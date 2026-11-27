"use client";

import { useState, useTransition } from "react";
import {
  adminOverrideRoomStatus,
  submitRoomServiceRequest,
  checkOutGuest,
} from "@/app/actions/staff";
import Link from "next/link";
import {
  BedDouble,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wrench,
  ShieldAlert,
  Crown,
  Info,
  User,
  Phone,
  Mail,
  Calendar,
  LogOut,
  PlusCircle,
  Eye,
  LogIn,
  Clock,
} from "lucide-react";

interface ActiveStayGuest {
  reservation_id: number;
  booking_reference: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  reservation_status: string;
  has_active_stay: boolean;
  actual_check_in?: string | null;
}

interface RoomItem {
  room_id: number;
  room_number: string;
  floor: number | null;
  room_type: string;
  base_price: number;
  status: "available" | "occupied" | "maintenance" | "cleaning";
  operational_status?: string;
  is_under_maintenance?: boolean;
  is_under_cleaning?: boolean;
  notes?: string | null;
  active_cleaning?: { taskId: number; status: string; notes?: string | null } | null;
  active_maintenance?: { taskId: number; status: string; notes?: string | null } | null;
  active_stay_guest?: ActiveStayGuest | null;
}

export default function RoomsClient({
  initialRooms,
  currentUserRole,
}: {
  initialRooms: RoomItem[];
  currentUserRole: string;
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isPending, startTransition] = useTransition();

  // Room Details Modal
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<RoomItem | null>(null);

  // Simplified Request Modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestRoom, setRequestRoom] = useState<RoomItem | null>(null);
  const [requestType, setRequestType] = useState<"cleaning" | "maintenance">("cleaning");
  const [requestComment, setRequestComment] = useState("");

  // Admin Override Modal
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<"available" | "occupied" | "cleaning" | "maintenance">("available");
  const [overrideReason, setOverrideReason] = useState("");

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const roleLower = currentUserRole.toLowerCase();
  const isAdmin = roleLower === "admin";
  const isManager = roleLower === "manager";
  const isReceptionist = roleLower === "receptionist";
  const isHousekeeper = roleLower === "housekeeping";
  const isMaintenance = roleLower === "maintenance";

  const floors = Array.from(
    new Set(rooms.map((r) => r.floor).filter((f): f is number => f !== null))
  ).sort((a, b) => a - b);

  const filtered = rooms.filter((r) => {
    const matchesFloor =
      floorFilter === "all" || (r.floor !== null && r.floor.toString() === floorFilter);
    const matchesStatus =
      statusFilter === "all" ||
      r.status === statusFilter ||
      r.operational_status?.toLowerCase().replace(/\s+/g, "_") === statusFilter;
    return matchesFloor && matchesStatus;
  });

  const handleOpenDetailModal = (room: RoomItem) => {
    setSelectedRoomForDetail(room);
  };

  const handleOpenRequestModal = (room: RoomItem) => {
    // Check dynamic action availability
    if (room.is_under_maintenance && room.is_under_cleaning) {
      setFeedbackMessage({
        type: "error",
        text: `Room ${room.room_number} already has active Cleaning and Maintenance requests.`,
      });
      return;
    }

    setRequestRoom(room);
    // Auto-select whichever category is NOT active
    if (room.is_under_cleaning && !room.is_under_maintenance) {
      setRequestType("maintenance");
    } else {
      setRequestType("cleaning");
    }
    setRequestComment("");
    setRequestModalOpen(true);
  };

  const handleConfirmRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestRoom) return;

    // Front-end safeguard
    if (requestType === "maintenance" && requestRoom.is_under_maintenance) {
      setFeedbackMessage({
        type: "error",
        text: `Room ${requestRoom.room_number} is already under Maintenance.`,
      });
      return;
    }

    if (requestType === "cleaning" && requestRoom.is_under_cleaning) {
      setFeedbackMessage({
        type: "error",
        text: `Room ${requestRoom.room_number} is already awaiting Cleaning.`,
      });
      return;
    }

    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await submitRoomServiceRequest(requestRoom.room_id, requestType, requestComment);
      if (res.success) {
        setRooms((prev) =>
          prev.map((r) => {
            if (r.room_id === requestRoom.room_id) {
              if (requestType === "maintenance") {
                return {
                  ...r,
                  status: "maintenance",
                  is_under_maintenance: true,
                  operational_status: "Maintenance Required",
                  notes: requestComment || "Maintenance reported",
                };
              } else {
                return {
                  ...r,
                  status: r.status === "available" ? "cleaning" : r.status,
                  is_under_cleaning: true,
                  operational_status: r.status === "available" ? "Cleaning Required" : r.operational_status,
                };
              }
            }
            return r;
          })
        );
        setFeedbackMessage({
          type: "success",
          text: res.message || "Request successfully dispatched.",
        });
        setRequestModalOpen(false);
        if (selectedRoomForDetail?.room_id === requestRoom.room_id) {
          setSelectedRoomForDetail(null);
        }
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to submit request." });
      }
    });
  };

  const handleCheckOutFromRoomModal = (reservationId: number, roomNumber: string) => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await checkOutGuest(reservationId);
      if (res.success) {
        setRooms((prev) =>
          prev.map((r) =>
            r.room_number === roomNumber
              ? {
                  ...r,
                  status: "cleaning",
                  operational_status: "Cleaning Required",
                  is_under_cleaning: true,
                  active_stay_guest: null,
                }
              : r
          )
        );
        setFeedbackMessage({
          type: "success",
          text: `Guest checked out from Room ${roomNumber}. Room status updated to 'Cleaning Required' and turnover task dispatched to Housekeeping.`,
        });
        setSelectedRoomForDetail(null);
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to check out guest." });
      }
    });
  };

  const handleOpenOverride = (room: RoomItem) => {
    setSelectedRoomId(room.room_id);
    setOverrideStatus(room.status);
    setOverrideReason("");
    setOverrideModalOpen(true);
  };

  const handleConfirmOverride = () => {
    if (!selectedRoomId) return;
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await adminOverrideRoomStatus(selectedRoomId, overrideStatus, overrideReason);
      if (res.success) {
        setRooms((prev) =>
          prev.map((r) => {
            if (r.room_id === selectedRoomId) {
              return {
                ...r,
                status: overrideStatus,
                operational_status:
                  overrideStatus === "available"
                    ? "Available"
                    : overrideStatus === "occupied"
                    ? "Occupied"
                    : overrideStatus === "cleaning"
                    ? "Cleaning Required"
                    : "Maintenance Required",
                is_under_cleaning: overrideStatus === "cleaning",
                is_under_maintenance: overrideStatus === "maintenance",
              };
            }
            return r;
          })
        );
        setFeedbackMessage({ type: "success", text: "Room status successfully overridden by Administrator." });
        setOverrideModalOpen(false);
        if (selectedRoomForDetail?.room_id === selectedRoomId) {
          setSelectedRoomForDetail(null);
        }
      } else {
        setFeedbackMessage({ type: "error", text: res.error || "Failed to override room status." });
      }
    });
  };

  const getStatusBadge = (opStatus: string, baseStatus: string) => {
    const s = opStatus || baseStatus;
    if (s === "Available") {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
    if (s === "Reserved") {
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
    }
    if (s === "Occupied") {
      return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    }
    if (s.startsWith("Cleaning")) {
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    }
    if (s.startsWith("Maintenance")) {
      return "bg-red-500/10 text-red-400 border-red-500/20";
    }
    return "bg-slate-800 text-slate-300 border-slate-700";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white flex items-center gap-3">
          <BedDouble className="w-7 h-7 text-amber-500" />
          Room Inventory &amp; Availability
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {isAdmin
            ? "Central hotel room inventory with real-time operational status and administrative override authority."
            : isReceptionist
            ? "Live room availability. View reserved vs occupied rooms, check in arriving guests, or submit conditional room requests."
            : isHousekeeper
            ? "Cleanliness status tracking. View rooms awaiting turnover and report maintenance directly from Housekeeping."
            : "Technical maintenance monitoring. Complete repairs to return rooms to service."}
        </p>
      </div>

      {/* Role-specific Banner */}
      {isReceptionist && (
        <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-sky-400" />
          <span>
            <strong>Front Desk Operational Rules:</strong> Rooms with confirmed bookings display <strong>Reserved</strong> until you check the guest in. Rooms already under Maintenance or Cleaning will dynamically disable duplicate requests.
          </span>
        </div>
      )}

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-3 ${
            feedbackMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Available Rooms
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-white mt-1">
            {rooms.filter((r) => (r.operational_status || r.status) === "Available").length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Clean &amp; ready for guest</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-indigo-500/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
            Reserved
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-white mt-1">
            {rooms.filter((r) => r.operational_status === "Reserved").length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Awaiting guest check-in</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-sky-500/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
            Occupied
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-white mt-1">
            {rooms.filter((r) => (r.operational_status || r.status) === "Occupied").length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active checked-in stay</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-violet-500/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
            Cleaning Required
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-white mt-1">
            {rooms.filter((r) => r.is_under_cleaning).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Turnover queue</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-red-500/30 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
            Under Maintenance
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-white mt-1">
            {rooms.filter((r) => r.is_under_maintenance).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Repairs logged</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Floor:
            </span>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Floors</option>
              {floors.map((fl) => (
                <option key={fl} value={fl.toString()}>
                  Floor {fl}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="occupied">Occupied</option>
              <option value="cleaning">Cleaning</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="text-white font-semibold">{filtered.length}</span> of{" "}
          <span className="text-white font-semibold">{rooms.length}</span> rooms
        </div>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((room) => {
          const opStatus = room.operational_status || room.status;
          const isAvailable = opStatus === "Available";
          const isReserved = opStatus === "Reserved";
          const isOccupied = opStatus === "Occupied";
          const isCleaning = room.is_under_cleaning;
          const isMaintenance = room.is_under_maintenance;

          return (
            <div
              key={room.room_id}
              onClick={() => handleOpenDetailModal(room)}
              className={`p-5 rounded-2xl border transition group cursor-pointer flex flex-col justify-between ${
                isAvailable
                  ? "bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/70"
                  : isReserved
                  ? "bg-slate-900/90 border-indigo-500/30 hover:border-indigo-500/70"
                  : isOccupied
                  ? "bg-slate-900/90 border-sky-500/30 hover:border-sky-500/70"
                  : isCleaning
                  ? "bg-slate-900/90 border-violet-500/30 hover:border-violet-500/70"
                  : "bg-slate-900/90 border-red-500/30 hover:border-red-500/70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xl font-bold text-white group-hover:text-amber-400 transition">
                    Room {room.room_number}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border ${getStatusBadge(
                      opStatus,
                      room.status
                    )}`}
                  >
                    {opStatus}
                  </span>
                </div>

                <div className="mt-3 text-xs text-slate-400 space-y-1">
                  <div>Type: <span className="text-slate-200 font-medium">{room.room_type}</span></div>
                  <div>Floor: <span className="text-slate-200 font-medium">{room.floor}</span></div>
                  <div>Base Rate: <span className="text-amber-400 font-mono font-medium">PKR {room.base_price.toLocaleString()}</span></div>

                  {/* Reserved Snippet */}
                  {isReserved && room.active_stay_guest && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-indigo-300 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">Res: {room.active_stay_guest.guest_name}</span>
                    </div>
                  )}

                  {/* Occupied Guest Snippet */}
                  {isOccupied && room.active_stay_guest && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-sky-300 font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">{room.active_stay_guest.guest_name}</span>
                    </div>
                  )}

                  {/* Notes snippet */}
                  {room.notes && (
                    <div className="pt-2 text-[11px] text-amber-300/90 italic border-t border-slate-800 line-clamp-2">
                      {room.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Toolbar */}
              <div
                className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Conditional Room Request Button */}
                {room.is_under_maintenance && room.is_under_cleaning ? (
                  <span className="text-[10px] text-slate-500 italic px-2 py-1">
                    Busy
                  </span>
                ) : (
                  <button
                    onClick={() => handleOpenRequestModal(room)}
                    disabled={isPending}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                    title="Submit a guest complaint or room request (Cleaning or Maintenance)"
                  >
                    <PlusCircle className="w-3 h-3 text-amber-500" />
                    Request
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  {isReserved && room.active_stay_guest && (
                    <Link
                      href={`/staff/dashboard/reservations?reservationId=${room.active_stay_guest.reservation_id}`}
                      className="px-2 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                      title="Check in this arriving reserved guest"
                    >
                      <LogIn className="w-3 h-3" />
                      Check In
                    </Link>
                  )}

                  <button
                    onClick={() => handleOpenDetailModal(room)}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    Details
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => handleOpenOverride(room)}
                      disabled={isPending}
                      className="px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                    >
                      <Crown className="w-3 h-3" />
                      Override
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comprehensive Room Detail Modal */}
      {selectedRoomForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xl font-bold text-white font-serif flex items-center gap-2">
                  <BedDouble className="w-5 h-5 text-amber-500" />
                  Room {selectedRoomForDetail.room_number} Details
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedRoomForDetail.room_type} – Floor {selectedRoomForDetail.floor}
                </p>
              </div>
              <button
                onClick={() => setSelectedRoomForDetail(null)}
                className="text-slate-400 hover:text-white text-base p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              {/* Status Header */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Operational Status:</span>
                <span
                  className={`text-xs font-bold uppercase px-3 py-1 rounded-full border ${getStatusBadge(
                    selectedRoomForDetail.operational_status || selectedRoomForDetail.status,
                    selectedRoomForDetail.status
                  )}`}
                >
                  {selectedRoomForDetail.operational_status || selectedRoomForDetail.status}
                </span>
              </div>

              {/* Reserved Status Information */}
              {selectedRoomForDetail.operational_status === "Reserved" && selectedRoomForDetail.active_stay_guest && (
                <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Reserved – Awaiting Guest Arrival
                  </div>
                  <div className="text-sm font-bold text-white">
                    {selectedRoomForDetail.active_stay_guest.guest_name}
                  </div>
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {selectedRoomForDetail.active_stay_guest.guest_phone}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850">
                    <div>
                      <span className="text-slate-500 block">Expected Arrival:</span>
                      <span className="text-white font-medium">
                        {selectedRoomForDetail.active_stay_guest.check_in_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Scheduled Checkout:</span>
                      <span className="text-amber-400 font-medium">
                        {selectedRoomForDetail.active_stay_guest.check_out_date}
                      </span>
                    </div>
                  </div>

                  {(isReceptionist || isManager || isAdmin) && (
                    <div className="pt-2">
                      <Link
                        href={`/staff/dashboard/reservations?reservationId=${selectedRoomForDetail.active_stay_guest.reservation_id}`}
                        className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Check In Reserved Guest
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Occupied Guest Information */}
              {selectedRoomForDetail.operational_status === "Occupied" && selectedRoomForDetail.active_stay_guest && (
                <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/30 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Currently In-House Guest
                  </div>
                  <div className="text-sm font-bold text-white">
                    {selectedRoomForDetail.active_stay_guest.guest_name}
                  </div>
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {selectedRoomForDetail.active_stay_guest.guest_phone}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850">
                    <div>
                      <span className="text-slate-500 block">Check-in:</span>
                      <span className="text-white font-medium">
                        {selectedRoomForDetail.active_stay_guest.check_in_date}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Scheduled Checkout:</span>
                      <span className="text-amber-400 font-medium">
                        {selectedRoomForDetail.active_stay_guest.check_out_date}
                      </span>
                    </div>
                  </div>

                  {/* Direct Check Out Button */}
                  {(isReceptionist || isManager || isAdmin) && (
                    <div className="pt-2">
                      <button
                        onClick={() =>
                          handleCheckOutFromRoomModal(
                            selectedRoomForDetail.active_stay_guest!.reservation_id,
                            selectedRoomForDetail.room_number
                          )
                        }
                        disabled={isPending}
                        className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Check Out Guest from Room {selectedRoomForDetail.room_number}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Cleaning Turnover Status */}
              {selectedRoomForDetail.is_under_cleaning && (
                <div className="p-4 rounded-xl bg-slate-950 border border-violet-500/30 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Turnover Cleaning in Progress
                  </div>
                  <p className="text-slate-300">
                    Room is assigned for housekeeping turnover. Once cleaning is marked completed in Housekeeping, the room will automatically be verified and restored to Available.
                  </p>
                  {selectedRoomForDetail.active_cleaning?.notes && (
                    <p className="text-slate-400 italic text-[11px] pt-1">
                      Notes: {selectedRoomForDetail.active_cleaning.notes}
                    </p>
                  )}
                </div>
              )}

              {/* Maintenance Status */}
              {selectedRoomForDetail.is_under_maintenance && (
                <div className="p-4 rounded-xl bg-slate-950 border border-red-500/30 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Technical Defect / Out of Service
                  </div>
                  <p className="text-slate-300">
                    Room is currently under maintenance. Technicians are addressing the issue.
                  </p>
                  {selectedRoomForDetail.notes && (
                    <p className="text-amber-300 font-mono text-[11px] pt-1">
                      Issue: {selectedRoomForDetail.notes}
                    </p>
                  )}
                </div>
              )}

              {/* Available Ready Status */}
              {selectedRoomForDetail.operational_status === "Available" && (
                <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Clean &amp; Ready for Guests
                  </div>
                  <p className="text-slate-300">
                    Room is fully inspected, sanitized, and ready for immediate walk-in or online guest check-in.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setSelectedRoomForDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {(!selectedRoomForDetail.is_under_maintenance || !selectedRoomForDetail.is_under_cleaning) && (
                  <button
                    onClick={() => {
                      const r = selectedRoomForDetail;
                      setSelectedRoomForDetail(null);
                      handleOpenRequestModal(r);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Log Request / Issue
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => {
                      const r = selectedRoomForDetail;
                      setSelectedRoomForDetail(null);
                      handleOpenOverride(r);
                    }}
                    className="px-3 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    Override Status
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Guest Complaints & Room Requests Modal (Conditional Actions) */}
      {requestModalOpen && requestRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-500" />
              Room Request – Room {requestRoom.room_number}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Select the applicable request category. Duplicate requests for active issues are restricted.
            </p>

            <form onSubmit={handleConfirmRequest} className="mt-4 space-y-4">
              {/* Dynamic Action Availability: Cleaning vs Maintenance */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Request Category <span className="text-amber-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Cleaning Option */}
                  {requestRoom.is_under_cleaning ? (
                    <div className="p-3 rounded-xl border border-slate-850 bg-slate-950/40 text-center opacity-60 cursor-not-allowed">
                      <Sparkles className="w-5 h-5 mx-auto mb-1 text-slate-500" />
                      <span className="text-xs text-slate-400 block font-medium">Cleaning</span>
                      <span className="text-[10px] text-amber-400/90 block mt-0.5">
                        Already awaiting cleaning
                      </span>
                    </div>
                  ) : (
                    <div
                      onClick={() => setRequestType("cleaning")}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition ${
                        requestType === "cleaning"
                          ? "bg-violet-500/10 border-violet-500 text-violet-400 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sparkles className="w-5 h-5 mx-auto mb-1 text-violet-400" />
                      <span className="text-xs">Cleaning</span>
                      <span className="text-[10px] text-slate-500 block">Sent to Housekeeping</span>
                    </div>
                  )}

                  {/* Maintenance Option */}
                  {requestRoom.is_under_maintenance ? (
                    <div className="p-3 rounded-xl border border-slate-850 bg-slate-950/40 text-center opacity-60 cursor-not-allowed">
                      <Wrench className="w-5 h-5 mx-auto mb-1 text-slate-500" />
                      <span className="text-xs text-slate-400 block font-medium">Maintenance</span>
                      <span className="text-[10px] text-amber-400/90 block mt-0.5">
                        Already under maintenance
                      </span>
                    </div>
                  ) : (
                    <div
                      onClick={() => setRequestType("maintenance")}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition ${
                        requestType === "maintenance"
                          ? "bg-red-500/10 border-red-500 text-red-400 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Wrench className="w-5 h-5 mx-auto mb-1 text-red-400" />
                      <span className="text-xs">Maintenance</span>
                      <span className="text-[10px] text-slate-500 block">Sent to Maintenance</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comment field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Comment / Problem Description
                </label>
                <textarea
                  value={requestComment}
                  onChange={(e) => setRequestComment(e.target.value)}
                  placeholder={
                    requestType === "cleaning"
                      ? "e.g., Guest requested extra towels and room freshening..."
                      : "e.g., Air conditioning not cooling properly / bathroom faucet leak..."
                  }
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isPending ||
                    (requestType === "cleaning" && requestRoom.is_under_cleaning) ||
                    (requestType === "maintenance" && requestRoom.is_under_maintenance)
                  }
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Override Modal */}
      {overrideModalOpen && selectedRoomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-red-500/40 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <Crown className="w-5 h-5 text-red-500" />
              Administrative Room Status Override
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Override operational status when required. Turnover or maintenance tasks will be dispatched automatically.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Target Operational Status
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as any)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  <option value="available">Available (Inspected &amp; Ready)</option>
                  <option value="occupied">Occupied (Guest In-House)</option>
                  <option value="cleaning">Cleaning (Dispatch Turnover Task)</option>
                  <option value="maintenance">Maintenance (Dispatch Repair Order)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Override Justification / Audit Note
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. VIP arrival prep, emergency maintenance release, or manual turnover audit."
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmOverride}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Overriding..." : "Confirm Status Override"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
