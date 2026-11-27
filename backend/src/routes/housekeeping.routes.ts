import { Router, Request, Response } from "express";
import { db, RoomStatus, toIsoDateTime } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";
import { addNotification, logActivity, getNotificationsForRole } from "../lib/events.js";

const router = Router();

function formatHkTask(t: any) {
  return {
    task_id: t.task_id,
    room_id: t.room_id,
    room_number: t.room_number,
    room_type: t.room_type,
    floor: t.floor,
    status: t.status,
    assigned_to: t.staff_first_name ? `${t.staff_first_name} ${t.staff_last_name}` : "Unassigned",
    assigned_to_id: t.assigned_to,
    notes: t.notes || "Standard checkout turnaround",
    created_at: toIsoDateTime(t.created_at),
    completed_at: toIsoDateTime(t.completed_at),
  };
}

// GET /api/housekeeping/dashboard
router.get("/dashboard", requireRole(["Admin", "Manager", "Housekeeping"]), async (req: Request, res: Response) => {
  try {
    const session = req.user!;

    // 1. Synchronize any rooms in 'cleaning' status without an active task
    const roomsAwaitingCleaning = await db.query<{
      room_id: number;
      room_number: string;
      floor: number | null;
      notes: string | null;
      room_type: string;
      status: string;
    }>(
      `SELECT r.room_id, r.room_number, r.floor, r.notes, r.status, rt.name AS room_type
       FROM rooms r
       JOIN room_types rt ON rt.room_type_id = r.room_type_id
       WHERE r.status = 'cleaning'
       ORDER BY r.room_number ASC`
    );

    const existingActiveTasks = await db.query<{ room_id: number }>(
      `SELECT room_id FROM housekeeping_tasks
       WHERE status IN ('pending', 'in_progress')
         AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')`
    );
    const activeRoomIds = new Set(existingActiveTasks.map((t) => t.room_id));

    for (const r of roomsAwaitingCleaning) {
      if (!activeRoomIds.has(r.room_id)) {
        await db.execute(
          "INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)",
          [
            r.room_id,
            r.notes || `Turnover cleaning required for Room ${r.room_number}. Linen replacement and sanitization.`,
          ]
        );
      }
    }

    // 2. Fetch all cleaning tasks
    const allTasks = await db.query(
      `SELECT ht.task_id, ht.room_id, ht.assigned_to, ht.status, ht.created_at, ht.completed_at, ht.notes,
              r.room_number, r.floor, rt.name AS room_type,
              st.first_name AS staff_first_name, st.last_name AS staff_last_name
       FROM housekeeping_tasks ht
       JOIN rooms r ON r.room_id = ht.room_id
       JOIN room_types rt ON rt.room_type_id = r.room_type_id
       LEFT JOIN staff st ON st.staff_id = ht.assigned_to
       WHERE (ht.notes IS NULL OR ht.notes NOT LIKE '[MAINTENANCE]%')
       ORDER BY ht.created_at DESC
       LIMIT 100`
    );

    const pendingTasks = allTasks.filter((t) => t.status === "pending").map(formatHkTask);
    const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").map(formatHkTask);
    const completedTasks = allTasks.filter((t) => t.status === "done").map(formatHkTask);
    const notifications = getNotificationsForRole(session.role_name);

    res.json({
      success: true,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      roomsAwaitingCleaning: roomsAwaitingCleaning.map((r) => ({
        room_id: r.room_id,
        room_number: r.room_number,
        floor: r.floor,
        room_type: r.room_type,
        status: r.status,
      })),
      notifications,
    });
  } catch (err: any) {
    console.error("Housekeeping dashboard error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load housekeeping data." });
  }
});

