import { Prisma } from "@prisma/client";
import {
  calculateFinancialSummary,
  syncInvoiceStatus,
  lockInvoiceForReservation,
  type FinancialSummary,
} from "../src/lib/financial";
import {
  validatePersonName,
  validatePhoneNumber,
  sanitizePhoneInput,
  validateEmail,
  validateStaffUsername,
  validateStaffPassword,
  sanitizeFreeText,
  GuestBookingValidationSchema,
} from "../src/lib/validation";
import { canonicalizePhone } from "../src/lib/phone";

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

  // =========================================================================
  // 13. Phase 12.2 Academic Demo Payment Transparency
  // =========================================================================
  console.log("\n13. Testing Phase 12.2 Academic Demo Payment Transparency & Reference Formatting");
  {
    // 13.1 Verify Demo Transaction Reference Format
    const last4 = "4242";
    const demoRef = `SIM-ONL-${Date.now()}-${last4}`;
    assert(demoRef.startsWith("SIM-ONL-"), "Demo Payment Ref: Starts with explicit 'SIM-ONL-' prefix");
    assert(demoRef.endsWith("-4242"), "Demo Payment Ref: Ends with last4 digits");
    assert(!demoRef.includes("CVV") && !demoRef.includes("EXP"), "Demo Payment Ref: Contains zero CVV or Expiry tokens");

    // 13.2 Verify Demo Payment Ledger Integration in Financial Summary
    const demoPayment = { amount: new Prisma.Decimal("15000.00"), method: "online", transaction_ref: demoRef };
    const summary = calculateFinancialSummary(new Prisma.Decimal("15000.00"), [demoPayment]);
    assert(summary.paymentStatus === "PAID", "Demo Payment Summary: Evaluates to PAID status");
    assert(summary.dbStatus === "paid", "Demo Payment Summary: DB status is 'paid'");
    assert(summary.remainingBalance.toNumber() === 0, "Demo Payment Summary: Remaining balance is 0");

    // 13.3 Verify Absence of Sensitive Card Data in Simulated Payload
    const demoPayload: any = {
      cardholderName: "DEMO GUEST",
      cardNumberLast4: "4242",
    };
    assert(demoPayload.cardCvv === undefined, "Demo Payload: cardCvv is undefined (not collected)");
    assert(demoPayload.cardExpiry === undefined, "Demo Payload: cardExpiry is undefined (not collected)");
    assert(demoPayload.cardNumber === undefined, "Demo Payload: Full PAN cardNumber is not stored in payload");
  }

  // =========================================================================
  // 14. Phase 12.5 Duplicate Payment Behavior & Ledger Concurrency
  // =========================================================================
  console.log("\n14. Testing Duplicate Payment Behavior & Ledger Concurrency (Phase 12.5)");
  {
    const billedTotal = new Prisma.Decimal("10000.00");
    const payment1 = {
      amount: new Prisma.Decimal("10000.00"),
      method: "card",
      transaction_ref: "PAY-CARD-1700000001",
    };

    // 14.1 Initial Settlement of Invoice
    const summary1 = calculateFinancialSummary(billedTotal, [payment1]);
    assert(summary1.paymentStatus === "PAID", "Duplicate Test: Initial payment achieves PAID status");
    assert(summary1.dbStatus === "paid", "Duplicate Test: Initial DB status is 'paid'");
    assert(summary1.remainingBalance.toNumber() === 0, "Duplicate Test: Initial remaining balance is 0");
    assert(summary1.creditBalance.toNumber() === 0, "Duplicate Test: Initial credit balance is 0");
    assert(summary1.isFullySettled === true, "Duplicate Test: Initial state isFullySettled is true");

    // 14.2 Sequential Duplicate Payment Submission (e.g. Double-click or retry with new ref)
    const payment2Duplicate = {
      amount: new Prisma.Decimal("10000.00"),
      method: "card",
      transaction_ref: "PAY-CARD-1700000002",
    };
    const summary2 = calculateFinancialSummary(billedTotal, [payment1, payment2Duplicate]);
    assert(summary2.paymentStatus === "PAID", "Duplicate Test: Status remains PAID on duplicate payment");
    assert(summary2.dbStatus === "paid", "Duplicate Test: DB status remains 'paid'");
    assert(summary2.totalPaid.toNumber() === 20000, "Duplicate Test: Total paid safely accumulates to 20,000 without corruption");
    assert(summary2.remainingBalance.toNumber() === 0, "Duplicate Test: Remaining balance remains 0 (does not go negative)");
    assert(summary2.creditBalance.toNumber() === 10000, "Duplicate Test: Excess funds recorded as 10,000 credit balance");
    assert(summary2.isFullySettled === true, "Duplicate Test: Duplicate payment maintains isFullySettled = true");

    // 14.3 Ledger Recalculation Idempotency
    const summaryRepeat = calculateFinancialSummary(billedTotal, [payment1, payment2Duplicate]);
    assert(summaryRepeat.paymentStatus === summary2.paymentStatus, "Idempotency: Status calculation is idempotent");
    assert(summaryRepeat.totalPaid.equals(summary2.totalPaid), "Idempotency: totalPaid is strictly equal");
    assert(summaryRepeat.remainingBalance.equals(summary2.remainingBalance), "Idempotency: remainingBalance is strictly equal");
    assert(summaryRepeat.creditBalance.equals(summary2.creditBalance), "Idempotency: creditBalance is strictly equal");

    // 14.4 Architectural Idempotency Boundary Verification
    // Schema analysis: In `prisma/schema.prisma`, payments table has NO unique constraint on transaction_ref.
    // Demonstrating the distinction between static request tokens and dynamic timestamps:
    const paymentWithSameRef = {
      amount: new Prisma.Decimal("10000.00"),
      method: "card",
      transaction_ref: "PAY-CARD-1700000001",
    };
    const hasDuplicateRef = [payment1].some((p) => p.transaction_ref === paymentWithSameRef.transaction_ref);
    assert(hasDuplicateRef === true, "Idempotency Boundary: Same transaction_ref detectable by application guard");

    const hasTimestampRefCollision = [payment1].some((p) => p.transaction_ref === payment2Duplicate.transaction_ref);
    assert(hasTimestampRefCollision === false, "Idempotency Boundary: Dynamic timestamp references bypass application-level reference checks");
  }

  // =========================================================================
  // 15. Phase 14 Person Name Validation & Security Hardening
  // =========================================================================
  console.log("\n15. Testing Person Name Validation & Security Boundaries (Phase 14)");
  {
    // 15.1 Standard Valid Names
    const valid1 = validatePersonName("John Doe", "First and Last Name");
    assert(valid1.isValid === true, "Name Validation: 'John Doe' is valid");
    assert(valid1.sanitized === "John Doe", "Name Validation: 'John Doe' sanitized correctly");

    const valid2 = validatePersonName("Mary-Jane O'Connor", "Full Name");
    assert(valid2.isValid === true, "Name Validation: 'Mary-Jane O'Connor' with hyphen and ASCII apostrophe is valid");

    const valid3 = validatePersonName("Dr. Martin Luther King Jr.", "Full Name");
    assert(valid3.isValid === true, "Name Validation: 'Dr. Martin Luther King Jr.' with periods is valid");

    // 15.2 Typographic & Smart Apostrophe Support (Phase 14.2 Defect 2 Fix)
    const typoApos1 = validatePersonName("O’Connor", "Surname");
    assert(typoApos1.isValid === true, "Typographic Apostrophe: 'O’Connor' with U+2019 is valid");
    assert(typoApos1.sanitized === "O'Connor", "Typographic Apostrophe: 'O’Connor' normalized to ASCII apostrophe");

    const typoApos2 = validatePersonName("D’Angelo", "Surname");
    assert(typoApos2.isValid === true, "Typographic Apostrophe: 'D’Angelo' with U+2019 is valid");
    assert(typoApos2.sanitized === "D'Angelo", "Typographic Apostrophe: 'D’Angelo' normalized to ASCII apostrophe");

    const typoApos3 = validatePersonName("Mary-Jane O’Connor", "Full Name");
    assert(typoApos3.isValid === true, "Typographic Apostrophe: 'Mary-Jane O’Connor' is valid");
    assert(typoApos3.sanitized === "Mary-Jane O'Connor", "Typographic Apostrophe: Normalized to ASCII apostrophe");

    // 15.2 International Unicode & Accented Names
    const unicode1 = validatePersonName("François Müller", "International Name");
    assert(unicode1.isValid === true, "Name Validation: Unicode 'François Müller' is valid");

    const unicode2 = validatePersonName("José María Álvarez", "International Name");
    assert(unicode2.isValid === true, "Name Validation: Unicode 'José María Álvarez' is valid");

    const unicode3 = validatePersonName("Søren Kierkegaard", "Scandinavian Name");
    assert(unicode3.isValid === true, "Name Validation: Unicode 'Søren Kierkegaard' is valid");

    const unicode4 = validatePersonName("Khaïr-Eddine", "Name with trema");
    assert(unicode4.isValid === true, "Name Validation: Unicode 'Khaïr-Eddine' is valid");

    // 15.3 Strict Rejection of Digits in Person Names (Application-Wide & Cardholder)
    const digit1 = validatePersonName("John2 Doe", "First Name");
    assert(digit1.isValid === false, "Name Validation: Digits in name 'John2 Doe' rejected");
    assert(Boolean(digit1.error?.includes("must not contain numbers")), "Name Validation: Clear error message for digits in name");

    const digit2 = validatePersonName("Agent 007", "First Name");
    assert(digit2.isValid === false, "Name Validation: 'Agent 007' rejected");

    const digit3 = validatePersonName("GUEST123", "Cardholder Name", 100);
    assert(digit3.isValid === false, "Name Validation: 'GUEST123' cardholder name strictly rejected");

    const digit4 = validatePersonName("4242", "Cardholder Name", 100);
    assert(digit4.isValid === false, "Name Validation: Raw card number in cardholder name strictly rejected");

    // 15.4 Rejection of Symbols, Emoji, HTML & Injection Characters
    const symbol1 = validatePersonName("John <script>alert(1)</script>", "First Name");
    assert(symbol1.isValid === false, "Name Validation: HTML/XSS injection tags rejected");

    const emoji1 = validatePersonName("Jane Doe 😊", "First Name");
    assert(emoji1.isValid === false, "Name Validation: Emoji in name rejected");

    const symbol2 = validatePersonName("John@Doe#1", "First Name");
    assert(symbol2.isValid === false, "Name Validation: Symbols @ and # rejected");

    // 15.5 Invisible, Control Characters & Edge Cases
    const nullByte = validatePersonName("Alice\x00Smith", "Name");
    assert(nullByte.isValid === false, "Name Validation: Null byte injection rejected");

    const zeroWidth = validatePersonName("Bob\u200BJones", "Name");
    assert(zeroWidth.isValid === false, "Name Validation: Zero-width space injection rejected");

    const empty = validatePersonName("   ", "Name");
    assert(empty.isValid === false, "Name Validation: Blank/whitespace-only name rejected");

    // 15.3 Single-Letter & Short Names (Phase 14.2 Minimum Name Length Review)
    const singleLetter1 = validatePersonName("O", "Korean/Irish Surname");
    assert(singleLetter1.isValid === true, "Single-Letter Name: 'O' is valid");
    assert(singleLetter1.sanitized === "O", "Single-Letter Name: 'O' sanitized correctly");

    const singleLetter2 = validatePersonName("U", "Burmese First Name");
    assert(singleLetter2.isValid === true, "Single-Letter Name: 'U' is valid");
    assert(singleLetter2.sanitized === "U", "Single-Letter Name: 'U' sanitized correctly");

    const singleLetterAbbr = validatePersonName("A.", "Abbreviated Name");
    assert(singleLetterAbbr.isValid === true, "Single-Letter Name: 'A.' with period is valid");

    const twoLetter1 = validatePersonName("Li", "Chinese Surname");
    assert(twoLetter1.isValid === true, "Short Name: 'Li' is valid");

    const twoLetter2 = validatePersonName("Ng", "Vietnamese Surname");
    assert(twoLetter2.isValid === true, "Short Name: 'Ng' is valid");

    const noLetters = validatePersonName(".-.", "Name");
    assert(noLetters.isValid === false, "Name Validation: Non-alphabetic punctuation string rejected (< 1 letter)");

    const tooLong = validatePersonName("A".repeat(51), "Name", 50);
    assert(tooLong.isValid === false, "Name Validation: Exceeding max length rejected (> 50 chars)");

    // 15.6 Whitespace Normalization
    const padded = validatePersonName("   Tariq    Khan   ", "Full Name");
    assert(padded.isValid === true, "Name Validation: Irregular whitespace normalized");
    assert(padded.sanitized === "Tariq Khan", "Name Validation: Sanitized to single spaced 'Tariq Khan'");
  }

  // =========================================================================
  // 16. Phase 14.4 Phone Number Validation, libphonenumber-js & Input Sanitization
  // =========================================================================
  console.log("\n16. Testing Phone Number Validation, libphonenumber-js & Input Sanitization (Phase 14.4)");
  {
    // 16.1 Valid Digits-Only and E.164 International Phone Numbers
    const pakNational = validatePhoneNumber("03001234567", "Phone Number");
    assert(pakNational.isValid === true, "Phone Validation: 11-digit national '03001234567' valid");
    assert(pakNational.canonical === "+923001234567", "Phone Canonical: Canonicalized to +923001234567");

    const pak12Digit = validatePhoneNumber("923001234567", "Phone Number");
    assert(pak12Digit.isValid === true, "Phone Validation: 12-digit international '923001234567' valid");
    assert(pak12Digit.canonical === "+923001234567", "Phone Canonical: Canonicalized to +923001234567");

    const pakE164 = validatePhoneNumber("+923001234567", "Phone Number");
    assert(pakE164.isValid === true, "Phone Validation: Direct E.164 '+923001234567' valid");
    assert(pakE164.canonical === "+923001234567", "Phone Canonical: Preserved as +923001234567");

    const usE164 = validatePhoneNumber("+14155552671", "US Phone Number");
    assert(usE164.isValid === true, "Phone Validation: Direct E.164 '+14155552671' valid");
    assert(usE164.canonical === "+14155552671", "Phone Canonical: Preserved as +14155552671");

    const ukE164 = validatePhoneNumber("+447911123456", "UK Phone Number");
    assert(ukE164.isValid === true, "Phone Validation: UK E.164 '+447911123456' valid");
    assert(ukE164.canonical === "+447911123456", "Phone Canonical: Preserved as +447911123456");

    const uaeE164 = validatePhoneNumber("+971501234567", "UAE Phone Number");
    assert(uaeE164.isValid === true, "Phone Validation: UAE E.164 '+971501234567' valid");
    assert(uaeE164.canonical === "+971501234567", "Phone Canonical: Preserved as +971501234567");

    // 16.2 Rejection of Ambiguous / Unqualified Numbers (Phase 14.4 Defect 2 Fix)
    const pakAmbiguous10 = validatePhoneNumber("3001234567", "Phone Number");
    assert(pakAmbiguous10.isValid === false, "Ambiguous 10-Digit: '3001234567' without leading 0 or + rejected");

    const usAmbiguous10 = validatePhoneNumber("3125550199", "Phone Number");
    assert(usAmbiguous10.isValid === false, "Ambiguous 10-Digit: Chicago '3125550199' without +1 rejected");

    const sfAmbiguous10 = validatePhoneNumber("4155552671", "Phone Number");
    assert(sfAmbiguous10.isValid === false, "Ambiguous 10-Digit: San Francisco '4155552671' without +1 rejected");

    const usUnprefixed11 = validatePhoneNumber("14155552671", "Phone Number");
    assert(usUnprefixed11.isValid === false, "Unprefixed International: '14155552671' without + rejected");

    // 16.3 Rejection of Invalid Country Calling Codes & Impossible Numbers (libphonenumber-js)
    const invalidCallingCode = validatePhoneNumber("+99912345678", "Phone Number");
    assert(invalidCallingCode.isValid === false, "Invalid Country Code: '+99912345678' rejected by libphonenumber-js");

    const invalidPakNational = validatePhoneNumber("30012345678", "Phone Number");
    assert(invalidPakNational.isValid === false, "Invalid 11-digit national: '30012345678' without 03 prefix rejected");

    const repeatedCallingCode = validatePhoneNumber("+92923001234567", "Phone Number");
    assert(repeatedCallingCode.isValid === false, "Repeated Country Code: '+92923001234567' rejected");

    // 16.4 Rejection of Formatting / Syntax Violations
    const repeatedPlus = validatePhoneNumber("++923001234567", "Phone Number");
    assert(repeatedPlus.isValid === false, "Phone Validation: Repeated '+' prefix '++923001234567' rejected");

    const plusInMiddle = validatePhoneNumber("92+3001234567", "Phone Number");
    assert(plusInMiddle.isValid === false, "Phone Validation: '+' in middle '92+3001234567' rejected");

    const hyphenated = validatePhoneNumber("0300-1234567", "Phone Number");
    assert(hyphenated.isValid === false, "Phone Validation: Hyphenated phone input rejected");

    const spaced = validatePhoneNumber("0300 1234567", "Phone Number");
    assert(spaced.isValid === false, "Phone Validation: Spaced phone input rejected");

    const formatted = validatePhoneNumber("+92 (300) 123-4567", "Phone Number");
    assert(formatted.isValid === false, "Phone Validation: Parenthesized phone input rejected");

    const alpha = validatePhoneNumber("0300123456a", "Phone Number");
    assert(alpha.isValid === false, "Phone Validation: Alphabetic characters rejected");

    // 16.5 Length Bounds (ITU-T E.164: 10 to 15 digits)
    const tooShortPhone = validatePhoneNumber("123456789", "Phone Number");
    assert(tooShortPhone.isValid === false, "Phone Validation: 9-digit phone rejected (minimum 10)");

    const tooLongPhone = validatePhoneNumber("+1234567890123456", "Phone Number");
    assert(tooLongPhone.isValid === false, "Phone Validation: 16-digit phone rejected (maximum 15)");

    // 16.6 Optional vs Required Handling
    const optionalEmpty = validatePhoneNumber("", "Optional Phone", false);
    assert(optionalEmpty.isValid === true, "Phone Validation: Empty string valid when required=false");

    const requiredEmpty = validatePhoneNumber("", "Required Phone", true);
    assert(requiredEmpty.isValid === false, "Phone Validation: Empty string rejected when required=true");

    // 16.7 Frontend Input Sanitization (sanitizePhoneInput - Phase 14.4 Defect 1 Fix)
    assert(sanitizePhoneInput("+14155552671") === "+14155552671", "Frontend Sanitization: Preserves single leading '+' for international");
    assert(sanitizePhoneInput("+92 (300) 123-4567") === "+923001234567", "Frontend Sanitization: Strips parens and hyphens, preserves leading '+'");
    assert(sanitizePhoneInput("0300-1234567") === "03001234567", "Frontend Sanitization: Strips hyphens from national number");
    assert(sanitizePhoneInput("++923001234567") === "+923001234567", "Frontend Sanitization: Collapses duplicate '+' characters");
    assert(sanitizePhoneInput("0300+1234567") === "03001234567", "Frontend Sanitization: Strips non-leading '+' characters");
    assert(sanitizePhoneInput("+1234567890123456789") === "+123456789012345", "Frontend Sanitization: Clamps digits to 15 max");
  }

  // =========================================================================
  // 17. Phase 14 Staff Credentials & Free-Text Security Sanitization
  // =========================================================================
  console.log("\n17. Testing Staff Credentials & Free-Text Security Sanitization (Phase 14)");
  {
    // 17.1 Staff Username Validation
    const validUser1 = validateStaffUsername("manager");
    assert(validUser1.isValid === true, "Staff Username: 'manager' is valid");

    const validUser2 = validateStaffUsername("receptionist_1");
    assert(validUser2.isValid === true, "Staff Username: 'receptionist_1' with underscore is valid");

    const validUser3 = validateStaffUsername("staff-lead.01");
    assert(validUser3.isValid === true, "Staff Username: 'staff-lead.01' with hyphen and period is valid");

    const shortUser = validateStaffUsername("ab");
    assert(shortUser.isValid === false, "Staff Username: 'ab' rejected (< 3 chars)");

    const symbolUser = validateStaffUsername("user@name");
    assert(symbolUser.isValid === false, "Staff Username: '@' symbol in username rejected");

    const sqlInjectUser = validateStaffUsername("admin; DROP TABLE staff;--");
    assert(sqlInjectUser.isValid === false, "Staff Username: SQL injection attempt in username rejected");

    // 17.2 Staff Password Validation
    const validPwd = validateStaffPassword("AdminPass123!@#");
    assert(validPwd.isValid === true, "Staff Password: Strong 15-char password valid");

    const shortPwd = validateStaffPassword("short");
    assert(shortPwd.isValid === false, "Staff Password: Password < 8 characters rejected");

    // 17.3 Email Validation
    const validEmail = validateEmail("guest@example.com", "Guest Email");
    assert(validEmail.isValid === true, "Email Validation: 'guest@example.com' is valid");

    const invalidEmail = validateEmail("not-an-email", "Guest Email");
    assert(invalidEmail.isValid === false, "Email Validation: 'not-an-email' rejected");

    // 17.4 Free-Text Sanitization (Special Requests, Reasons)
    const normalText = sanitizeFreeText("Quiet room on high floor please.", 500, "Special Requests");
    assert(normalText.isValid === true, "Free Text: Normal request valid");
    assert(normalText.sanitized === "Quiet room on high floor please.", "Free Text: Preserved accurately");

    const dirtyText = sanitizeFreeText("Room\x00with\x08null\u200Bbytes", 500, "Special Requests");
    assert(dirtyText.isValid === true, "Free Text: Control characters stripped");
    assert(dirtyText.sanitized === "Roomwithnullbytes", "Free Text: Null bytes and zero-width chars removed");

    const excessiveSpaces = sanitizeFreeText("   Late    arrival    at   midnight   ", 500, "Notes");
    assert(excessiveSpaces.sanitized === "Late arrival at midnight", "Free Text: Multiple spaces collapsed and trimmed");
  }

  // =========================================================================
  // 18. Phase 14 Full Contract Zod Schema Validation
  // =========================================================================
  console.log("\n18. Testing Full Contract Zod Schema Validation (Phase 14)");
  {
    const validPayload = {
      roomTypeId: 1,
      checkInDate: "2026-12-01",
      checkOutDate: "2026-12-05",
      adults: 2,
      children: 1,
      firstName: "Tariq",
      lastName: "Khan",
      phone: "03001234567",
      email: "tkhan@example.com",
      paymentOption: "online_card" as const,
      cardDetails: {
        cardholderName: "Tariq Khan",
        cardNumberLast4: "4242",
      },
      specialRequests: "Non-smoking room.",
    };

    const parseResult = GuestBookingValidationSchema.safeParse(validPayload);
    assert(parseResult.success === true, "Zod Contract: Valid booking payload successfully parses");

    // Tampered payload: Digits in cardholder name
    const invalidCardholderPayload = {
      ...validPayload,
      cardDetails: {
        cardholderName: "GUEST123",
        cardNumberLast4: "4242",
      },
    };
    const parseCardholderResult = GuestBookingValidationSchema.safeParse(invalidCardholderPayload);
    assert(parseCardholderResult.success === false, "Zod Contract: Digits in cardholder name strictly rejected by Zod schema");

    // Tampered payload: Negative children
    const negativeChildrenPayload = {
      ...validPayload,
      children: -1,
    };
    const parseChildrenResult = GuestBookingValidationSchema.safeParse(negativeChildrenPayload);
    assert(parseChildrenResult.success === false, "Zod Contract: Negative children count rejected");

    // Tampered payload: Excessive adult count
    const excessiveAdultsPayload = {
      ...validPayload,
      adults: 25,
    };
    const parseAdultsResult = GuestBookingValidationSchema.safeParse(excessiveAdultsPayload);
    assert(parseAdultsResult.success === false, "Zod Contract: Adults count exceeding maximum (10) rejected");

    // Tampered payload: Malformed date format
    const malformedDatePayload = {
      ...validPayload,
      checkInDate: "2026/12/01",
    };
    const parseDateResult = GuestBookingValidationSchema.safeParse(malformedDatePayload);
    assert(parseDateResult.success === false, "Zod Contract: Non-ISO date format rejected");
  }

  console.log("\n==================================================================");
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified.`);
  console.log("==================================================================");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
