"use client";

import { useState, useTransition } from "react";
import { submitGuestBooking, checkRoomTypeAvailability, BookingResult } from "@/app/actions/booking";
import Link from "next/link";
import {
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

interface RoomTypeData {
  room_type_id: number;
  name: string;
  description: string | null;
  base_price: number;
  max_adults: number;
  max_children: number;
  bed_type: string | null;
}

export default function BookingClient({
  roomTypes,
  initialRoomTypeId,
}: {
  roomTypes: RoomTypeData[];
  initialRoomTypeId?: number;
}) {
  // Form State
  const [selectedTypeId, setSelectedTypeId] = useState<number>(
    initialRoomTypeId && roomTypes.some((r) => r.room_type_id === initialRoomTypeId)
      ? initialRoomTypeId
      : roomTypes[0]?.room_type_id || 1
  );

  // Default dates: tomorrow to day after tomorrow
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const [checkInDate, setCheckInDate] = useState<string>(formatDate(tomorrow));
  const [checkOutDate, setCheckOutDate] = useState<string>(formatDate(dayAfter));
  const [adults, setAdults] = useState<number>(1);
  const [children, setChildren] = useState<number>(0);

  // Guest Details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "Other">("M");
  const [nationality, setNationality] = useState("Pakistani");
  const [specialRequests, setSpecialRequests] = useState("");

  // Availability & Submit States
  const [isPending, startTransition] = useTransition();
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calculations
  const selectedRoomType = roomTypes.find((r) => r.room_type_id === selectedTypeId);
  const pricePerNight = selectedRoomType ? selectedRoomType.base_price : 0;

  const d1 = new Date(checkInDate);
  const d2 = new Date(checkOutDate);
  const diffTime = d2.getTime() - d1.getTime();
  const totalNights = diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
  const estimatedTotal = totalNights * pricePerNight;

  // Handle availability check
  const handleCheckAvailability = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await checkRoomTypeAvailability(selectedTypeId, checkInDate, checkOutDate);
      if (res.available) {
        setIsAvailable(true);
        setAvailabilityMessage(`✓ Rooms available! (${res.availableCount} available for these dates)`);
      } else {
        setIsAvailable(false);
        setAvailabilityMessage(res.message || "No rooms of this type available for these dates.");
      }
    });
  };

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (totalNights <= 0) {
      setErrorMessage("Check-out date must be after check-in date.");
      return;
    }

    if (!firstName || !lastName || !phone) {
      setErrorMessage("Please complete all required fields (Name and Phone Number).");
      return;
    }

    startTransition(async () => {
      const result = await submitGuestBooking({
        roomTypeId: selectedTypeId,
        checkInDate,
        checkOutDate,
        adults,
        children,
        firstName,
        lastName,
        email,
        phone,
        gender,
        nationality,
        specialRequests,
      });

      if (result.success) {
        setBookingResult(result);
      } else {
        setErrorMessage(result.message || "Failed to submit booking.");
      }
    });
  };

  // If booking succeeded, show confirmation screen
  if (bookingResult && bookingResult.success) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              Reservation Submitted
            </span>
            <h2 className="text-3xl font-bold font-serif text-white mt-2">
              Thank You, {firstName}!
            </h2>
            <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
              Your booking request has been securely recorded in our reservation system.
            </p>
          </div>

          {/* Reference Card */}
          <div className="mt-8 p-6 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs text-slate-400 uppercase tracking-wider">
                Booking Reference
              </span>
              <span className="text-xl font-bold text-amber-400 font-mono tracking-wider">
                {bookingResult.referenceCode}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Suite Type</span>
                <span className="text-white font-medium text-sm">
                  {bookingResult.roomTypeName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Assigned Room</span>
                <span className="text-white font-medium text-sm">
                  Room {bookingResult.roomNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Check-in</span>
                <span className="text-white font-medium text-sm">{checkInDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Check-out</span>
                <span className="text-white font-medium text-sm">{checkOutDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Duration</span>
                <span className="text-white font-medium text-sm">
                  {bookingResult.totalNights} Night{bookingResult.totalNights! > 1 ? "s" : ""}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Estimated Total</span>
                <span className="text-amber-400 font-bold text-sm">
                  PKR {bookingResult.estimatedTotal?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 24-Hour Approval Policy Alert */}
          <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-xs text-amber-300">
            <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-semibold block text-amber-200">
                Staff Approval Policy (24-Hour Hold)
              </span>
              Your room is currently locked and held for you. Hotel front desk staff will review and approve your reservation within 24 hours. Payment is settled upon check-in or via online confirmation.
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 justify-center">
            <Link
              href={`/lookup?ref=${bookingResult.referenceCode}&contact=${encodeURIComponent(phone)}`}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition text-center shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
            >
              Check My Booking Status
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition text-center"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-10">
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-500 block mb-1">
          Online Reservations
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold font-serif text-white">
          Reserve Your Stay
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          Select your dates, review room options, and lock in your reservation with direct staff approval.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3 text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Select Room and Dates */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold text-lg border-b border-slate-800 pb-3">
            <Calendar className="w-5 h-5 text-amber-500" />
            <span>1. Dates &amp; Room Selection</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Check-in Date (After 2:00 PM)
              </label>
              <input
                type="date"
                min={formatDate(today)}
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Check-out Date (Before 12:00 PM)
              </label>
              <input
                type="date"
                min={checkInDate}
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>
          </div>

          {/* Room Type Selector */}
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-2">
              Choose Suite Category
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {roomTypes.map((rt) => {
                const isSelected = rt.room_type_id === selectedTypeId;
                return (
                  <button
                    type="button"
                    key={rt.room_type_id}
                    onClick={() => {
                      setSelectedTypeId(rt.room_type_id);
                      setIsAvailable(null);
                      setAvailabilityMessage(null);
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-amber-500/10 border-amber-500 text-white shadow-md shadow-amber-500/10"
                        : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold text-sm">{rt.name}</div>
                    <div className="text-xs text-amber-400 font-bold mt-1">
                      PKR {rt.base_price.toLocaleString()}
                      <span className="text-[10px] text-slate-400 font-normal">/nt</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>Max {rt.max_adults} Adults</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Guests count */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Adults
              </label>
              <select
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} Adult{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Children
              </label>
              <select
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} Child{n > 1 ? "ren" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={handleCheckAvailability}
                disabled={isPending}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition border border-slate-700 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                {isPending ? "Checking..." : "Verify Availability"}
              </button>
            </div>
          </div>

          {availabilityMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                isAvailable
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
              }`}
            >
              {isAvailable ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{availabilityMessage}</span>
            </div>
          )}
        </div>

        {/* Step 2: Guest Details */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold text-lg border-b border-slate-800 pb-3">
            <Users className="w-5 h-5 text-amber-500" />
            <span>2. Guest Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                First Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ahmed"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Last Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Khan"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Phone Number <span className="text-amber-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 300 1234567"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Email Address (Optional for verification)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmed.khan@example.com"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Gender
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "M" | "F" | "Other")}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Nationality
              </label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="Pakistani"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">
              Special Requests or Arrival Notes
            </label>
            <textarea
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="e.g. Quiet room preferred, arriving after 8:00 PM, extra towels..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
            />
          </div>
        </div>

        {/* Rate Summary & Submit Bar */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/20 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-xs text-slate-400">
              Estimated Total ({totalNights} Night{totalNights > 1 ? "s" : ""})
            </div>
            <div className="text-3xl font-bold font-serif text-amber-400">
              PKR {estimatedTotal > 0 ? estimatedTotal.toLocaleString() : "0"}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Includes room rate snapshot and applicable hotel room levies.
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || totalNights <= 0}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-slate-950 font-bold text-base transition shadow-xl shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span>Confirming Lock...</span>
            ) : (
              <>
                <span>Confirm &amp; Request Reservation</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
