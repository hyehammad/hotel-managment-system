import { getStaffRooms } from "@/app/actions/staff";
import { getStaffSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import RoomsClient from "./RoomsClient";

export const dynamic = "force-dynamic";

export default async function StaffRoomsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const rooms = await getStaffRooms();
  return <RoomsClient initialRooms={rooms} currentUserRole={session.role_name} />;
}
