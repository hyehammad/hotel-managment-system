import { NextResponse } from "next/server";
import crypto from "crypto";
import { expireOverdueReservations } from "@/lib/expiry-cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === "production";

    // 1. Mandatory check in production: fail closed if CRON_SECRET is not configured
    if (!cronSecret) {
      if (isProduction) {
        console.error("Cron expiry blocked: CRON_SECRET is not configured in production.");
        return NextResponse.json(
          { success: false, error: "CRON_SECRET is not configured on the server." },
          { status: 500 }
        );
      }
      console.warn("CRON_SECRET is not set in non-production environment.");
    }

    // 2. Validate authorization credentials when secret is configured
    if (cronSecret) {
      const authHeader = request.headers.get("authorization") || "";
      const headerSecret = request.headers.get("x-cron-secret") || "";

      let providedSecret = "";
      if (authHeader.startsWith("Bearer ")) {
        providedSecret = authHeader.slice(7).trim();
      } else if (headerSecret) {
        providedSecret = headerSecret.trim();
      }

      const expectedBuf = Buffer.from(cronSecret);
      const providedBuf = Buffer.from(providedSecret);

      const isValid =
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!isValid) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid or missing cron credentials." },
          { status: 401 }
        );
      }
    }

    const result = await expireOverdueReservations();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("Cron expiry error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute expiry cron." },
      { status: 500 }
    );
  }
}
