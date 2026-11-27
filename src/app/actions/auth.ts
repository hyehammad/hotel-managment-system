"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as argon2 from "argon2";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StaffSession {
  staff_id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name: string;
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

const SESSION_COOKIE = "hms_staff_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: SESSION_SECRET environment variable is missing in production. Staff session signing is blocked until configured."
      );
    }
    // Development-only fallback to allow local testing without explicit .env configuration
    return "development_session_secret_for_local_testing_only_32_bytes";
  }
  if (secret.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: SESSION_SECRET must be at least 32 characters in production.");
  }
  return secret;
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function encodeSession(session: StaffSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSession(value: string): StaffSession | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expectedSignature = signPayload(payload);

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffSession;
  } catch {
    return null;
  }
}

// ─── Get current session (server-side) ──────────────────────────────────────

export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return decodeSession(cookie.value);
}

// ─── Staff Login ─────────────────────────────────────────────────────────────

export async function staffLogin(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const rawUsername = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!rawUsername || !password) {
    return { error: "Username and password are required." };
  }

  // Support flexible aliases: "housekeeping" <-> "housekeeper"
  const lookupUsernames = [rawUsername, rawUsername.toLowerCase()];
  if (rawUsername.toLowerCase() === "housekeeping") {
    lookupUsernames.push("housekeeper");
  } else if (rawUsername.toLowerCase() === "housekeeper") {
    lookupUsernames.push("housekeeping");
  }

  // Fetch staff with their role
  const staff = await prisma.staff.findFirst({
    where: {
      username: { in: lookupUsernames },
    },
    include: { roles: true },
  });

  if (!staff) {
    return { error: "Invalid username or password." };
  }

  if (!staff.is_active) {
    return { error: "This account is disabled. Contact your administrator." };
  }

  // Verify password with argon2
  let valid = false;
  try {
    valid = await argon2.verify(staff.password_hash, password);
  } catch {
    valid = false;
  }

  if (!valid) {
    return { error: "Invalid username or password." };
  }

  // Create session
  const session: StaffSession = {
    staff_id: staff.staff_id,
    username: staff.username,
    full_name: `${staff.first_name} ${staff.last_name}`,
    role_id: staff.role_id,
    role_name: staff.roles.role_name,
  };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  // Redirect based on role
  const roleLower = staff.roles.role_name.toLowerCase();
  if (roleLower === "housekeeping") {
    redirect("/staff/dashboard/housekeeping");
  } else if (roleLower === "maintenance") {
    redirect("/staff/dashboard/maintenance");
  } else if (roleLower === "receptionist") {
    redirect("/staff/dashboard/reservations");
  } else {
    redirect("/staff/dashboard");
  }
}

// ─── Staff Logout ─────────────────────────────────────────────────────────────

export async function staffLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/staff/login");
}
