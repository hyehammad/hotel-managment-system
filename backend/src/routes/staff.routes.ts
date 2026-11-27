import { Router, Request, Response } from "express";
import * as argon2 from "argon2";
import { db, toIsoDate } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/events.js";

const router = Router();

// GET /api/staff
router.get("/", requireRole(["Admin", "Manager"]), async (_req: Request, res: Response) => {
  try {
    const [staff, roles] = await Promise.all([
      db.query(
        `SELECT s.staff_id, s.username, s.first_name, s.last_name, s.email, s.phone,
                s.hire_date, s.is_active, s.role_id,
                r.role_name, r.description AS role_description
         FROM staff s
         JOIN roles r ON r.role_id = s.role_id
         ORDER BY s.staff_id ASC`
      ),
      db.query(
        `SELECT role_id, role_name, description
         FROM roles
         ORDER BY role_id ASC`
      ),
    ]);

    const formatted = staff.map((s) => ({
      staff_id: s.staff_id,
      username: s.username,
      first_name: s.first_name,
      last_name: s.last_name,
      full_name: `${s.first_name} ${s.last_name}`,
      email: s.email,
      phone: s.phone,
      hire_date: s.hire_date ? toIsoDate(s.hire_date) : "N/A",
      is_active: Boolean(s.is_active),
      role_id: s.role_id,
      role_name: s.role_name,
      role_description: s.role_description,
    }));

    res.json({ success: true, staff: formatted, roles });
  } catch (err: any) {
    console.error("Fetch staff error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load staff accounts." });
  }
});

// POST /api/staff
router.post("/", requireRole(["Admin"]), async (req: Request, res: Response) => {
  try {
    const session = req.user!;
    const { firstName, lastName, username, password, email, phone, roleId } = req.body;

    if (!firstName || !lastName || !username || !password || !roleId) {
      res.status(400).json({ success: false, error: "First name, last name, username, password, and role are required." });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanPhone = phone ? phone.trim() : null;
    const parsedRoleId = parseInt(roleId, 10);

    const existing = cleanEmail
      ? await db.queryOne(
          "SELECT staff_id FROM staff WHERE username = ? OR email = ? LIMIT 1",
          [cleanUsername, cleanEmail]
        )
      : await db.queryOne("SELECT staff_id FROM staff WHERE username = ? LIMIT 1", [cleanUsername]);

    if (existing) {
      res.status(400).json({ success: false, error: "A staff account with this username or email already exists." });
      return;
    }

    const role = await db.queryOne<{ role_id: number; role_name: string }>(
      "SELECT role_id, role_name FROM roles WHERE role_id = ? LIMIT 1",
      [parsedRoleId]
    );
    if (!role) {
      res.status(400).json({ success: false, error: "Invalid role selected." });
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const insertRes = await db.execute(
      `INSERT INTO staff (first_name, last_name, username, password_hash, email, phone, role_id, hire_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 1)`,
      [firstName.trim(), lastName.trim(), cleanUsername, passwordHash, cleanEmail, cleanPhone, parsedRoleId]
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Staff Account Created",
      `Created staff account for ${firstName.trim()} ${lastName.trim()} (@${cleanUsername}) with role '${role.role_name}'.`
    );

    res.json({
      success: true,
      staff: {
        staff_id: insertRes.insertId,
        username: cleanUsername,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        role_name: role.role_name,
      },
      message: `Account created for ${firstName.trim()} ${lastName.trim()}.`,
    });
  } catch (err: any) {
    console.error("Create staff error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to create staff account." });
  }
});

// PATCH /api/staff/:id/toggle
router.patch("/:id/toggle", requireRole(["Admin"]), async (req: Request, res: Response) => {
  try {
    const targetStaffId = parseInt(req.params.id as string, 10);
    const session = req.user!;

    if (targetStaffId === session.staff_id) {
      res.status(400).json({ success: false, error: "You cannot deactivate your own active session account." });
      return;
    }

    if (targetStaffId === 1) {
      res.status(400).json({ success: false, error: "System Gateway account cannot be modified." });
      return;
    }

    const target = await db.queryOne<{
      staff_id: number;
      username: string;
      first_name: string;
      last_name: string;
      is_active: number | boolean;
    }>("SELECT staff_id, username, first_name, last_name, is_active FROM staff WHERE staff_id = ? LIMIT 1", [
      targetStaffId,
    ]);

    if (!target) {
      res.status(404).json({ success: false, error: "Staff member not found." });
      return;
    }

    const nextActive = !Boolean(target.is_active);
    await db.execute("UPDATE staff SET is_active = ? WHERE staff_id = ?", [nextActive ? 1 : 0, targetStaffId]);

    logActivity(
      session.full_name,
      session.role_name,
      nextActive ? "Staff Activated" : "Staff Deactivated",
      `${nextActive ? "Activated" : "Deactivated"} account @${target.username} (${target.first_name} ${target.last_name}).`
    );

    res.json({
      success: true,
      isActive: nextActive,
      message: `Staff member @${target.username} has been ${nextActive ? "activated" : "deactivated"}.`,
    });
  } catch (err: any) {
    console.error("Toggle staff active error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to toggle staff status." });
  }
});

export default router;
