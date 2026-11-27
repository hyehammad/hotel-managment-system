import { Router, Request, Response } from "express";
import { db, withTransaction, toIsoDate, toIsoDateTime } from "../lib/db.js";
import { requireRole } from "../middleware/auth.js";
import { addNotification, logActivity } from "../lib/events.js";

const router = Router();

// GET /api/reservations
router.get("/", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string;
    const filterSql = statusFilter && statusFilter !== "all" ? "WHERE r.status = ?" : "";
    const filterParams = statusFilter && statusFilter !== "all" ? [statusFilter] : [];

    const reservations = await db.query(
      `SELECT
         r.reservation_id, r.guest_id, r.created_by, r.source, r.check_in_date, r.check_out_date,
         r.adults, r.children, r.status, r.special_requests, r.cancel_reason, r.created_at,
         g.first_name AS guest_first_name, g.last_name AS guest_last_name,
         g.email AS guest_email, g.phone AS guest_phone,
         st.first_name AS staff_first_name, st.last_name AS staff_last_name,
         inv.total_amount AS invoice_total
       FROM reservations r
       JOIN guests g ON g.guest_id = r.guest_id
       LEFT JOIN staff st ON st.staff_id = r.created_by
       LEFT JOIN invoices inv ON inv.reservation_id = r.reservation_id
       ${filterSql}
       ORDER BY r.created_at DESC
       LIMIT 100`,
      filterParams
    );

    if (reservations.length === 0) {
      res.json({ success: true, reservations: [] });
      return;
    }

    const resIds = reservations.map((r) => r.reservation_id);
    const idPlaceholders = resIds.map(() => "?").join(", ");

    const [rrRows, paymentRows] = await Promise.all([
      db.query(
        `SELECT
           rr.reservation_room_id, rr.reservation_id, rr.room_id, rr.rate_per_night,
           rm.room_number, rm.status AS room_status,
           rt.name AS room_type,
           s.stay_id, s.actual_check_in, s.actual_check_out
         FROM reservation_rooms rr
         JOIN rooms rm ON rm.room_id = rr.room_id
         JOIN room_types rt ON rt.room_type_id = rm.room_type_id
         LEFT JOIN stays s ON s.reservation_room_id = rr.reservation_room_id
         WHERE rr.reservation_id IN (${idPlaceholders})`,
        resIds
      ),
      db.query(
        `SELECT reservation_id, SUM(amount) AS paid_total
         FROM payments
         WHERE reservation_id IN (${idPlaceholders})
         GROUP BY reservation_id`,
        resIds
      ),
    ]);

    const paidByResId = new Map<number, number>();
    for (const p of paymentRows) {
      paidByResId.set(p.reservation_id, parseFloat(String(p.paid_total ?? 0)));
    }

    const rrsByResId = new Map<number, any[]>();
    for (const rr of rrRows) {
      const list = rrsByResId.get(rr.reservation_id) || [];
      list.push(rr);
      rrsByResId.set(rr.reservation_id, list);
    }

    const formatted = reservations.map((r) => {
      const rrs = rrsByResId.get(r.reservation_id) || [];
      const primaryRr = rrs[0];

      const checkInIso = toIsoDate(r.check_in_date);
      const checkOutIso = toIsoDate(r.check_out_date);
      const ratePerNight = primaryRr ? parseFloat(String(primaryRr.rate_per_night)) : 0;
      const nights = Math.max(
        1,
        Math.ceil((new Date(checkOutIso).getTime() - new Date(checkInIso).getTime()) / (1000 * 60 * 60 * 24))
      );

      const totalAmount = r.invoice_total ? parseFloat(String(r.invoice_total)) : ratePerNight * nights;
      const totalPaid = paidByResId.get(r.reservation_id) ?? 0;
      const isPaid = totalPaid >= totalAmount && totalAmount > 0;

      const assignedRooms = rrs.map((rr) => {
        let assignmentStatus: "RESERVED" | "CHECKED IN" | "COMPLETED" | "CANCELLED" = "RESERVED";
        if (r.status === "cancelled") {
          assignmentStatus = "CANCELLED";
        } else if (rr.stay_id) {
          assignmentStatus = rr.actual_check_out === null ? "CHECKED IN" : "COMPLETED";
        }

        return {
          reservation_room_id: rr.reservation_room_id,
          room_id: rr.room_id,
          room_number: rr.room_number ?? "Unassigned",
          room_type: rr.room_type ?? "Standard",
          room_status: rr.room_status ?? "unknown",
          rate_per_night: parseFloat(String(rr.rate_per_night)),
          assignment_status: assignmentStatus,
          stay_id: rr.stay_id ?? null,
          actual_check_in: toIsoDateTime(rr.actual_check_in),
          actual_check_out: toIsoDateTime(rr.actual_check_out),
        };
      });

      return {
        reservation_id: r.reservation_id,
        booking_reference: `RES-${String(r.reservation_id).padStart(4, "0")}`,
        source: r.source || "online",
        guest_name: `${r.guest_first_name} ${r.guest_last_name}`,
        guest_email: r.guest_email,
        guest_phone: r.guest_phone,
        room_id: primaryRr?.room_id,
        room_number: primaryRr?.room_number ?? "Unassigned",
        room_type: primaryRr?.room_type ?? "Standard",
        room_current_status: primaryRr?.room_status ?? "unknown",
        assigned_rooms: assignedRooms,
        check_in_date: checkInIso,
        check_out_date: checkOutIso,
        adults: r.adults,
        children: r.children,
        total_amount: totalAmount,
        total_paid: totalPaid,
        status: r.status,
        created_at: toIsoDateTime(r.created_at),
        cancel_reason: r.cancel_reason,
        special_requests: r.special_requests,
        created_by_staff: r.staff_first_name
          ? `${r.staff_first_name} ${r.staff_last_name}`
          : r.source === "online"
          ? "Online Guest"
          : "Reception",
        payment_status: isPaid ? "PAID" : "YET TO PAY",
        has_active_stay: primaryRr?.stay_id ? primaryRr.actual_check_out === null : false,
        actual_check_in: toIsoDateTime(primaryRr?.actual_check_in),
        actual_check_out: toIsoDateTime(primaryRr?.actual_check_out),
      };
    });

    res.json({ success: true, reservations: formatted });
  } catch (err: any) {
    console.error("Failed to fetch reservations:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch reservations." });
  }
});

