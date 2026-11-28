"use server";

import { prisma } from "@/lib/prisma";
import { getStaffSession } from "./auth";
import { revalidatePath } from "next/cache";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import {
  calculateFinancialSummary,
  syncInvoiceStatus,
  lockInvoiceForReservation,
  type PaymentStatus,
} from "@/lib/financial";
import {
  addNotification,
  logActivity,
  getNotificationsForRole,
  getAllActivityLogs,
  submitSeriousIssueRecord,
  getAllSeriousIssues,
  getSeriousIssueById,
  getSeriousIssueByTaskId,
  updateSeriousIssueDecision,
  updateSeriousIssueProgress,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/events";
import {
  validatePersonName,
  validatePhoneNumber,
  validateEmail,
  validateStaffUsername,
  validateStaffPassword,
  sanitizeFreeText,
} from "@/lib/validation";

// ─── RBAC Helpers ────────────────────────────────────────────────────────────

export async function requireStaff() {
  const session = await getStaffSession();
  if (!session) {
    throw new Error("Unauthorized: Staff login required.");
  }
  return session;
}

export async function requireRole(allowedRoles: string[]) {
  const session = await requireStaff();
  const normalizedUserRole = session.role_name.toLowerCase();
  const hasAccess = allowedRoles.some((r) => r.toLowerCase() === normalizedUserRole);

  if (!hasAccess) {
    throw new Error(
      `Access restricted for role '${session.role_name}'. Required: ${allowedRoles.join(" or ")}`
    );
  }
  return session;
}

// ─── Duplicate Maintenance Request Prevention ──────────────────────────────

function normalizeMaintenanceIssueText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/\[maintenance\]/gi, "")
    .replace(/\[source:[^\]]+\]/gi, "")
    .replace(/\[severity:[^\]]+\]/gi, "")
    .replace(/\[escalation[^\]]*\]/gi, "")
    .replace(/\[approved[^\]]*\]/gi, "")
    .replace(/\[guest request\]/gi, "")
    .replace(/\|?\s*resolved:.*$/gi, "")
    .replace(/\(reported by[^)]*\)/gi, "")
    .replace(/\(authorized by[^)]*\)/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAINTENANCE_STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "were",
  "it", "this", "that", "and", "or", "be", "been", "has", "have", "had", "do", "does", "did",
  "very", "too", "quite", "heavily", "badly", "extremely", "room", "issue", "problem",
  "needs", "need", "needed", "repair", "maintenance", "fix", "fixed"
]);

function getSignificantKeywords(text: string): string[] {
  const normalized = normalizeMaintenanceIssueText(text);
  const words = normalized
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !MAINTENANCE_STOP_WORDS.has(w));
  return words;
}

function isSameMaintenanceIssue(newIssue: string, existingNote: string): boolean {
  const a = normalizeMaintenanceIssueText(newIssue);
  const b = normalizeMaintenanceIssueText(existingNote);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const wordsA = getSignificantKeywords(newIssue);
  const wordsB = getSignificantKeywords(existingNote);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  // Count common keywords or stems
  const common = wordsA.filter(
    (w) => wordsB.includes(w) || wordsB.some((wb) => wb.startsWith(w) || w.startsWith(wb))
  );

  const overlapRatioA = common.length / wordsA.length;

  if (common.length >= 2 || (wordsA.length === 1 && common.length === 1 && overlapRatioA >= 0.5)) {
    return true;
  }

  return false;
}

// ─── Dashboard Overview Stats ───────────────────────────────────────────────

export async function getDashboardStats() {
  await requireStaff();

  const [
    totalRooms,
    cleaningRooms,
    maintenanceRooms,
    totalReservations,
    pendingReservations,
    confirmedReservations,
    activeStays,
    pendingHousekeeping,
    pendingMaintenance,
    totalStaff,
  ] = await Promise.all([
    prisma.rooms.count(),
    prisma.rooms.count({ where: { status: "cleaning" } }),
    prisma.rooms.count({ where: { status: "maintenance" } }),
    prisma.reservations.count(),
    prisma.reservations.count({ where: { status: "pending" } }),
    prisma.reservations.count({ where: { status: "confirmed" } }),
    prisma.stays.count({ where: { actual_check_out: null } }),
    prisma.housekeeping_tasks.count({
      where: {
        status: "pending",
        NOT: { notes: { startsWith: "[MAINTENANCE]" } },
      },
    }),
    prisma.housekeeping_tasks.count({
      where: {
        status: "pending",
        notes: { startsWith: "[MAINTENANCE]" },
      },
    }),
    prisma.staff.count({ where: { is_active: true } }),
  ]);

  const occupiedRooms = activeStays;
  const availableRooms = Math.max(0, totalRooms - occupiedRooms - cleaningRooms - maintenanceRooms);

  return {
    rooms: {
      total: totalRooms,
      available: availableRooms,
      occupied: occupiedRooms,
      cleaning: cleaningRooms,
      maintenance: maintenanceRooms,
    },
    reservations: {
      total: totalReservations,
      pending: pendingReservations,
      confirmed: confirmedReservations,
    },
    stays: {
      checkedIn: activeStays,
    },
    housekeeping: {
      pending: pendingHousekeeping,
    },
    maintenance: {
      pending: pendingMaintenance,
    },
    staff: {
      totalActive: totalStaff,
    },
  };
}

// ─── Reservations Management (Receptionist, Manager, Admin) ─────────────────

