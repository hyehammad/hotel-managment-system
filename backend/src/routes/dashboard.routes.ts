import { Router, Request, Response } from "express";
import { db, toIsoDate, toIsoDateTime } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getAllActivityLogs,
  getNotificationsForRole,
  markNotificationAsRead,
  markAllNotificationsForRoleAsRead,
} from "../lib/events.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [
      roomsSummary,
      resSummary,
      activeStaysRow,
      hkPendingRow,
      maintPendingRow,
      staffCountRow,
    ] = await Promise.all([
      db.queryOne<{
        total: number;
        cleaning: number;
        maintenance: number;
      }>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'cleaning' THEN 1 ELSE 0 END) AS cleaning,
           SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance
         FROM rooms`
      ),
      db.queryOne<{
        total: number;
        pending: number;
        confirmed: number;
      }>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
         FROM reservations`
      ),
      db.queryOne<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM stays WHERE actual_check_out IS NULL"),
      db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM housekeeping_tasks
         WHERE status = 'pending'
           AND (notes IS NULL OR notes NOT LIKE '[MAINTENANCE]%')`
      ),
      db.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM housekeeping_tasks
         WHERE status = 'pending'
           AND notes LIKE '[MAINTENANCE]%'`
      ),
      db.queryOne<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM staff WHERE is_active = 1"),
    ]);

    const totalRooms = Number(roomsSummary?.total ?? 0);
    const cleaningRooms = Number(roomsSummary?.cleaning ?? 0);
    const maintenanceRooms = Number(roomsSummary?.maintenance ?? 0);
    const activeStays = Number(activeStaysRow?.cnt ?? 0);
    const occupiedRooms = activeStays;
    const availableRooms = Math.max(0, totalRooms - occupiedRooms - cleaningRooms - maintenanceRooms);

    res.json({
      success: true,
      stats: {
        rooms: {
          total: totalRooms,
          available: availableRooms,
          occupied: occupiedRooms,
          cleaning: cleaningRooms,
          maintenance: maintenanceRooms,
        },
        reservations: {
          total: Number(resSummary?.total ?? 0),
          pending: Number(resSummary?.pending ?? 0),
          confirmed: Number(resSummary?.confirmed ?? 0),
        },
        stays: {
          checkedIn: activeStays,
        },
        housekeeping: {
          pending: Number(hkPendingRow?.cnt ?? 0),
        },
        maintenance: {
          pending: Number(maintPendingRow?.cnt ?? 0),
        },
        staff: {
          totalActive: Number(staffCountRow?.cnt ?? 0),
        },
      },
    });
  } catch (err: any) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load stats." });
  }
});

// GET /api/dashboard/active-stays
router.get("/active-stays", requireRole(["Admin", "Manager", "Receptionist"]), async (_req: Request, res: Response) => {
  try {
    const activeStays = await db.query<{
      stay_id: number;
      reservation_id: number;
      actual_check_in: Date;
      room_id: number;
      room_number: string;
      floor: number | null;
      room_type: string;
      guest_first_name: string;
      guest_last_name: string;
      guest_phone: string;
      guest_email: string | null;
      check_out_date: Date;
      staff_first_name: string | null;
      staff_last_name: string | null;
      invoice_total: string | null;
      paid_total: string | null;
    }>(
      `SELECT
         s.stay_id,
         s.actual_check_in,
         res.reservation_id,
         res.check_out_date,
         rm.room_id,
         rm.room_number,
         rm.floor,
         rt.name AS room_type,
         g.first_name AS guest_first_name,
         g.last_name AS guest_last_name,
         g.phone AS guest_phone,
         g.email AS guest_email,
         st.first_name AS staff_first_name,
         st.last_name AS staff_last_name,
         inv.total_amount AS invoice_total,
         COALESCE(pay.paid_total, 0) AS paid_total
       FROM stays s
       JOIN reservation_rooms rr ON rr.reservation_room_id = s.reservation_room_id
       JOIN rooms rm ON rm.room_id = rr.room_id
       JOIN room_types rt ON rt.room_type_id = rm.room_type_id
       JOIN reservations res ON res.reservation_id = rr.reservation_id
       JOIN guests g ON g.guest_id = res.guest_id
       LEFT JOIN staff st ON st.staff_id = s.checked_in_by
       LEFT JOIN invoices inv ON inv.reservation_id = res.reservation_id
       LEFT JOIN (
         SELECT reservation_id, SUM(amount) AS paid_total
         FROM payments
         GROUP BY reservation_id
       ) pay ON pay.reservation_id = res.reservation_id
       WHERE s.actual_check_out IS NULL
       ORDER BY s.actual_check_in DESC`
    );

    const formatted = activeStays.map((s) => {
      const invoiceTotal = s.invoice_total ? parseFloat(String(s.invoice_total)) : 0;
      const totalPaid = s.paid_total ? parseFloat(String(s.paid_total)) : 0;
      const isPaid = totalPaid >= invoiceTotal && invoiceTotal > 0;

      return {
        stay_id: s.stay_id,
        reservation_id: s.reservation_id,
        booking_reference: `RES-${String(s.reservation_id).padStart(4, "0")}`,
        room_id: s.room_id,
        room_number: s.room_number,
        room_type: s.room_type,
        floor: s.floor,
        guest_name: `${s.guest_first_name} ${s.guest_last_name}`,
        guest_phone: s.guest_phone,
        guest_email: s.guest_email,
        check_in_date: toIsoDate(s.actual_check_in),
        check_in_time: toIsoDateTime(s.actual_check_in),
        expected_check_out: toIsoDate(s.check_out_date),
        stay_status: "Checked In",
        payment_status: isPaid ? "PAID" : "YET TO PAY",
        total_amount: invoiceTotal,
        amount_paid: totalPaid,
        checked_in_by: s.staff_first_name
          ? `${s.staff_first_name} ${s.staff_last_name}`
          : "Staff",
      };
    });

    res.json({ success: true, activeStays: formatted });
  } catch (err: any) {
    console.error("Active stays error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load active stays." });
  }
});

// GET /api/dashboard/activity-logs
router.get("/activity-logs", requireRole(["Admin", "Manager"]), (_req: Request, res: Response) => {
  const logs = getAllActivityLogs();
  res.json({ success: true, logs });
});

// GET /api/dashboard/notifications
router.get("/notifications", requireAuth, (req: Request, res: Response) => {
  const session = req.user!;
  const notifs = getNotificationsForRole(session.role_name);
  res.json({ success: true, notifications: notifs });
});

// POST /api/dashboard/notifications/:id/read
router.post("/notifications/:id/read", requireAuth, (req: Request, res: Response) => {
  markNotificationAsRead(req.params.id as string);
  res.json({ success: true });
});

// POST /api/dashboard/notifications/read-all
router.post("/notifications/read-all", requireAuth, (req: Request, res: Response) => {
  const session = req.user!;
  markAllNotificationsForRoleAsRead(session.role_name);
  res.json({ success: true });
});

export default router;
