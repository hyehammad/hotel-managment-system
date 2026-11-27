"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { addNotification } from "@/lib/events";

export interface BookingInput {
  roomTypeId: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender?: "M" | "F" | "Other";
  nationality?: string;
  specialRequests?: string;
  paymentOption?: "online_card" | "pay_on_arrival";
  cardDetails?: {
    cardholderName?: string;
    cardNumberLast4?: string;
  };
}

export interface BookingResult {
  success: boolean;
  message?: string;
  reservationId?: number;
  referenceCode?: string;
  roomNumber?: string;
  roomTypeName?: string;
  ratePerNight?: number;
  totalNights?: number;
  estimatedTotal?: number;
  paymentOption?: "online_card" | "pay_on_arrival";
  isPaid?: boolean;
}

// 1. Check availability for a specific room type and date range
export async function checkRoomTypeAvailability(
  roomTypeId: number,
  checkInDate: string,
  checkOutDate: string
): Promise<{ available: boolean; availableCount: number; message?: string }> {
  try {
    if (!checkInDate || !checkOutDate) {
      return { available: false, availableCount: 0, message: "Dates are required" };
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkOut <= checkIn) {
      return { available: false, availableCount: 0, message: "Check-out must be after check-in" };
    }

    // Execute reference query from hotel_db.sql:
    // Rooms of given type where status <> 'maintenance' and no overlapping active reservations
    const availableRooms = await prisma.$queryRaw<Array<{ room_id: number; room_number: string }>>`
      SELECT r.room_id, r.room_number
      FROM rooms r
      WHERE r.room_type_id = ${roomTypeId}
        AND r.status <> 'maintenance'
        AND NOT EXISTS (
          SELECT 1
          FROM reservation_rooms rr
          JOIN reservations res ON res.reservation_id = rr.reservation_id
          WHERE rr.room_id = r.room_id
            AND res.status IN ('pending', 'confirmed', 'checked_in')
            AND res.check_in_date < ${checkOutDate}
            AND res.check_out_date > ${checkInDate}
        )
    `;

    return {
      available: availableRooms.length > 0,
      availableCount: availableRooms.length,
    };
  } catch (error) {
    console.error("Availability check failed:", error);
    return { available: false, availableCount: 0, message: "Database query failed" };
  }
}

// 2. Submit a guest reservation with concurrency row locking (SELECT ... FOR UPDATE)
export async function submitGuestBooking(input: BookingInput): Promise<BookingResult> {
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
      paymentOption = "pay_on_arrival",
      cardDetails,
    } = input;

    // Validate dates
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return { success: false, message: "Invalid check-in or check-out date." };
    }

    if (checkOut <= checkIn) {
      return { success: false, message: "Check-out date must be strictly after check-in date." };
    }

    if (!firstName || !lastName || !phone) {
      return { success: false, message: "First name, last name, and phone number are required." };
    }

    const diffTime = checkOut.getTime() - checkIn.getTime();
    const totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Execute atomic reservation within transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Lock available room of the selected type with SELECT ... FOR UPDATE
      const availableRooms = await tx.$queryRaw<
        Array<{ room_id: number; room_number: string; base_price: string; type_name: string }>
      >`
        SELECT r.room_id, r.room_number, rt.base_price, rt.name as type_name
        FROM rooms r
        JOIN room_types rt ON rt.room_type_id = r.room_type_id
        WHERE r.room_type_id = ${roomTypeId}
          AND r.status <> 'maintenance'
          AND NOT EXISTS (
            SELECT 1
            FROM reservation_rooms rr
            JOIN reservations res ON res.reservation_id = rr.reservation_id
            WHERE rr.room_id = r.room_id
              AND res.status IN ('pending', 'confirmed', 'checked_in')
              AND res.check_in_date < ${checkOutDate}
              AND res.check_out_date > ${checkInDate}
          )
        LIMIT 1
        FOR UPDATE;
      `;

      if (availableRooms.length === 0) {
        throw new Error("No rooms of this type are available for the selected dates. Please select another date or room type.");
      }

      const selectedRoom = availableRooms[0];
      const ratePerNight = parseFloat(selectedRoom.base_price);
      const estimatedTotal = ratePerNight * totalNights;

      // Step B: Find or create guest record
      let guest = await tx.guests.findFirst({
        where: { phone },
      });

      if (!guest) {
        guest = await tx.guests.create({
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email ? email.trim() : null,
            phone: phone.trim(),
            gender: gender || null,
            nationality: nationality || null,
          },
        });
      } else if (email && !guest.email) {
        // Update contact email if previously missing
        await tx.guests.update({
          where: { guest_id: guest.guest_id },
          data: { email: email.trim() },
        });
      }

      // Step C: Create the reservation (Status is 'pending', source is 'online', created_by is NULL)
      const reservation = await tx.reservations.create({
        data: {
          guest_id: guest.guest_id,
          source: "online",
          created_by: null,
          check_in_date: checkIn,
          check_out_date: checkOut,
          adults: Math.max(1, adults),
          children: Math.max(0, children || 0),
          status: "pending",
          special_requests: specialRequests ? specialRequests.trim() : null,
        },
      });

      // Step D: Create reservation_room price snapshot
      await tx.reservation_rooms.create({
        data: {
          reservation_id: reservation.reservation_id,
          room_id: selectedRoom.room_id,
          rate_per_night: ratePerNight,
        },
      });

      // Step E: Create Invoice for clear financial accounting
      const isPaidOnline = paymentOption === "online_card";
      await tx.invoices.create({
        data: {
          reservation_id: reservation.reservation_id,
          subtotal: estimatedTotal,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: estimatedTotal,
          status: isPaidOnline ? "paid" : "issued",
          generated_by: 1, // System Gateway
        },
      });

      // Step F: If paid online with card, create verified payment record
      if (isPaidOnline) {
        const last4 = cardDetails?.cardNumberLast4 || "4242";
        await tx.payments.create({
          data: {
            reservation_id: reservation.reservation_id,
            amount: estimatedTotal,
            method: "online",
            transaction_ref: `ONL-${Date.now()}-${last4}`,
            processed_by: 1, // System Gateway
          },
        });
      }

      return {
        reservationId: reservation.reservation_id,
        referenceCode: `RES-${String(reservation.reservation_id).padStart(4, "0")}`,
        roomNumber: selectedRoom.room_number,
        roomTypeName: selectedRoom.type_name,
        ratePerNight,
        totalNights,
        estimatedTotal,
        paymentOption,
        isPaid: isPaidOnline,
      };
    }, { timeout: 30000, maxWait: 15000 });

    const paymentLabel = result.isPaid ? "PAID ONLINE" : "PAYMENT ON ARRIVAL";

    // Notify Receptionist and Admin in real time
    addNotification(
      "receptionist",
      "New Online Reservation",
      `Online reservation ${result.referenceCode} placed for ${firstName} ${lastName} – Room ${result.roomNumber} (${checkInDate} to ${checkOutDate}) [${paymentLabel}].`,
      "online_booking",
      result.roomNumber,
      "/staff/dashboard/reservations"
    );

    addNotification(
      "admin",
      "New Online Reservation",
      `Online reservation ${result.referenceCode} placed for ${firstName} ${lastName} – Room ${result.roomNumber} [${paymentLabel}].`,
      "online_booking",
      result.roomNumber,
      "/staff/dashboard/reservations"
    );

    revalidatePath("/");
    revalidatePath("/book");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");

    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error("Booking error:", error);
    return {
      success: false,
      message: error.message || "Failed to submit booking. Please try again.",
    };
  }
}

