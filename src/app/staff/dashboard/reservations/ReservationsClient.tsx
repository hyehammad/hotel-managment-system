"use client";

import { useState, useTransition, useEffect } from "react";
import {
  confirmReservation,
  cancelReservation,
  checkInGuest,
  checkOutGuest,
  createWalkInReservation,
  recordReservationPayment,
} from "@/app/actions/staff";
import {
  validatePersonName,
  validatePhoneNumber,
  validateEmail,
  sanitizePhoneInput,
} from "@/lib/validation";
import {
  CalendarCheck,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  LogIn,
  LogOut,
  User,
  Phone,
  Mail,
  AlertCircle,
  BedDouble,
  Sparkles,
  Wrench,
  PlusCircle,
  Calendar,
  Globe,
  Building,
  Info,
  Eye,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Receipt,
} from "lucide-react";

interface ReservationRoomAssignment {
  reservation_room_id: number;
  room_id?: number;
  room_number: string;
  room_type: string;
  room_status: string;
  rate_per_night: number;
  assignment_status: "RESERVED" | "CHECKED IN" | "COMPLETED" | "CANCELLED";
  stay_id: number | null;
  actual_check_in: string | null;
  actual_check_out: string | null;
}

interface ReservationItem {
  reservation_id: number;
  booking_reference: string;
  source?: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string;
  room_id?: number;
  room_number: string;
  room_type: string;
  room_current_status?: string;
  assigned_rooms?: ReservationRoomAssignment[];
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  total_amount: number;
  status: string;
  created_at: string;
  cancel_reason: string | null;
  special_requests?: string | null;
  created_by_staff: string;
  payment_status: string;
  total_paid?: number;
  remaining_balance?: number;
  credit_balance?: number;
  has_active_stay?: boolean;
  actual_check_in?: string | null;
  actual_check_out?: string | null;
}

interface RoomOption {
  room_id: number;
  room_number: string;
  floor: number | null;
  room_type: string;
  base_price: number;
  status: string;
}

