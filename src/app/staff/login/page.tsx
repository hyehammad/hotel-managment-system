import { redirect } from "next/navigation";
import { getStaffSession } from "@/app/actions/auth";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage() {
  const session = await getStaffSession();
  if (session) {
    redirect("/staff/dashboard");
  }

  return <LoginClient />;
}
