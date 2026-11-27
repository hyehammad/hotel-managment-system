import { Router, Request, Response } from "express";
import { db, RoomStatus, toIsoDate, toIsoDateTime } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { addNotification, logActivity } from "../lib/events.js";
import { isSameMaintenanceIssue } from "../lib/maintenance-utils.js";

const router = Router();

// GET /api/rooms
router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [rooms, activeTasks, rrRows] = await Promise.all([
      db.query(
        `SELECT r.room_id, r.room_number, r.floor, r.room_type_id, r.status, r.notes,
                rt.name AS room_type, rt.base_price
         FROM rooms r
         JOIN room_types rt ON rt.room_type_id = r.room_type_id
         ORDER BY r.room_number ASC`
      ),
      db.query(
        `SELECT task_id, room_id, status, notes
         FROM housekeeping_tasks
         WHERE status IN ('pending', 'in_progress')
         ORDER BY created_at DESC`
      ),
      db.query(
        `SELECT rr.reservation_room_id, rr.room_id, res.reservation_id, res.status AS reservation_status,
                res.check_in_date, res.check_out_date,
                g.first_name, g.last_name, g.phone, g.email,
                s.stay_id, s.actual_check_in, s.actual_check_out
         FROM reservation_rooms rr
         JOIN reservations res ON res.reservation_id = rr.reservation_id
         JOIN guests g ON g.guest_id = res.guest_id
         LEFT JOIN stays s ON s.reservation_room_id = rr.reservation_room_id
         WHERE res.status IN ('checked_in', 'confirmed')
         ORDER BY rr.reservation_room_id DESC`
      ),
    ]);

    const formattedRooms = rooms.map((r) => {
      const roomTasks = activeTasks.filter((t) => t.room_id === r.room_id);
      const activeMaintenanceTask = roomTasks.find((t) => (t.notes || "").startsWith("[MAINTENANCE]"));
      const activeCleaningTask = roomTasks.find((t) => !(t.notes || "").startsWith("[MAINTENANCE]"));

      const roomRrs = rrRows.filter((rr) => rr.room_id === r.room_id);
      const activeRr = roomRrs.find((rr) => rr.stay_id && rr.actual_check_out === null) || roomRrs[0];

      const hasActiveStay = activeRr ? Boolean(activeRr.stay_id && activeRr.actual_check_out === null) : false;

      let operationalStatus = "Available";
      if (r.status === "maintenance") {
        operationalStatus =
          activeMaintenanceTask?.status === "in_progress"
            ? "Maintenance in Progress"
            : "Maintenance Required";
      } else if (r.status === "cleaning") {
        operationalStatus =
          activeCleaningTask?.status === "in_progress"
            ? "Cleaning in Progress"
            : "Cleaning Required";
      } else if (r.status === "occupied" || hasActiveStay) {
        operationalStatus = "Occupied";
      } else if (
        activeRr &&
        (activeRr.reservation_status === "confirmed" || activeRr.reservation_status === "pending") &&
        !hasActiveStay
      ) {
        operationalStatus = "Reserved";
      }

      return {
        room_id: r.room_id,
        room_number: r.room_number,
        floor: r.floor,
        room_type_id: r.room_type_id,
        room_type: r.room_type,
        base_price: parseFloat(String(r.base_price)),
        status: r.status,
        operational_status: operationalStatus,
        is_under_maintenance: Boolean(r.status === "maintenance" || activeMaintenanceTask),
        is_under_cleaning: Boolean(r.status === "cleaning" || activeCleaningTask),
        notes: r.notes,
        active_cleaning: activeCleaningTask
          ? {
              taskId: activeCleaningTask.task_id,
              status: activeCleaningTask.status,
              notes: activeCleaningTask.notes,
            }
          : null,
        active_maintenance: activeMaintenanceTask
          ? {
              taskId: activeMaintenanceTask.task_id,
              status: activeMaintenanceTask.status,
              notes: activeMaintenanceTask.notes,
            }
          : null,
        active_stay_guest: activeRr
          ? {
              reservation_id: activeRr.reservation_id,
              booking_reference: `RES-${String(activeRr.reservation_id).padStart(4, "0")}`,
              guest_name: `${activeRr.first_name} ${activeRr.last_name}`,
              guest_phone: activeRr.phone,
              guest_email: activeRr.email,
              check_in_date: toIsoDate(activeRr.check_in_date),
              check_out_date: toIsoDate(activeRr.check_out_date),
              reservation_status: activeRr.reservation_status,
              has_active_stay: hasActiveStay,
              actual_check_in: toIsoDateTime(activeRr.actual_check_in),
            }
          : null,
      };
    });

    res.json({ success: true, rooms: formattedRooms });
  } catch (err: any) {
    console.error("Failed to fetch staff rooms:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load rooms." });
  }
});

