import { Router, Request, Response } from "express";
import { db, withTransaction, RoomStatus, toIsoDateTime } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";
import {
  addNotification,
  logActivity,
  getNotificationsForRole,
  getAllSeriousIssues,
  getSeriousIssueById,
  submitSeriousIssueRecord,
  updateSeriousIssueDecision,
  updateSeriousIssueProgress,
} from "../lib/events.js";
import { isSameMaintenanceIssue } from "../lib/maintenance-utils.js";

const router = Router();

function formatMaintTask(t: any) {
  const rawNote = t.notes || "";
  let requestSource = "Housekeeping";
  if (rawNote.includes("[Source: Reception Desk]") || rawNote.toLowerCase().includes("reception")) {
    requestSource = "Reception Desk";
  } else if (
    rawNote.includes("[Source: Room Inspection]") ||
    rawNote.toLowerCase().includes("inspection") ||
    rawNote.toLowerCase().includes("admin")
  ) {
    requestSource = "Room Inspection";
  } else if (rawNote.includes("[Source: Housekeeping]") || rawNote.toLowerCase().includes("housekeep")) {
    requestSource = "Housekeeping";
  }

  let cleanNote = rawNote
    .replace(/\[MAINTENANCE\]/g, "")
    .replace(/\[Source:[^\]]+\]/g, "")
    .replace(/\[Severity:[^\]]+\]/g, "")
    .trim();

  if (!cleanNote) {
    cleanNote = "Room repair and technical maintenance required";
  }

  return {
    task_id: t.task_id,
    room_id: t.room_id,
    room_number: t.room_number || "Unknown",
    room_type: t.room_type || "Standard",
    floor: t.floor ?? null,
    status: t.status,
    assigned_to: t.staff_first_name ? `${t.staff_first_name} ${t.staff_last_name}` : "Unassigned",
    assigned_to_id: t.assigned_to,
    issue_description: cleanNote,
    request_source: requestSource,
    created_at: toIsoDateTime(t.created_at),
    completed_at: toIsoDateTime(t.completed_at),
  };
}

// GET /api/maintenance/dashboard
router.get("/dashboard", requireRole(["Admin", "Manager", "Maintenance"]), async (_req: Request, res: Response) => {
  try {
    const roomsUnderMaintenance = await db.query<{
      room_id: number;
      room_number: string;
      floor: number | null;
      room_type: string;
      status: string;
      notes: string | null;
    }>(
      `SELECT r.room_id, r.room_number, r.floor, rt.name AS room_type, r.status, r.notes
       FROM rooms r
       JOIN room_types rt ON rt.room_type_id = r.room_type_id
       WHERE r.status = 'maintenance'
       ORDER BY r.room_number ASC`
    );

    const activeTasks = await db.query<{ room_id: number }>(
      `SELECT room_id FROM housekeeping_tasks
       WHERE notes LIKE '[MAINTENANCE]%'
         AND status IN ('pending', 'in_progress')`
    );
    const activeTaskRoomIds = new Set(activeTasks.map((t) => t.room_id));

    for (const r of roomsUnderMaintenance) {
      if (!activeTaskRoomIds.has(r.room_id)) {
        const note = r.notes
          ? `[MAINTENANCE] [Source: Room Inspection] ${r.notes}`.slice(0, 255)
          : `[MAINTENANCE] [Source: Room Inspection] Scheduled room maintenance and physical defect inspection`;
        await db.execute("INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)", [
          r.room_id,
          note,
        ]);
      }
    }

    const allMaintTasks = await db.query(
      `SELECT ht.task_id, ht.room_id, ht.assigned_to, ht.status, ht.created_at, ht.completed_at, ht.notes,
              r.room_number, r.floor, rt.name AS room_type,
              st.first_name AS staff_first_name, st.last_name AS staff_last_name
       FROM housekeeping_tasks ht
       JOIN rooms r ON r.room_id = ht.room_id
       JOIN room_types rt ON rt.room_type_id = r.room_type_id
       LEFT JOIN staff st ON st.staff_id = ht.assigned_to
       WHERE ht.notes LIKE '[MAINTENANCE]%'
       ORDER BY ht.created_at DESC
       LIMIT 100`
    );

    const pendingRepairs = allMaintTasks.filter((t) => t.status === "pending").map(formatMaintTask);
    const inProgressRepairs = allMaintTasks.filter((t) => t.status === "in_progress").map(formatMaintTask);
    const completedRepairs = allMaintTasks.filter((t) => t.status === "done").map(formatMaintTask);
    const notifications = getNotificationsForRole("maintenance");

    res.json({
      success: true,
      pendingRepairs,
      inProgressRepairs,
      completedRepairs,
      roomsUnderMaintenance,
      notifications,
    });
  } catch (err: any) {
    console.error("Maintenance dashboard error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load maintenance data." });
  }
});