export async function getStaffReservations(statusFilter?: string) {
  await requireRole(["Admin", "Manager", "Receptionist"]);

  const whereClause: any = {};
  if (statusFilter && statusFilter !== "all") {
    whereClause.status = statusFilter;
  }

  const reservations = await prisma.reservations.findMany({
    where: whereClause,
    include: {
      guests: true,
      reservation_rooms: {
        include: {
          rooms: {
            include: {
              room_types: true,
            },
          },
          stays: true,
        },
      },
      staff: {
        select: {
          staff_id: true,
          first_name: true,
          last_name: true,
          username: true,
        },
      },
      payments: true,
      invoices: true,
    },
    orderBy: {
      created_at: "desc",
    },
    take: 100,
  });

  return reservations.map((r) => {
    const primaryRr = r.reservation_rooms[0];
    const primaryRoom = primaryRr?.rooms;
    const ratePerNight = primaryRr ? parseFloat(primaryRr.rate_per_night.toString()) : 0;
    const nights = Math.max(
      1,
      Math.ceil(
        (new Date(r.check_out_date).getTime() - new Date(r.check_in_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const totalAmountDecimal = r.invoices
      ? r.invoices.total_amount
      : new Prisma.Decimal(ratePerNight).times(nights);

    const summary = calculateFinancialSummary(totalAmountDecimal, r.payments);

    const assignedRooms = r.reservation_rooms.map((rr) => {
      const stay = rr.stays;
      let assignmentStatus: "RESERVED" | "CHECKED IN" | "COMPLETED" | "CANCELLED" = "RESERVED";
      if (r.status === "cancelled") {
        assignmentStatus = "CANCELLED";
      } else if (stay) {
        if (stay.actual_check_out === null) {
          assignmentStatus = "CHECKED IN";
        } else {
          assignmentStatus = "COMPLETED";
        }
      } else {
        assignmentStatus = "RESERVED";
      }

      return {
        reservation_room_id: rr.reservation_room_id,
        room_id: rr.rooms?.room_id,
        room_number: rr.rooms?.room_number ?? "Unassigned",
        room_type: rr.rooms?.room_types.name ?? "Standard",
        room_status: rr.rooms?.status ?? "unknown",
        rate_per_night: parseFloat(rr.rate_per_night.toString()),
        assignment_status: assignmentStatus,
        stay_id: stay?.stay_id ?? null,
        actual_check_in: stay?.actual_check_in ? stay.actual_check_in.toISOString() : null,
        actual_check_out: stay?.actual_check_out ? stay.actual_check_out.toISOString() : null,
      };
    });

    return {
      reservation_id: r.reservation_id,
      booking_reference: `RES-${String(r.reservation_id).padStart(4, "0")}`,
      source: r.source || "online",
      guest_name: `${r.guests.first_name} ${r.guests.last_name}`,
      guest_email: r.guests.email,
      guest_phone: r.guests.phone,
      room_id: primaryRoom?.room_id,
      room_number: primaryRoom?.room_number ?? "Unassigned",
      room_type: primaryRoom?.room_types.name ?? "Standard",
      room_current_status: primaryRoom?.status ?? "unknown",
      assigned_rooms: assignedRooms,
      check_in_date: r.check_in_date.toISOString().split("T")[0],
      check_out_date: r.check_out_date.toISOString().split("T")[0],
      adults: r.adults,
      children: r.children,
      total_amount: summary.totalAmountNum,
      total_paid: summary.totalPaidNum,
      remaining_balance: summary.remainingBalanceNum,
      credit_balance: summary.creditBalanceNum,
      status: r.status,
      created_at: r.created_at.toISOString(),
      cancel_reason: r.cancel_reason,
      special_requests: r.special_requests,
      created_by_staff: r.staff
        ? `${r.staff.first_name} ${r.staff.last_name}`
        : r.source === "online"
        ? "Online Guest"
        : "Reception",
      payment_status: summary.paymentStatus,
      has_active_stay: primaryRr?.stays ? primaryRr.stays.actual_check_out === null : false,
      actual_check_in: primaryRr?.stays?.actual_check_in
        ? primaryRr.stays.actual_check_in.toISOString()
        : null,
      actual_check_out: primaryRr?.stays?.actual_check_out
        ? primaryRr.stays.actual_check_out.toISOString()
        : null,
    };
  });
}

// ─── Active Checked-In Stays (Admin, Manager, Receptionist) ─────────────────

export async function getActiveCheckedInStays() {
  await requireRole(["Admin", "Manager", "Receptionist"]);

  const stays = await prisma.stays.findMany({
    where: { actual_check_out: null },
    include: {
      reservation_rooms: {
        include: {
          rooms: { include: { room_types: true } },
          reservations: {
            include: {
              guests: true,
              invoices: true,
              payments: true,
            },
          },
        },
      },
      staff_stays_checked_in_byTostaff: {
        select: { first_name: true, last_name: true, username: true },
      },
    },
    orderBy: { actual_check_in: "desc" },
  });

  return stays.map((s) => {
    const rr = s.reservation_rooms;
    const res = rr.reservations;
    const room = rr.rooms;
    const summary = calculateFinancialSummary(res.invoices?.total_amount ?? 0, res.payments);

    return {
      stay_id: s.stay_id,
      reservation_id: res.reservation_id,
      booking_reference: `RES-${String(res.reservation_id).padStart(4, "0")}`,
      room_id: room.room_id,
      room_number: room.room_number,
      room_type: room.room_types.name,
      floor: room.floor,
      guest_name: `${res.guests.first_name} ${res.guests.last_name}`,
      guest_phone: res.guests.phone,
      guest_email: res.guests.email,
      check_in_date: s.actual_check_in.toISOString().split("T")[0],
      check_in_time: s.actual_check_in.toISOString(),
      expected_check_out: res.check_out_date.toISOString().split("T")[0],
      stay_status: "Checked In",
      payment_status: summary.paymentStatus,
      total_amount: summary.totalAmountNum,
      amount_paid: summary.totalPaidNum,
      remaining_balance: summary.remainingBalanceNum,
      credit_balance: summary.creditBalanceNum,
      checked_in_by: s.staff_stays_checked_in_byTostaff
        ? `${s.staff_stays_checked_in_byTostaff.first_name} ${s.staff_stays_checked_in_byTostaff.last_name}`
        : "Staff",
    };
  });
}

// ─── Guest Check-in Event ────────────────────────────────────────────────────

export async function checkInGuest(reservationId: number, roomId?: number) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        guests: true,
        invoices: true,
        reservation_rooms: {
          include: {
            rooms: true,
            stays: true,
          },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: "Reservation not found." };
    }

    if (reservation.status !== "confirmed" && reservation.status !== "pending") {
      return {
        success: false,
        error: `Reservation cannot be checked in. Current status: '${reservation.status}'. Only pending or confirmed reservations can be checked in.`,
      };
    }

    // Identify target room assignment
    const targetRr = roomId
      ? reservation.reservation_rooms.find((r) => r.room_id === roomId)
      : reservation.reservation_rooms.find((r) => !r.stays || r.stays.actual_check_out !== null);

    if (!targetRr || !targetRr.rooms) {
      return { success: false, error: "No eligible un-checked-in room found for this reservation." };
    }

    const room = targetRr.rooms;

    if (targetRr.stays && targetRr.stays.actual_check_out === null) {
      return {
        success: false,
        error: `Room ${room.room_number} is already checked in for this reservation.`,
      };
    }

    // Validate physical room status
    if (room.status !== "available") {
      return {
        success: false,
        error: `Room ${room.room_number} is currently '${room.status}'. Only 'available' (clean & inspected) rooms can be checked into.`,
      };
    }

    // Check if room has an active stay from ANY other reservation
    const existingActiveStay = await prisma.stays.findFirst({
      where: {
        actual_check_out: null,
        reservation_rooms: {
          room_id: room.room_id,
        },
      },
    });

    if (existingActiveStay) {
      return {
        success: false,
        error: `Room ${room.room_number} currently has another active guest checked in.`,
      };
    }

    // Execute atomic check-in transaction with extended 30s timeout
    await prisma.$transaction(
      async (tx) => {
        // 1. Create stays record for this specific room
        await tx.stays.create({
          data: {
            reservation_room_id: targetRr.reservation_room_id,
            actual_check_in: new Date(),
            checked_in_by: session.staff_id,
          },
        });

        // 2. Mark target room as occupied
        await tx.rooms.update({
          where: { room_id: room.room_id },
          data: { status: "occupied" },
        });

        // 3. Check if all rooms in this reservation now have active stays
        const allRrs = await tx.reservation_rooms.findMany({
          where: { reservation_id: reservationId },
          include: { stays: true },
        });

        const allCheckedIn =
          allRrs.length > 0 && allRrs.every((r) => r.stays && r.stays.actual_check_out === null);

        if (allCheckedIn) {
          await tx.reservations.update({
            where: { reservation_id: reservationId },
            data: { status: "checked_in" },
          });
        }
      },
      { maxWait: 20000, timeout: 30000 }
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Guest Check-in",
      `Checked in guest ${reservation.guests.first_name} ${reservation.guests.last_name} into Room ${room.room_number}.`,
      room.room_number
    );

    addNotification(
      "receptionist",
      "Guest Checked In",
      `${reservation.guests.first_name} ${reservation.guests.last_name} checked into Room ${room.room_number}.`,
      "checkin",
      room.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to check in guest." };
  }
}

// ─── Guest Check-out Event ───────────────────────────────────────────────────

export async function checkOutGuest(reservationId: number, roomId?: number) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        guests: true,
        invoices: true,
        reservation_rooms: {
          include: {
            rooms: true,
            stays: true,
          },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: "Reservation not found." };
    }

    // Find target room assignment with active stay
    const targetRr = roomId
      ? reservation.reservation_rooms.find((r) => r.room_id === roomId && r.stays && r.stays.actual_check_out === null)
      : reservation.reservation_rooms.find((r) => r.stays && r.stays.actual_check_out === null);

    if (!targetRr || !targetRr.rooms || !targetRr.stays) {
      return { success: false, error: "No active stay found to check out for this room." };
    }

    const room = targetRr.rooms;
    const stay = targetRr.stays;

    const now = new Date();
    const checkoutTimeFormatted = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Execute atomic check-out transaction with extended 30s timeout
    await prisma.$transaction(
      async (tx) => {
        // 1. Close active stay
        await tx.stays.update({
          where: { stay_id: stay.stay_id },
          data: {
            actual_check_out: now,
            checked_out_by: session.staff_id,
          },
        });

        // 2. Set room to cleaning
        await tx.rooms.update({
          where: { room_id: room.room_id },
          data: { status: "cleaning" },
        });

        // 3. Create housekeeping turnover task
        await tx.housekeeping_tasks.create({
          data: {
            room_id: room.room_id,
            status: "pending",
            notes: `Guest checkout turnover. Completed at ${checkoutTimeFormatted}. Requires linen change, sanitization, and minibar restock.`,
          },
        });

        // 4. Check if any active stays remain for this reservation
        const remainingActiveStays = await tx.stays.count({
          where: {
            reservation_rooms: { reservation_id: reservationId },
            actual_check_out: null,
          },
        });

        if (remainingActiveStays === 0) {
          await tx.reservations.update({
            where: { reservation_id: reservationId },
            data: { status: "checked_out" },
          });
        }

        // 5. Synchronize invoice status upon checkout under row lock
        if (reservation.invoices) {
          await lockInvoiceForReservation(tx, reservationId, session.staff_id);
          await syncInvoiceStatus(tx, reservation.invoices.invoice_id);
        }
      },
      { maxWait: 20000, timeout: 30000 }
    );

    // Event notifications
    addNotification(
      "housekeeping",
      "Checkout Cleaning Required",
      `Room ${room.room_number} requires cleaning. Guest checkout completed at ${checkoutTimeFormatted}.`,
      "checkout",
      room.room_number
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Guest Check-out",
      `Checked out guest from Room ${room.room_number}. Room set to 'cleaning' and turnover task dispatched.`,
      room.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    revalidatePath("/staff/dashboard/housekeeping");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to check out guest." };
  }
}

// ─── Confirm Reservation ─────────────────────────────────────────────────────

export async function confirmReservation(reservationId: number) {
  const session = await requireRole(["Admin", "Manager", "Receptionist"]);

  const reservation = await prisma.reservations.findUnique({
    where: { reservation_id: reservationId },
  });

  if (!reservation) return { success: false, error: "Reservation not found." };
  if (reservation.status !== "pending") {
    return { success: false, error: `Cannot confirm reservation with status '${reservation.status}'.` };
  }

  await prisma.reservations.update({
    where: { reservation_id: reservationId },
    data: { status: "confirmed" },
  });

  logActivity(
    session.full_name,
    session.role_name,
    "Reservation Confirmed",
    `Confirmed booking reference RES-${String(reservationId).padStart(4, "0")}.`
  );

  revalidatePath("/staff/dashboard");
  revalidatePath("/staff/dashboard/reservations");
  return { success: true };
}

// ─── Record / Collect Payment for Reservation (Receptionist, Manager, Admin) ─

export async function recordReservationPayment(
  reservationId: number,
  amount: number,
  method: "cash" | "card" | "bank_transfer" | "online" | "cheque",
  transactionRef?: string
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    if (!amount || typeof amount !== "number" || isNaN(amount) || amount <= 0 || amount > 10000000) {
      return { success: false, error: "Payment amount must be a valid positive number under 10,000,000." };
    }

    const validMethods = ["cash", "card", "bank_transfer", "online", "cheque"];
    if (!validMethods.includes(method)) {
      return { success: false, error: `Invalid payment method. Allowed: ${validMethods.join(", ")}` };
    }

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        guests: true,
        invoices: true,
        payments: true,
        reservation_rooms: {
          include: { rooms: { include: { room_types: true } } },
        },
      },
    });

    if (!reservation) {
      return { success: false, error: "Reservation not found." };
    }

    const primaryRr = reservation.reservation_rooms[0];
    const primaryRate = primaryRr ? new Prisma.Decimal(primaryRr.rate_per_night) : new Prisma.Decimal(0);
    const decimalPaymentAmount = new Prisma.Decimal(amount);
    const cleanRef = transactionRef ? sanitizeFreeText(transactionRef, 100, "Transaction reference").sanitized : "";
    const ref = cleanRef || `PAY-${method.toUpperCase().slice(0, 4)}-${Date.now()}`;

    // Execute payment creation and atomic invoice recalculation in transaction with invoice row locking
    const summary = await prisma.$transaction(
      async (tx) => {
        // 1. Lock invoice row for update FIRST, establishing consistent serialization
        const lockedInvoice = await lockInvoiceForReservation(
          tx,
          reservationId,
          session.staff_id,
          reservation.check_in_date,
          reservation.check_out_date,
          primaryRate
        );

        // 2. Insert payment record
        await tx.payments.create({
          data: {
            reservation_id: reservationId,
            amount: decimalPaymentAmount,
            method,
            transaction_ref: ref,
            processed_by: session.staff_id,
          },
        });

        // 3. Atomically synchronize invoice status against all payments while holding the lock
        return await syncInvoiceStatus(tx, lockedInvoice.invoice_id);
      },
      { maxWait: 20000, timeout: 30000 }
    );

    const remainingBalance = summary.remainingBalanceNum;
    const creditBalance = summary.creditBalanceNum;
    const isFullySettled = summary.isFullySettled;
    const totalPaid = summary.totalPaidNum;

    logActivity(
      session.full_name,
      session.role_name,
      "Payment Recorded",
      `Collected PKR ${amount.toLocaleString()} via ${method.toUpperCase()} for booking RES-${String(reservationId).padStart(4, "0")} (${reservation.guests.first_name} ${reservation.guests.last_name}). ${isFullySettled ? (creditBalance > 0 ? `Bill fully settled with PKR ${creditBalance.toLocaleString()} credit balance.` : "Bill is fully settled.") : `Remaining balance: PKR ${remainingBalance.toLocaleString()}.`}`
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");

    return {
      success: true,
      message: `Payment of PKR ${amount.toLocaleString()} recorded successfully. ${isFullySettled ? (creditBalance > 0 ? `Bill is fully settled. Excess credit: PKR ${creditBalance.toLocaleString()}.` : "Bill is fully settled.") : `Remaining balance: PKR ${remainingBalance.toLocaleString()}.`}`,
      remainingBalance,
      creditBalance,
      isFullySettled,
      totalPaid,
      paymentStatus: summary.paymentStatus,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to record payment." };
  }
}

