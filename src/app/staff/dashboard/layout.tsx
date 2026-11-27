import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession, staffLogout } from "@/app/actions/auth";
import { getNotificationsForRole } from "@/lib/events";
import NotificationBell from "./NotificationBell";
import {
  Hotel,
  LayoutDashboard,
  CalendarCheck,
  BedDouble,
  Sparkles,
  Wrench,
  Users,
  ClipboardList,
  LogOut,
  ShieldCheck,
  Crown,
  KeyRound,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();

  if (!session) {
    redirect("/staff/login");
  }

  const roleLower = session.role_name.toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const isReceptionist = roleLower === "receptionist";
  const isHousekeeper = roleLower === "housekeeping";
  const isMaintenance = roleLower === "maintenance";

  // Role-specific badge styling
  const roleBadge = isAdmin
    ? {
        border: "border-red-500/40",
        bg: "bg-red-500/10",
        text: "text-red-400",
        label: "Administrator",
        icon: Crown,
      }
    : isManager
    ? {
        border: "border-amber-500/40",
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        label: "Hotel Manager",
        icon: KeyRound,
      }
    : isReceptionist
    ? {
        border: "border-sky-500/40",
        bg: "bg-sky-500/10",
        text: "text-sky-400",
        label: "Frontdesk Reception",
        icon: ShieldCheck,
      }
    : isMaintenance
    ? {
        border: "border-orange-500/40",
        bg: "bg-orange-500/10",
        text: "text-orange-400",
        label: "Maintenance Staff",
        icon: Wrench,
      }
    : {
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
        label: "Housekeeping Staff",
        icon: Sparkles,
      };

  const RoleIcon = roleBadge.icon;

  const notifications = getNotificationsForRole(session.role_name);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900/90 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5">
                <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                  <Hotel className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <div>
                <span className="font-serif font-bold text-white tracking-tight text-sm block">
                  Grand Horizon
                </span>
                <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold block">
                  Staff Management
                </span>
              </div>
            </Link>
          </div>

          {/* User profile snippet with distinct Role Badge */}
          <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl ${roleBadge.bg} border ${roleBadge.border} flex items-center justify-center ${roleBadge.text} font-bold text-base shadow-sm`}
              >
                {session.full_name.charAt(0)}
              </div>
              <div className="overflow-hidden flex-1">
                <div className="text-xs font-bold text-white truncate">
                  {session.full_name}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  @{session.username}
                </div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${roleBadge.bg} ${roleBadge.text} border ${roleBadge.border}`}
                >
                  <RoleIcon className="w-3 h-3 shrink-0" />
                  {roleBadge.label}
                </div>
              </div>
            </div>
          </div>

          {/* Role-tailored Navigation Links */}
          <nav className="p-4 space-y-1 text-sm font-medium">
            {/* Overview: Admin, Manager */}
            {(isAdmin || isManager) && (
              <Link
                href="/staff/dashboard"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <LayoutDashboard className="w-4 h-4 text-amber-500" />
                Overview
              </Link>
            )}

            {/* Reservations & Frontdesk: Admin, Manager, Receptionist */}
            {(isAdmin || isManager || isReceptionist) && (
              <Link
                href="/staff/dashboard/reservations"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <CalendarCheck className="w-4 h-4 text-amber-500" />
                {isReceptionist ? "Frontdesk & Check-in" : "Reservations & Stays"}
              </Link>
            )}

            {/* Room Inventory: All roles (displays contextual views) */}
            <Link
              href="/staff/dashboard/rooms"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
            >
              <BedDouble className="w-4 h-4 text-amber-500" />
              {isHousekeeper
                ? "Room Cleanliness"
                : isMaintenance
                ? "Room Maintenance"
                : isReceptionist
                ? "Room Availability"
                : "Rooms & Inventory"}
            </Link>

            {/* Housekeeping Tasks: Admin, Manager, Housekeeping */}
            {(isAdmin || isManager || isHousekeeper) && (
              <Link
                href="/staff/dashboard/housekeeping"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                {isHousekeeper ? "My Cleaning Tasks" : "Housekeeping Tasks"}
              </Link>
            )}

            {/* Maintenance Requests: Admin, Manager, Maintenance */}
            {(isAdmin || isManager || isMaintenance) && (
              <Link
                href="/staff/dashboard/maintenance"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <Wrench className="w-4 h-4 text-amber-500" />
                {isMaintenance ? "Repair Requests" : "Maintenance"}
              </Link>
            )}

            {/* Staff Accounts: Admin & Manager */}
            {(isAdmin || isManager) && (
              <Link
                href="/staff/dashboard/staff"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <Users className="w-4 h-4 text-amber-500" />
                {isAdmin ? "Staff & Access Control" : "Staff Directory"}
              </Link>
            )}

            {/* Activity History Logs: Admin & Manager */}
            {(isAdmin || isManager) && (
              <Link
                href="/staff/dashboard/activity"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition"
              >
                <ClipboardList className="w-4 h-4 text-amber-500" />
                Activity History
              </Link>
            )}
          </nav>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            Guest Booking View
          </Link>

          <form action={staffLogout}>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-h-screen bg-slate-950 flex flex-col">
        {/* Top Header with Notification Bell */}
        <header className="h-16 px-6 md:px-8 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
              Department Portal
            </span>
            <span className="text-slate-600">/</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${roleBadge.text}`}>
              {roleBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell
              notifications={notifications}
              role={session.role_name}
            />
          </div>
        </header>

        <div className="p-6 md:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