// POST /api/maintenance/tasks/:id/start
router.post("/tasks/:id/start", requireRole(["Admin", "Manager", "Maintenance"]), async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id as string, 10);
    const session = req.user!;

    const task = await db.queryOne<{
      task_id: number;
      room_id: number;
      notes: string | null;
      room_number: string;
    }>(
      `SELECT ht.task_id, ht.room_id, ht.notes, r.room_number
       FROM housekeeping_tasks ht
       JOIN rooms r ON r.room_id = ht.room_id
       WHERE ht.task_id = ?
       LIMIT 1`,
      [taskId]
    );

    if (!task) {
      res.status(404).json({ success: false, error: "Maintenance task not found." });
      return;
    }

    await db.execute("UPDATE housekeeping_tasks SET status = 'in_progress', assigned_to = ? WHERE task_id = ?", [
      session.staff_id,
      taskId,
    ]);

    const issues = getAllSeriousIssues();
    const linkedEscalation = issues.find(
      (i) => i.linkedTaskId === taskId || (task.notes && task.notes.includes(`[ESCALATION #${i.id}]`))
    );
    if (linkedEscalation && linkedEscalation.status === "approved") {
      updateSeriousIssueProgress(linkedEscalation.id, "in_progress", session.full_name);
    }

    logActivity(
      session.full_name,
      session.role_name,
      "Maintenance Started",
      `Technician ${session.full_name} started repair on Room ${task.room_number}: ${task.notes || ""}`,
      task.room_number
    );

    res.json({ success: true, message: `Repair in progress on Room ${task.room_number}.` });
  } catch (err: any) {
    console.error("Start repair error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to start repair task." });
  }
});

// POST /api/maintenance/tasks/:id/complete
router.post("/tasks/:id/complete", requireRole(["Admin", "Manager", "Maintenance"]), async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id as string, 10);
    const resolutionNotes = (req.body.resolutionNotes || "").trim();
    const session = req.user!;

    const task = await db.queryOne<{
      task_id: number;
      room_id: number;
      notes: string | null;
      room_number: string;
      room_notes: string | null;
    }>(
      `SELECT ht.task_id, ht.room_id, ht.notes, r.room_number, r.notes AS room_notes
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

    const nowFormatted = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const cleanResNotes = resolutionNotes || "Defect inspected and repaired";
    const cleanBaseNotes = (task.notes || "").split(" | RESOLVED:")[0].trim();
    const updatedNote = `${cleanBaseNotes} | RESOLVED: ${cleanResNotes} (Signed off by ${session.full_name} at ${nowFormatted})`.slice(
      0,
      255
    );

    await db.execute(
      `UPDATE housekeeping_tasks
       SET status = 'done', completed_at = NOW(), assigned_to = ?, notes = ?
       WHERE task_id = ?`,
      [session.staff_id, updatedNote, taskId]
    );

    const issues = getAllSeriousIssues();
    const linkedEscalation = issues.find(
      (i) => i.linkedTaskId === taskId || (task.notes && task.notes.includes(`[ESCALATION #${i.id}]`))
    );
    if (linkedEscalation && linkedEscalation.status !== "completed") {
      updateSeriousIssueProgress(linkedEscalation.id, "completed", session.full_name, cleanResNotes);
    }

    const [maintRow, cleanRow, stayRow] = await Promise.all([
      db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM housekeeping_tasks
         WHERE room_id = ? AND task_id <> ?
           AND notes LIKE '[MAINTENANCE]%'
           AND status IN ('pending', 'in_progress')`,
        [task.room_id, taskId]
      ),
      db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM housekeeping_tasks
         WHERE room_id = ? AND task_id <> ?
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')
           AND status IN ('pending', 'in_progress')`,
        [task.room_id, taskId]
      ),
      db.queryOne<{ stay_id: number }>(
        `SELECT s.stay_id FROM stays s
         JOIN reservation_rooms rr ON rr.reservation_room_id = s.reservation_room_id
         WHERE rr.room_id = ? AND s.actual_check_out IS NULL
         LIMIT 1`,
        [task.room_id]
      ),
    ]);

    let recalculatedStatus: RoomStatus = "available";
    if (Number(maintRow?.cnt ?? 0) > 0) {
      recalculatedStatus = "maintenance";
    } else if (Number(cleanRow?.cnt ?? 0) > 0) {
      recalculatedStatus = "cleaning";
    } else if (stayRow) {
      recalculatedStatus = "occupied";
    }

    await db.execute("UPDATE rooms SET status = ?, notes = ? WHERE room_id = ?", [
      recalculatedStatus,
      recalculatedStatus === "available" ? null : task.room_notes,
      task.room_id,
    ]);

    logActivity(
      session.full_name,
      session.role_name,
      "Maintenance Completed",
      `Technician ${session.full_name} completed repair on Room ${task.room_number}: ${cleanResNotes}. Room status set to ${recalculatedStatus.toUpperCase()}.`,
      task.room_number
    );

    addNotification(
      "manager",
      `Maintenance Completed: Room ${task.room_number}`,
      `Repair completed on Room ${task.room_number} by ${session.full_name}. Room is now '${recalculatedStatus}'.`,
      "maintenance",
      task.room_number
    );

    res.json({
      success: true,
      message: `Repair on Room ${task.room_number} marked as complete. Room status: ${recalculatedStatus}.`,
    });
  } catch (err: any) {
    console.error("Complete maintenance error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to complete repair task." });
  }
});

