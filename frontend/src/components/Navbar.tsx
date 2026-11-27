import Link from "next/link";
import { Hotel, Calendar, Search, ShieldCheck } from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Hotel className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white block leading-tight font-serif">
              Grand Horizon
            </span>
            <span className="text-xs text-amber-400 font-medium tracking-widest uppercase block">
              Hotel & Suites
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link
            href="/#rooms"
            className="text-slate-300 hover:text-amber-400 transition-colors"
          >
            Rooms & Suites
          </Link>
          <Link
            href="/#amenities"
            className="text-slate-300 hover:text-amber-400 transition-colors"
          >
            Amenities
          </Link>
          <Link
            href="/lookup"
            className="flex items-center gap-2 text-slate-300 hover:text-amber-400 transition-colors"
          >
            <Search className="w-4 h-4" />
            Find My Booking
          </Link>
        </nav>

        {/* CTA Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/staff/login"
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800 transition"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            Staff Portal
          </Link>
          <Link
            href="/book"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-medium shadow-md shadow-amber-500/10 transition active:scale-95"
          >
            <Calendar className="w-4 h-4" />
            Book Now
          </Link>
        </div>
      </div>
    </header>
  );
}
