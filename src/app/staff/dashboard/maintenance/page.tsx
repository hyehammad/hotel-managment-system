import { getMaintenanceDashboardData, getSeriousEscalatedIssues } from "@/app/actions/staff";
import { getStaffSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import MaintenanceClient from "./MaintenanceClient";

export const dynamic = "force-dynamic";

export default async function StaffMaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; escalationId?: string; taskId?: string }>;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const roleLower = session.role_name.toLowerCase();
  if (roleLower === "receptionist") {
    redirect("/staff/dashboard/reservations");
  } else if (roleLower === "housekeeping") {
    redirect("/staff/dashboard/housekeeping");
  }

  const params = searchParams ? await searchParams : {};

  const [data, seriousIssues] = await Promise.all([
    getMaintenanceDashboardData(),
    getSeriousEscalatedIssues(),
  ]);

  return (
    <MaintenanceClient
      data={data}
      seriousIssues={seriousIssues}
      currentUserRole={session.role_name}
      initialTab={params.tab as any}
      highlightEscalationId={params.escalationId}
      highlightTaskId={params.taskId ? parseInt(params.taskId, 10) : undefined}
    />
  );
}
