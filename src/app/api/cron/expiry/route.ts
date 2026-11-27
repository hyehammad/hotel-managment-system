import { NextResponse } from "next/server";
import { expireOverdueReservations } from "@/lib/expiry-cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
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
