import { getStaffReservations, getStaffRooms } from "@/app/actions/staff";
import { getStaffSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import ReservationsClient from "./ReservationsClient";

export const dynamic = "force-dynamic";

export default async function StaffReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; view?: string; reservationId?: string }>;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const roleLower = session.role_name.toLowerCase();
  // Housekeeping and Maintenance are strictly restricted from reservations
  if (roleLower === "housekeeping") {
    redirect("/staff/dashboard/housekeeping");
  } else if (roleLower === "maintenance") {
    redirect("/staff/dashboard/maintenance");
  }

  const params = searchParams ? await searchParams : {};
  const [reservations, rooms] = await Promise.all([
    getStaffReservations(params?.status),
    getStaffRooms(),
  ]);

  return (
    <ReservationsClient
      initialReservations={reservations}
      rooms={rooms}
      currentUserRole={session.role_name}
      initialView={params.view as any}
      initialReservationId={params.reservationId ? parseInt(params.reservationId, 10) : undefined}
    />
  );
}