// 3. Guest booking lookup by Reference ID and Email or Phone
export async function lookupGuestBooking(referenceInput: string, contactInput: string) {
  try {
    const rawId = referenceInput.replace(/[^0-9]/g, "");
    const reservationId = parseInt(rawId, 10);

    if (isNaN(reservationId)) {
      return { success: false, message: "Invalid booking reference format. Example: RES-0001 or 1" };
    }

    const cleanContact = contactInput.trim().toLowerCase();

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        guests: true,
        reservation_rooms: {
          include: {
            rooms: {
              include: {
                room_types: true,
              },
            },
          },
        },
        invoices: {
          include: {
            invoice_items: true,
          },
        },
        payments: true,
      },
    });

    if (!reservation) {
      return { success: false, message: "No reservation found matching this reference." };
    }

    // Verify contact info matches guest record
    const guestEmail = (reservation.guests.email || "").toLowerCase();
    const guestPhone = (reservation.guests.phone || "").toLowerCase();

    if (!cleanContact || (!guestEmail.includes(cleanContact) && !guestPhone.includes(cleanContact))) {
      return { success: false, message: "The email or phone provided does not match the reservation record." };
    }

    const roomInfo = reservation.reservation_rooms[0];
    const roomType = roomInfo?.rooms?.room_types;
    const rate = roomInfo ? parseFloat(roomInfo.rate_per_night.toString()) : 0;

    const checkIn = new Date(reservation.check_in_date);
    const checkOut = new Date(reservation.check_out_date);
    const diffTime = checkOut.getTime() - checkIn.getTime();
    const totalNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const totalEstimated = rate * totalNights;

    // Check if pending has expired (> 24 hours from creation)
    const createdAt = new Date(reservation.created_at);
    const now = new Date();
    const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    const isPast24Hours = hoursElapsed >= 24;

    return {
      success: true,
      booking: {
        reservationId: reservation.reservation_id,
        referenceCode: `RES-${String(reservation.reservation_id).padStart(4, "0")}`,
        status: reservation.status,
        checkInDate: reservation.check_in_date.toISOString().split("T")[0],
        checkOutDate: reservation.check_out_date.toISOString().split("T")[0],
        adults: reservation.adults,
        children: reservation.children,
        specialRequests: reservation.special_requests,
        createdAt: reservation.created_at.toISOString(),
        isPast24Hours,
        guest: {
          name: `${reservation.guests.first_name} ${reservation.guests.last_name}`,
          email: reservation.guests.email,
          phone: reservation.guests.phone,
        },
        room: {
          roomNumber: roomInfo?.rooms?.room_number || "TBD",
          typeName: roomType?.name || "Standard Room",
          bedType: roomType?.bed_type || "Single",
          ratePerNight: rate,
          totalNights,
          totalEstimated,
        },
        payments: reservation.payments.map((p) => ({
          paymentId: p.payment_id,
          amount: parseFloat(p.amount.toString()),
          method: p.method,
          paidAt: p.paid_at.toISOString(),
        })),
      },
    };
  } catch (error) {
    console.error("Lookup failed:", error);
    return { success: false, message: "Error looking up reservation details." };
  }
}