// POST /api/reservations/:id/approve
router.post("/:id/approve", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const reservationId = parseInt(req.params.id as string, 10);
    const session = req.user!;

    const reservation = await db.queryOne<{
      reservation_id: number;
      status: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT r.reservation_id, r.status, g.first_name, g.last_name
       FROM reservations r
       JOIN guests g ON g.guest_id = r.guest_id
       WHERE r.reservation_id = ?
       LIMIT 1`,
      [reservationId]
    );

    if (!reservation) {
      res.status(404).json({ success: false, error: "Reservation not found." });
      return;
    }

    if (reservation.status !== "pending") {
      res.status(400).json({ success: false, error: `Cannot approve reservation with status '${reservation.status}'.` });
      return;
    }

    const roomRows = await db.query<{ room_number: string }>(
      `SELECT rm.room_number
       FROM reservation_rooms rr
       JOIN rooms rm ON rm.room_id = rr.room_id
       WHERE rr.reservation_id = ?`,
      [reservationId]
    );

    await db.execute("UPDATE reservations SET status = 'confirmed' WHERE reservation_id = ?", [reservationId]);

    const roomNums = roomRows.map((r) => r.room_number).join(", ");
    logActivity(
      session.full_name,
      session.role_name,
      "Reservation Approved",
      `Approved reservation RES-${String(reservationId).padStart(4, "0")} for ${reservation.first_name} ${reservation.last_name} in Room(s) ${roomNums}.`,
      roomNums
    );

    res.json({ success: true, message: "Reservation confirmed successfully." });
  } catch (err: any) {
    console.error("Error approving reservation:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to approve reservation." });
  }
});

// POST /api/reservations/:id/check-in
router.post("/:id/check-in", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const reservationId = parseInt(req.params.id as string, 10);
    const roomId = req.body.roomId ? parseInt(req.body.roomId, 10) : undefined;
    const session = req.user!;

    const reservation = await db.queryOne<{
      reservation_id: number;
      status: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT r.reservation_id, r.status, g.first_name, g.last_name
       FROM reservations r
       JOIN guests g ON g.guest_id = r.guest_id
       WHERE r.reservation_id = ?
       LIMIT 1`,
      [reservationId]
    );

    if (!reservation) {
      res.status(404).json({ success: false, error: "Reservation not found." });
      return;
    }

    if (reservation.status !== "confirmed" && reservation.status !== "pending") {
      res.status(400).json({
        success: false,
        error: `Reservation cannot be checked in. Current status: '${reservation.status}'. Only pending or confirmed reservations can be checked in.`,
      });
      return;
    }

    const rrs = await db.query<{
      reservation_room_id: number;
      room_id: number;
      room_number: string;
      room_status: string;
      stay_id: number | null;
      actual_check_out: Date | null;
    }>(
      `SELECT rr.reservation_room_id, rr.room_id, rm.room_number, rm.status AS room_status,
              s.stay_id, s.actual_check_out
       FROM reservation_rooms rr
       JOIN rooms rm ON rm.room_id = rr.room_id
       LEFT JOIN stays s ON s.reservation_room_id = rr.reservation_room_id
       WHERE rr.reservation_id = ?`,
      [reservationId]
    );

    const targetRr = roomId
      ? rrs.find((r) => r.room_id === roomId)
      : rrs.find((r) => !r.stay_id);

    if (!targetRr) {
      res.status(400).json({ success: false, error: "No pending room assignment found to check in." });
      return;
    }

    if (targetRr.stay_id && targetRr.actual_check_out === null) {
      res.status(400).json({ success: false, error: `Room ${targetRr.room_number} is already checked in.` });
      return;
    }

    if (targetRr.room_status === "maintenance") {
      res.status(400).json({ success: false, error: `Room ${targetRr.room_number} is under maintenance and cannot be checked in.` });
      return;
    }

    if (targetRr.room_status === "cleaning") {
      res.status(400).json({ success: false, error: `Room ${targetRr.room_number} is currently being cleaned. Housekeeping must finish before check-in.` });
      return;
    }

    await withTransaction(async (tx) => {
      // Lock the room and check for duplicate active stays
      const roomLock = await tx.queryOne<{ status: string }>(
        "SELECT status FROM rooms WHERE room_id = ? FOR UPDATE",
        [targetRr.room_id]
      );
      if (roomLock?.status === "occupied") {
        throw new Error(`Room ${targetRr.room_number} is already occupied.`);
      }

      const existingStay = await tx.queryOne<{ stay_id: number }>(
        `SELECT s.stay_id
         FROM stays s
         JOIN reservation_rooms rr ON rr.reservation_room_id = s.reservation_room_id
         WHERE rr.room_id = ? AND s.actual_check_out IS NULL
         LIMIT 1`,
        [targetRr.room_id]
      );
      if (existingStay) {
        throw new Error(`Room ${targetRr.room_number} already has an active stay.`);
      }

      await tx.execute(
        `INSERT INTO stays (reservation_room_id, actual_check_in, checked_in_by)
         VALUES (?, NOW(), ?)`,
        [targetRr.reservation_room_id, session.staff_id]
      );

      await tx.execute("UPDATE rooms SET status = 'occupied' WHERE room_id = ?", [targetRr.room_id]);

      const unCheckedRow = await tx.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM reservation_rooms rr
         LEFT JOIN stays s ON s.reservation_room_id = rr.reservation_room_id
         WHERE rr.reservation_id = ?
           AND (s.stay_id IS NULL OR s.actual_check_out IS NOT NULL)`,
        [reservationId]
      );

      if (Number(unCheckedRow?.cnt ?? 0) === 0) {
        await tx.execute("UPDATE reservations SET status = 'checked_in' WHERE reservation_id = ?", [reservationId]);
      }
    });

    logActivity(
      session.full_name,
      session.role_name,
      "Guest Check-in",
      `Checked in ${reservation.first_name} ${reservation.last_name} into Room ${targetRr.room_number}.`,
      targetRr.room_number
    );

    res.json({ success: true, message: `Checked in to Room ${targetRr.room_number} successfully.` });
  } catch (err: any) {
    console.error("Check-in error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to check in guest." });
  }
});

// POST /api/reservations/:id/check-out
router.post("/:id/check-out", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const reservationId = parseInt(req.params.id as string, 10);
    const roomId = req.body.roomId ? parseInt(req.body.roomId, 10) : undefined;
    const session = req.user!;

    const reservation = await db.queryOne<{
      reservation_id: number;
      first_name: string;
      last_name: string;
    }>(
      `SELECT r.reservation_id, g.first_name, g.last_name
       FROM reservations r
       JOIN guests g ON g.guest_id = r.guest_id
       WHERE r.reservation_id = ?
       LIMIT 1`,
      [reservationId]
    );

    if (!reservation) {
      res.status(404).json({ success: false, error: "Reservation not found." });
      return;
    }

    const rrs = await db.query<{
      reservation_room_id: number;
      room_id: number;
      room_number: string;
      stay_id: number | null;
      actual_check_out: Date | null;
    }>(
      `SELECT rr.reservation_room_id, rr.room_id, rm.room_number, s.stay_id, s.actual_check_out
       FROM reservation_rooms rr
       JOIN rooms rm ON rm.room_id = rr.room_id
       LEFT JOIN stays s ON s.reservation_room_id = rr.reservation_room_id
       WHERE rr.reservation_id = ?`,
      [reservationId]
    );

    const targetRr = roomId
      ? rrs.find((r) => r.room_id === roomId && r.stay_id && r.actual_check_out === null)
      : rrs.find((r) => r.stay_id && r.actual_check_out === null);

    if (!targetRr || !targetRr.stay_id) {
      res.status(400).json({ success: false, error: "No active stay found to check out for this room." });
      return;
    }

    const now = new Date();
    const checkoutTimeFormatted = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    await withTransaction(async (tx) => {
      await tx.execute(
        `UPDATE stays
         SET actual_check_out = ?, checked_out_by = ?
         WHERE stay_id = ?`,
        [now, session.staff_id, targetRr.stay_id]
      );

      const activeMaint = await tx.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM housekeeping_tasks
         WHERE room_id = ? AND notes LIKE '[MAINTENANCE]%' AND status IN ('pending', 'in_progress')`,
        [targetRr.room_id]
      );
      const nextRoomStatus = Number(activeMaint?.cnt ?? 0) > 0 ? "maintenance" : "cleaning";
      await tx.execute("UPDATE rooms SET status = ? WHERE room_id = ?", [nextRoomStatus, targetRr.room_id]);

      await tx.execute(
        `INSERT INTO housekeeping_tasks (room_id, status, notes)
         VALUES (?, 'pending', ?)`,
        [
          targetRr.room_id,
          `Guest checkout turnover. Completed at ${checkoutTimeFormatted}. Requires linen change and sanitization.`,
        ]
      );

      const remainingActiveRow = await tx.queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM stays s
         JOIN reservation_rooms rr ON rr.reservation_room_id = s.reservation_room_id
         WHERE rr.reservation_id = ? AND s.actual_check_out IS NULL`,
        [reservationId]
      );

      if (Number(remainingActiveRow?.cnt ?? 0) === 0) {
        await tx.execute("UPDATE reservations SET status = 'checked_out' WHERE reservation_id = ?", [reservationId]);
      }
    });

    addNotification(
      "housekeeping",
      `Turnover Required: Room ${targetRr.room_number}`,
      `Guest checked out of Room ${targetRr.room_number}. Cleaning turnover task dispatched.`,
      "checkout",
      targetRr.room_number
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Guest Check-out",
      `Checked out ${reservation.first_name} ${reservation.last_name} from Room ${targetRr.room_number}. Dispatched turnover task.`,
      targetRr.room_number
    );

    res.json({ success: true, message: `Checked out from Room ${targetRr.room_number}. Turnover task created.` });
  } catch (err: any) {
    console.error("Check-out error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to check out guest." });
  }
});

// POST /api/reservations/:id/cancel
router.post("/:id/cancel", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const reservationId = parseInt(req.params.id as string, 10);
    const reason = req.body.reason || "Cancelled by hotel staff";
    const session = req.user!;

    const reservation = await db.queryOne<{ reservation_id: number }>(
      "SELECT reservation_id FROM reservations WHERE reservation_id = ? LIMIT 1",
      [reservationId]
    );

    if (!reservation) {
      res.status(404).json({ success: false, error: "Reservation not found." });
      return;
    }

    const rrs = await db.query<{ room_id: number }>(
      "SELECT room_id FROM reservation_rooms WHERE reservation_id = ?",
      [reservationId]
    );

    await withTransaction(async (tx) => {
      await tx.execute(
        `UPDATE reservations
         SET status = 'cancelled', cancel_reason = ?
         WHERE reservation_id = ?`,
        [reason, reservationId]
      );

      for (const rr of rrs) {
        await tx.execute(
          `UPDATE rooms
           SET status = 'available'
           WHERE room_id = ? AND status = 'occupied'`,
          [rr.room_id]
        );
      }
    });

    logActivity(
      session.full_name,
      session.role_name,
      "Reservation Cancelled",
      `Cancelled booking RES-${String(reservationId).padStart(4, "0")}: ${reason}`
    );

    res.json({ success: true, message: "Reservation cancelled." });
  } catch (err: any) {
    console.error("Cancellation error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to cancel reservation." });
  }
});

// POST /api/reservations/walk-in
router.post("/walk-in", requireRole(["Admin", "Manager", "Receptionist"]), async (req: Request, res: Response) => {
  try {
    const session = req.user!;
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      nationality,
      roomId,
      checkInDate,
      checkOutDate,
      adults,
      children,
      specialRequests,
      directCheckIn,
      recordPayment,
      paymentMethod,
    } = req.body;

    if (!firstName || !lastName || !roomId || !checkInDate || !checkOutDate) {
      res.status(400).json({ success: false, error: "Missing required walk-in reservation fields." });
      return;
    }

    const parsedRoomId = parseInt(String(roomId), 10);
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const checkInIso = toIsoDate(checkInDate);
    const checkOutIso = toIsoDate(checkOutDate);

    const room = await db.queryOne<{
      room_id: number;
      room_number: string;
      status: string;
      type_name: string;
      base_price: string;
    }>(
      `SELECT r.room_id, r.room_number, r.status, rt.name AS type_name, rt.base_price
       FROM rooms r
       JOIN room_types rt ON rt.room_type_id = r.room_type_id
       WHERE r.room_id = ?
       LIMIT 1`,
      [parsedRoomId]
    );

    if (!room) {
      res.status(404).json({ success: false, error: "Room not found." });
      return;
    }

    if (room.status !== "available") {
      res.status(400).json({
        success: false,
        error: `Room ${room.room_number} is currently '${room.status}'. Only 'available' rooms can be assigned for walk-in guests.`,
      });
      return;
    }

    const overlapping = await db.queryOne<{ reservation_id: number }>(
      `SELECT res.reservation_id
       FROM reservation_rooms rr
       JOIN reservations res ON res.reservation_id = rr.reservation_id
       WHERE rr.room_id = ?
         AND res.status IN ('pending', 'confirmed', 'checked_in')
         AND res.check_in_date < ?
         AND res.check_out_date > ?
       LIMIT 1`,
      [parsedRoomId, checkOutIso, checkInIso]
    );

    if (overlapping) {
      res.status(400).json({ success: false, error: `Room ${room.room_number} has an overlapping booking for these dates.` });
      return;
    }

    const ratePerNight = parseFloat(String(room.base_price));
    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    const totalAmount = ratePerNight * nights;

    const cleanPhone = phone?.trim() || "";
    const cleanEmail = email?.trim() || null;

    const reservationId = await withTransaction(async (tx) => {
      let guest = cleanEmail
        ? await tx.queryOne<{ guest_id: number }>(
            "SELECT guest_id FROM guests WHERE phone = ? OR email = ? LIMIT 1",
            [cleanPhone, cleanEmail]
          )
        : await tx.queryOne<{ guest_id: number }>(
            "SELECT guest_id FROM guests WHERE phone = ? LIMIT 1",
            [cleanPhone]
          );

      let guestId: number;
      if (!guest) {
        const gRes = await tx.execute(
          `INSERT INTO guests (first_name, last_name, email, phone, gender, nationality)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            firstName.trim(),
            lastName.trim(),
            cleanEmail,
            cleanPhone,
            gender === "M" ? "M" : gender === "F" ? "F" : "Other",
            nationality?.trim() || "Pakistan",
          ]
        );
        guestId = gRes.insertId;
      } else {
        guestId = guest.guest_id;
      }

      const resInsert = await tx.execute(
        `INSERT INTO reservations (guest_id, created_by, source, check_in_date, check_out_date, adults, children, status, special_requests)
         VALUES (?, ?, 'walk_in', ?, ?, ?, ?, ?, ?)`,
        [
          guestId,
          session.staff_id,
          checkInIso,
          checkOutIso,
          Math.max(1, adults || 1),
          Math.max(0, children || 0),
          directCheckIn ? "checked_in" : "confirmed",
          specialRequests || null,
        ]
      );
      const newResId = resInsert.insertId;

      const rrInsert = await tx.execute(
        `INSERT INTO reservation_rooms (reservation_id, room_id, rate_per_night)
         VALUES (?, ?, ?)`,
        [newResId, room.room_id, ratePerNight]
      );
      const newRrId = rrInsert.insertId;

      await tx.execute(
        `INSERT INTO invoices (reservation_id, subtotal, tax_amount, discount_amount, total_amount, status, generated_by)
         VALUES (?, ?, 0, 0, ?, ?, ?)`,
        [newResId, totalAmount, totalAmount, recordPayment ? "paid" : "issued", session.staff_id]
      );

      if (recordPayment) {
        const methodVal =
          paymentMethod === "cash" ? "cash" : paymentMethod === "bank_transfer" ? "bank_transfer" : "card";
        await tx.execute(
          `INSERT INTO payments (reservation_id, amount, method, transaction_ref, processed_by)
           VALUES (?, ?, ?, ?, ?)`,
          [newResId, totalAmount, methodVal, `WALK-${Date.now()}`, session.staff_id]
        );
      }

      if (directCheckIn) {
        await tx.execute(
          `INSERT INTO stays (reservation_room_id, actual_check_in, checked_in_by)
           VALUES (?, NOW(), ?)`,
          [newRrId, session.staff_id]
        );

        await tx.execute("UPDATE rooms SET status = 'occupied' WHERE room_id = ?", [room.room_id]);
      }

      return newResId;
    });

    const referenceCode = `RES-${String(reservationId).padStart(4, "0")}`;

    logActivity(
      session.full_name,
      session.role_name,
      directCheckIn ? "Walk-In Direct Check-in" : "Walk-In Booking Created",
      `${directCheckIn ? "Directly checked in" : "Created reservation for"} ${firstName} ${lastName} in Room ${room.room_number}. Payment: ${recordPayment ? "PAID" : "YET TO PAY"}.`,
      room.room_number
    );

    res.json({
      success: true,
      reservationId,
      referenceCode,
      roomNumber: room.room_number,
      directCheckIn,
      message: directCheckIn
        ? `Walk-in guest ${firstName} ${lastName} checked in directly into Room ${room.room_number}! Room status: Occupied.`
        : `Walk-in booking ${referenceCode} confirmed for Room ${room.room_number}. Ready for check-in.`,
      reservation: {
        reservation_id: reservationId,
        booking_reference: referenceCode,
        room_number: room.room_number,
        room_type: room.type_name,
        total_amount: totalAmount,
        status: directCheckIn ? "checked_in" : "confirmed",
      },
    });
  } catch (err: any) {
    console.error("Walk-in booking error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to create walk-in reservation." });
  }
});

export default router;