// POST /api/maintenance/report
router.post("/report", requireRole(["Admin", "Manager", "Maintenance"]), async (req: Request, res: Response) => {
  try {
    const session = req.user!;
    const { roomNumber, issue, severity, source } = req.body;

    if (!roomNumber || !issue) {
      res.status(400).json({ success: false, error: "Room number and issue description are required." });
      return;
    }

    const room = await db.queryOne<{ room_id: number; room_number: string }>(
      "SELECT room_id, room_number FROM rooms WHERE room_number = ? LIMIT 1",
      [roomNumber.toString().trim()]
    );

    if (!room) {
      res.status(404).json({ success: false, error: `Room ${roomNumber} not found.` });
      return;
    }

    const cleanIssueText = issue.trim();

    const activeTasks = await db.query<{ task_id: number; notes: string | null }>(
      `SELECT task_id, notes FROM housekeeping_tasks
       WHERE room_id = ?
         AND notes LIKE '[MAINTENANCE]%'
         AND status IN ('pending', 'in_progress')`,
      [room.room_id]
    );

    const duplicateTask = activeTasks.find((t) => isSameMaintenanceIssue(cleanIssueText, t.notes || ""));
    if (duplicateTask) {
      res.status(400).json({
        success: false,
        duplicate: true,
        error: `Room ${room.room_number} already has an unresolved task for this issue (Task #${duplicateTask.task_id}).`,
      });
      return;
    }

    const severityTag = severity ? `[Severity: ${severity}]` : "[Severity: Routine]";
    const sourceTag = source ? `[Source: ${source}]` : "[Source: Maintenance]";
    const note = `[MAINTENANCE] ${sourceTag} ${severityTag} ${cleanIssueText} (Reported by ${session.full_name})`.slice(0, 255);

    await db.execute("INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)", [
      room.room_id,
      note,
    ]);

    await db.execute("UPDATE rooms SET status = 'maintenance', notes = ? WHERE room_id = ?", [
      cleanIssueText.slice(0, 255),
      room.room_id,
    ]);

    addNotification(
      "maintenance",
      `New Maintenance Task: Room ${room.room_number}`,
      `Reported by ${session.full_name}: ${cleanIssueText}`,
      "maintenance",
      room.room_number
    );

    res.json({
      success: true,
      message: `Maintenance request created for Room ${room.room_number}.`,
    });
  } catch (err: any) {
    console.error("Report maintenance error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to create maintenance report." });
  }
});

// GET /api/maintenance/escalations
router.get("/escalations", requireRole(["Admin", "Manager", "Maintenance"]), (_req: Request, res: Response) => {
  const issues = getAllSeriousIssues();
  res.json({ success: true, issues });
});

