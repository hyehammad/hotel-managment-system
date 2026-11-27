import { redirect } from "next/navigation";
import { getStaffSession } from "@/app/actions/auth";
import { getStaffMembers } from "@/app/actions/staff";
import StaffClient from "./StaffClient";

export const dynamic = "force-dynamic";

export default async function StaffManagementPage() {
  const session = await getStaffSession();

  if (!session) {
    redirect("/staff/login");
  }

  const roleLower = session.role_name.toLowerCase();
  if (roleLower !== "admin" && roleLower !== "manager") {
    redirect("/staff/dashboard");
  }

  const data = await getStaffMembers();

  return (
    <StaffClient
      staffList={data.staff}
      roles={data.roles}
      currentUserRole={session.role_name}
    />
  );
}
