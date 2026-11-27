import { Router, Request, Response } from "express";
import { db, withTransaction, toIsoDate, toIsoDateTime } from "../lib/db.js";
import { addNotification } from "../lib/events.js";

const router = Router();

// GET /api/bookings/public-home
router.get("/public-home", async (_req: Request, res: Response) => {
  try {
    const [roomTypesRaw, roomsRaw, rtaRaw, servicesRaw] = await Promise.all([
      db.query("SELECT * FROM room_types ORDER BY base_price ASC"),
      db.query("SELECT * FROM rooms ORDER BY room_number ASC"),
      db.query(
        `SELECT rta.room_type_id, rta.amenity_id, a.name AS amenity_name
         FROM room_type_amenities rta
         JOIN amenities a ON a.amenity_id = rta.amenity_id`
      ),
      db.query("SELECT * FROM services WHERE is_active = 1 ORDER BY price DESC LIMIT 6"),
    ]);

    const roomTypes = roomTypesRaw.map((rt) => ({
      ...rt,
      base_price: String(rt.base_price),
      rooms: roomsRaw.filter((r) => r.room_type_id === rt.room_type_id),
      room_type_amenities: rtaRaw
        .filter((rta) => rta.room_type_id === rt.room_type_id)
        .map((rta) => ({
          room_type_id: rta.room_type_id,
          amenity_id: rta.amenity_id,
          amenities: {
            amenity_id: rta.amenity_id,
            name: rta.amenity_name,
          },
        })),
    }));

    const services = servicesRaw.map((s) => ({
      ...s,
      price: String(s.price),
      is_active: Boolean(s.is_active),
    }));

    res.json({ success: true, roomTypes, services });
  } catch (err: any) {
    console.error("Failed to load public home data:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to load public data." });
  }
});

// GET /api/bookings/available-rooms
router.get("/available-rooms", async (req: Request, res: Response) => {
  try {
    const roomTypeId = parseInt(req.query.roomTypeId as string, 10);
    const checkInDate = req.query.checkInDate as string;
    const checkOutDate = req.query.checkOutDate as string;

    if (!roomTypeId || !checkInDate || !checkOutDate) {
      res.status(400).json({ success: false, available: false, availableCount: 0, message: "Missing required parameters." });
      return;
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkOut <= checkIn) {
      res.status(400).json({ success: false, available: false, availableCount: 0, message: "Check-out must be after check-in." });
      return;
    }

    const availableRooms = await db.query<{ room_id: number; room_number: string }>(
      `SELECT r.room_id, r.room_number
       FROM rooms r
       WHERE r.room_type_id = ?
         AND r.status <> 'maintenance'
         AND NOT EXISTS (
           SELECT 1
           FROM reservation_rooms rr
           JOIN reservations res ON res.reservation_id = rr.reservation_id
           WHERE rr.room_id = r.room_id
             AND res.status IN ('pending', 'confirmed', 'checked_in')
             AND res.check_in_date < ?
             AND res.check_out_date > ?
         )`,
      [roomTypeId, checkOutDate, checkInDate]
    );

    res.json({
      success: true,
      available: availableRooms.length > 0,
      availableCount: availableRooms.length,
      rooms: availableRooms,
    });
  } catch (err: any) {
    console.error("Availability check failed:", err);
    res.status(500).json({ success: false, available: false, availableCount: 0, error: err.message });
  }
});

