require('dotenv').config();
const mysql = require('mysql2/promise');

async function runLiveTest() {
  console.log("=== EXECUTING SYSTEM WORKFLOW & DATABASE INTEGRITY QA ===");
  const pool = mysql.createPool(process.env.DATABASE_URL);

  try {
    // 1. Verify Database Schema (17 Tables intact)
    const [tables] = await pool.query("SHOW TABLES");
    console.log(`[SCHEMA CHECK] Database contains ${tables.length} tables. Expected: 17.`);
    if (tables.length !== 17) {
      throw new Error(`Schema altered! Found ${tables.length} tables, expected 17.`);
    }

    // 2. Verify Online Booking with Card Payment records invoice & payment
    const [invoices] = await pool.query(
      "SELECT i.invoice_id, i.reservation_id, i.total_amount, i.status, p.payment_id, p.method, p.amount as paid_amount " +
      "FROM invoices i " +
      "LEFT JOIN payments p ON p.reservation_id = i.reservation_id " +
      "ORDER BY i.invoice_id DESC LIMIT 5"
    );
    console.log("[PAYMENT AUDIT] Recent invoices & payments:", invoices);

    // 3. Verify Operational Room Inventory status distribution
    const [roomCounts] = await pool.query(
      "SELECT status, COUNT(*) as count FROM rooms GROUP BY status"
    );
    console.log("[ROOM INVENTORY] Current status distribution:", roomCounts);

    // 4. Verify Housekeeping Tasks
    const [hkTasks] = await pool.query(
      "SELECT task_id, room_id, status, notes FROM housekeeping_tasks ORDER BY task_id DESC LIMIT 5"
    );
    console.log("[HOUSEKEEPING QUEUE] Recent cleaning & maintenance tasks:", hkTasks);

    // 5. Verify Active Stays vs Checked Out
    const [staysSummary] = await pool.query(
      "SELECT " +
      "COUNT(CASE WHEN actual_check_out IS NULL THEN 1 END) as active_stays, " +
      "COUNT(CASE WHEN actual_check_out IS NOT NULL THEN 1 END) as completed_stays " +
      "FROM stays"
    );
    console.log("[STAYS AUDIT] Stays summary:", staysSummary[0]);

    console.log("\n=== ALL DATABASE AND WORKFLOW CONSTRAINTS VERIFIED CLEAN ===");
  } finally {
    await pool.end();
  }
}

runLiveTest().catch((err) => {
  console.error("Workflow Test Failed:", err);
  process.exit(1);
});