// POST /api/housekeeping/tasks/:id/start
router.post("/tasks/:id/start", requireRole(["Admin", "Manager", "Housekeeping"]), async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id as string, 10);
    const session = req.user!;

    const task = await db.queryOne<{
      task_id: number;
      room_id: number;
      room_number: string;
      room_status: string;
    }>(
      `SELECT ht.task_id, ht.room_id, r.room_number, r.status AS room_status
       FROM housekeeping_tasks ht
       JOIN rooms r ON r.room_id = ht.room_id
       WHERE ht.task_id = ?
       LIMIT 1`,
      [taskId]
    );

    if (!task) {
      res.status(404).json({ success: false, error: "Task not found." });
      return;
    }

    await db.execute("UPDATE housekeeping_tasks SET status = 'in_progress', assigned_to = ? WHERE task_id = ?", [
      session.staff_id,
      taskId,
    ]);

    if (task.room_status !== "occupied" && task.room_status !== "maintenance") {
      await db.execute("UPDATE rooms SET status = 'cleaning' WHERE room_id = ?", [task.room_id]);
    }

    logActivity(
      session.full_name,
      session.role_name,
      "Started Cleaning Task",
      `Housekeeper ${session.full_name} started cleaning Room ${task.room_number}.`,
      task.room_number
    );

    res.json({ success: true, message: `Started cleaning Room ${task.room_number}.` });
  } catch (err: any) {
    console.error("Start cleaning task error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to start cleaning task." });
  }
});

async function recalculateRoomAfterCleaning(roomId: number): Promise<RoomStatus> {
  const [activeMaint, hasActiveStay] = await Promise.all([
    db.queryOne<{ task_id: number }>(
      `SELECT task_id FROM housekeeping_tasks
       WHERE room_id = ?
         AND notes LIKE '[MAINTENANCE]%'
         AND status IN ('pending', 'in_progress')
       LIMIT 1`,
      [roomId]
    ),
    db.queryOne<{ stay_id: number }>(
      `SELECT s.stay_id FROM stays s
       JOIN reservation_rooms rr ON rr.reservation_room_id = s.reservation_room_id
       WHERE rr.room_id = ? AND s.actual_check_out IS NULL
       LIMIT 1`,
      [roomId]
    ),
  ]);

  if (activeMaint) return "maintenance";
  if (hasActiveStay) return "occupied";
  return "available";
}

// POST /api/housekeeping/tasks/:id/complete
router.post("/tasks/:id/complete", requireRole(["Admin", "Manager", "Housekeeping"]), async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id as string, 10);
    const session = req.user!;

    const task = await db.queryOne<{ task_id: number; room_id: number; room_number: string }>(
      `SELECT ht.task_id, ht.room_id, r.room_number
       FROM housekeeping_tasks ht
       JOIN rooms r ON r.room_id = ht.room_id
       WHERE ht.task_id = ?
       LIMIT 1`,
      [taskId]
    );

    if (!task) {
      res.status(404).json({ success: false, error: "Task not found." });
      return;
    }

    await db.execute(
      "UPDATE housekeeping_tasks SET status = 'done', completed_at = NOW(), assigned_to = ? WHERE task_id = ?",
      [session.staff_id, taskId]
    );

    const newStatus = await recalculateRoomAfterCleaning(task.room_id);
    await db.execute("UPDATE rooms SET status = ? WHERE room_id = ?", [newStatus, task.room_id]);

    logActivity(
      session.full_name,
      session.role_name,
      "Completed Cleaning Task",
      `Housekeeper ${session.full_name} finished cleaning Room ${task.room_number}. Status: ${newStatus.toUpperCase()}.`,
      task.room_number
    );

    addNotification(
      "manager",
      "Room Cleaned",
      `Room ${task.room_number} cleaning completed by ${session.full_name}.`,
      "cleaning",
      task.room_number
    );

    res.json({
      success: true,
      message: `Cleaning completed for Room ${task.room_number}. Room is now ${newStatus}.`,
    });
  } catch (err: any) {
    console.error("Complete cleaning task error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to complete cleaning task." });
  }
});