// POST /api/rooms/:id/override
router.post("/:id/override", requireRole(["Admin", "Manager"]), async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.id as string, 10);
    const { targetStatus, reason } = req.body as { targetStatus: RoomStatus; reason?: string };
    const session = req.user!;

    if (!reason || reason.trim().length < 5) {
      res.status(400).json({ success: false, error: "Mandatory justification reason required for status change." });
      return;
    }

    const room = await db.queryOne<{ room_id: number; room_number: string; status: string; notes: string | null }>(
      "SELECT room_id, room_number, status, notes FROM rooms WHERE room_id = ? LIMIT 1",
      [roomId]
    );
    if (!room) {
      res.status(404).json({ success: false, error: "Room not found." });
      return;
    }

    let createdTaskId: number | undefined;
    const cleanReason = reason.trim();

    if (targetStatus === "cleaning") {
      const existingCleaning = await db.queryOne<{ task_id: number }>(
        `SELECT task_id FROM housekeeping_tasks
         WHERE room_id = ?
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')
           AND status IN ('pending', 'in_progress')
         LIMIT 1`,
        [roomId]
      );

      if (!existingCleaning) {
        const insertRes = await db.execute(
          `INSERT INTO housekeeping_tasks (room_id, status, notes)
           VALUES (?, 'pending', ?)`,
          [
            roomId,
            `Turnover cleaning required: Initiated by ${session.full_name} (${session.role_name}). Reason: ${cleanReason}`.slice(0, 255),
          ]
        );
        createdTaskId = insertRes.insertId;
      }

      addNotification(
        "housekeeping",
        `Cleaning Required: Room ${room.room_number}`,
        `Management set Room ${room.room_number} to Cleaning Required: ${cleanReason}`,
        "cleaning",
        room.room_number,
        createdTaskId
          ? `/staff/dashboard/housekeeping?taskId=${createdTaskId}&room=${room.room_number}`
          : `/staff/dashboard/housekeeping?room=${room.room_number}`,
        createdTaskId
      );
    } else if (targetStatus === "maintenance") {
      const activeTasks = await db.query<{ task_id: number; notes: string | null }>(
        `SELECT task_id, notes FROM housekeeping_tasks
         WHERE room_id = ?
           AND notes LIKE '[MAINTENANCE]%'
           AND status IN ('pending', 'in_progress')`,
        [roomId]
      );

      const duplicateTask = activeTasks.find((t) => isSameMaintenanceIssue(cleanReason, t.notes || ""));
      if (duplicateTask) {
        createdTaskId = duplicateTask.task_id;
      } else {
        const insertRes = await db.execute(
          `INSERT INTO housekeeping_tasks (room_id, status, notes)
           VALUES (?, 'pending', ?)`,
          [
            roomId,
            `[MAINTENANCE] [Source: Management] ${cleanReason} (Initiated by ${session.full_name})`.slice(0, 255),
          ]
        );
        createdTaskId = insertRes.insertId;
      }

      addNotification(
        "maintenance",
        `Maintenance Required: Room ${room.room_number}`,
        `Management set Room ${room.room_number} to Maintenance: ${cleanReason}`,
        "maintenance",
        room.room_number,
        createdTaskId
          ? `/staff/dashboard/maintenance?taskId=${createdTaskId}&room=${room.room_number}`
          : `/staff/dashboard/maintenance?room=${room.room_number}`,
        createdTaskId
      );
    }

    await db.execute("UPDATE rooms SET status = ?, notes = ? WHERE room_id = ?", [
      targetStatus,
      `[STATUS OVERRIDE by ${session.full_name}]: ${cleanReason}`.slice(0, 255),
      roomId,
    ]);

    logActivity(
      session.full_name,
      session.role_name,
      "Room Status Override",
      `Changed Room ${room.room_number} from '${room.status}' to '${targetStatus}'. Reason: ${cleanReason}`,
      room.room_number
    );

    res.json({
      success: true,
      message: `Room ${room.room_number} status updated to ${targetStatus.toUpperCase()}.`,
    });
  } catch (err: any) {
    console.error("Room override error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to override room status." });
  }
});