// ─── Post Incidental / Service Charge ────────────────────────────────────────

export async function postIncidentalCharge(
  reservationId: number,
  charge: {
    description: string;
    amount: number;
    itemType?: "service" | "penalty" | "other" | "room";
    quantity?: number;
    stayId?: number;
  }
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    const descVal = sanitizeFreeText(charge.description, 255, "Charge description");
    if (!descVal.isValid || !descVal.sanitized) {
      return { success: false, error: descVal.error || "Charge description is required." };
    }
    const cleanDescription = descVal.sanitized;

    const unitPrice = charge.amount;
    if (typeof unitPrice !== "number" || isNaN(unitPrice) || unitPrice <= 0 || unitPrice > 10000000) {
      return { success: false, error: "Charge amount must be a positive number under 10,000,000." };
    }

    const validItemTypes = ["service", "penalty", "other", "room"];
    const itemType = charge.itemType && validItemTypes.includes(charge.itemType) ? charge.itemType : "service";
    const qty = charge.quantity && typeof charge.quantity === "number" && charge.quantity > 0 ? Math.min(100, Math.floor(charge.quantity)) : 1;
    const decimalUnitPrice = new Prisma.Decimal(unitPrice);
    const decimalChargeTotal = decimalUnitPrice.times(qty);

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        guests: true,
        invoices: true,
        reservation_rooms: true,
      },
    });

    if (!reservation) {
      return { success: false, error: "Reservation not found." };
    }

    if (reservation.status === "cancelled") {
      return { success: false, error: "Cannot post charges to a cancelled reservation." };
    }

    const primaryRr = reservation.reservation_rooms[0];
    const primaryRate = primaryRr ? new Prisma.Decimal(primaryRr.rate_per_night) : new Prisma.Decimal(0);

    // Execute atomic charge posting, invoice total update, and status sync under exclusive row lock
    const summary = await prisma.$transaction(
      async (tx) => {
        // 1. Lock invoice row for update FIRST before reading or calculating any totals
        const lockedInvoice = await lockInvoiceForReservation(
          tx,
          reservationId,
          session.staff_id,
          reservation.check_in_date,
          reservation.check_out_date,
          primaryRate
        );

        // 2. Create itemized invoice item
        await tx.invoice_items.create({
          data: {
            invoice_id: lockedInvoice.invoice_id,
            item_type: charge.itemType || "service",
            description: cleanDescription,
            quantity: qty,
            unit_price: decimalUnitPrice,
          },
        });

        // 3. Atomically increment invoice subtotal and total_amount using Decimal from the locked record
        const newSubtotal = lockedInvoice.subtotal.plus(decimalChargeTotal);
        const newTotal = lockedInvoice.total_amount.plus(decimalChargeTotal);

        await tx.invoices.update({
          where: { invoice_id: lockedInvoice.invoice_id },
          data: {
            subtotal: newSubtotal,
            total_amount: newTotal,
          },
        });

        // 4. Atomically synchronize invoice status against all payments while still holding the lock
        // If invoice was previously "paid", this reverts it to "issued" when newTotal > payments
        return await syncInvoiceStatus(tx, lockedInvoice.invoice_id);
      },
      { maxWait: 20000, timeout: 30000 }
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Incidental Charge Posted",
      `Added charge "${cleanDescription}" (PKR ${decimalChargeTotal.toString()}) to booking RES-${String(reservationId).padStart(4, "0")} (${reservation.guests.first_name} ${reservation.guests.last_name}). Status: ${summary.paymentStatus}, Remaining: PKR ${summary.remainingBalanceNum.toLocaleString()}.`
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");

    return {
      success: true,
      message: `Charge of PKR ${decimalChargeTotal.toString()} posted successfully. Status is now ${summary.paymentStatus}.`,
      summary: {
        totalAmount: summary.totalAmountNum,
        totalPaid: summary.totalPaidNum,
        remainingBalance: summary.remainingBalanceNum,
        creditBalance: summary.creditBalanceNum,
        paymentStatus: summary.paymentStatus,
        isFullySettled: summary.isFullySettled,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to post incidental charge." };
  }
}

// ─── Cancel Reservation ──────────────────────────────────────────────────────

export async function cancelReservation(reservationId: number, reason: string) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    const reservation = await prisma.reservations.findUnique({
      where: { reservation_id: reservationId },
      include: {
        reservation_rooms: {
          include: { stays: true },
        },
      },
    });

    if (!reservation) return { success: false, error: "Reservation not found." };
    if (["checked_out", "cancelled"].includes(reservation.status)) {
      return { success: false, error: `Cannot cancel reservation with status '${reservation.status}'.` };
    }

    // Disallow cancelling if an active stay exists
    const hasActiveStay = reservation.reservation_rooms.some(
      (rr) => rr.stays && rr.stays.actual_check_out === null
    );
    if (hasActiveStay) {
      return {
        success: false,
        error: "Cannot cancel a reservation while guests are actively checked in. Please check out the guest first.",
      };
    }

    const reasonVal = sanitizeFreeText(reason, 500, "Cancellation reason");
    if (!reasonVal.isValid) {
      return { success: false, error: reasonVal.error };
    }
    const cleanReason = reasonVal.sanitized || "Cancelled by hotel staff";

    await prisma.$transaction(
      async (tx) => {
        await tx.reservations.update({
          where: { reservation_id: reservationId },
          data: {
            status: "cancelled",
            cancel_reason: cleanReason,
          },
        });

        // Release assigned rooms back to available in a single atomic updateMany (excluding maintenance/cleaning)
        const roomIds = reservation.reservation_rooms
          .map((rr) => rr.room_id)
          .filter((id): id is number => typeof id === "number");

        if (roomIds.length > 0) {
          await tx.rooms.updateMany({
            where: {
              room_id: { in: roomIds },
              status: "occupied",
            },
            data: {
              status: "available",
            },
          });
        }
      },
      { maxWait: 20000, timeout: 30000 }
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Reservation Cancelled",
      `Cancelled booking RES-${String(reservationId).padStart(4, "0")}: ${reason}`
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to cancel reservation." };
  }
}

// ─── Room Inventory & Status ─────────────────────────────────────────────────

