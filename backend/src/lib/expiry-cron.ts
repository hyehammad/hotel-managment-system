import cron from "node-cron";
import { db, withTransaction } from "./db.js";
import { addNotification, logActivity } from "./events.js";

export function startExpiryCron() {
  // Check every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const expirationThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const expiredPending = await db.query<{
        reservation_id: number;
        first_name: string;
        last_name: string;
      }>(
        `SELECT r.reservation_id, g.first_name, g.last_name
         FROM reservations r
         JOIN guests g ON g.guest_id = r.guest_id
         WHERE r.status = 'pending' AND r.created_at < ?`,
        [expirationThreshold]
      );

      if (expiredPending.length === 0) return;

      console.log(`[CRON] Found ${expiredPending.length} expired reservations to cancel.`);

      for (const res of expiredPending) {
        await withTransaction(async (tx) => {
          await tx.execute(
            `UPDATE reservations
             SET status = 'cancelled',
                 cancel_reason = ?
             WHERE reservation_id = ?`,
            [
              "Auto-expired: Online booking exceeded 24-hour hold without frontdesk confirmation.",
              res.reservation_id,
            ]
          );
        });

        addNotification(
          "receptionist",
          "Reservation Expired",
          `Booking RES-${String(res.reservation_id).padStart(4, "0")} auto-cancelled after 24hr hold.`,
          "system"
        );

        logActivity(
          "System Automation",
          "System",
          "Reservation Expired",
          `Auto-cancelled booking RES-${String(res.reservation_id).padStart(4, "0")} for ${res.first_name} ${res.last_name}.`
        );
      }
    } catch (err) {
      console.error("[CRON] Error checking expired reservations:", err);
    }
  });

  console.log("[CRON] Reservation 24-hour expiration cron job started.");
}
