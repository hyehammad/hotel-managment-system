import { Prisma } from "@prisma/client";

export type PaymentStatus = "PAID" | "PARTIALLY PAID" | "YET TO PAY";
export type DbInvoiceStatus = "paid" | "issued";

export interface FinancialSummary {
  totalAmount: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  remainingBalance: Prisma.Decimal;
  creditBalance: Prisma.Decimal;
  isFullySettled: boolean;
  paymentStatus: PaymentStatus;
  dbStatus: DbInvoiceStatus;
  totalAmountNum: number;
  totalPaidNum: number;
  remainingBalanceNum: number;
  creditBalanceNum: number;
}

/**
 * Pure Decimal-based calculation of financial totals, balances, and statuses.
 * Handles Scenarios A, B, C, D, E with zero floating-point precision loss.
 *
 * Scenario A: Total 10,000, Paid 10,000 -> PAID, Bal 0, Credit 0
 * Scenario B: Total 12,000, Paid 10,000 -> PARTIALLY PAID, Bal 2,000, Credit 0
 * Scenario C: Total 10,000, Paid 5,000  -> PARTIALLY PAID, Bal 5,000, Credit 0
 * Scenario D: Total 10,000, Paid 0      -> YET TO PAY, Bal 10,000, Credit 0
 * Scenario E: Total 10,000, Paid 12,000 -> PAID, Bal 0, Credit 2,000 (Excess preserved)
 */
export function calculateFinancialSummary(
  totalAmountInput: Prisma.Decimal | number | string | null | undefined,
  payments: Array<{ amount: Prisma.Decimal | number | string | null | undefined }> | null | undefined
): FinancialSummary {
  const totalAmount = new Prisma.Decimal(totalAmountInput ?? 0);
  const totalPaid = (payments || []).reduce(
    (sum, p) => sum.plus(new Prisma.Decimal(p?.amount ?? 0)),
    new Prisma.Decimal(0)
  );

  const isFullySettled = totalAmount.gt(0) && totalPaid.gte(totalAmount);
  const remainingBalance = totalPaid.gte(totalAmount)
    ? new Prisma.Decimal(0)
    : totalAmount.minus(totalPaid);
  const creditBalance = totalPaid.gt(totalAmount)
    ? totalPaid.minus(totalAmount)
    : new Prisma.Decimal(0);

  let paymentStatus: PaymentStatus;
  if (isFullySettled) {
    paymentStatus = "PAID";
  } else if (totalPaid.gt(0)) {
    paymentStatus = "PARTIALLY PAID";
  } else {
    paymentStatus = "YET TO PAY";
  }

  // Database enum only supports "issued" and "paid".
  // In MySQL:
  // - "paid" when totalPaid >= totalAmount and totalAmount > 0
  // - "issued" when totalPaid < totalAmount or totalAmount <= 0
  const dbStatus: DbInvoiceStatus = isFullySettled ? "paid" : "issued";

  return {
    totalAmount,
    totalPaid,
    remainingBalance,
    creditBalance,
    isFullySettled,
    paymentStatus,
    dbStatus,
    totalAmountNum: totalAmount.toNumber(),
    totalPaidNum: totalPaid.toNumber(),
    remainingBalanceNum: remainingBalance.toNumber(),
    creditBalanceNum: creditBalance.toNumber(),
  };
}

export interface LockedInvoiceRecord {
  invoice_id: number;
  reservation_id: number;
  subtotal: Prisma.Decimal;
  total_amount: Prisma.Decimal;
  status: string;
}

/**
 * Locks an invoice row for update in MySQL InnoDB using parameterized SELECT ... FOR UPDATE.
 * If the invoice does not exist, creates it atomically within the transaction, resolves any concurrent
 * insertion collisions on uq_invoices_reservation safely, and acquires the exclusive row lock.
 *
 * FAIL-CLOSED: Genuine database, connection, or lock-wait errors propagate immediately to abort
 * the transaction. No silent fallback to un-locked reads.
 */
