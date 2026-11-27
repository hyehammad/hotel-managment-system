"use client";

import { useState, useTransition, useEffect } from "react";
import { lookupGuestBooking } from "@/app/actions/booking";
import Link from "next/link";
import {
  Search,
  Calendar,
  Bed,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  ArrowRight,
} from "lucide-react";

export default function LookupClient({
  initialRef,
  initialContact,
}: {
  initialRef?: string;
  initialContact?: string;
}) {
  const [refInput, setRefInput] = useState(initialRef || "");
  const [contactInput, setContactInput] = useState(initialContact || "");
  const [isPending, startTransition] = useTransition();
  const [bookingData, setBookingData] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performLookup = (ref: string, contact: string) => {
    if (!ref.trim() || !contact.trim()) return;
    setErrorMessage(null);
    startTransition(async () => {
      const res = await lookupGuestBooking(ref, contact);
      if (res.success && res.booking) {
        setBookingData(res.booking);
      } else {
        setBookingData(null);
        setErrorMessage(res.message || "No matching reservation found.");
      }
    });
  };

  useEffect(() => {
    if (initialRef && initialContact) {
      performLookup(initialRef, initialContact);
    }
  }, [initialRef, initialContact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(refInput, contactInput);
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-10">
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-500 block mb-1">
          Guest Self-Service
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold font-serif text-white">
          Find Your Reservation
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          Enter your Booking Reference number and the contact email or phone number used during reservation.
        </p>
      </div>

      {/* Lookup Search Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl mb-10">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Booking Reference <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. RES-0001 or 1"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Contact Email or Phone <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. +92300... or email"
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold text-sm transition shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isPending ? "Searching System..." : "Search Reservation"}
          </button>
        </form>
      </div>

      {/* Error State */}
      {errorMessage && (
        <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Record Not Found</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Booking Details Card */}
      {bookingData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 animate-in fade-in duration-300 shadow-2xl">
          {/* Header & Status Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <span className="text-xs font-mono text-slate-400 block">
                REFERENCE CODE
              </span>
              <h2 className="text-2xl font-bold font-mono text-amber-400 tracking-wider">
                {bookingData.referenceCode}
              </h2>
              <span className="text-xs text-slate-400 mt-1 block">
                Guest: <strong className="text-white">{bookingData.guest.name}</strong>
              </span>
            </div>

            {/* Status Pill */}
            <div>
              {bookingData.status === "pending" && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Clock className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Pending Staff Approval</span>
                </div>
              )}
              {bookingData.status === "confirmed" && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Reservation Confirmed</span>
                </div>
              )}
              {bookingData.status === "checked_in" && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Currently Checked-in</span>
                </div>
              )}
              {bookingData.status === "cancelled" && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                  <XCircle className="w-4 h-4" />
                  <span>Reservation Cancelled</span>
                </div>
              )}
            </div>
          </div>

          {/* Pending 24H Policy Explainer Banner */}
          {bookingData.status === "pending" && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-3">
              <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold block text-amber-200">
                  Awaiting Staff Confirmation (24-Hour Approval Window)
                </span>
                Your room has been temporarily held for you. Hotel front desk staff will review and confirm your booking. If not confirmed within 24 hours of submission, pending hold will automatically expire.
              </div>
            </div>
          )}

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs uppercase text-slate-400 font-semibold block flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-500" />
                Stay Schedule
              </span>
              <div className="text-xs text-slate-300">
                Check-in: <strong className="text-white">{bookingData.checkInDate}</strong> (14:00)
              </div>
              <div className="text-xs text-slate-300">
                Check-out: <strong className="text-white">{bookingData.checkOutDate}</strong> (12:00)
              </div>
              <div className="text-xs text-slate-400">
                Total Duration: <strong className="text-amber-400">{bookingData.room.totalNights} Night{bookingData.room.totalNights > 1 ? "s" : ""}</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs uppercase text-slate-400 font-semibold block flex items-center gap-1.5">
                <Bed className="w-4 h-4 text-amber-500" />
                Suite &amp; Room Assignment
              </span>
              <div className="text-xs text-slate-300">
                Category: <strong className="text-white">{bookingData.room.typeName}</strong>
              </div>
              <div className="text-xs text-slate-300">
                Room Number: <strong className="text-amber-400">{bookingData.room.roomNumber}</strong>
              </div>
              <div className="text-xs text-slate-400">
                Guests: {bookingData.adults} Adult{bookingData.adults > 1 ? "s" : ""}{bookingData.children > 0 ? `, ${bookingData.children} Child` : ""}
              </div>
            </div>
          </div>

          {/* Pricing & Rate Snapshot */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block">Rate per night snapshot</span>
              <span className="text-sm font-semibold text-white">
                PKR {bookingData.room.ratePerNight.toLocaleString()} / night
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Total Estimated Amount</span>
              <span className="text-xl font-bold font-serif text-amber-400">
                PKR {bookingData.room.totalEstimated.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Payment History */}
          {bookingData.payments && bookingData.payments.length > 0 && (
            <div className="border-t border-slate-800 pt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-500" />
                Recorded Payments
              </h4>
              <div className="space-y-2">
                {bookingData.payments.map((p: any) => (
                  <div
                    key={p.paymentId}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="capitalize font-medium text-white">{p.method} Payment</span>
                      <span className="text-[11px] text-slate-400 block">{new Date(p.paidAt).toLocaleDateString()}</span>
                    </div>
                    <span className="font-bold text-emerald-400">
                      PKR {p.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bookingData.specialRequests && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <strong className="text-slate-400 block mb-1">Special Requests:</strong>
              {bookingData.specialRequests}
            </div>
          )}

          <div className="border-t border-slate-800 pt-5 flex items-center justify-between">
            <Link
              href="/book"
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium"
            >
              Book Another Stay
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-slate-500">
              Need to cancel or adjust? Contact hotel front desk.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
