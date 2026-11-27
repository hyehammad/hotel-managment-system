import { redirect } from "next/navigation";
import { getStaffSession } from "@/app/actions/auth";
import { getActivityHistory } from "@/app/actions/staff";
import ActivityClient from "./ActivityClient";

export const dynamic = "force-dynamic";

export default async function ActivityHistoryPage() {
  const session = await getStaffSession();

  if (!session) {
    redirect("/staff/login");
  }

  const roleLower = session.role_name.toLowerCase();
  if (roleLower !== "admin" && roleLower !== "manager") {
    redirect("/staff/dashboard");
  }

  const logs = await getActivityHistory();

  return (
    <ActivityClient
      initialLogs={logs}
      currentUserRole={session.role_name}
    />
  );
}