// POST /api/maintenance/escalations
router.post("/escalations", requireRole(["Admin", "Manager", "Maintenance"]), async (req: Request, res: Response) => {
  try {
    const session = req.user!;
    const { roomNumber, title, description, estimatedCost } = req.body;

    if (!title || !description) {
      res.status(400).json({ success: false, error: "Title and description are required." });
      return;
    }

    const { item, isNew } = submitSeriousIssueRecord({
      roomNumber: roomNumber ? roomNumber.toString().trim() : undefined,
      title: title.trim(),
      description: description.trim(),
      estimatedCost: estimatedCost ? estimatedCost.trim() : undefined,
      reportedBy: `${session.full_name} (${session.role_name})`,
    });

    if (isNew) {
      addNotification(
        "admin",
        "Serious Issue Escalated",
        `Major issue requires authorization: "${item.title}" (Room ${item.roomNumber || "N/A"})`,
        "maintenance",
        item.roomNumber
      );
      addNotification(
        "manager",
        "Serious Issue Escalated",
        `Major issue requires authorization: "${item.title}" (Room ${item.roomNumber || "N/A"})`,
        "maintenance",
        item.roomNumber
      );
    }

    res.json({
      success: true,
      issue: item,
      message: isNew
        ? "Serious issue escalated. Awaiting Manager or Administrator authorization."
        : `An escalation for this problem already exists with status: ${item.status.toUpperCase()}.`,
    });
  } catch (err: any) {
    console.error("Escalation submission error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to escalate issue." });
  }
});

// POST /api/maintenance/escalations/:id/review
router.post("/escalations/:id/review", requireRole(["Admin", "Manager"]), async (req: Request, res: Response) => {
  try {
    const issueId = req.params.id as string;
    const { decision, reviewNotes } = req.body;
    const session = req.user!;

    const issue = getSeriousIssueById(issueId);
    if (!issue) {
      res.status(404).json({ success: false, error: "Escalated issue not found." });
      return;
    }

    if (issue.status === "approved" || issue.status === "in_progress" || issue.status === "completed") {
      res.json({
        success: true,
        message: `Issue "${issue.title}" has already been approved by ${issue.reviewedBy || "Management"}. Exactly one maintenance task is active.`,
      });
      return;
    }

    let linkedTaskId = issue.linkedTaskId;

    if (decision === "approved" && issue.roomNumber) {
      linkedTaskId = await withTransaction(async (tx) => {
        const room = await tx.queryOne<{ room_id: number }>(
          "SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1",
          [issue.roomNumber]
        );
        if (!room) return linkedTaskId;

        const existingTask = await tx.queryOne<{ task_id: number }>(
          "SELECT task_id FROM housekeeping_tasks WHERE room_id = ? AND notes LIKE ? LIMIT 1",
          [room.room_id, `%[ESCALATION #${issue.id}]%`]
        );

        let taskId = existingTask?.task_id;
        if (!taskId) {
          const insertRes = await tx.execute(
            "INSERT INTO housekeeping_tasks (room_id, status, notes) VALUES (?, 'pending', ?)",
            [
              room.room_id,
              `[MAINTENANCE] [ESCALATION #${issue.id}] ${issue.title.slice(0, 80)} (Authorized by ${session.full_name})`.slice(0, 255),
            ]
          );
          taskId = insertRes.insertId;
        }

        await tx.execute("UPDATE rooms SET status = 'maintenance', notes = ? WHERE room_id = ?", [
          `Critical Defect: ${issue.title.slice(0, 100)}`,
          room.room_id,
        ]);

        return taskId;
      });
    }

    updateSeriousIssueDecision(issueId, decision, reviewNotes || "", session.full_name, linkedTaskId);

    addNotification(
      "maintenance",
      `Escalation ${decision === "approved" ? "Approved" : "Declined"}`,
      `Single approval by ${session.role_name} (${session.full_name}) on "${issue.title}": ${decision.toUpperCase()}`,
      "maintenance",
      issue.roomNumber
    );

    res.json({
      success: true,
      message: `Escalated issue marked as ${decision.toUpperCase()} by ${session.full_name}.`,
    });
  } catch (err: any) {
    console.error("Escalation review error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to review escalation." });
  }
});

export default router;