export default function ReservationsClient({
  initialReservations,
  rooms = [],
  currentUserRole,
  initialView,
  initialReservationId,
}: {
  initialReservations: ReservationItem[];
  rooms?: RoomOption[];
  currentUserRole: string;
  initialView?: "all" | "occupied" | "upcoming_online";
  initialReservationId?: number;
}) {
  const [reservations, setReservations] = useState(initialReservations);
  const [sourceFilter, setSourceFilter] = useState<"all" | "online" | "walk_in">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<"all" | "occupied" | "upcoming_online">(
    initialView || "all"
  );

  const [isPending, startTransition] = useTransition();
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals
  const [selectedResForDetail, setSelectedResForDetail] = useState<ReservationItem | null>(null);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutReservation, setCheckoutReservation] = useState<ReservationItem | null>(null);
  const [checkoutSettlePayment, setCheckoutSettlePayment] = useState(true);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [checkoutPaymentAmount, setCheckoutPaymentAmount] = useState<number>(0);

  // Dedicated Payment Collection Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTargetRes, setPaymentTargetRes] = useState<ReservationItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer">("cash");

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReservationId, setCancelReservationId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Walk-in reservation modal state
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const [walkInFirstName, setWalkInFirstName] = useState("");
  const [walkInLastName, setWalkInLastName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInRoomId, setWalkInRoomId] = useState<number | null>(null);
  const [walkInCheckIn, setWalkInCheckIn] = useState(todayStr);
  const [walkInCheckOut, setWalkInCheckOut] = useState(tomorrowStr);
  const [walkInAdults, setWalkInAdults] = useState("1");
  const [walkInChildren, setWalkInChildren] = useState("0");
  const [walkInSpecialRequests, setWalkInSpecialRequests] = useState("");
  const [walkInDirectCheckIn, setWalkInDirectCheckIn] = useState(true);
  const [walkInRecordPayment, setWalkInRecordPayment] = useState(false);
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState("cash");

  useEffect(() => {
    if (initialReservationId) {
      const target = reservations.find((r) => r.reservation_id === initialReservationId);
      if (target) {
        setSelectedResForDetail(target);
      }
    }
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialReservationId, initialView, reservations]);

  const availableRooms = rooms.filter((r) => r.status === "available");
  const occupiedStays = reservations.filter(
    (r) => r.status === "checked_in" || r.has_active_stay === true
  );
  const upcomingOnlineBookings = reservations.filter(
    (r) => r.source === "online" && (r.status === "pending" || r.status === "confirmed")
  );

  // Filter reservations based on activeView, filters, and search
  const filtered = reservations.filter((r) => {
    // View filtering
    if (activeView === "occupied") {
      if (r.status !== "checked_in" && !r.has_active_stay) return false;
    } else if (activeView === "upcoming_online") {
      if (r.source !== "online" || (r.status !== "pending" && r.status !== "confirmed")) return false;
    }

    // Source filtering
    if (sourceFilter !== "all" && (r.source || "online") !== sourceFilter) {
      return false;
    }

    // Status filtering
    if (statusFilter !== "all" && r.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }

    // Search query
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchesQuery =
        r.booking_reference.toLowerCase().includes(query) ||
        r.guest_name.toLowerCase().includes(query) ||
        r.guest_phone.toLowerCase().includes(query) ||
        (r.guest_email && r.guest_email.toLowerCase().includes(query)) ||
        r.room_number.toLowerCase().includes(query);
      if (!matchesQuery) return false;
    }

    return true;
  });

  const handleConfirm = (id: number) => {
    setActionMessage(null);
    startTransition(async () => {
      const res = await confirmReservation(id);
      if (res.success) {
        setReservations((prev) =>
          prev.map((item) =>
            item.reservation_id === id ? { ...item, status: "confirmed" } : item
          )
        );
        if (selectedResForDetail?.reservation_id === id) {
          setSelectedResForDetail((prev) => (prev ? { ...prev, status: "confirmed" } : null));
        }
        setActionMessage({ type: "success", text: "Reservation confirmed successfully." });
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to confirm." });
      }
    });
  };

  const handleCheckIn = (id: number, roomNumber: string, roomId?: number) => {
    setActionMessage(null);
    startTransition(async () => {
      const res = await checkInGuest(id, roomId);
      if (res.success) {
        setReservations((prev) =>
          prev.map((item) =>
            item.reservation_id === id
              ? {
                  ...item,
                  status: "checked_in",
                  room_current_status: "occupied",
                  has_active_stay: true,
                  actual_check_in: new Date().toISOString(),
                  assigned_rooms: item.assigned_rooms?.map((ar) =>
                    !roomId || ar.room_id === roomId
                      ? {
                          ...ar,
                          assignment_status: "CHECKED IN",
                          room_status: "occupied",
                          actual_check_in: new Date().toISOString(),
                        }
                      : ar
                  ),
                }
              : item
          )
        );
        if (selectedResForDetail?.reservation_id === id) {
          setSelectedResForDetail((prev) =>
            prev
              ? {
                  ...prev,
                  status: "checked_in",
                  room_current_status: "occupied",
                  has_active_stay: true,
                  assigned_rooms: prev.assigned_rooms?.map((ar) =>
                    !roomId || ar.room_id === roomId
                      ? {
                          ...ar,
                          assignment_status: "CHECKED IN",
                          room_status: "occupied",
                          actual_check_in: new Date().toISOString(),
                        }
                      : ar
                  ),
                }
              : null
          );
        }
        setActionMessage({
          type: "success",
          text: `Guest successfully checked in into Room ${roomNumber}. Room status updated to Occupied across all dashboards.`,
        });
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to check in guest." });
      }
    });
  };

  const handleOpenCheckoutModal = (resItem: ReservationItem, roomId?: number, roomNumber?: string) => {
    const target = roomId && roomNumber
      ? { ...resItem, room_id: roomId, room_number: roomNumber }
      : resItem;
    setCheckoutReservation(target);
    const balance = target.remaining_balance ?? 0;
    setCheckoutPaymentAmount(balance);
    setCheckoutSettlePayment(balance > 0);
    setCheckoutPaymentMethod("cash");
    setCheckoutModalOpen(true);
  };

  const handleConfirmCheckOut = () => {
    if (!checkoutReservation) return;
    const { reservation_id, room_number, room_id } = checkoutReservation;

    setActionMessage(null);
    startTransition(async () => {
      let settlementSummary: { paymentStatus: string; remainingBalance: number; totalPaid?: number; creditBalance?: number } | null = null;
      // 1. If settlement requested and amount > 0, record payment first
      if (checkoutSettlePayment && checkoutPaymentAmount > 0) {
        const payRes = await recordReservationPayment(
          reservation_id,
          checkoutPaymentAmount,
          checkoutPaymentMethod
        );
        if (!payRes.success) {
          setActionMessage({
            type: "error",
            text: payRes.error || "Failed to record payment during check-out.",
          });
          return;
        }
        settlementSummary = {
          paymentStatus: payRes.paymentStatus || (payRes.isFullySettled ? "PAID" : "PARTIALLY PAID"),
          remainingBalance: payRes.remainingBalance ?? 0,
          totalPaid: payRes.totalPaid,
          creditBalance: payRes.creditBalance,
        };
      }

      // 2. Perform check-out
      const res = await checkOutGuest(reservation_id, room_id);
      if (res.success) {
        setReservations((prev) =>
          prev.map((item) =>
            item.reservation_id === reservation_id
              ? {
                  ...item,
                  status: "checked_out",
                  payment_status: settlementSummary ? settlementSummary.paymentStatus : item.payment_status,
                  remaining_balance: settlementSummary ? settlementSummary.remainingBalance : (item.remaining_balance ?? item.total_amount),
                  total_paid: settlementSummary?.totalPaid ?? item.total_paid,
                  credit_balance: settlementSummary?.creditBalance ?? item.credit_balance,
                  room_current_status: "cleaning",
                  has_active_stay: false,
                  actual_check_out: new Date().toISOString(),
                  assigned_rooms: item.assigned_rooms?.map((ar) =>
                    !room_id || ar.room_id === room_id
                      ? {
                          ...ar,
                          assignment_status: "COMPLETED",
                          room_status: "cleaning",
                          actual_check_out: new Date().toISOString(),
                        }
                      : ar
                  ),
                }
              : item
          )
        );
        if (selectedResForDetail?.reservation_id === reservation_id) {
          setSelectedResForDetail((prev) =>
            prev
              ? {
                  ...prev,
                  status: "checked_out",
                  payment_status: settlementSummary ? settlementSummary.paymentStatus : prev.payment_status,
                  remaining_balance: settlementSummary ? settlementSummary.remainingBalance : (prev.remaining_balance ?? prev.total_amount),
                  total_paid: settlementSummary?.totalPaid ?? prev.total_paid,
                  credit_balance: settlementSummary?.creditBalance ?? prev.credit_balance,
                  room_current_status: "cleaning",
                  has_active_stay: false,
                  assigned_rooms: prev.assigned_rooms?.map((ar) =>
                    !room_id || ar.room_id === room_id
                      ? {
                          ...ar,
                          assignment_status: "COMPLETED",
                          room_status: "cleaning",
                          actual_check_out: new Date().toISOString(),
                        }
                      : ar
                  ),
                }
              : null
          );
        }
        setCheckoutModalOpen(false);
        setCheckoutReservation(null);
        setActionMessage({
          type: "success",
          text: `Guest checked out from Room ${room_number}. ${
            checkoutSettlePayment && checkoutPaymentAmount > 0
              ? `Payment of PKR ${checkoutPaymentAmount.toLocaleString()} collected. `
              : ""
          }Stay completed, room set to 'Cleaning Required', and turnover task automatically dispatched to Housekeeping!`,
        });
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to check out guest." });
      }
    });
  };

  const handleOpenPaymentModal = (resItem: ReservationItem) => {
    setPaymentTargetRes(resItem);
    const balance = resItem.remaining_balance ?? 0;
    setPaymentAmount(balance > 0 ? balance : resItem.total_amount);
    setPaymentMethod("cash");
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = () => {
    if (!paymentTargetRes) return;
    if (paymentAmount <= 0) {
      setActionMessage({ type: "error", text: "Please enter a valid payment amount greater than 0." });
      return;
    }

    setActionMessage(null);
    startTransition(async () => {
      const res = await recordReservationPayment(
        paymentTargetRes.reservation_id,
        paymentAmount,
        paymentMethod
      );
      if (res.success) {
        const nextStatus = res.paymentStatus || (res.isFullySettled ? "PAID" : "PARTIALLY PAID");
        setReservations((prev) =>
          prev.map((item) =>
            item.reservation_id === paymentTargetRes.reservation_id
              ? {
                  ...item,
                  payment_status: nextStatus,
                  total_paid: res.totalPaid,
                  remaining_balance: res.remainingBalance,
                  credit_balance: res.creditBalance,
                }
              : item
          )
        );
        if (selectedResForDetail?.reservation_id === paymentTargetRes.reservation_id) {
          setSelectedResForDetail((prev) =>
            prev
              ? {
                  ...prev,
                  payment_status: nextStatus,
                  total_paid: res.totalPaid,
                  remaining_balance: res.remainingBalance,
                  credit_balance: res.creditBalance,
                }
              : null
          );
        }
        setPaymentModalOpen(false);
        setPaymentTargetRes(null);
        setActionMessage({
          type: "success",
          text: res.message || `Payment of PKR ${paymentAmount.toLocaleString()} recorded successfully.`,
        });
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to record payment." });
      }
    });
  };

  const handleOpenCancelModal = (id: number) => {
    setCancelReservationId(id);
    setCancelReason("Guest cancellation request");
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (!cancelReservationId) return;
    setActionMessage(null);
    startTransition(async () => {
      const res = await cancelReservation(cancelReservationId, cancelReason);
      if (res.success) {
        setReservations((prev) =>
          prev.map((item) =>
            item.reservation_id === cancelReservationId
              ? { ...item, status: "cancelled", cancel_reason: cancelReason }
              : item
          )
        );
        if (selectedResForDetail?.reservation_id === cancelReservationId) {
          setSelectedResForDetail((prev) =>
            prev ? { ...prev, status: "cancelled", cancel_reason: cancelReason } : null
          );
        }
        setCancelModalOpen(false);
        setActionMessage({
          type: "success",
          text: "Reservation cancelled. Assigned room returned to inventory.",
        });
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to cancel." });
      }
    });
  };

  const handleCreateWalkIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInRoomId) {
      setActionMessage({ type: "error", text: "Please select an available room for the walk-in guest." });
      return;
    }

    const fnCheck = validatePersonName(walkInFirstName, "Guest First Name", 50);
    if (!fnCheck.isValid) {
      setActionMessage({ type: "error", text: fnCheck.error || "Invalid first name." });
      return;
    }
    const lnCheck = validatePersonName(walkInLastName, "Guest Last Name", 50);
    if (!lnCheck.isValid) {
      setActionMessage({ type: "error", text: lnCheck.error || "Invalid last name." });
      return;
    }
    const phoneCheck = validatePhoneNumber(walkInPhone, "Guest Phone Number", true);
    if (!phoneCheck.isValid) {
      setActionMessage({ type: "error", text: phoneCheck.error || "Invalid phone number." });
      return;
    }
    if (walkInEmail && walkInEmail.trim()) {
      const emailCheck = validateEmail(walkInEmail, "Guest Email Address", false);
      if (!emailCheck.isValid) {
        setActionMessage({ type: "error", text: emailCheck.error || "Invalid email address." });
        return;
      }
    }

    const formData = new FormData();
    formData.append("firstName", walkInFirstName);
    formData.append("lastName", walkInLastName);
    formData.append("phone", walkInPhone);
    formData.append("email", walkInEmail);
    formData.append("roomId", walkInRoomId.toString());
    formData.append("checkInDate", walkInCheckIn);
    formData.append("checkOutDate", walkInCheckOut);
    formData.append("adults", walkInAdults);
    formData.append("children", walkInChildren);
    formData.append("specialRequests", walkInSpecialRequests);
    formData.append("directCheckIn", walkInDirectCheckIn ? "true" : "false");
    formData.append("recordPayment", walkInRecordPayment ? "true" : "false");
    formData.append("paymentMethod", walkInPaymentMethod);

    setActionMessage(null);
    startTransition(async () => {
      const res = await createWalkInReservation(formData);
      if (res.success && res.reservation) {
        const msg = walkInDirectCheckIn
          ? `Walk-in guest registered and directly checked in into Room ${res.reservation.room_number}! Stay logged and room status set to Occupied.`
          : `Walk-in booking created successfully! Reference: ${res.reservation.booking_reference}.`;

        setActionMessage({
          type: "success",
          text: msg,
        });
        setWalkInModalOpen(false);

        // Add to local state
        setReservations((prev) => [
          {
            reservation_id: res.reservation.reservation_id,
            booking_reference: res.reservation.booking_reference,
            source: "walk_in",
            guest_name: `${walkInFirstName} ${walkInLastName}`,
            guest_email: walkInEmail || null,
            guest_phone: walkInPhone,
            room_id: walkInRoomId,
            room_number: res.reservation.room_number,
            room_type: res.reservation.room_type,
            room_current_status: walkInDirectCheckIn ? "occupied" : "available",
            check_in_date: walkInCheckIn,
            check_out_date: walkInCheckOut,
            adults: parseInt(walkInAdults, 10),
            children: parseInt(walkInChildren, 10),
            total_amount: res.reservation.total_amount,
            status: walkInDirectCheckIn ? "checked_in" : "confirmed",
            created_at: new Date().toISOString(),
            cancel_reason: null,
            special_requests: walkInSpecialRequests || null,
            created_by_staff: currentUserRole,
            payment_status: walkInRecordPayment ? "PAID" : "YET TO PAY",
            has_active_stay: walkInDirectCheckIn,
            actual_check_in: walkInDirectCheckIn ? new Date().toISOString() : null,
          },
          ...prev,
        ]);

        // Reset inputs
        setWalkInFirstName("");
        setWalkInLastName("");
        setWalkInPhone("");
        setWalkInEmail("");
        setWalkInRoomId(null);
        setWalkInSpecialRequests("");
      } else {
        setActionMessage({ type: "error", text: res.error || "Failed to create walk-in reservation." });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white flex items-center gap-3">
            <CalendarCheck className="w-7 h-7 text-amber-500" />
            Front Desk &amp; Reservation Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time synchronization across all Online and Walk-in reservations, guest check-ins, and active occupied stays.
          </p>
        </div>

        <button
          onClick={() => setWalkInModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition cursor-pointer shadow-lg shadow-amber-500/20 shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          New Walk-In Booking
        </button>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-3 ${
            actionMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Operational View Switcher Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => {
            setActiveView("all");
            setStatusFilter("all");
          }}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeView === "all"
              ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            All Reservations
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {reservations.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Online &amp; Walk-in bookings
          </div>
        </div>

        <div
          onClick={() => {
            setActiveView("occupied");
            setStatusFilter("all");
          }}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeView === "occupied"
              ? "bg-sky-500/10 border-sky-500/40 text-sky-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <LogOut className="w-4 h-4 text-sky-400" />
            Occupied Rooms (Ready for Check-out)
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {occupiedStays.length}
          </div>
          <div className="text-xs text-sky-400 mt-1">
            Guests currently staying at hotel
          </div>
        </div>

        <div
          onClick={() => {
            setActiveView("upcoming_online");
            setStatusFilter("all");
          }}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeView === "upcoming_online"
              ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-indigo-400" />
            Upcoming Online Bookings
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {upcomingOnlineBookings.length}
          </div>
          <div className="text-xs text-indigo-300 mt-1">
            Awaiting guest physical arrival
          </div>
        </div>
      </div>

      {/* SECTION B: Dedicated Occupied Rooms & Check-out Quick Action Banner */}
      {occupiedStays.length > 0 && activeView !== "upcoming_online" && (
        <div className="rounded-2xl bg-slate-900/90 border border-sky-500/30 p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <LogOut className="w-5 h-5 text-sky-400" />
                Active Occupied Rooms &amp; Guest Check-Out
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Every room with an active checked-in stay is listed below. Perform checkout when guest departs to dispatch cleaning.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {occupiedStays.length} In-House Stay{occupiedStays.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {occupiedStays.map((stayRes) => (
              <div
                key={stayRes.reservation_id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        Room {stayRes.room_number}
                      </span>
                      <span className="text-xs text-slate-400 block">{stayRes.room_type}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      Occupied
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {stayRes.guest_name}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                      <Phone className="w-3 h-3 text-slate-500" />
                      {stayRes.guest_phone}
                    </div>
                    <div className="text-xs text-slate-400 mt-2 bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                      <div className="text-[11px] text-slate-400">
                        Check-in: <span className="text-white">{stayRes.check_in_date}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Scheduled Out: <span className="text-amber-400">{stayRes.check_out_date}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between">
                        <span>Payment:</span>
                        {stayRes.payment_status === "PAID" ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : stayRes.payment_status === "PARTIALLY PAID" ? (
                          <span className="text-amber-400 font-semibold">
                            Partial (Bal: PKR {(stayRes.remaining_balance ?? 0).toLocaleString()})
                          </span>
                        ) : (
                          <span className="text-red-400 font-semibold">
                            Unpaid
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-850 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedResForDetail(stayRes)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Details
                  </button>
                  <button
                    onClick={() => handleOpenCheckoutModal(stayRes)}
                    disabled={isPending}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by reference (RES-0001), guest name, phone, room number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setSourceFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              sourceFilter === "all"
                ? "bg-amber-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Sources
          </button>
          <button
            onClick={() => setSourceFilter("online")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              sourceFilter === "online"
                ? "bg-indigo-500 text-white font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Globe className="w-3 h-3" />
            Online
          </button>
          <button
            onClick={() => setSourceFilter("walk_in")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              sourceFilter === "walk_in"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Building className="w-3 h-3" />
            Walk-in
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {["all", "pending", "confirmed", "checked_in", "checked_out", "cancelled"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition cursor-pointer ${
                statusFilter === st
                  ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Reservations Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Booking Ref</th>
                <th className="py-3.5 px-4">Source</th>
                <th className="py-3.5 px-4">Guest Details</th>
                <th className="py-3.5 px-4">Room &amp; Status</th>
                <th className="py-3.5 px-4">Stay Dates</th>
                <th className="py-3.5 px-4">Total Amount</th>
                <th className="py-3.5 px-4">Reservation Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-sm">
                    No reservations found matching the current criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const isPendingStatus = r.status === "pending";
                  const isConfirmed = r.status === "confirmed";
                  const isCheckedIn = r.status === "checked_in";
                  const isCheckedOut = r.status === "checked_out";
                  const isCancelled = r.status === "cancelled";

                  const isRoomAvailable = r.room_current_status === "available";
                  const isOnline = (r.source || "online") === "online";

                  return (
                    <tr
                      key={r.reservation_id}
                      className="hover:bg-slate-850/40 transition group cursor-pointer"
                      onClick={() => setSelectedResForDetail(r)}
                    >
                      {/* Ref */}
                      <td className="py-4 px-4 font-mono font-bold text-amber-400">
                        {r.booking_reference}
                      </td>

                      {/* Source Badge */}
                      <td className="py-4 px-4">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Globe className="w-3 h-3" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Building className="w-3 h-3" />
                            Walk-in
                          </span>
                        )}
                      </td>

                      {/* Guest */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-white">{r.guest_name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {r.guest_phone}
                        </div>
                      </td>

                      {/* Room */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          Room {r.room_number}
                          <span
                            className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold ${
                              r.room_current_status === "available"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : r.room_current_status === "occupied"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : r.room_current_status === "cleaning"
                                ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {r.room_current_status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">{r.room_type}</div>
                      </td>

                      {/* Dates */}
                      <td className="py-4 px-4 text-xs">
                        <div className="text-slate-300 font-medium">In: {r.check_in_date}</div>
                        <div className="text-slate-500 mt-0.5">Out: {r.check_out_date}</div>
                      </td>

                      {/* Total & Payment */}
                      <td className="py-4 px-4 font-mono text-xs">
                        <div className="font-medium text-white">PKR {r.total_amount.toLocaleString()}</div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {r.payment_status === "PAID" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                              <CheckCircle2 className="w-2.5 h-2.5" /> PAID
                            </span>
                          ) : r.payment_status === "PARTIALLY PAID" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans">
                              PARTIAL (Bal: PKR {(r.remaining_balance ?? 0).toLocaleString()})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 font-sans">
                              YET TO PAY
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            isPendingStatus
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : isConfirmed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : isCheckedIn
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : isCheckedOut
                              ? "bg-slate-800 text-slate-300 border border-slate-700"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {isPendingStatus && <Clock className="w-3 h-3" />}
                          {isConfirmed && <CheckCircle className="w-3 h-3" />}
                          {isCheckedIn && <LogIn className="w-3 h-3" />}
                          {isCheckedOut && <LogOut className="w-3 h-3" />}
                          {isCancelled && <XCircle className="w-3 h-3" />}
                          {r.status.replace("_", " ")}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {/* Confirm */}
                          {isPendingStatus && (
                            <button
                              onClick={() => handleConfirm(r.reservation_id)}
                              disabled={isPending}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                            >
                              Confirm
                            </button>
                          )}

                          {/* Check In */}
                          {(isConfirmed || isPendingStatus) && (
                            <button
                              onClick={() => handleCheckIn(r.reservation_id, r.room_number)}
                              disabled={isPending || !isRoomAvailable}
                              title={
                                !isRoomAvailable
                                  ? `Cannot check in: Room ${r.room_number} is currently ${r.room_current_status}. It must be 'available' first.`
                                  : "Check in guest"
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              Check In
                            </button>
                          )}

                          {/* Check Out */}
                          {isCheckedIn && (
                            <button
                              onClick={() => handleOpenCheckoutModal(r)}
                              disabled={isPending}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              Check Out
                            </button>
                          )}

                          {/* Collect Payment */}
                          {r.payment_status !== "PAID" && r.status !== "cancelled" && (
                            <button
                              onClick={() => handleOpenPaymentModal(r)}
                              disabled={isPending}
                              title="Collect payment from guest"
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Collect</span>
                            </button>
                          )}

                          {/* Cancel */}
                          {(isPendingStatus || isConfirmed) && (
                            <button
                              onClick={() => handleOpenCancelModal(r.reservation_id)}
                              disabled={isPending}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/30 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}

                          {/* Inspect Details */}
                          <button
                            onClick={() => setSelectedResForDetail(r)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                            title="View full booking details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reservation Details Modal */}
      {selectedResForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white font-serif">
                    {selectedResForDetail.booking_reference}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      selectedResForDetail.source === "walk_in"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    }`}
                  >
                    {selectedResForDetail.source === "walk_in" ? "Walk-in Booking" : "Online Booking"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Booked on {new Date(selectedResForDetail.created_at).toLocaleString()} by {selectedResForDetail.created_by_staff}
                </p>
              </div>
              <button
                onClick={() => setSelectedResForDetail(null)}
                className="text-slate-400 hover:text-white text-base p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              {/* Guest Information */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-500" />
                  Guest Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Full Name:</span>{" "}
                    <span className="font-semibold text-white">{selectedResForDetail.guest_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Phone:</span>{" "}
                    <span className="font-mono text-white">{selectedResForDetail.guest_phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Email:</span>{" "}
                    <span className="text-white">{selectedResForDetail.guest_email || "Not provided"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Guests:</span>{" "}
                    <span className="text-white">
                      {selectedResForDetail.adults} Adults
                      {selectedResForDetail.children > 0 ? `, ${selectedResForDetail.children} Children` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Room & Stay Details */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5 text-amber-500" />
                  Assigned Room &amp; Stay Duration
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Room:</span>{" "}
                    <span className="font-bold text-amber-400">
                      Room {selectedResForDetail.room_number} ({selectedResForDetail.room_type})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Room Status:</span>{" "}
                    <span className="font-semibold uppercase text-emerald-400">
                      {selectedResForDetail.room_current_status}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Check-In Date:</span>{" "}
                    <span className="text-white font-medium">{selectedResForDetail.check_in_date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Check-Out Date:</span>{" "}
                    <span className="text-white font-medium">{selectedResForDetail.check_out_date}</span>
                  </div>
                </div>
              </div>

              {/* Assigned Rooms & Independent Room Lifecycle Status */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Assigned Room Lifecycle &amp; Individual Status
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {selectedResForDetail.assigned_rooms?.length || 1} room(s) assigned
                  </span>
                </div>

                <div className="space-y-2">
                  {(selectedResForDetail.assigned_rooms && selectedResForDetail.assigned_rooms.length > 0
                    ? selectedResForDetail.assigned_rooms
                    : [
                        {
                          reservation_room_id: 0,
                          room_id: selectedResForDetail.room_id,
                          room_number: selectedResForDetail.room_number,
                          room_type: selectedResForDetail.room_type,
                          room_status: selectedResForDetail.room_current_status || "available",
                          rate_per_night: 0,
                          assignment_status: (selectedResForDetail.status === "cancelled"
                            ? "CANCELLED"
                            : selectedResForDetail.has_active_stay
                            ? "CHECKED IN"
                            : selectedResForDetail.status === "checked_out"
                            ? "COMPLETED"
                            : "RESERVED") as any,
                          stay_id: null,
                          actual_check_in: selectedResForDetail.actual_check_in,
                          actual_check_out: selectedResForDetail.actual_check_out,
                        },
                      ]
                  ).map((ar, idx) => {
                    const isCheckedIn = ar.assignment_status === "CHECKED IN";
                    const isCompleted = ar.assignment_status === "COMPLETED";
                    const isCancelled = ar.assignment_status === "CANCELLED";
                    const isReserved = ar.assignment_status === "RESERVED";

                    return (
                      <div
                        key={ar.reservation_room_id || idx}
                        className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-serif font-bold text-white text-sm">
                              Room {ar.room_number}
                            </span>
                            <span className="text-xs text-slate-400">({ar.room_type})</span>
                            <span
                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                isCheckedIn
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : isCompleted
                                  ? "bg-slate-800 text-slate-400 border border-slate-700"
                                  : isCancelled
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              }`}
                            >
                              {ar.assignment_status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {isCheckedIn && ar.actual_check_in && (
                              <span>
                                Checked in:{" "}
                                {new Date(ar.actual_check_in).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                            {isCompleted && ar.actual_check_out && (
                              <span>
                                Checked out:{" "}
                                {new Date(ar.actual_check_out).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                            {isReserved && (
                              <span>
                                Physical room status:{" "}
                                <strong className="text-slate-300 capitalize">
                                  {ar.room_status}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isReserved && selectedResForDetail.status !== "cancelled" && (
                            <button
                              onClick={() =>
                                handleCheckIn(
                                  selectedResForDetail.reservation_id,
                                  ar.room_number,
                                  ar.room_id
                                )
                              }
                              disabled={isPending || ar.room_status !== "available"}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              Check In Room {ar.room_number}
                            </button>
                          )}
                          {isCheckedIn && (
                            <button
                              onClick={() => {
                                const resToCheckout = selectedResForDetail;
                                setSelectedResForDetail(null);
                                handleOpenCheckoutModal(resToCheckout, ar.room_id, ar.room_number);
                              }}
                              disabled={isPending}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              Check Out Room {ar.room_number}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financials & Requests */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Financial Summary &amp; Special Requests
                  </h4>
                  {selectedResForDetail.payment_status !== "PAID" && selectedResForDetail.status !== "cancelled" && (
                    <button
                      onClick={() => handleOpenPaymentModal(selectedResForDetail)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Collect Payment
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Total Billed:</span>{" "}
                    <span className="font-mono font-bold text-white text-sm">
                      PKR {selectedResForDetail.total_amount.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Amount Paid:</span>{" "}
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      PKR {(selectedResForDetail.total_paid ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Remaining Due:</span>{" "}
                    <span className={`font-mono font-bold text-sm ${(selectedResForDetail.remaining_balance ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      PKR {(selectedResForDetail.remaining_balance ?? 0).toLocaleString()}
                    </span>
                  </div>
                  {(selectedResForDetail.credit_balance ?? 0) > 0 && (
                    <div className="col-span-full flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">
                      <span>Guest Credit Balance:</span>
                      <span className="font-mono">PKR {selectedResForDetail.credit_balance!.toLocaleString()} (Excess Guest Credit / Unapplied Balance)</span>
                    </div>
                  )}
                  {selectedResForDetail.source === "online" && (
                    <div className="col-span-full p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                      <strong>Payment Note (Academic Demo):</strong> Online booking payment was recorded in simulation mode. No real card funds were collected or settled.
                    </div>
                  )}
                  <div className="col-span-full">
                    <span className="text-slate-400">Special Requests:</span>{" "}
                    <span className="text-slate-300 italic">
                      {selectedResForDetail.special_requests || "None specified"}
                    </span>
                  </div>
                  {selectedResForDetail.cancel_reason && (
                    <div className="col-span-full text-red-400">
                      <span className="font-semibold">Cancellation Reason:</span> {selectedResForDetail.cancel_reason}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setSelectedResForDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {selectedResForDetail.status === "pending" && (
                  <button
                    onClick={() => handleConfirm(selectedResForDetail.reservation_id)}
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold transition cursor-pointer"
                  >
                    Confirm Reservation
                  </button>
                )}

                {(selectedResForDetail.status === "confirmed" || selectedResForDetail.status === "pending") && (
                  <button
                    onClick={() =>
                      handleCheckIn(selectedResForDetail.reservation_id, selectedResForDetail.room_number)
                    }
                    disabled={isPending || selectedResForDetail.room_current_status !== "available"}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Check In Guest
                  </button>
                )}

                {selectedResForDetail.status === "checked_in" && (
                  <button
                    onClick={() => {
                      const resToCheckout = selectedResForDetail;
                      setSelectedResForDetail(null);
                      handleOpenCheckoutModal(resToCheckout);
                    }}
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out Guest
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check-Out Confirmation Modal */}
      {checkoutModalOpen && checkoutReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <LogOut className="w-5 h-5 text-violet-400" />
              Complete Guest Check-Out
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Verify checkout details for Room {checkoutReservation.room_number}. Completing checkout will set the room to &apos;Cleaning Required&apos; and notify Housekeeping.
            </p>

            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Guest:</span>
                <span className="font-bold text-white">{checkoutReservation.guest_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Room:</span>
                <span className="font-mono font-bold text-amber-400">Room {checkoutReservation.room_number}</span>
              </div>
              <div className="flex justify-between border-t border-slate-850 pt-2">
                <span className="text-slate-400">Total Billed:</span>
                <span className="font-mono text-white">PKR {checkoutReservation.total_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Paid:</span>
                <span className="font-mono text-emerald-400">
                  PKR {(checkoutReservation.total_paid ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Payment Status:</span>
                {checkoutReservation.payment_status === "PAID" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                    <CheckCircle2 className="w-2.5 h-2.5" /> PAID
                  </span>
                ) : checkoutReservation.payment_status === "PARTIALLY PAID" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans">
                    PARTIALLY PAID
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 font-sans">
                    YET TO PAY
                  </span>
                )}
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-300">Remaining Due:</span>
                <span className={`font-mono ${(checkoutReservation.remaining_balance ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  PKR {(checkoutReservation.remaining_balance ?? 0).toLocaleString()}
                </span>
              </div>
              {(checkoutReservation.credit_balance ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  <span>Guest Credit Balance:</span>
                  <span className="font-mono">PKR {checkoutReservation.credit_balance!.toLocaleString()} (Excess Guest Credit / Unapplied Balance)</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-850 pt-2">
                <span className="text-slate-400">Next Step:</span>
                <span className="text-violet-400 font-semibold">Housekeeping Turnover Dispatched</span>
              </div>
            </div>

            {/* Settle Balance Section */}
            {(checkoutReservation.remaining_balance ?? 0) > 0 ? (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-amber-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="w-4 h-4" />
                    Unpaid Balance at Checkout
                  </span>
                  <span className="font-mono">
                    PKR {(checkoutReservation.remaining_balance ?? checkoutReservation.total_amount).toLocaleString()}
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={checkoutSettlePayment}
                    onChange={(e) => setCheckoutSettlePayment(e.target.checked)}
                    className="rounded border-slate-750 bg-slate-900 text-amber-500 focus:ring-0"
                  />
                  <span>Collect outstanding payment at Front Desk now</span>
                </label>
                {checkoutSettlePayment && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                      <select
                        value={checkoutPaymentMethod}
                        onChange={(e) => setCheckoutPaymentMethod(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      >
                        <option value="cash">Cash (Front Desk)</option>
                        <option value="card">Credit/Debit Card (Front Desk POS Demo)</option>
                        <option value="bank_transfer">Bank Transfer (Demo)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Amount to Collect (PKR)</label>
                      <input
                        type="number"
                        min="1"
                        max={checkoutReservation.total_amount}
                        value={checkoutPaymentAmount}
                        onChange={(e) => setCheckoutPaymentAmount(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Bill is fully settled. No outstanding balance to collect.</span>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCheckoutModalOpen(false);
                  setCheckoutReservation(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCheckOut}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                {isPending ? "Processing..." : "Confirm & Complete Check-Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Payment Collection Modal */}
      {paymentModalOpen && paymentTargetRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              Collect Guest Payment
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Record a payment received for booking{" "}
              <span className="text-white font-mono font-bold">
                RES-{String(paymentTargetRes.reservation_id).padStart(4, "0")}
              </span>{" "}
              ({paymentTargetRes.guest_name}).
            </p>

            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Room:</span>
                <span className="font-mono font-bold text-amber-400">Room {paymentTargetRes.room_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Billed:</span>
                <span className="font-mono text-white">PKR {paymentTargetRes.total_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid to Date:</span>
                <span className="font-mono text-emerald-400">
                  PKR {(paymentTargetRes.total_paid ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t border-slate-850 pt-2">
                <span className="text-slate-300">Remaining Balance:</span>
                <span className={`font-mono font-bold ${(paymentTargetRes.remaining_balance ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  PKR {(paymentTargetRes.remaining_balance ?? 0).toLocaleString()}
                </span>
              </div>
              {(paymentTargetRes.credit_balance ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-xs">
                  <span>Credit Balance:</span>
                  <span className="font-mono">PKR {paymentTargetRes.credit_balance!.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="cash">Cash (Front Desk)</option>
                  <option value="card">Credit/Debit Card (Front Desk POS Demo)</option>
                  <option value="bank_transfer">Bank Transfer (Demo)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Amount to Record (PKR)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-500 font-mono">
                    PKR
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={paymentTargetRes.total_amount}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="w-full pl-12 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setPaymentModalOpen(false);
                  setPaymentTargetRes(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={isPending || paymentAmount <= 0}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {isPending ? "Recording..." : `Collect PKR ${paymentAmount.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif">
              Cancel Reservation
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Please provide a reason for cancelling this reservation. The assigned room will immediately be returned to available inventory.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Cancellation Reason
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Walk-in Reservation Modal */}
      {walkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-amber-500" />
                  New Walk-In Reservation
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct front-desk reservation. Only rooms currently verified as Available can be assigned.
                </p>
              </div>
              <button
                onClick={() => setWalkInModalOpen(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWalkIn} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    First Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={walkInFirstName}
                    onChange={(e) => setWalkInFirstName(e.target.value.replace(/[\d\p{N}]/gu, ""))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text").replace(/[\d\p{N}]/gu, "");
                      setWalkInFirstName((prev) => (prev + text).slice(0, 50));
                    }}
                    placeholder="Guest First Name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Last Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={walkInLastName}
                    onChange={(e) => setWalkInLastName(e.target.value.replace(/[\d\p{N}]/gu, ""))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text").replace(/[\d\p{N}]/gu, "");
                      setWalkInLastName((prev) => (prev + text).slice(0, 50));
                    }}
                    placeholder="Guest Last Name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Phone Number <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(sanitizePhoneInput(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = sanitizePhoneInput(e.clipboardData.getData("text"));
                      setWalkInPhone(text);
                    }}
                    placeholder="03001234567 or +923001234567"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={walkInEmail}
                    onChange={(e) => setWalkInEmail(e.target.value)}
                    placeholder="guest@example.com (optional)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Room Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Assign Available Room <span className="text-amber-400">*</span>
                </label>
                <select
                  value={walkInRoomId || ""}
                  onChange={(e) => setWalkInRoomId(parseInt(e.target.value, 10))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select an available room...</option>
                  {availableRooms.map((rm) => (
                    <option key={rm.room_id} value={rm.room_id}>
                      Room {rm.room_number} – {rm.room_type} (Floor {rm.floor}) – PKR {rm.base_price.toLocaleString()}/night
                    </option>
                  ))}
                </select>
                {availableRooms.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">
                    No rooms are currently available. Check out departing guests or complete cleaning in Housekeeping.
                  </p>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Check-in Date <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={walkInCheckIn}
                    onChange={(e) => setWalkInCheckIn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Check-out Date <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={walkInCheckOut}
                    onChange={(e) => setWalkInCheckOut(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Occupants */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Adults
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={walkInAdults}
                    onChange={(e) => setWalkInAdults(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Children
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    value={walkInChildren}
                    onChange={(e) => setWalkInChildren(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              {/* Special Requests */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Special Requests / Guest Notes
                </label>
                <input
                  type="text"
                  value={walkInSpecialRequests}
                  onChange={(e) => setWalkInSpecialRequests(e.target.value)}
                  placeholder="Extra pillow, quiet room, late check-in..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Direct Check-in & Payment Options */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={walkInDirectCheckIn}
                      onChange={(e) => setWalkInDirectCheckIn(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs font-semibold text-white">
                      Direct Check-In Now (Guest is present at Front Desk)
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 pl-6">
                    Immediately transitions room status from Available to Occupied and logs active stay.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={walkInRecordPayment}
                      onChange={(e) => setWalkInRecordPayment(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs font-semibold text-white">
                      Record Payment Received at Front Desk (Demo / Internal)
                    </span>
                  </label>
                  {walkInRecordPayment && (
                    <div className="pl-6 pt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-400">Payment Method:</span>
                      <select
                        value={walkInPaymentMethod}
                        onChange={(e) => setWalkInPaymentMethod(e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                      >
                        <option value="cash">Cash (Front Desk)</option>
                        <option value="card">Card (Front Desk POS Demo)</option>
                        <option value="bank_transfer">Bank Transfer (Demo)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setWalkInModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !walkInRoomId}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer"
                >
                  {isPending ? "Creating..." : walkInDirectCheckIn ? "Check In Guest Now" : "Confirm Walk-In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