export async function getStaffRooms() {
  await requireStaff();

  const rooms = await prisma.rooms.findMany({
    include: {
      room_types: true,
      housekeeping_tasks: {
        orderBy: { created_at: "desc" },
        take: 5,
      },
      reservation_rooms: {
        where: {
          reservations: {
            status: { in: ["checked_in", "confirmed"] },
          },
        },
        include: {
          reservations: {
            include: {
              guests: true,
            },
          },
          stays: true,
        },
        orderBy: {
          reservation_room_id: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      room_number: "asc",
    },
  });

  return rooms.map((r) => {
    const activeMaintenanceTask = r.housekeeping_tasks.find(
      (t) => t.notes?.startsWith("[MAINTENANCE]") && t.status !== "done"
    );
    const activeCleaningTask = r.housekeeping_tasks.find(
      (t) => !t.notes?.startsWith("[MAINTENANCE]") && t.status !== "done"
    );

    const activeRr = r.reservation_rooms[0];
    const activeRes = activeRr?.reservations;
    const activeStay = activeRr?.stays;

    let operationalStatus = "Available";
    if (r.status === "maintenance") {
      operationalStatus = activeMaintenanceTask?.status === "in_progress"
        ? "Maintenance in Progress"
        : "Maintenance Required";
    } else if (r.status === "cleaning") {
      operationalStatus = activeCleaningTask?.status === "in_progress"
        ? "Cleaning in Progress"
        : "Cleaning Required";
    } else if (r.status === "occupied" || (activeStay && activeStay.actual_check_out === null)) {
      operationalStatus = "Occupied";
    } else if (activeRes && (activeRes.status === "confirmed" || activeRes.status === "pending") && (!activeStay || activeStay.actual_check_out !== null)) {
      operationalStatus = "Reserved";
    }

    return {
      room_id: r.room_id,
      room_number: r.room_number,
      floor: r.floor,
      room_type: r.room_types.name,
      base_price: parseFloat(r.room_types.base_price.toString()),
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
      active_stay_guest: activeRes
        ? {
            reservation_id: activeRes.reservation_id,
            booking_reference: `RES-${String(activeRes.reservation_id).padStart(4, "0")}`,
            guest_name: `${activeRes.guests.first_name} ${activeRes.guests.last_name}`,
            guest_phone: activeRes.guests.phone,
            guest_email: activeRes.guests.email,
            check_in_date: activeRes.check_in_date.toISOString().split("T")[0],
            check_out_date: activeRes.check_out_date.toISOString().split("T")[0],
            reservation_status: activeRes.status,
            has_active_stay: activeStay ? activeStay.actual_check_out === null : false,
            actual_check_in: activeStay?.actual_check_in
              ? activeStay.actual_check_in.toISOString()
              : null,
          }
        : null,
    };
  });
}

// ─── Simplified Guest Complaint / Room Request (Receptionist & Staff) ────────

export async function submitRoomServiceRequest(
  roomId: number,
  requestType: "cleaning" | "maintenance",
  comment?: string
) {
  try {
    const session = await requireRole([
      "Admin",
      "Manager",
      "Receptionist",
      "Housekeeping",
      "Maintenance",
    ]);

    const roleLower = session.role_name.toLowerCase();
    if (roleLower === "housekeeping" && requestType !== "maintenance") {
      return { success: false, error: "Housekeeping staff can only dispatch Maintenance requests." };
    }
    if (roleLower === "maintenance" && requestType !== "cleaning") {
      return { success: false, error: "Maintenance staff can only dispatch Cleaning turnover requests." };
    }

    const room = await prisma.rooms.findUnique({
      where: { room_id: roomId },
    });

    if (!room) {
      return { success: false, error: "Room not found." };
    }

    const cleanComment = (comment || "").trim();

    // Dynamic duplicate prevention: verify unresolved maintenance for the SAME issue
    if (requestType === "maintenance") {
      const activeTasks = await prisma.housekeeping_tasks.findMany({
        where: {
          room_id: roomId,
          notes: { startsWith: "[MAINTENANCE]" },
          status: { in: ["pending", "in_progress"] },
        },
      });

      const duplicateTask = activeTasks.find((t) =>
        isSameMaintenanceIssue(cleanComment || "Technical defect", t.notes || "")
      );

      if (duplicateTask) {
        return {
          success: false,
          duplicate: true,
          error: `Room ${room.room_number} is already under maintenance for this issue (Task #${duplicateTask.task_id}).`,
        };
      }
    }

    if (requestType === "cleaning") {
      const activeClean = await prisma.housekeeping_tasks.findFirst({
        where: {
          room_id: roomId,
          NOT: { notes: { startsWith: "[MAINTENANCE]" } },
          status: { in: ["pending", "in_progress"] },
        },
      });
      if (room.status === "cleaning" || activeClean) {
        return {
          success: false,
          duplicate: true,
          error: `Room ${room.room_number} is already awaiting Cleaning.`,
        };
      }
    }

    if (requestType === "cleaning") {
      const task = await prisma.housekeeping_tasks.create({
        data: {
          room_id: roomId,
          status: "pending",
          notes: cleanComment
            ? `[GUEST REQUEST] Housekeeping requested: ${cleanComment} (Logged by ${session.full_name})`
            : `[GUEST REQUEST] Housekeeping requested by Front Desk (Logged by ${session.full_name})`,
        },
      });

      if (room.status === "available") {
        await prisma.rooms.update({
          where: { room_id: roomId },
          data: { status: "cleaning" },
        });
      }

      addNotification(
        "housekeeping",
        `Cleaning Request: Room ${room.room_number}`,
        `Front Desk request for Room ${room.room_number}: ${cleanComment || "Cleaning requested."}`,
        "cleaning",
        room.room_number,
        `/staff/dashboard/housekeeping?taskId=${task.task_id}&room=${room.room_number}`,
        task.task_id
      );

      logActivity(
        session.full_name,
        session.role_name,
        "Cleaning Request Dispatched",
        `Requested cleaning for Room ${room.room_number}: ${cleanComment || "Routine request"}`,
        room.room_number
      );
    } else {
      const task = await prisma.housekeeping_tasks.create({
        data: {
          room_id: roomId,
          status: "pending",
          notes: cleanComment
            ? `[MAINTENANCE] [Source: Reception Desk] ${cleanComment} (Reported by ${session.full_name})`
            : `[MAINTENANCE] [Source: Reception Desk] Technical defect reported by Front Desk (Reported by ${session.full_name})`,
        },
      });

      await prisma.rooms.update({
        where: { room_id: roomId },
        data: {
          status: "maintenance",
          notes: cleanComment || "Maintenance defect reported by Front Desk.",
        },
      });

      addNotification(
        "maintenance",
        `Maintenance Request: Room ${room.room_number}`,
        `Front Desk reported issue for Room ${room.room_number}: ${cleanComment || "Repair required."}`,
        "maintenance",
        room.room_number,
        `/staff/dashboard/maintenance?taskId=${task.task_id}&room=${room.room_number}`,
        task.task_id
      );

      logActivity(
        session.full_name,
        session.role_name,
        "Maintenance Request Dispatched",
        `Reported maintenance issue for Room ${room.room_number}: ${cleanComment || "Repair required."}`,
        room.room_number
      );
    }

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/rooms");
    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/maintenance");

    return {
      success: true,
      message: `${requestType === "cleaning" ? "Housekeeping" : "Maintenance"} request successfully dispatched for Room ${room.room_number}.`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit room request." };
  }
}

// ─── Administrator & Manager Room Override (With Automatic Department Tasks) ──

export async function adminOverrideRoomStatus(
  roomId: number,
  newStatus: "available" | "occupied" | "cleaning" | "maintenance",
  reason: string
) {
  const session = await requireRole(["Admin", "Manager"]);

  if (!reason || reason.trim().length < 5) {
    return { success: false, error: "Mandatory justification reason required for status change." };
  }

  const room = await prisma.rooms.findUnique({ where: { room_id: roomId } });
  if (!room) return { success: false, error: "Room not found." };

  let createdTaskId: number | undefined = undefined;

  // Requirement 7: Every departmental status change must generate or update the corresponding task
  if (newStatus === "cleaning") {
    const existingCleaning = await prisma.housekeeping_tasks.findFirst({
      where: {
        room_id: roomId,
        NOT: { notes: { startsWith: "[MAINTENANCE]" } },
        status: { in: ["pending", "in_progress"] },
      },
    });

    if (!existingCleaning) {
      const task = await prisma.housekeeping_tasks.create({
        data: {
          room_id: roomId,
          status: "pending",
          notes: `Turnover cleaning required: Initiated by ${session.full_name} (${session.role_name}). Reason: ${reason.trim()}`,
        },
      });
      createdTaskId = task.task_id;
    }

    addNotification(
      "housekeeping",
      `Cleaning Required: Room ${room.room_number}`,
      `Management set Room ${room.room_number} to Cleaning Required: ${reason}`,
      "cleaning",
      room.room_number,
      createdTaskId
        ? `/staff/dashboard/housekeeping?taskId=${createdTaskId}&room=${room.room_number}`
        : `/staff/dashboard/housekeeping?room=${room.room_number}`,
      createdTaskId
    );
  } else if (newStatus === "maintenance") {
    const activeTasks = await prisma.housekeeping_tasks.findMany({
      where: {
        room_id: roomId,
        notes: { startsWith: "[MAINTENANCE]" },
        status: { in: ["pending", "in_progress"] },
      },
    });

    const duplicateTask = activeTasks.find((t) =>
      isSameMaintenanceIssue(reason.trim(), t.notes || "")
    );

    if (duplicateTask) {
      createdTaskId = duplicateTask.task_id;
    } else {
      const task = await prisma.housekeeping_tasks.create({
        data: {
          room_id: roomId,
          status: "pending",
          notes: `[MAINTENANCE] [Source: Management] ${reason.trim()} (Initiated by ${session.full_name})`.slice(0, 255),
        },
      });
      createdTaskId = task.task_id;
    }

    addNotification(
      "maintenance",
      `Maintenance Required: Room ${room.room_number}`,
      `Management set Room ${room.room_number} to Maintenance: ${reason}`,
      "maintenance",
      room.room_number,
      createdTaskId
        ? `/staff/dashboard/maintenance?taskId=${createdTaskId}&room=${room.room_number}`
        : `/staff/dashboard/maintenance?room=${room.room_number}`,
      createdTaskId
    );
  }

  await prisma.rooms.update({
    where: { room_id: roomId },
    data: {
      status: newStatus,
      notes: `[STATUS OVERRIDE by ${session.full_name}]: ${reason.trim()}`,
    },
  });

  logActivity(
    session.full_name,
    session.role_name,
    "Room Status Override",
    `Changed Room ${room.room_number} from '${room.status}' to '${newStatus}'. Reason: ${reason}`,
    room.room_number
  );

  revalidatePath("/staff/dashboard");
  revalidatePath("/staff/dashboard/rooms");
  revalidatePath("/staff/dashboard/housekeeping");
  revalidatePath("/staff/dashboard/maintenance");

  return { success: true };
}

// ─── Housekeeping Workflow ───────────────────────────────────────────────────

export async function getHousekeepingDashboardData() {
  await requireRole(["Admin", "Manager", "Housekeeping"]);

  // 1. Auto-synchronize all rooms currently in 'cleaning' status:
  // Ensure every room requiring cleaning has an active task in housekeeping_tasks
  const roomsAwaitingCleaning = await prisma.rooms.findMany({
    where: { status: "cleaning" },
    include: { room_types: true },
    orderBy: { room_number: "asc" },
  });

  const existingActiveTasks = await prisma.housekeeping_tasks.findMany({
    where: {
      NOT: { notes: { startsWith: "[MAINTENANCE]" } },
      status: { in: ["pending", "in_progress"] },
    },
  });

  const roomsWithActiveCleaning = new Set(existingActiveTasks.map((t) => t.room_id));

  for (const r of roomsAwaitingCleaning) {
    if (!roomsWithActiveCleaning.has(r.room_id)) {
      await prisma.housekeeping_tasks.create({
        data: {
          room_id: r.room_id,
          status: "pending",
          notes: r.notes || `Turnover cleaning required for Room ${r.room_number}. Linen replacement and sanitization.`,
        },
      });
    }
  }

  // 2. Fetch all cleaning tasks
  const allTasks = await prisma.housekeeping_tasks.findMany({
    where: {
      NOT: { notes: { startsWith: "[MAINTENANCE]" } },
    },
    include: {
      rooms: {
        include: { room_types: true },
      },
      staff: {
        select: { staff_id: true, first_name: true, last_name: true },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const completedTasks = allTasks.filter((t) => t.status === "done");

  const roomsWaitingForMaintenance = await prisma.rooms.findMany({
    where: { status: "maintenance" },
    include: { room_types: true },
    orderBy: { room_number: "asc" },
  });

  const notifications = getNotificationsForRole("housekeeping");

  return {
    pendingTasks: pendingTasks.map(formatHkTask),
    inProgressTasks: inProgressTasks.map(formatHkTask),
    completedTasks: completedTasks.map(formatHkTask),
    roomsAwaitingCleaning: roomsAwaitingCleaning.map((r) => ({
      room_id: r.room_id,
      room_number: r.room_number,
      floor: r.floor,
      room_type: r.room_types.name,
      status: r.status,
    })),
    roomsWaitingForMaintenance: roomsWaitingForMaintenance.map((r) => ({
      room_id: r.room_id,
      room_number: r.room_number,
      floor: r.floor,
      room_type: r.room_types.name,
      status: r.status,
      notes: r.notes,
    })),
    notifications,
  };
}

function formatHkTask(t: any) {
  return {
    task_id: t.task_id,
    room_id: t.room_id,
    room_number: t.rooms.room_number,
    room_type: t.rooms.room_types.name,
    floor: t.rooms.floor,
    status: t.status,
    assigned_to: t.staff ? `${t.staff.first_name} ${t.staff.last_name}` : "Unassigned",
    assigned_to_id: t.assigned_to,
    notes: t.notes || "Standard checkout turnaround",
    created_at: t.created_at.toISOString(),
    completed_at: t.completed_at ? t.completed_at.toISOString() : null,
  };
}

export async function startCleaningTask(taskId: number) {
  const session = await requireRole(["Admin", "Manager", "Housekeeping"]);

  const task = await prisma.housekeeping_tasks.findUnique({
    where: { task_id: taskId },
    include: { rooms: true },
  });

  if (!task) return { success: false, error: "Cleaning task not found." };

  await prisma.housekeeping_tasks.update({
    where: { task_id: taskId },
    data: {
      status: "in_progress",
      assigned_to: session.staff_id,
    },
  });

  // Ensure room stays/becomes 'cleaning'
  if (task.rooms.status !== "maintenance") {
    await prisma.rooms.update({
      where: { room_id: task.room_id },
      data: { status: "cleaning" },
    });
  }

  logActivity(
    session.full_name,
    session.role_name,
    "Cleaning Started",
    `Started cleaning Room ${task.rooms.room_number}.`,
    task.rooms.room_number
  );

  revalidatePath("/staff/dashboard/housekeeping");
  revalidatePath("/staff/dashboard/rooms");
  return { success: true };
}

export async function completeCleaningTask(taskId: number) {
  const session = await requireRole(["Admin", "Manager", "Housekeeping"]);

  const task = await prisma.housekeeping_tasks.findUnique({
    where: { task_id: taskId },
    include: {
      rooms: {
        include: {
          housekeeping_tasks: {
            where: {
              notes: { startsWith: "[MAINTENANCE]" },
              status: { not: "done" },
            },
          },
        },
      },
    },
  });

  if (!task) return { success: false, error: "Task not found." };

  await prisma.housekeeping_tasks.update({
    where: { task_id: taskId },
    data: {
      status: "done",
      completed_at: new Date(),
      assigned_to: session.staff_id,
    },
  });

  // Recalculate room availability:
  // If unresolved maintenance exists, room stays 'maintenance'.
  // Otherwise, if no issues, room becomes 'available'!
  const hasUnresolvedMaintenance = task.rooms.housekeeping_tasks.length > 0;

  if (!hasUnresolvedMaintenance) {
    await prisma.rooms.update({
      where: { room_id: task.room_id },
      data: { status: "available" },
    });
  }

  logActivity(
    session.full_name,
    session.role_name,
    "Cleaning Completed",
    `Completed cleaning for Room ${task.rooms.room_number}. Room status recalculated to ${
      hasUnresolvedMaintenance ? "'maintenance'" : "'available'"
    }.`,
    task.rooms.room_number
  );

  addNotification(
    "manager",
    "Room Cleaned",
    `Room ${task.rooms.room_number} cleaning completed by ${session.full_name}.`,
    "cleaning",
    task.rooms.room_number
  );

  revalidatePath("/staff/dashboard/housekeeping");
  revalidatePath("/staff/dashboard/rooms");
  return { success: true };
}

// ─── Maintenance Workflow ────────────────────────────────────────────────────

export async function getMaintenanceDashboardData() {
  await requireRole(["Admin", "Manager", "Maintenance"]);

  // 1. Synchronize all rooms currently under 'maintenance' status:
  // Ensure every room under maintenance has an active task in housekeeping_tasks
  const roomsUnderMaintenance = await prisma.rooms.findMany({
    where: { status: "maintenance" },
    include: { room_types: true },
    orderBy: { room_number: "asc" },
  });

  const existingActiveTasks = await prisma.housekeeping_tasks.findMany({
    where: {
      notes: { startsWith: "[MAINTENANCE]" },
      status: { in: ["pending", "in_progress"] },
    },
  });

  const activeTaskRoomIds = new Set(existingActiveTasks.map((t) => t.room_id));

  for (const r of roomsUnderMaintenance) {
    if (!activeTaskRoomIds.has(r.room_id)) {
      await prisma.housekeeping_tasks.create({
        data: {
          room_id: r.room_id,
          status: "pending",
          notes: r.notes
            ? `[MAINTENANCE] [Source: Room Inspection] ${r.notes}`
            : `[MAINTENANCE] [Source: Room Inspection] Scheduled room maintenance and physical defect inspection`,
        },
      });
    }
  }

  // 2. Fetch all maintenance tasks
  const allMaintTasks = await prisma.housekeeping_tasks.findMany({
    where: {
      notes: { startsWith: "[MAINTENANCE]" },
    },
    include: {
      rooms: {
        include: { room_types: true },
      },
      staff: {
        select: { staff_id: true, first_name: true, last_name: true },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const pendingRepairs = allMaintTasks.filter((t) => t.status === "pending");
  const inProgressRepairs = allMaintTasks.filter((t) => t.status === "in_progress");
  const completedRepairs = allMaintTasks.filter((t) => t.status === "done");

  const notifications = getNotificationsForRole("maintenance");

  return {
    pendingRepairs: pendingRepairs.map(formatMaintTask),
    inProgressRepairs: inProgressRepairs.map(formatMaintTask),
    completedRepairs: completedRepairs.map(formatMaintTask),
    roomsUnderMaintenance: roomsUnderMaintenance.map((r) => ({
      room_id: r.room_id,
      room_number: r.room_number,
      floor: r.floor,
      room_type: r.room_types.name,
      status: r.status,
      notes: r.notes,
    })),
    notifications,
  };
}

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
  } else if (
    rawNote.includes("[Source: Housekeeping]") ||
    rawNote.toLowerCase().includes("housekeep")
  ) {
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
    room_number: t.rooms ? t.rooms.room_number : "Unknown",
    room_type: t.rooms?.room_types ? t.rooms.room_types.name : "Standard",
    floor: t.rooms ? t.rooms.floor : null,
    status: t.status,
    assigned_to: t.staff ? `${t.staff.first_name} ${t.staff.last_name}` : "Unassigned",
    assigned_to_id: t.assigned_to,
    issue_description: cleanNote,
    request_source: requestSource,
    created_at: t.created_at.toISOString(),
    completed_at: t.completed_at ? t.completed_at.toISOString() : null,
  };
}

export async function reportMaintenanceIssue(
  roomId: number,
  issueDescription: string,
  severity: "low" | "medium" | "urgent" = "medium"
) {
  const session = await requireStaff();

  if (!issueDescription || issueDescription.trim().length < 3) {
    return { success: false, error: "Please enter a valid description of the maintenance issue." };
  }

  const room = await prisma.rooms.findUnique({ where: { room_id: roomId } });
  if (!room) return { success: false, error: "Room not found." };

  const cleanDescription = issueDescription.trim();

  // Duplicate prevention: check unresolved maintenance for the SAME issue
  const activeTasks = await prisma.housekeeping_tasks.findMany({
    where: {
      room_id: roomId,
      notes: { startsWith: "[MAINTENANCE]" },
      status: { in: ["pending", "in_progress"] },
    },
  });

  const duplicateTask = activeTasks.find((t) =>
    isSameMaintenanceIssue(cleanDescription, t.notes || "")
  );

  if (duplicateTask) {
    return {
      success: false,
      duplicate: true,
      error: `Room ${room.room_number} is already under maintenance for this issue (Task #${duplicateTask.task_id}).`,
    };
  }

  const taskNote = `[MAINTENANCE] [Severity: ${severity.toUpperCase()}] ${cleanDescription} (Reported by ${
    session.full_name
  })`.slice(0, 255);

  // 1. Create maintenance task
  await prisma.housekeeping_tasks.create({
    data: {
      room_id: roomId,
      status: "pending",
      notes: taskNote,
    },
  });

  // 2. Set room status to 'maintenance'
  await prisma.rooms.update({
    where: { room_id: roomId },
    data: {
      status: "maintenance",
      notes: `Active Issue: ${cleanDescription} [${severity.toUpperCase()}]`.slice(0, 255),
    },
  });

  // 3. Dispatch notifications
  addNotification(
    "maintenance",
    `Maintenance Required: Room ${room.room_number}`,
    `Room ${room.room_number} – ${cleanDescription} (Priority: ${severity.toUpperCase()})`,
    "maintenance",
    room.room_number
  );

  logActivity(
    session.full_name,
    session.role_name,
    "Maintenance Reported",
    `Reported maintenance issue for Room ${room.room_number}: ${cleanDescription}`,
    room.room_number
  );

  revalidatePath("/staff/dashboard/rooms");
  revalidatePath("/staff/dashboard/housekeeping");
  revalidatePath("/staff/dashboard/maintenance");
  return { success: true };
}

export async function startMaintenanceTask(taskId: number) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    const task = await prisma.housekeeping_tasks.findUnique({
      where: { task_id: taskId },
      include: { rooms: true },
    });

    if (!task) return { success: false, error: "Maintenance task not found." };

    await prisma.housekeeping_tasks.update({
      where: { task_id: taskId },
      data: {
        status: "in_progress",
        assigned_to: session.staff_id,
      },
    });

    // Synchronize linked critical escalation if any
    const linkedEscalation = getSeriousIssueByTaskId(taskId);
    if (linkedEscalation && linkedEscalation.status !== "in_progress" && linkedEscalation.status !== "completed") {
      updateSeriousIssueProgress(
        linkedEscalation.id,
        "in_progress",
        session.full_name
      );
    }

    logActivity(
      session.full_name,
      session.role_name,
      "Repair Started",
      `Started maintenance repair on Room ${task.rooms.room_number}.`,
      task.rooms.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return { success: true, message: `Repair started for Room ${task.rooms.room_number}. Status: IN PROGRESS.` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to start repair task." };
  }
}

export async function completeMaintenanceTask(
  taskId: number,
  resolutionNotes: string,
  requestCleaningAfterRepair: boolean = true
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    const task = await prisma.housekeeping_tasks.findUnique({
      where: { task_id: taskId },
      include: { rooms: true },
    });

    if (!task) return { success: false, error: "Task not found." };

    const cleanResNotes = resolutionNotes.trim() || "Repaired and verified.";
    const updatedNotes = `${task.notes || ""} | RESOLVED: ${cleanResNotes}`.slice(0, 255);

    // 1. Mark task completed in MySQL
    await prisma.housekeeping_tasks.update({
      where: { task_id: taskId },
      data: {
        status: "done",
        completed_at: new Date(),
        assigned_to: session.staff_id,
        notes: updatedNotes,
      },
    });

    // 2. Synchronize linked critical escalation if any
    const linkedEscalation = getSeriousIssueByTaskId(taskId);
    if (linkedEscalation) {
      updateSeriousIssueProgress(
        linkedEscalation.id,
        "completed",
        session.full_name,
        cleanResNotes
      );
    }

    // 3. Recalculate room status based on remaining active tasks for this room
    const otherActiveTasks = await prisma.housekeeping_tasks.findMany({
      where: {
        room_id: task.room_id,
        task_id: { not: taskId },
        status: { not: "done" },
      },
    });

    const otherMaintenance = otherActiveTasks.filter((t) => t.notes?.startsWith("[MAINTENANCE]"));
    const otherCleaning = otherActiveTasks.filter((t) => !t.notes?.startsWith("[MAINTENANCE]"));

    let newStatus: "available" | "cleaning" | "maintenance" = "available";
    if (otherMaintenance.length > 0) {
      newStatus = "maintenance";
    } else if (otherCleaning.length > 0) {
      newStatus = "cleaning";
    } else if (requestCleaningAfterRepair) {
      // Automatic turnover cleaning request post-repair
      const existingCleaning = await prisma.housekeeping_tasks.findFirst({
        where: {
          room_id: task.room_id,
          NOT: { notes: { startsWith: "[MAINTENANCE]" } },
          status: { in: ["pending", "in_progress"] },
        },
      });

      if (!existingCleaning) {
        await prisma.housekeeping_tasks.create({
          data: {
            room_id: task.room_id,
            status: "pending",
            notes: `Post-repair cleaning turnover for Room ${task.rooms.room_number}. Clean debris, dust, and sanitize following completed repair.`,
          },
        });
      }

      newStatus = "cleaning";

      addNotification(
        "housekeeping",
        "Turnover Cleaning Required",
        `Repair completed on Room ${task.rooms.room_number}. Post-repair cleaning turnover dispatched.`,
        "cleaning",
        task.rooms.room_number
      );
    } else {
      newStatus = "available";
    }

    await prisma.rooms.update({
      where: { room_id: task.room_id },
      data: {
        status: newStatus,
        notes: newStatus === "available" ? null : task.rooms.notes,
      },
    });

    logActivity(
      session.full_name,
      session.role_name,
      "Maintenance Completed",
      `Completed repair on Room ${task.rooms.room_number}. Room status recalculated to '${newStatus}'. Notes: ${cleanResNotes}`,
      task.rooms.room_number
    );

    addNotification(
      "manager",
      `Maintenance Completed: Room ${task.rooms.room_number}`,
      `Repair completed on Room ${task.rooms.room_number} by ${session.full_name}. Room is now '${newStatus}'.`,
      "maintenance",
      task.rooms.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    revalidatePath("/staff/dashboard/housekeeping");

    return {
      success: true,
      message: `Repair completed on Room ${task.rooms.room_number}. Room status updated to '${newStatus}'.`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to complete repair task." };
  }
}

// ─── Request Cleaning from Maintenance (Technician, Manager, Admin) ─────────

export async function requestCleaningFromMaintenance(roomId: number, comment?: string) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    const room = await prisma.rooms.findUnique({ where: { room_id: roomId } });
    if (!room) return { success: false, error: "Room not found." };

    // Prevent duplicate active cleaning tasks
    const existingCleaningTask = await prisma.housekeeping_tasks.findFirst({
      where: {
        room_id: roomId,
        NOT: { notes: { startsWith: "[MAINTENANCE]" } },
        status: { in: ["pending", "in_progress"] },
      },
    });

    if (existingCleaningTask) {
      return {
        success: false,
        error: `Room ${room.room_number} already has an active cleaning task (Task #${existingCleaningTask.task_id}).`,
      };
    }

    const task = await prisma.housekeeping_tasks.create({
      data: {
        room_id: roomId,
        status: "pending",
        notes: comment?.trim() || `Turnover sanitization and cleaning requested by Maintenance (${session.full_name}).`,
      },
    });

    if (room.status === "available") {
      await prisma.rooms.update({
        where: { room_id: roomId },
        data: { status: "cleaning" },
      });
    }

    addNotification(
      "housekeeping",
      "Cleaning Requested",
      `Room ${room.room_number}: Cleaning requested by Maintenance technician ${session.full_name}.`,
      "cleaning",
      room.room_number
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Cleaning Requested",
      `Dispatched cleaning turnover for Room ${room.room_number}.`,
      room.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");

    return {
      success: true,
      message: `Cleaning request dispatched to Housekeeping for Room ${room.room_number} (Task #${task.task_id}).`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request cleaning." };
  }
}

// ─── Staff Management (Admin Only) ──────────────────────────────────────────

export async function getStaffMembers() {
  await requireRole(["Admin", "Manager"]);

  const staffList = await prisma.staff.findMany({
    include: { roles: true },
    orderBy: { staff_id: "asc" },
  });

  const roles = await prisma.roles.findMany({ orderBy: { role_id: "asc" } });

  return {
    staff: staffList.map((s) => ({
      staff_id: s.staff_id,
      first_name: s.first_name,
      last_name: s.last_name,
      full_name: `${s.first_name} ${s.last_name}`,
      username: s.username,
      email: s.email,
      phone: s.phone,
      role_id: s.role_id,
      role_name: s.roles.role_name,
      role_description: s.roles.description,
      is_active: s.is_active,
      hire_date: s.hire_date ? s.hire_date.toISOString().split("T")[0] : "N/A",
    })),
    roles: roles.map((r) => ({
      role_id: r.role_id,
      role_name: r.role_name,
      description: r.description,
    })),
  };
}

export async function createStaffAccount(formData: FormData) {
  const session = await requireRole(["Admin"]);

  const username = formData.get("username")?.toString();
  const password = formData.get("password")?.toString();
  const firstName = formData.get("firstName")?.toString();
  const lastName = formData.get("lastName")?.toString();
  const roleId = parseInt(formData.get("roleId")?.toString() || "0", 10);
  const email = formData.get("email")?.toString();
  const phone = formData.get("phone")?.toString();

  if (!username || !password || !firstName || !lastName || !roleId) {
    return { success: false, error: "Please provide all required fields." };
  }

  // Validate Person Names
  const fnVal = validatePersonName(firstName, "First name", 50);
  if (!fnVal.isValid) return { success: false, error: fnVal.error };
  const cleanFirstName = fnVal.sanitized;

  const lnVal = validatePersonName(lastName, "Last name", 50);
  if (!lnVal.isValid) return { success: false, error: lnVal.error };
  const cleanLastName = lnVal.sanitized;

  // Validate Username format
  const userVal = validateStaffUsername(username);
  if (!userVal.isValid) return { success: false, error: userVal.error };
  const cleanUsername = userVal.sanitized;

  // Validate Password strength
  const passVal = validateStaffPassword(password);
  if (!passVal.isValid) return { success: false, error: passVal.error };

  // Validate Phone (optional)
  let canonicalStaffPhone: string | null = null;
  if (phone && phone.trim().length > 0) {
    const pVal = validatePhoneNumber(phone, "Staff phone number", false);
    if (!pVal.isValid) return { success: false, error: pVal.error };
    canonicalStaffPhone = pVal.canonical;
  }

  // Validate Email (optional)
  let cleanStaffEmail: string | null = null;
  if (email && email.trim().length > 0) {
    const emVal = validateEmail(email, "Staff email address", false);
    if (!emVal.isValid) return { success: false, error: emVal.error };
    cleanStaffEmail = emVal.sanitized;
  }

  const existing = await prisma.staff.findUnique({ where: { username: cleanUsername } });
  if (existing) {
    return { success: false, error: `Username '${cleanUsername}' is already in use.` };
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const newStaff = await prisma.staff.create({
    data: {
      username: cleanUsername,
      password_hash: passwordHash,
      first_name: cleanFirstName,
      last_name: cleanLastName,
      role_id: roleId,
      email: cleanStaffEmail,
      phone: canonicalStaffPhone,
      is_active: true,
      hire_date: new Date(),
    },
    include: { roles: true },
  });

  logActivity(
    session.full_name,
    "Admin",
    "Staff Account Created",
    `Created new staff account for ${firstName} ${lastName} (@${username}) with role ${newStaff.roles.role_name}.`
  );

  revalidatePath("/staff/dashboard/staff");
  return { success: true };
}

export async function toggleStaffActive(targetStaffId: number) {
  const session = await requireRole(["Admin"]);

  if (session.staff_id === targetStaffId) {
    return { success: false, error: "Cannot disable your own administrator account." };
  }

  if (targetStaffId === 1) {
    return { success: false, error: "System Gateway account cannot be modified." };
  }

  const target = await prisma.staff.findUnique({
    where: { staff_id: targetStaffId },
  });

  if (!target) return { success: false, error: "Staff member not found." };

  await prisma.staff.update({
    where: { staff_id: targetStaffId },
    data: { is_active: !target.is_active },
  });

  logActivity(
    session.full_name,
    "Admin",
    "Staff Status Toggled",
    `${target.is_active ? "Deactivated" : "Activated"} staff account #${targetStaffId} (@${target.username}).`
  );

  revalidatePath("/staff/dashboard/staff");
  return { success: true };
}

export async function adminResetStaffPassword(targetStaffId: number, newPassword: string) {
  const session = await requireRole(["Admin"]);

  if (!Number.isInteger(targetStaffId) || targetStaffId <= 0) {
    return { success: false, error: "Invalid target staff ID." };
  }

  if (targetStaffId === 1) {
    return { success: false, error: "System Gateway account cannot be modified." };
  }

  // Strong password policy: 12-128 chars, uppercase, lowercase, digit, special character
  if (!newPassword || typeof newPassword !== "string") {
    return { success: false, error: "Password is required." };
  }

  if (newPassword.length < 12) {
    return { success: false, error: "Password must be at least 12 characters long." };
  }

  if (newPassword.length > 128) {
    return { success: false, error: "Password cannot exceed 128 characters." };
  }

  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    return {
      success: false,
      error: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
    };
  }

  const target = await prisma.staff.findUnique({
    where: { staff_id: targetStaffId },
    include: { roles: true },
  });

  if (!target) {
    return { success: false, error: "Staff member not found." };
  }

  if (!target.is_active) {
    return {
      success: false,
      error: "Cannot reset password for a deactivated account. Please activate the account first.",
    };
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

  await prisma.staff.update({
    where: { staff_id: targetStaffId },
    data: { password_hash: passwordHash },
  });

  logActivity(
    session.full_name,
    "Admin",
    "Staff Password Reset",
    `Reset password for staff account #${targetStaffId} (@${target.username}, role: ${target.roles.role_name}).`
  );

  revalidatePath("/staff/dashboard/staff");
  return { success: true };
}

// ─── Activity Log & Notifications ───────────────────────────────────────────

export async function getActivityHistory() {
  await requireRole(["Admin", "Manager"]);
  return getAllActivityLogs();
}

export async function getRoleNotifications() {
  const session = await requireStaff();
  return getNotificationsForRole(session.role_name);
}

// ─── Housekeeping Simplified Status Submission (3 Options) ───────────────────

export async function submitHousekeepingRoomStatus(
  roomId: number,
  selectedStatus: "in_progress" | "cleaned" | "need_maintenance",
  comment?: string
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Housekeeping"]);

  const room = await prisma.rooms.findUnique({
    where: { room_id: roomId },
    include: {
      housekeeping_tasks: {
        where: {
          NOT: { notes: { startsWith: "[MAINTENANCE]" } },
          status: { not: "done" },
        },
        take: 1,
      },
    },
  });

  if (!room) return { success: false, error: "Room not found." };

  if (selectedStatus === "in_progress") {
    // In Progress: Housekeeping started cleaning
    if (room.housekeeping_tasks.length > 0) {
      await prisma.housekeeping_tasks.update({
        where: { task_id: room.housekeeping_tasks[0].task_id },
        data: { status: "in_progress", assigned_to: session.staff_id },
      });
    } else {
      await prisma.housekeeping_tasks.create({
        data: {
          room_id: roomId,
          status: "in_progress",
          assigned_to: session.staff_id,
          notes: "Room turnover cleaning in progress.",
        },
      });
    }

    if (room.status !== "maintenance") {
      await prisma.rooms.update({
        where: { room_id: roomId },
        data: { status: "cleaning" },
      });
    }

    logActivity(
      session.full_name,
      session.role_name,
      "Cleaning In Progress",
      `Started cleaning Room ${room.room_number}.`,
      room.room_number
    );

    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/rooms");
    return { success: true, message: `Room ${room.room_number} set to Cleaning in Progress.` };
  } else if (selectedStatus === "cleaned") {
    // Cleaned: Housekeeping finished cleaning
    if (room.housekeeping_tasks.length > 0) {
      await prisma.housekeeping_tasks.update({
        where: { task_id: room.housekeeping_tasks[0].task_id },
        data: {
          status: "done",
          completed_at: new Date(),
          assigned_to: session.staff_id,
        },
      });
    }

    // Check if unresolved maintenance exists
    const activeMaintenance = await prisma.housekeeping_tasks.findFirst({
      where: {
        room_id: roomId,
        notes: { startsWith: "[MAINTENANCE]" },
        status: { not: "done" },
      },
    });

    const newStatus = activeMaintenance || room.status === "maintenance" ? "maintenance" : "available";

    await prisma.rooms.update({
      where: { room_id: roomId },
      data: { status: newStatus },
    });

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

    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/rooms");
    return {
      success: true,
      message:
        newStatus === "available"
          ? `Room ${room.room_number} is clean and now Available.`
          : `Room ${room.room_number} cleaned, but remains under Maintenance for active repair.`,
    };
  } else if (selectedStatus === "need_maintenance") {
    // Need Maintenance: Problem discovered requiring repair
    const cleanComment = (comment || "").trim();
    if (cleanComment.length < 3) {
      return { success: false, error: "Please enter a comment describing the maintenance problem." };
    }

    // Check duplicate active maintenance requests for the same issue in this room
    const activeTasks = await prisma.housekeeping_tasks.findMany({
      where: {
        room_id: roomId,
        notes: { startsWith: "[MAINTENANCE]" },
        status: { in: ["pending", "in_progress"] },
      },
    });

    const duplicateTask = activeTasks.find((t) =>
      isSameMaintenanceIssue(cleanComment, t.notes || "")
    );

    if (duplicateTask) {
      return {
        success: false,
        duplicate: true,
        error: `Room ${room.room_number} is already under maintenance for this issue (Task #${duplicateTask.task_id}).`,
      };
    }

    const note = `[MAINTENANCE] [Source: Housekeeping] ${cleanComment} (Reported by ${session.full_name})`.slice(0, 255);

    await prisma.housekeeping_tasks.create({
      data: {
        room_id: roomId,
        status: "pending",
        notes: note,
      },
    });

    await prisma.rooms.update({
      where: { room_id: roomId },
      data: {
        status: "maintenance",
        notes: cleanComment.slice(0, 255),
      },
    });

    // Mark existing active cleaning tasks as blocked by maintenance so room leaves the active cleaning queue
    const activeCleaningTasks = await prisma.housekeeping_tasks.findMany({
      where: {
        room_id: roomId,
        NOT: { notes: { startsWith: "[MAINTENANCE]" } },
        status: { in: ["pending", "in_progress"] },
      },
    });

    for (const act of activeCleaningTasks) {
      await prisma.housekeeping_tasks.update({
        where: { task_id: act.task_id },
        data: {
          notes: `[BLOCKED BY MAINTENANCE] ${act.notes || "Turnover cleaning"}`.slice(0, 255),
        },
      });
    }

    addNotification(
      "maintenance",
      `Maintenance Required: Room ${room.room_number}`,
      `Room ${room.room_number} – ${cleanComment}`,
      "maintenance",
      room.room_number
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Maintenance Dispatched",
      `Room ${room.room_number} reported needing maintenance: ${cleanComment}`,
      room.room_number
    );

    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return {
      success: true,
      message: `Room ${room.room_number} set to Maintenance Required. Sent to Maintenance: "${cleanComment}".`,
    };
  }

    return { success: false, error: "Invalid status selection." };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update room status." };
  }
}

// ─── Serious Problems Requiring Approval (Maintenance Escalation) ─────────────

export async function escalateSeriousIssue(
  roomNumber: string | undefined,
  title: string,
  description: string,
  estimatedCost: string | undefined
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    if (!title || title.trim().length < 3 || !description || description.trim().length < 5) {
      return { success: false, error: "Please provide a title and detailed problem description." };
    }

    submitSeriousIssueRecord(
      roomNumber?.trim() || undefined,
      title.trim(),
      description.trim(),
      estimatedCost?.trim() || undefined,
      session.full_name
    );

    logActivity(
      session.full_name,
      session.role_name,
      "Serious Issue Escalated",
      `Escalated serious issue: ${title.trim()} (${roomNumber ? `Room ${roomNumber}` : "Property"}). Awaiting Manager/Admin authorization.`,
      roomNumber
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    return { success: true, message: "Serious issue submitted for Manager and Administrator review." };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to escalate serious issue." };
  }
}

export async function reviewEscalatedIssue(
  issueId: string,
  decision: "approved" | "rejected",
  reviewNotes: string
) {
  try {
    const session = await requireRole(["Admin", "Manager"]);

    const issue = getSeriousIssueById(issueId);
    if (!issue) return { success: false, error: "Issue not found." };

    // Single approval rule: Either Admin OR Manager can approve.
    // If already approved, in_progress, or completed, do not re-approve or create duplicate tasks.
    if (issue.status === "approved" || issue.status === "in_progress" || issue.status === "completed") {
      return {
        success: true,
        message: `Issue "${issue.title}" has already been approved by ${issue.reviewedBy || "Management"}. Exactly one maintenance task is active.`,
      };
    }

    if (issue.status === "rejected") {
      return {
        success: false,
        error: `Issue "${issue.title}" was already declined by ${issue.reviewedBy || "Management"}.`,
      };
    }

    let linkedTaskId: number | undefined = issue.linkedTaskId;

    // After approval by either Admin OR Manager, create exactly ONE linked maintenance task in MySQL
    if (decision === "approved") {
      await prisma.$transaction(
        async (tx) => {
          let room = null;
          if (issue.roomNumber) {
            room = await tx.rooms.findUnique({
              where: { room_number: issue.roomNumber },
            });
          }

          if (room) {
            // Check if a linked task already exists for this escalation to strictly prevent duplicates
            const existingTask = await tx.housekeeping_tasks.findFirst({
              where: {
                room_id: room.room_id,
                notes: { contains: `[ESCALATION #${issue.id}]` },
              },
            });

            if (existingTask) {
              linkedTaskId = existingTask.task_id;
            } else {
              const task = await tx.housekeeping_tasks.create({
                data: {
                  room_id: room.room_id,
                  status: "pending",
                  notes: `[MAINTENANCE] [ESCALATION #${issue.id}] ${issue.title.slice(0, 80)} (Authorized by ${session.full_name})`.slice(0, 255),
                },
              });
              linkedTaskId = task.task_id;
            }

            await tx.rooms.update({
              where: { room_id: room.room_id },
              data: {
                status: "maintenance",
                notes: `Critical Defect: ${issue.title.slice(0, 100)}`,
              },
            });
          }
        },
        { maxWait: 20000, timeout: 30000 }
      );
    }

    updateSeriousIssueDecision(
      issueId,
      decision,
      reviewNotes,
      session.full_name,
      linkedTaskId
    );

    logActivity(
      session.full_name,
      session.role_name,
      `Escalation ${decision === "approved" ? "Approved" : "Declined"}`,
      `Single authorization by ${session.role_name} (${session.full_name}) on '${issue.title}': ${reviewNotes || decision}.`,
      issue.roomNumber
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");

    return {
      success: true,
      message: `Escalated issue marked as ${decision.toUpperCase()} by ${session.full_name}. Exactly one linked maintenance task is active.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error:
        err.message ||
        "Access restricted. You must be signed in as Administrator or Manager to review and approve maintenance escalations.",
    };
  }
}

export async function startSeriousEscalationRepair(issueId: string) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    const issue = getSeriousIssueById(issueId);
    if (!issue) return { success: false, error: "Issue not found." };

    if (issue.status !== "approved") {
      return {
        success: false,
        error: `Cannot start maintenance. Escalation must be approved first (current status: ${issue.status}).`,
      };
    }

    if (issue.linkedTaskId) {
      // UNIFIED WORKFLOW: delegate directly to startMaintenanceTask
      return await startMaintenanceTask(issue.linkedTaskId);
    }

    updateSeriousIssueProgress(issueId, "in_progress", session.full_name);

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    return { success: true, message: `Maintenance in progress on "${issue.title}".` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to start repair." };
  }
}

export async function completeSeriousEscalationRepair(
  issueId: string,
  resolutionNotes: string
) {
  try {
    const session = await requireRole(["Admin", "Manager", "Maintenance"]);

    const issue = getSeriousIssueById(issueId);
    if (!issue) return { success: false, error: "Issue not found." };

    if (issue.linkedTaskId) {
      // UNIFIED WORKFLOW: delegate directly to completeMaintenanceTask
      return await completeMaintenanceTask(issue.linkedTaskId, resolutionNotes);
    }

    updateSeriousIssueProgress(issueId, "completed", session.full_name, resolutionNotes);

    logActivity(
      session.full_name,
      session.role_name,
      "Serious Repair Finished",
      `Finished repair on "${issue.title}". Resolution: ${resolutionNotes}.`,
      issue.roomNumber
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return { success: true, message: `Repair on "${issue.title}" completed.` };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to finish repair." };
  }
}

export async function getSeriousEscalatedIssues() {
  await requireRole(["Admin", "Manager", "Maintenance"]);
  const issues = getAllSeriousIssues();

  // Synchronize status with authoritative live MySQL housekeeping_tasks
  const linkedTaskIds = issues
    .map((i) => i.linkedTaskId)
    .filter((id): id is number => typeof id === "number");

  if (linkedTaskIds.length > 0) {
    const dbTasks = await prisma.housekeeping_tasks.findMany({
      where: { task_id: { in: linkedTaskIds } },
      include: { staff: true },
    });

    const taskMap = new Map(dbTasks.map((t) => [t.task_id, t]));

    for (const issue of issues) {
      if (!issue.linkedTaskId) continue;
      const dbTask = taskMap.get(issue.linkedTaskId);
      if (!dbTask) continue;

      if (dbTask.status === "done" && issue.status !== "completed") {
        updateSeriousIssueProgress(
          issue.id,
          "completed",
          dbTask.staff ? `${dbTask.staff.first_name} ${dbTask.staff.last_name}` : "Technician",
          dbTask.notes?.includes("| RESOLVED:") ? dbTask.notes.split("| RESOLVED:")[1].trim() : undefined
        );
      } else if (dbTask.status === "in_progress" && issue.status === "approved") {
        updateSeriousIssueProgress(
          issue.id,
          "in_progress",
          dbTask.staff ? `${dbTask.staff.first_name} ${dbTask.staff.last_name}` : "Technician"
        );
      }
    }
  }

  return getAllSeriousIssues();
}

// ─── Front Desk: Walk-in Reservation Creation (Supports Direct Check-In) ─────

export async function createWalkInReservation(formData: FormData) {
  try {
    const session = await requireRole(["Admin", "Manager", "Receptionist"]);

    const firstName = formData.get("firstName")?.toString().trim();
    const lastName = formData.get("lastName")?.toString().trim();
    const phone = formData.get("phone")?.toString().trim();
    const email = formData.get("email")?.toString().trim() || null;
    const roomId = parseInt(formData.get("roomId")?.toString() || "0", 10);
    const checkInDate = formData.get("checkInDate")?.toString();
    const checkOutDate = formData.get("checkOutDate")?.toString();
    const adults = parseInt(formData.get("adults")?.toString() || "1", 10);
    const children = parseInt(formData.get("children")?.toString() || "0", 10);
    const specialRequests = formData.get("specialRequests")?.toString().trim() || null;

    const directCheckIn = formData.get("directCheckIn") === "true";
    const recordPayment = formData.get("recordPayment") === "true";
    const paymentMethod = (formData.get("paymentMethod")?.toString() || "cash") as any;

    if (!firstName || !lastName || !phone || !roomId || !checkInDate || !checkOutDate) {
      return { success: false, error: "All required guest, room, and date fields must be filled." };
    }

    // Validate Person Names
    const fnVal = validatePersonName(firstName, "First name", 50);
    if (!fnVal.isValid) return { success: false, error: fnVal.error };
    const cleanFirstName = fnVal.sanitized;

    const lnVal = validatePersonName(lastName, "Last name", 50);
    if (!lnVal.isValid) return { success: false, error: lnVal.error };
    const cleanLastName = lnVal.sanitized;

    // Validate Phone Number
    const phoneVal = validatePhoneNumber(phone, "Phone number", true);
    if (!phoneVal.isValid) return { success: false, error: phoneVal.error };
    const canonicalGuestPhone = phoneVal.canonical;

    // Validate Email Address
    let cleanEmail: string | null = null;
    if (email && String(email).trim().length > 0) {
      const emVal = validateEmail(email, "Email address", false);
      if (!emVal.isValid) return { success: false, error: emVal.error };
      cleanEmail = emVal.sanitized;
    }

    // Sanitize special requests
    const specVal = sanitizeFreeText(specialRequests, 500, "Special requests");
    if (!specVal.isValid) return { success: false, error: specVal.error };
    const cleanSpecialRequests = specVal.sanitized || null;

    // Validate occupancy bounds
    const cleanAdults = Math.max(1, Math.min(10, adults || 1));
    const cleanChildren = Math.max(0, Math.min(10, children || 0));

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkOut <= checkIn) {
      return { success: false, error: "Check-out date must be after check-in date." };
    }

    // 1. Verify room is currently available
    const room = await prisma.rooms.findUnique({
      where: { room_id: roomId },
      include: { room_types: true },
    });

    if (!room) return { success: false, error: "Selected room not found." };

    if (room.status !== "available") {
      return {
        success: false,
        error: `Room ${room.room_number} is currently '${room.status}'. Only 'available' rooms can be assigned for walk-in guests.`,
      };
    }

    // 2. Check for overlapping reservations
    const overlapping = await prisma.reservation_rooms.findFirst({
      where: {
        room_id: roomId,
        reservations: {
          status: { in: ["pending", "confirmed", "checked_in"] },
          check_in_date: { lt: checkOut },
          check_out_date: { gt: checkIn },
        },
      },
    });

    if (overlapping) {
      return { success: false, error: `Room ${room.room_number} has an overlapping booking for these dates.` };
    }

    // 3. Upsert guest
    let guest = await prisma.guests.findFirst({
      where: {
        OR: [
          { phone: canonicalGuestPhone },
          { phone: phone.trim() },
        ],
      },
    });
    if (!guest) {
      guest = await prisma.guests.create({
        data: {
          first_name: cleanFirstName,
          last_name: cleanLastName,
          phone: canonicalGuestPhone,
          email: cleanEmail,
        },
      });
    }

    // 4. Create reservation & optional direct stay / payment
    const ratePerNight = parseFloat(room.room_types.base_price.toString());
    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    const totalAmount = ratePerNight * nights;

    const reservation = await prisma.$transaction(
      async (tx) => {
        const res = await tx.reservations.create({
          data: {
            guest_id: guest.guest_id,
            created_by: session.staff_id,
            source: "walk_in",
            check_in_date: checkIn,
            check_out_date: checkOut,
            adults: cleanAdults,
            children: cleanChildren,
            status: directCheckIn ? "checked_in" : "confirmed",
            special_requests: cleanSpecialRequests,
          },
        });

        const rr = await tx.reservation_rooms.create({
          data: {
            reservation_id: res.reservation_id,
            room_id: roomId,
            rate_per_night: ratePerNight,
          },
        });

        await tx.invoices.create({
          data: {
            reservation_id: res.reservation_id,
            subtotal: totalAmount,
            tax_amount: 0,
            discount_amount: 0,
            total_amount: totalAmount,
            status: recordPayment ? "paid" : "issued",
            generated_by: session.staff_id,
          },
        });

        if (recordPayment) {
          const methodVal = (paymentMethod === "cash" ? "cash" : paymentMethod === "bank_transfer" ? "bank_transfer" : "card") as any;
          await tx.payments.create({
            data: {
              reservation_id: res.reservation_id,
              amount: totalAmount,
              method: methodVal,
              transaction_ref: `WALK-${Date.now()}`,
              processed_by: session.staff_id,
            },
          });
        }

        if (directCheckIn) {
          await tx.stays.create({
            data: {
              reservation_room_id: rr.reservation_room_id,
              actual_check_in: new Date(),
              checked_in_by: session.staff_id,
            },
          });

          await tx.rooms.update({
            where: { room_id: roomId },
            data: { status: "occupied" },
          });
        }

        return res;
      },
      { timeout: 30000, maxWait: 15000 }
    );

    logActivity(
      session.full_name,
      session.role_name,
      directCheckIn ? "Walk-In Direct Check-in" : "Walk-In Booking Created",
      `${directCheckIn ? "Directly checked in" : "Created reservation for"} ${firstName} ${lastName} in Room ${room.room_number}. Payment: ${recordPayment ? "PAID" : "YET TO PAY"}.`,
      room.room_number
    );

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return {
      success: true,
      message: directCheckIn
        ? `Walk-in guest ${firstName} ${lastName} checked in directly into Room ${room.room_number}! Room status: Occupied.`
        : `Walk-in booking RES-${String(reservation.reservation_id).padStart(4, "0")} confirmed for Room ${room.room_number}. Ready for check-in.`,
      reservation: {
        reservation_id: reservation.reservation_id,
        booking_reference: `RES-${String(reservation.reservation_id).padStart(4, "0")}`,
        room_number: room.room_number,
        room_type: room.room_types.name,
        total_amount: totalAmount,
        status: directCheckIn ? "checked_in" : "confirmed",
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create walk-in reservation." };
  }
}

// ─── Notification Actions ───────────────────────────────────────────────────

export async function getStaffNotifications() {
  const session = await requireStaff();
  return getNotificationsForRole(session.role_name);
}

export async function markNotificationRead(id: string) {
  await requireStaff();
  const res = markNotificationAsRead(id);
  revalidatePath("/staff/dashboard");
  return { success: true, item: res };
}

export async function markAllStaffNotificationsRead() {
  const session = await requireStaff();
  markAllNotificationsAsRead(session.role_name);
  revalidatePath("/staff/dashboard");
  return { success: true };
}
