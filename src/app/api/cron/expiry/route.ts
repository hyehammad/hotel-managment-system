import { NextResponse } from "next/server";
import { expireOverdueReservations } from "@/lib/expiry-cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      const headerSecret = request.headers.get("x-cron-secret");
      const expectedBearer = `Bearer ${cronSecret}`;
      if (authHeader !== expectedBearer && headerSecret !== cronSecret) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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
