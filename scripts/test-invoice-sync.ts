import { Prisma } from "@prisma/client";
import {
  calculateFinancialSummary,
  syncInvoiceStatus,
  lockInvoiceForReservation,
  type FinancialSummary,
} from "../src/lib/financial";

/**
 * Phase 10C Isolated Financial Concurrency & Lifecycle Verification Suite
 *
 * STRICT SAFETY RULE:
 * This test suite runs 100% in-memory without contacting or writing to Railway MySQL production.
 */

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error("    Details:", details);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("PHASE 10C: FINANCIAL CONCURRENCY & LIFECYCLE VERIFICATION SUITE");
  console.log("==================================================================\n");

  // ─── 1. Initial Unpaid Invoice ───────────────────────────────────────────────
  console.log("1. Testing Initial Unpaid Invoice (10,000 billed, 0 payments)");
  {
    const total = new Prisma.Decimal("10000.00");
    const payments: Array<{ amount: any }> = [];
    const summary = calculateFinancialSummary(total, payments);

    assert(summary.paymentStatus === "YET TO PAY", "Initial Unpaid: paymentStatus is YET TO PAY");
    assert(summary.dbStatus === "issued", "Initial Unpaid: dbStatus is 'issued'");
    assert(summary.remainingBalance.equals("10000.00"), "Initial Unpaid: remainingBalance is 10,000.00");
    assert(summary.totalPaid.equals(0), "Initial Unpaid: totalPaid is 0");
    assert(summary.creditBalance.equals(0), "Initial Unpaid: creditBalance is 0");
    assert(summary.isFullySettled === false, "Initial Unpaid: isFullySettled is false");
  }

  // ─── 2. Full Payment ─────────────────────────────────────────────────────────
  console.log("\n2. Testing Full Payment (10,000 billed, 10,000 paid)");
  {
    const total = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("10000.00") }];
    const summary = calculateFinancialSummary(total, payments);

    assert(summary.paymentStatus === "PAID", "Full Payment: paymentStatus is PAID");
    assert(summary.dbStatus === "paid", "Full Payment: dbStatus is 'paid'");
    assert(summary.remainingBalance.equals(0), "Full Payment: remainingBalance is 0");
    assert(summary.creditBalance.equals(0), "Full Payment: creditBalance is 0");
    assert(summary.isFullySettled === true, "Full Payment: isFullySettled is true");
  }

  // ─── 3. Partial Payment ──────────────────────────────────────────────────────
  console.log("\n3. Testing Partial Payment (10,000 billed, 5,000 paid)");
  {
    const total = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("5000.00") }];
    const summary = calculateFinancialSummary(total, payments);

    assert(summary.paymentStatus === "PARTIALLY PAID", "Partial Payment: paymentStatus is PARTIALLY PAID");
    assert(summary.dbStatus === "issued", "Partial Payment: dbStatus is 'issued'");
    assert(summary.remainingBalance.equals("5000.00"), "Partial Payment: remainingBalance is 5,000.00");
    assert(summary.creditBalance.equals(0), "Partial Payment: creditBalance is 0");
    assert(summary.isFullySettled === false, "Partial Payment: isFullySettled is false");
  }

  // ─── 4. Full Payment Followed by Incidental Charge (BUG-01 Core) ────────────
  console.log("\n4. Testing Full Payment Followed by Incidental Charge (BUG-01 Core Lifecycle)");
  {
    let invoiceTotal = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("10000.00") }];
    let summary = calculateFinancialSummary(invoiceTotal, payments);

    assert(summary.paymentStatus === "PAID", "Post-Payment Charge: Initial status is PAID");
    assert(summary.dbStatus === "paid", "Post-Payment Charge: Initial DB status is 'paid'");

    // Add room service charge of 2,000
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("2000.00")); // 12,000
    summary = calculateFinancialSummary(invoiceTotal, payments);

    assert(summary.totalAmount.equals("12000.00"), "Post-Payment Charge: Total updated to 12,000.00");
    assert(summary.totalPaid.equals("10000.00"), "Post-Payment Charge: Paid remains 10,000.00");
    assert(summary.paymentStatus === "PARTIALLY PAID", "Post-Payment Charge: Status reverts to PARTIALLY PAID");
    assert(summary.dbStatus === "issued", "Post-Payment Charge: DB status reverts to 'issued'");
    assert(summary.remainingBalance.equals("2000.00"), "Post-Payment Charge: Remaining balance is 2,000.00");
    assert(summary.isFullySettled === false, "Post-Payment Charge: isFullySettled is false");

    // Settle balance
    payments.push({ amount: new Prisma.Decimal("2000.00") });
    summary = calculateFinancialSummary(invoiceTotal, payments);

    assert(summary.paymentStatus === "PAID", "Post-Payment Charge: Status restored to PAID upon full settlement");
    assert(summary.dbStatus === "paid", "Post-Payment Charge: DB status restored to 'paid'");
    assert(summary.remainingBalance.equals(0), "Post-Payment Charge: Remaining balance is 0");
    assert(summary.isFullySettled === true, "Post-Payment Charge: isFullySettled is true");
  }

  // ─── 5. Multiple Incidental Charges on the Same Invoice ──────────────────────
  console.log("\n5. Testing Multiple Incidental Charges on Same Invoice");
  {
    let invoiceTotal = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("10000.00") }]; // Paid initially

    // Charge 1: Minibar 1,500
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("1500.00")); // 11,500
    let s1 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s1.paymentStatus === "PARTIALLY PAID" && s1.remainingBalance.equals(1500), "Multiple Charges (1): Bal 1,500, PARTIALLY PAID");
    assert(s1.dbStatus === "issued", "Multiple Charges (1): DB status is 'issued'");

    // Charge 2: Laundry 2,500
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("2500.00")); // 14,000
    let s2 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s2.paymentStatus === "PARTIALLY PAID" && s2.remainingBalance.equals(4000), "Multiple Charges (2): Bal 4,000, PARTIALLY PAID");
    assert(s2.totalAmount.equals(14000), "Multiple Charges (2): Total amount is 14,000");

    // Charge 3: Damage Penalty 1,000
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("1000.00")); // 15,000
    let s3 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s3.paymentStatus === "PARTIALLY PAID" && s3.remainingBalance.equals(5000), "Multiple Charges (3): Bal 5,000, PARTIALLY PAID");

    // Complete settlement of all incidental charges
    payments.push({ amount: new Prisma.Decimal("5000.00") });
    let sFinal = calculateFinancialSummary(invoiceTotal, payments);
    assert(sFinal.paymentStatus === "PAID" && sFinal.remainingBalance.equals(0), "Multiple Charges (Final): Fully settled to PAID");
    assert(sFinal.dbStatus === "paid", "Multiple Charges (Final): DB status updated to 'paid'");
  }

  // ─── 6. Payment Followed by Multiple Charges ─────────────────────────────────
  console.log("\n6. Testing Payment Followed by Multiple Charges");
  {
    let invoiceTotal = new Prisma.Decimal("8000.00");
    const payments = [{ amount: new Prisma.Decimal("5000.00") }]; // 5,000 paid

    let s0 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s0.paymentStatus === "PARTIALLY PAID" && s0.remainingBalance.equals(3000), "Pay + Charges (0): Initial partial bal 3,000");

    // Add Charge A: 1,000 -> Total 9,000
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("1000.00"));
    let sA = calculateFinancialSummary(invoiceTotal, payments);
    assert(sA.remainingBalance.equals(4000) && sA.paymentStatus === "PARTIALLY PAID", "Pay + Charges (A): Bal 4,000 after Charge A");

    // Add Charge B: 2,000 -> Total 11,000
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("2000.00"));
    let sB = calculateFinancialSummary(invoiceTotal, payments);
    assert(sB.remainingBalance.equals(6000) && sB.paymentStatus === "PARTIALLY PAID", "Pay + Charges (B): Bal 6,000 after Charge B");
    assert(sB.dbStatus === "issued", "Pay + Charges (B): DB status remains 'issued'");
  }

  // ─── 7. Partial Payment Followed by Incidental Charge ────────────────────────
  console.log("\n7. Testing Partial Payment Followed by Incidental Charge");
  {
    let invoiceTotal = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("4000.00") }]; // Partial 4,000

    let s1 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s1.paymentStatus === "PARTIALLY PAID" && s1.remainingBalance.equals(6000), "Partial + Charge (1): Bal 6,000");

    // Add incidental charge 3,000 -> Total 13,000
    invoiceTotal = invoiceTotal.plus(new Prisma.Decimal("3000.00"));
    let s2 = calculateFinancialSummary(invoiceTotal, payments);
    assert(s2.paymentStatus === "PARTIALLY PAID" && s2.remainingBalance.equals(9000), "Partial + Charge (2): Bal 9,000");
    assert(s2.totalPaid.equals(4000) && s2.totalAmount.equals(13000), "Partial + Charge (2): Paid 4k / Total 13k");
  }

  // ─── 8. Overpayment and Excess Guest Credit ───────────────────────────────────
  console.log("\n8. Testing Overpayment and Excess Guest Credit");
  {
    const total = new Prisma.Decimal("10000.00");
    const payments = [{ amount: new Prisma.Decimal("15000.00") }];
    const summary = calculateFinancialSummary(total, payments);

    assert(summary.paymentStatus === "PAID", "Overpayment: paymentStatus is PAID");
    assert(summary.dbStatus === "paid", "Overpayment: dbStatus is 'paid'");
    assert(summary.remainingBalance.equals(0), "Overpayment: remainingBalance is 0");
    assert(summary.creditBalance.equals("5000.00"), "Overpayment: creditBalance is 5,000.00");
    assert(summary.creditBalanceNum === 5000, "Overpayment: creditBalanceNum serializes to 5000");
    assert(summary.isFullySettled === true, "Overpayment: isFullySettled is true");
  }

  // ─── 9. Repeated Invoice Synchronization (Idempotency) ───────────────────────
  console.log("\n9. Testing Repeated Invoice Synchronization (10 Idempotent Iterations)");
  {
    const total = new Prisma.Decimal("12345.67");
    const payments = [
      { amount: new Prisma.Decimal("2345.67") },
      { amount: new Prisma.Decimal("5000.00") },
    ];

    const baseline = calculateFinancialSummary(total, payments);
    for (let i = 0; i < 10; i++) {
      const run = calculateFinancialSummary(total, payments);
      assert(run.paymentStatus === baseline.paymentStatus, `Idempotency run ${i+1}: paymentStatus matches`);
      assert(run.remainingBalance.equals(baseline.remainingBalance), `Idempotency run ${i+1}: remainingBalance matches`);
      assert(run.dbStatus === baseline.dbStatus, `Idempotency run ${i+1}: dbStatus matches`);
      assert(run.creditBalance.equals(baseline.creditBalance), `Idempotency run ${i+1}: creditBalance matches`);
    }
  }

  // ─── 10. Financial Decimal Precision (Zero Floating-Point Drift) ─────────────
  console.log("\n10. Testing Financial Decimal Precision");
  {
    const item1 = new Prisma.Decimal("19.99");
    const total = item1.times(3).plus(new Prisma.Decimal("10.03")); // exactly 70.00
    const payments = [
      { amount: new Prisma.Decimal("33.33") },
      { amount: new Prisma.Decimal("36.67") },
    ]; // exactly 70.00

    const summary = calculateFinancialSummary(total, payments);
    assert(summary.totalAmount.equals("70.00"), "Precision: Total amount exact 70.00");
    assert(summary.totalPaid.equals("70.00"), "Precision: Total paid exact 70.00");
    assert(summary.remainingBalance.equals("0.00"), "Precision: Remaining balance exact 0.00");
    assert(summary.paymentStatus === "PAID", "Precision: Status is PAID");
  }

  // ─── 11. Concurrency Simulation: Simultaneous Charge Submissions ────────────
  console.log("\n11. Testing Concurrency: Simultaneous Charge Submissions Under Exclusive Row Lock");
  {
    const mockDb = {
      invoice: {
        invoice_id: 101,
        reservation_id: 202,
        subtotal: new Prisma.Decimal("10000.00"),
        total_amount: new Prisma.Decimal("10000.00"),
        status: "paid",
        reservations: {
          payments: [{ amount: new Prisma.Decimal("10000.00") }],
        },
      },
      invoiceItems: [] as any[],
    };

    let isLocked = false;
    const lockWaitQueue: Array<() => void> = [];

    const acquireRowLock = async () => {
      if (!isLocked) {
        isLocked = true;
        return;
      }
      await new Promise<void>((resolve) => lockWaitQueue.push(resolve));
    };

    const releaseRowLock = () => {
      if (lockWaitQueue.length > 0) {
        const next = lockWaitQueue.shift()!;
        next();
      } else {
        isLocked = false;
      }
    };

    const simulateConcurrentPostCharge = async (chargeAmount: number, description: string) => {
      await acquireRowLock();
      try {
        const currentSubtotal = mockDb.invoice.subtotal;
        const currentTotal = mockDb.invoice.total_amount;
        const decCharge = new Prisma.Decimal(chargeAmount);

        await new Promise((r) => setTimeout(r, 15));

        mockDb.invoice.subtotal = currentSubtotal.plus(decCharge);
        mockDb.invoice.total_amount = currentTotal.plus(decCharge);
        mockDb.invoiceItems.push({ description, amount: decCharge });

        const summary = calculateFinancialSummary(
          mockDb.invoice.total_amount,
          mockDb.invoice.reservations.payments
        );
        mockDb.invoice.status = summary.dbStatus;

        return summary;
      } finally {
        releaseRowLock();
      }
    };

    const [result1, result2] = await Promise.all([
      simulateConcurrentPostCharge(1200, "Minibar Refill"),
      simulateConcurrentPostCharge(800, "Room Service Dinner"),
    ]);

    assert(
      mockDb.invoice.total_amount.equals("12000.00"),
      "Concurrency Test: Final invoice total is exactly 12,000.00 (NO LOST UPDATES)"
    );
    assert(
      mockDb.invoice.subtotal.equals("12000.00"),
      "Concurrency Test: Final invoice subtotal is exactly 12,000.00"
    );
    assert(
      mockDb.invoiceItems.length === 2,
      "Concurrency Test: Both invoice items successfully recorded"
    );
    assert(
      mockDb.invoice.status === "issued",
      "Concurrency Test: DB invoice status reverted to 'issued' because 12,000 > 10,000 paid"
    );

    const finalSummary = calculateFinancialSummary(
      mockDb.invoice.total_amount,
      mockDb.invoice.reservations.payments
    );
    assert(
      finalSummary.paymentStatus === "PARTIALLY PAID",
      "Concurrency Test: Status correctly evaluated as PARTIALLY PAID"
    );
    assert(
      finalSummary.remainingBalance.equals("2000.00"),
      "Concurrency Test: Remaining balance is exactly 2,000.00"
    );
  }

  // ─── 12. Direct lockInvoiceForReservation Tests (Fail-Closed & Concurrency) ──
  console.log("\n12. Testing lockInvoiceForReservation: Fail-Closed & Concurrency Handling");
  {
    // 12.1 Existing Invoice Locking (Happy Path)
    {
      let queryRawCalls = 0;
      let createCalls = 0;
      const mockTx: any = {
        $queryRaw: async (query: any, ...args: any[]) => {
          queryRawCalls++;
          return [
            {
              invoice_id: 501,
              reservation_id: 1001,
              subtotal: new Prisma.Decimal("8500.00"),
              total_amount: new Prisma.Decimal("8500.00"),
              status: "issued",
            },
          ];
        },
        invoices: {
          create: async () => {
            createCalls++;
            return {};
          },
        },
      };

      const locked = await lockInvoiceForReservation(mockTx, 1001, 1);
      assert(locked.invoice_id === 501, "lockInvoice: Successfully locks existing invoice");
      assert(locked.total_amount.equals("8500.00"), "lockInvoice: Preserves total_amount Decimal");
      assert(queryRawCalls === 1, "lockInvoice: Exactly 1 FOR UPDATE query executed");
      assert(createCalls === 0, "lockInvoice: invoices.create NOT called when invoice exists");
    }

    // 12.2 Missing Invoice Creation & Lock Acquisition
    {
      let queryRawCalls = 0;
      let createdPayload: any = null;
      const mockTx: any = {
        $queryRaw: async (query: any, ...args: any[]) => {
          queryRawCalls++;
          if (queryRawCalls === 1) {
            return []; // Invoice not found initially
          }
          return [
            {
              invoice_id: 502,
              reservation_id: 1002,
              subtotal: createdPayload.subtotal,
              total_amount: createdPayload.total_amount,
              status: createdPayload.status,
            },
          ];
        },
        invoices: {
          create: async (args: any) => {
            createdPayload = args.data;
            return { invoice_id: 502, ...args.data };
          },
        },
      };

      const locked = await lockInvoiceForReservation(
        mockTx,
        1002,
        99,
        new Date("2026-07-01"),
        new Date("2026-07-04"), // 3 nights
        new Prisma.Decimal("1500.00") // 4500.00 total
      );

      assert(locked.invoice_id === 502, "lockInvoice: Creates missing invoice and returns locked record");
      assert(locked.total_amount.equals("4500.00"), "lockInvoice: Correctly computes nights * rate");
      assert(queryRawCalls === 2, "lockInvoice: Issues initial check query and post-creation lock query");
      assert(createdPayload !== null, "lockInvoice: Invoices.create was executed");
      assert(createdPayload.generated_by === 99, "lockInvoice: Uses fallback staff ID");
    }

    // 12.3 Missing Invoice Concurrency Collision (P2002 Unique Constraint Race)
    {
      let queryRawCalls = 0;
      const state = { createAttempted: false };
      const mockTx: any = {
        $queryRaw: async (query: any, ...args: any[]) => {
          queryRawCalls++;
          if (queryRawCalls === 1) {
            return []; // Both concurrent transactions observed no invoice
          }
          // Second transaction locks the row that the first transaction created
          return [
            {
              invoice_id: 503,
              reservation_id: 1003,
              subtotal: new Prisma.Decimal("3000.00"),
              total_amount: new Prisma.Decimal("3000.00"),
              status: "issued",
            },
          ];
        },
        invoices: {
          create: async () => {
            state.createAttempted = true;
            // Throw Prisma P2002 error simulating concurrent creation collision
            const err: any = new Error("Unique constraint failed on the constraint: `uq_invoices_reservation`");
            err.code = "P2002";
            err.meta = { target: ["reservation_id"] };
            throw err;
          },
        },
      };

      const locked = await lockInvoiceForReservation(mockTx, 1003, 1);
      assert(state.createAttempted, "lockInvoice collision: Create was attempted");
      assert(locked.invoice_id === 503, "lockInvoice collision: Catches P2002 and locks winner's row");
      assert(locked.total_amount.equals("3000.00"), "lockInvoice collision: Successfully retrieved locked row");
      assert(queryRawCalls === 2, "lockInvoice collision: Exactly 2 FOR UPDATE queries issued");
    }

    // 12.4 Fail-Closed: Raw Query Error Aborts Immediately (No Fallback)
    {
      const state = { errorThrown: false, createCalled: false };
      const mockTx: any = {
        $queryRaw: async () => {
          throw new Error("ER_LOCK_WAIT_TIMEOUT: Lock wait timeout exceeded; try restarting transaction");
        },
        invoices: {
          create: async () => {
            state.createCalled = true;
            return {};
          },
          findUnique: async () => {
            throw new Error("UNEXPECTED_FALLBACK: findUnique should NEVER be called on fail-closed lock failure");
          },
        },
      };

      try {
        await lockInvoiceForReservation(mockTx, 1004, 1);
      } catch (err: any) {
        state.errorThrown = true;
        assert(
          err.message.includes("ER_LOCK_WAIT_TIMEOUT"),
          "Fail-Closed: Genuine lock-wait timeout error propagated directly"
        );
      }

      assert(state.errorThrown, "Fail-Closed: Lock failure threw error as expected");
      assert(!state.createCalled, "Fail-Closed: Did not attempt creation when query failed");
    }

    // 12.5 Fail-Closed: Unrelated P2002 Error During Invoices.create Throws Directly
    {
      const state = { errorThrown: false };
      const mockTx: any = {
        $queryRaw: async () => [],
        invoices: {
          create: async () => {
            const err: any = new Error("Unique constraint failed on the constraint: `uq_other_constraint`");
            err.code = "P2002";
            err.meta = { target: ["other_column"] };
            throw err;
          },
        },
      };

      try {
        await lockInvoiceForReservation(mockTx, 1005, 1);
      } catch (err: any) {
        state.errorThrown = true;
        assert(
          err?.code === "P2002",
          "Fail-Closed: Unrelated P2002 error on other column propagates directly without being caught"
        );
      }

      assert(state.errorThrown, "Fail-Closed: Unrelated unique constraint error was rethrown");
    }

    // 12.6 Fail-Closed: Post-Creation Lock Failure Throws
    {
      const state = { errorThrown: false, queryCount: 0 };
      const mockTx: any = {
        $queryRaw: async () => {
          state.queryCount++;
          return []; // Returns empty even after creation
        },
        invoices: {
          create: async () => ({ invoice_id: 506 }),
        },
      };

      try {
        await lockInvoiceForReservation(mockTx, 1006, 1);
      } catch (err: any) {
        state.errorThrown = true;
        assert(
          err.message.includes("Failed to acquire exclusive invoice lock"),
          "Fail-Closed: Throws when post-creation lock fails to return row"
        );
      }

      assert(state.errorThrown, "Fail-Closed: Error raised when post-creation lock fails");
      assert(state.queryCount === 2, "Fail-Closed: Both query attempts executed");
    }
  }

  console.log("\n==================================================================");
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified.`);
  console.log("==================================================================");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