export async function lockInvoiceForReservation(
  tx: Prisma.TransactionClient,
  reservationId: number,
  fallbackStaffId: number,
  checkInDate?: Date,
  checkOutDate?: Date,
  ratePerNight?: Prisma.Decimal | number
): Promise<LockedInvoiceRecord> {
  // 1. Attempt exclusive row lock on existing invoice (Fail-Closed: errors throw directly)
  const rows = await tx.$queryRaw<LockedInvoiceRecord[]>`
    SELECT invoice_id, reservation_id, subtotal, total_amount, status 
    FROM invoices 
    WHERE reservation_id = ${reservationId} 
    FOR UPDATE
  `;

  if (rows && rows.length > 0) {
    return {
      invoice_id: rows[0].invoice_id,
      reservation_id: rows[0].reservation_id,
      subtotal: new Prisma.Decimal(rows[0].subtotal),
      total_amount: new Prisma.Decimal(rows[0].total_amount),
      status: rows[0].status,
    };
  }

  // 2. Invoice does not exist yet. Calculate initial bill and attempt creation.
  const nights = checkInDate && checkOutDate
    ? Math.max(1, Math.ceil((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const rate = ratePerNight ? new Prisma.Decimal(ratePerNight) : new Prisma.Decimal(0);
  const totalDue = rate.times(nights);

  try {
    await tx.invoices.create({
      data: {
        reservation_id: reservationId,
        subtotal: totalDue,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: totalDue,
        status: "issued",
        generated_by: fallbackStaffId,
      },
    });
  } catch (err: any) {
    // Deliberately handle unique-constraint collision on reservation_id if a concurrent transaction inserted first.
    // Explicitly verify that the unique constraint failure targets reservation_id / uq_invoices_reservation.
    const isP2002 = err?.code === "P2002";
    const targetsReservationConstraint =
      (Array.isArray(err?.meta?.target) && err.meta.target.includes("reservation_id")) ||
      (typeof err?.meta?.target === "string" &&
        (err.meta.target.includes("reservation_id") || err.meta.target.includes("uq_invoices_reservation"))) ||
      err?.message?.includes("uq_invoices_reservation") ||
      (err?.message?.includes("reservation_id") && err?.message?.includes("Unique constraint")) ||
      (err?.message?.includes("Duplicate entry") &&
        (err?.message?.includes("uq_invoices_reservation") || err?.message?.includes("reservation_id")));

    const isTargetedCollision = (isP2002 && targetsReservationConstraint) ||
      (err?.message?.includes("Duplicate entry") &&
        (err?.message?.includes("uq_invoices_reservation") || err?.message?.includes("reservation_id")));

    if (!isTargetedCollision) {
      throw err;
    }
  }

  // 3. Acquire exclusive row lock on the newly created or concurrently inserted invoice
  const lockedRows = await tx.$queryRaw<LockedInvoiceRecord[]>`
    SELECT invoice_id, reservation_id, subtotal, total_amount, status 
    FROM invoices 
    WHERE reservation_id = ${reservationId} 
    FOR UPDATE
  `;

  if (!lockedRows || lockedRows.length === 0) {
    throw new Error(`Failed to acquire exclusive invoice lock for reservation ${reservationId}`);
  }

  return {
    invoice_id: lockedRows[0].invoice_id,
    reservation_id: lockedRows[0].reservation_id,
    subtotal: new Prisma.Decimal(lockedRows[0].subtotal),
    total_amount: new Prisma.Decimal(lockedRows[0].total_amount),
    status: lockedRows[0].status,
  };
}

/**
 * Synchronize the database invoice status atomically within a transaction.
 * Reconciles invoice total against all payments and updates the database status if desynchronized.
 * Reverts "paid" -> "issued" if incidental charges or order additions exceed payments.
 */
export async function syncInvoiceStatus(
  tx: Prisma.TransactionClient,
  invoiceId: number
): Promise<FinancialSummary> {
  const invoice = await tx.invoices.findUnique({
    where: { invoice_id: invoiceId },
    include: {
      reservations: {
        include: {
          payments: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice with ID ${invoiceId} not found`);
  }

  const summary = calculateFinancialSummary(
    invoice.total_amount,
    invoice.reservations.payments
  );

  if (invoice.status !== summary.dbStatus) {
    await tx.invoices.update({
      where: { invoice_id: invoiceId },
      data: { status: summary.dbStatus },
    });
  }

  return summary;
}
