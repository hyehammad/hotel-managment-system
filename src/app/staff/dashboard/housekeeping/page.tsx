import { getHousekeepingDashboardData } from "@/app/actions/staff";
import { getStaffSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import HousekeepingClient from "./HousekeepingClient";

export const dynamic = "force-dynamic";

export default async function StaffHousekeepingPage({
  searchParams,
}: {
  searchParams?: Promise<{ taskId?: string; room?: string }>;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const roleLower = session.role_name.toLowerCase();
  // Receptionist and Maintenance are restricted from Housekeeping
  if (roleLower === "receptionist") {
    redirect("/staff/dashboard/reservations");
  } else if (roleLower === "maintenance") {
    redirect("/staff/dashboard/maintenance");
  }

  const params = searchParams ? await searchParams : {};
  const data = await getHousekeepingDashboardData();

  return (
    <HousekeepingClient
      data={data}
      currentUserRole={session.role_name}
      highlightTaskId={params.taskId ? parseInt(params.taskId, 10) : undefined}
      highlightRoom={params.room}
    />
  );
}