// POST /api/rooms/:id/service-request
router.post("/:id/service-request", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.id as string, 10);
    const { requestType, notes } = req.body;
    const session = req.user!;

    const room = await db.queryOne<{ room_id: number; room_number: string; status: string }>(
      "SELECT room_id, room_number, status FROM rooms WHERE room_id = ? LIMIT 1",
      [roomId]
    );
    if (!room) {
      res.status(404).json({ success: false, error: "Room not found." });
      return;
    }

    const cleanComment = (notes || "").trim();

    if (requestType === "maintenance") {
      const activeMaintTasks = await db.query<{ task_id: number; notes: string | null }>(
        `SELECT task_id, notes FROM housekeeping_tasks
         WHERE room_id = ?
           AND notes LIKE '[MAINTENANCE]%'
           AND status IN ('pending', 'in_progress')`,
        [roomId]
      );

      const duplicateTask = activeMaintTasks.find((t) =>
        isSameMaintenanceIssue(cleanComment || "Technical defect", t.notes || "")
      );

      if (duplicateTask) {
        res.status(400).json({
          success: false,
          duplicate: true,
          error: `Room ${room.room_number} is already under maintenance for this issue (Task #${duplicateTask.task_id}).`,
        });
        return;
      }

      const note = (
        cleanComment
          ? `[MAINTENANCE] [Source: Reception Desk] ${cleanComment} (Reported by ${session.full_name})`
          : `[MAINTENANCE] [Source: Reception Desk] Technical defect reported by Front Desk (Reported by ${session.full_name})`
      ).slice(0, 255);

      const insertRes = await db.execute(
        "INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)",
        [roomId, note]
      );

      await db.execute("UPDATE rooms SET status = 'maintenance', notes = ? WHERE room_id = ?", [
        (cleanComment || "Maintenance defect reported by Front Desk.").slice(0, 255),
        roomId,
      ]);

      addNotification(
        "maintenance",
        `Maintenance Request: Room ${room.room_number}`,
        `Front Desk reported issue for Room ${room.room_number}: ${cleanComment || "Repair required."}`,
        "maintenance",
        room.room_number,
        `/staff/dashboard/maintenance?taskId=${insertRes.insertId}&room=${room.room_number}`,
        insertRes.insertId
      );

      logActivity(
        session.full_name,
        session.role_name,
        "Maintenance Request Dispatched",
        `Reported maintenance issue for Room ${room.room_number}: ${cleanComment || "Repair required."}`,
        room.room_number
      );

      res.json({
        success: true,
        message: `Maintenance request successfully dispatched for Room ${room.room_number}.`,
      });
    } else if (requestType === "housekeeping" || requestType === "cleaning") {
      const activeClean = await db.queryOne<{ task_id: number }>(
        `SELECT task_id FROM housekeeping_tasks
         WHERE room_id = ?
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')
           AND status IN ('pending', 'in_progress')
         LIMIT 1`,
        [roomId]
      );

      if (room.status === "cleaning" || activeClean) {
        res.status(400).json({
          success: false,
          duplicate: true,
          error: `Room ${room.room_number} is already awaiting Cleaning.`,
        });
        return;
      }

      const note = (
        cleanComment
          ? `[GUEST REQUEST] Housekeeping requested: ${cleanComment} (Logged by ${session.full_name})`
          : `[GUEST REQUEST] Housekeeping requested by Front Desk (Logged by ${session.full_name})`
      ).slice(0, 255);

      const insertRes = await db.execute(
        "INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)",
        [roomId, note]
      );

      if (room.status === "available") {
        await db.execute("UPDATE rooms SET status = 'cleaning' WHERE room_id = ?", [roomId]);
      }

      addNotification(
        "housekeeping",
        `Cleaning Request: Room ${room.room_number}`,
        `Front Desk request for Room ${room.room_number}: ${cleanComment || "Cleaning requested."}`,
        "cleaning",
        room.room_number,
        `/staff/dashboard/housekeeping?taskId=${insertRes.insertId}&room=${room.room_number}`,
        insertRes.insertId
      );

      logActivity(
        session.full_name,
        session.role_name,
        "Cleaning Request Dispatched",
        `Requested cleaning for Room ${room.room_number}: ${cleanComment || "Routine request"}`,
        room.room_number
      );

      res.json({
        success: true,
        message: `Housekeeping request successfully dispatched for Room ${room.room_number}.`,
      });
    } else {
      res.status(400).json({ success: false, error: "Invalid request type." });
    }
  } catch (err: any) {
    console.error("Room service request error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to submit request." });
  }
});

export default router;
