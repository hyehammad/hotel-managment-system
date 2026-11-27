import {
  getDashboardStats,
  getSeriousEscalatedIssues,
  getActiveCheckedInStays,
} from "@/app/actions/staff";
import { getStaffSession } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import SeriousIssuesReview from "./SeriousIssuesReview";
import {
  BedDouble,
  CalendarCheck,
  Clock,
  Sparkles,
  Wrench,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users,
  ShieldCheck,
  Crown,
  KeyRound,
  ClipboardList,
  Phone,
  Calendar,
  CreditCard,
  DollarSign,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ escalationId?: string }>;
}) {
  const session = await getStaffSession();

  if (!session) {
    redirect("/staff/login");
  }

  const roleLower = session.role_name.toLowerCase();

  // Role-based smart redirects
  if (roleLower === "housekeeping") {
    redirect("/staff/dashboard/housekeeping");
  } else if (roleLower === "maintenance") {
    redirect("/staff/dashboard/maintenance");
  } else if (roleLower === "receptionist") {
    redirect("/staff/dashboard/reservations");
  }

  const params = searchParams ? await searchParams : {};

  const [stats, seriousIssues, activeStays] = await Promise.all([
    getDashboardStats(),
    getSeriousEscalatedIssues(),
    getActiveCheckedInStays(),
  ]);

  const occupancyRate =
    stats.rooms.total > 0
      ? Math.round((stats.rooms.occupied / stats.rooms.total) * 100)
      : 0;

  const isAdmin = roleLower === "admin";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Role-Specific Welcome Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2 bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {isAdmin ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <KeyRound className="w-3.5 h-3.5 text-amber-400" />}
            {isAdmin ? "Administrator System Oversight" : "General Manager Operations"}
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white">
            Welcome back, {session.full_name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {isAdmin
              ? "Complete oversight of hotel operations, room statuses, staff accounts, financial transactions, and activity audit trails."
              : "Operations dashboard overseeing daily occupancy, room turnaround times, reservations, and staff activities."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/staff/dashboard/reservations"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition shadow-lg shadow-amber-500/10 flex items-center gap-1.5"
          >
            <CalendarCheck className="w-4 h-4" />
            Manage Bookings
          </Link>
          <Link
            href="/staff/dashboard/staff"
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-amber-400" />
            {isAdmin ? "Staff Roster" : "Directory"}
          </Link>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Pending Approvals */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Pending Approvals
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-serif text-white">
              {stats.reservations.pending}
            </span>
            <span className="text-xs text-slate-400">needs review</span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/staff/dashboard/reservations?status=pending"
              className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1"
            >
              Review pending &rarr;
            </Link>
          </div>
        </div>

        {/* Active Checked-In Stays */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Active Stays
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-serif text-white">
              {activeStays.length}
            </span>
            <span className="text-xs text-slate-400">guests checked in</span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/staff/dashboard/reservations?view=occupied"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
            >
              View active stays &rarr;
            </Link>
          </div>
        </div>

        {/* Occupancy Rate */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Occupancy Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-serif text-white">
              {occupancyRate}%
            </span>
            <span className="text-xs text-slate-400">
              ({stats.rooms.occupied}/{stats.rooms.total} rooms)
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Link
              href="/staff/dashboard/rooms"
              className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
            >
              Room inventory &rarr;
            </Link>
          </div>
        </div>

        {/* Cleaning & Maintenance Queues */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              Turnover &amp; Repairs
            </span>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <div>
              <span className="text-2xl font-bold font-serif text-white">
                {stats.housekeeping.pending}
              </span>
              <span className="text-[11px] text-slate-400 ml-1">cleanings</span>
            </div>
            <div className="text-slate-600">|</div>
            <div>
              <span className="text-2xl font-bold font-serif text-amber-400">
                {stats.maintenance.pending}
              </span>
              <span className="text-[11px] text-slate-400 ml-1">repairs</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <Link
              href="/staff/dashboard/housekeeping"
              className="text-xs text-violet-400 hover:text-violet-300 font-medium"
            >
              Cleaning &rarr;
            </Link>
            <Link
              href="/staff/dashboard/maintenance"
              className="text-xs text-orange-400 hover:text-orange-300 font-medium"
            >
              Maintenance &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Serious Issues Escalation Section (Manager & Admin Approval) */}
      <SeriousIssuesReview
        issues={seriousIssues}
        userRole={session.role_name}
        highlightEscalationId={params.escalationId}
      />

      {/* SECTION 2: Active In-House Stays & Checked-In Rooms (Live Operational Data) */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-serif font-bold text-white flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-emerald-400" />
              In-House Guests &amp; Active Checked-In Stays
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live active stays currently occupying hotel rooms. When a guest checks out, the stay is completed and a turnover task is dispatched.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
              {activeStays.length} active stays
            </span>
            <Link
              href="/staff/dashboard/reservations"
              className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1"
            >
              Manage in Front Desk &rarr;
            </Link>
          </div>
        </div>

        {activeStays.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No guests are currently checked into hotel rooms.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Room</th>
                  <th className="py-3 px-4">Guest</th>
                  <th className="py-3 px-4">Check-in</th>
                  <th className="py-3 px-4">Scheduled Checkout</th>
                  <th className="py-3 px-4">Stay Status</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {activeStays.map((stay) => (
                  <tr key={stay.stay_id} className="hover:bg-slate-850/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-serif font-bold text-white text-sm">
                        Room {stay.room_number}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {stay.room_type} (Floor {stay.floor})
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-white text-xs">{stay.guest_name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        {stay.guest_phone}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-xs text-slate-300">
                      <div>{stay.check_in_date}</div>
                      <div className="text-[10px] text-slate-500">
                        by {stay.checked_in_by}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-xs text-amber-400 font-medium">
                      {stay.expected_check_out}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Checked In
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {stay.payment_status === "PAID" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          PAID
                        </span>
                      ) : stay.payment_status === "PARTIALLY PAID" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertCircle className="w-3 h-3" />
                          PARTIALLY PAID
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <AlertCircle className="w-3 h-3" />
                          YET TO PAY
                        </span>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        PKR {stay.amount_paid.toLocaleString()} / {stay.total_amount.toLocaleString()}
                        {stay.remaining_balance > 0 && (
                          <span className="text-amber-400 font-semibold ml-1">(Due: {stay.remaining_balance.toLocaleString()})</span>
                        )}
                        {stay.credit_balance > 0 && (
                          <span className="text-emerald-400 font-semibold ml-1">(Credit: {stay.credit_balance.toLocaleString()})</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/staff/dashboard/reservations?reservationId=${stay.reservation_id}`}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1"
                      >
                        Details &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Room Status Breakdown (Section 2 supported statuses) */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6">
        <h2 className="text-lg font-serif font-bold text-white mb-4">
          Room Inventory Status Overview
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Available
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.rooms.available}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Clean &amp; inspected</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5" />
              Occupied
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.rooms.occupied}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Active guest stay</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-violet-400 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Cleaning Required
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.rooms.cleaning}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Turnover pending</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-red-400 font-medium flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Maintenance
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.rooms.maintenance}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Repair issue logged</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5" />
              Total On Property
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {stats.rooms.total}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Across 4 floors</div>
          </div>
        </div>
      </div>

      {/* Fast Action Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Link
          href="/staff/dashboard/reservations"
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 mb-3">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition">
              Reservations &amp; Check-ins
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Confirm bookings, check in arriving guests, or complete departures.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-amber-400 font-medium">
            Open reservations
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/staff/dashboard/rooms"
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 mb-3">
              <BedDouble className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition">
              Room Inventory
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Live status across all floors {isAdmin && "(with Admin Override privileges)"}.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-sky-400 font-medium">
            Inspect inventory
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/staff/dashboard/housekeeping"
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition">
              Housekeeping Queue
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Monitor room cleanings, turnover pace, and housekeeper assignments.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-violet-400 font-medium">
            View cleaning queue
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        <Link
          href="/staff/dashboard/maintenance"
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition group flex flex-col justify-between"
        >
          <div>
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 mb-3">
              <Wrench className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition">
              Maintenance Requests
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Active repairs, technical issue reports, and resolution logs.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-orange-400 font-medium">
            Review repairs
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>
      </div>
    </div>
  );
}