// POST /api/housekeeping/rooms/:id/cleanliness
router.post("/rooms/:id/cleanliness", requireRole(["Admin", "Manager", "Housekeeping"]), async (req: Request, res: Response) => {
  try {
    const roomId = parseInt(req.params.id as string, 10);
    const { selectedStatus, comment } = req.body;
    const session = req.user!;

    const room = await db.queryOne<{ room_id: number; room_number: string; status: string }>(
      "SELECT room_id, room_number, status FROM rooms WHERE room_id = ? LIMIT 1",
      [roomId]
    );
    if (!room) {
      res.status(404).json({ success: false, error: "Room not found." });
      return;
    }

    if (selectedStatus === "in_progress") {
      const existingCleaningTask = await db.queryOne<{ task_id: number }>(
        `SELECT task_id FROM housekeeping_tasks
         WHERE room_id = ?
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')
           AND status IN ('pending', 'in_progress')
         LIMIT 1`,
        [roomId]
      );

      if (existingCleaningTask) {
        await db.execute("UPDATE housekeeping_tasks SET status = 'in_progress', assigned_to = ? WHERE task_id = ?", [
          session.staff_id,
          existingCleaningTask.task_id,
        ]);
      } else {
        await db.execute(
          "INSERT INTO housekeeping_tasks (room_id, status, assigned_to, notes) VALUES (?, 'in_progress', ?, ?)",
          [roomId, session.staff_id, `Cleaning started by ${session.full_name}`]
        );
      }

      if (room.status !== "occupied" && room.status !== "maintenance") {
        await db.execute("UPDATE rooms SET status = 'cleaning' WHERE room_id = ?", [roomId]);
      }

      logActivity(
        session.full_name,
        session.role_name,
        "Cleaning In Progress",
        `Started cleaning Room ${room.room_number}.`,
        room.room_number
      );

      res.json({ success: true, message: `Room ${room.room_number} cleaning marked as In Progress.` });
    } else if (selectedStatus === "cleaned") {
      await db.execute(
        `UPDATE housekeeping_tasks
         SET status = 'done', completed_at = NOW(), assigned_to = ?
         WHERE room_id = ?
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')
           AND status IN ('pending', 'in_progress')`,
        [session.staff_id, roomId]
      );

      const newStatus = await recalculateRoomAfterCleaning(roomId);
      await db.execute("UPDATE rooms SET status = ? WHERE room_id = ?", [newStatus, roomId]);

      logActivity(
        session.full_name,
        session.role_name,
        "Room Cleaned",
        `Completed cleaning for Room ${room.room_number}. Operational status: '${newStatus}'.`,
        room.room_number
      );

      addNotification(
        "manager",
        "Room Cleaned",
        `Room ${room.room_number} cleaning completed by ${session.full_name}.`,
        "cleaning",
        room.room_number
      );

      res.json({
        success: true,
        message:
          newStatus === "available"
            ? `Room ${room.room_number} is clean and now Available.`
            : `Room ${room.room_number} cleaned, operational status: ${newStatus}.`,
      });
    } else if (selectedStatus === "need_maintenance") {
      const cleanComment = (comment || "").trim();
      if (cleanComment.length < 3) {
        res.status(400).json({ success: false, error: "Please enter a comment describing the maintenance problem." });
        return;
      }

      const note = `[MAINTENANCE] [Source: Housekeeping] ${cleanComment} (Reported by ${session.full_name})`.slice(0, 255);

      await db.execute("INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)", [
        roomId,
        note,
      ]);

      await db.execute("UPDATE rooms SET status = 'maintenance', notes = ? WHERE room_id = ?", [
        cleanComment.slice(0, 255),
        roomId,
      ]);

      addNotification(
        "maintenance",
        `Maintenance Required: Room ${room.room_number}`,
        `Room ${room.room_number} – ${cleanComment}`,
        "maintenance",
        room.room_number
      );

      res.json({
        success: true,
        message: `Room ${room.room_number} set to Maintenance Required. Sent to Maintenance: "${cleanComment}".`,
      });
    } else {
      res.status(400).json({ success: false, error: "Invalid status selection." });
    }
  } catch (err: any) {
    console.error("Cleanliness update error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to update room cleanliness." });
  }
});

export default router;