// POST /api/bookings
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      roomTypeId,
      checkInDate,
      checkOutDate,
      adults,
      children,
      firstName,
      lastName,
      email,
      phone,
      gender,
      nationality,
      specialRequests,
    } = req.body;

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      res.status(400).json({ success: false, message: "Please provide valid check-in and check-out dates." });
      return;
    }

    const diffTime = checkOut.getTime() - checkIn.getTime();
    const totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const parsedRoomTypeId = parseInt(String(roomTypeId), 10);

    const result = await withTransaction(async (tx) => {
      const availableRooms = await tx.query<{
        room_id: number;
        room_number: string;
        base_price: string;
        type_name: string;
      }>(
        `SELECT r.room_id, r.room_number, rt.base_price, rt.name AS type_name
         FROM rooms r
         JOIN room_types rt ON rt.room_type_id = r.room_type_id
         WHERE r.room_type_id = ?
           AND r.status <> 'maintenance'
           AND NOT EXISTS (
             SELECT 1
             FROM reservation_rooms rr
             JOIN reservations res ON res.reservation_id = rr.reservation_id
             WHERE rr.room_id = r.room_id
               AND res.status IN ('pending', 'confirmed', 'checked_in')
               AND res.check_in_date < ?
               AND res.check_out_date > ?
           )
         LIMIT 1
         FOR UPDATE`,
        [parsedRoomTypeId, checkOutDate, checkInDate]
      );

      if (availableRooms.length === 0) {
        throw new Error("No rooms of this type are available for the selected dates.");
      }

      const selectedRoom = availableRooms[0];
      const ratePerNight = parseFloat(String(selectedRoom.base_price));
      const estimatedTotal = ratePerNight * totalNights;

      const cleanEmail = email?.trim() || "";
      const cleanPhone = phone?.trim() || "";

      let guest = cleanEmail
        ? await tx.queryOne<{ guest_id: number }>(
            "SELECT guest_id FROM guests WHERE email = ? OR phone = ? LIMIT 1",
            [cleanEmail, cleanPhone]
          )
        : await tx.queryOne<{ guest_id: number }>(
            "SELECT guest_id FROM guests WHERE phone = ? LIMIT 1",
            [cleanPhone]
          );

      let guestId: number;
      if (!guest) {
        const guestInsert = await tx.execute(
          `INSERT INTO guests (first_name, last_name, email, phone, gender, nationality)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            firstName.trim(),
            lastName.trim(),
            cleanEmail || null,
            cleanPhone,
            gender === "M" ? "M" : gender === "F" ? "F" : "Other",
            nationality?.trim() || "Pakistan",
          ]
        );
        guestId = guestInsert.insertId;
      } else {
        guestId = guest.guest_id;
      }

      const resInsert = await tx.execute(
        `INSERT INTO reservations (guest_id, source, status, check_in_date, check_out_date, adults, children, special_requests)
         VALUES (?, 'online', 'pending', ?, ?, ?, ?, ?)`,
        [
          guestId,
          toIsoDate(checkInDate),
          toIsoDate(checkOutDate),
          adults || 1,
          children || 0,
          specialRequests?.trim() || null,
        ]
      );

      const reservationId = resInsert.insertId;

      await tx.execute(
        `INSERT INTO reservation_rooms (reservation_id, room_id, rate_per_night)
         VALUES (?, ?, ?)`,
        [reservationId, selectedRoom.room_id, ratePerNight]
      );

      return {
        reservationId,
        referenceCode: `RES-${String(reservationId).padStart(4, "0")}`,
        roomNumber: selectedRoom.room_number,
        roomTypeName: selectedRoom.type_name,
        ratePerNight,
        totalNights,
        estimatedTotal,
      };
    });

    addNotification(
      "receptionist",
      "New Online Reservation",
      `Online reservation ${result.referenceCode} placed for ${firstName} ${lastName} – Room ${result.roomNumber} (${checkInDate} to ${checkOutDate}).`,
      "online_booking",
      result.roomNumber,
      "/staff/dashboard/reservations"
    );

    addNotification(
      "admin",
      "New Online Reservation",
      `Online reservation ${result.referenceCode} placed for ${firstName} ${lastName} – Room ${result.roomNumber}.`,
      "online_booking",
      result.roomNumber,
      "/staff/dashboard/reservations"
    );

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Booking submission error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to submit booking." });
  }
});

// GET /api/bookings/lookup
router.get("/lookup", async (req: Request, res: Response) => {
  try {
    const reference = (req.query.reference as string) || "";
    const contact = ((req.query.contact as string) || "").trim().toLowerCase();

    const rawId = reference.replace(/[^0-9]/g, "");
    const reservationId = parseInt(rawId, 10);

    if (isNaN(reservationId)) {
      res.status(400).json({ success: false, message: "Invalid booking reference format. Example: RES-0001 or 1" });
      return;
    }

    const reservation = await db.queryOne(
      `SELECT r.*, g.first_name, g.last_name, g.email AS guest_email, g.phone AS guest_phone
       FROM reservations r
       JOIN guests g ON g.guest_id = r.guest_id
       WHERE r.reservation_id = ?
       LIMIT 1`,
      [reservationId]
    );

    if (!reservation) {
      res.status(404).json({ success: false, message: "No reservation found matching this reference." });
      return;
    }

    const guestEmail = (reservation.guest_email || "").toLowerCase();
    const guestPhone = (reservation.guest_phone || "").toLowerCase();

    if (!contact || (!guestEmail.includes(contact) && !guestPhone.includes(contact))) {
      res.status(400).json({ success: false, message: "The email or phone provided does not match the reservation record." });
      return;
    }

    const [roomInfo, payments] = await Promise.all([
      db.queryOne(
        `SELECT rr.rate_per_night, rm.room_number, rt.name AS type_name, rt.bed_type
         FROM reservation_rooms rr
         JOIN rooms rm ON rm.room_id = rr.room_id
         JOIN room_types rt ON rt.room_type_id = rm.room_type_id
         WHERE rr.reservation_id = ?
         LIMIT 1`,
        [reservationId]
      ),
      db.query(
        `SELECT payment_id, amount, method, paid_at
         FROM payments
         WHERE reservation_id = ?
         ORDER BY paid_at DESC`,
        [reservationId]
      ),
    ]);

    const rate = roomInfo ? parseFloat(String(roomInfo.rate_per_night)) : 0;
    const checkInIso = toIsoDate(reservation.check_in_date);
    const checkOutIso = toIsoDate(reservation.check_out_date);
    const checkIn = new Date(checkInIso);
    const checkOut = new Date(checkOutIso);
    const totalNights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    res.json({
      success: true,
      booking: {
        reservationId: reservation.reservation_id,
        referenceCode: `RES-${String(reservation.reservation_id).padStart(4, "0")}`,
        status: reservation.status,
        checkInDate: checkInIso,
        checkOutDate: checkOutIso,
        adults: reservation.adults,
        children: reservation.children,
        specialRequests: reservation.special_requests,
        createdAt: toIsoDateTime(reservation.created_at),
        guest: {
          name: `${reservation.first_name} ${reservation.last_name}`,
          email: reservation.guest_email,
          phone: reservation.guest_phone,
        },
        room: {
          roomNumber: roomInfo?.room_number || "TBD",
          typeName: roomInfo?.type_name || "Standard Room",
          bedType: roomInfo?.bed_type || "Single",
          ratePerNight: rate,
          totalNights,
          totalEstimated: rate * totalNights,
        },
        payments: payments.map((p) => ({
          paymentId: p.payment_id,
          amount: parseFloat(String(p.amount)),
          method: p.method,
          paidAt: toIsoDateTime(p.paid_at),
        })),
      },
    });
  } catch (err: any) {
    console.error("Lookup failed:", err);
    res.status(500).json({ success: false, message: "Error looking up reservation details." });
  }
});

export default router;
