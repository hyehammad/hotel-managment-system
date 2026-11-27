"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";

export interface StaffSession {
  staff_id: number;
  username: string;
  full_name: string;
  role_id: number;
  role_name: string;
}

const SESSION_COOKIE = "hms_staff_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  try {
    return JSON.parse(Buffer.from(cookie.value, "base64").toString("utf8")) as StaffSession;
  } catch {
    return null;
  }
}

export async function staffLogin(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!username || !password) {
    return { error: "Username and password are required." };
  }

  let data: any;
  try {
    data = await authApi.login({ username, password });
  } catch (err: any) {
    return { error: err.message || "Invalid username or password." };
  }

  if (!data?.success || !data?.token) {
    return { error: data?.error || "Login failed." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  const redirectTo = data.redirectTo || "/staff/dashboard";
  redirect(redirectTo);
}

export async function staffLogout(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // continue
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/staff/login");
}
