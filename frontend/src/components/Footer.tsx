import Link from "next/link";
import { Hotel, Phone, Mail, MapPin, Shield } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Hotel className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-white font-serif">
                Grand Horizon
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">
              Luxury hospitality, refined comfort, and premium room suites tailored for leisure and business guests.
            </p>
            <div className="text-xs text-amber-500/80 font-mono">
              Times displayed in Asia/Karachi (PKT)
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/#rooms" className="hover:text-amber-400 transition">
                  Browse Rooms & Suites
                </Link>
              </li>
              <li>
                <Link href="/book" className="hover:text-amber-400 transition">
                  Check Availability & Book
                </Link>
              </li>
              <li>
                <Link href="/lookup" className="hover:text-amber-400 transition">
                  Manage / Lookup Booking
                </Link>
              </li>
              <li>
                <Link href="/staff/login" className="hover:text-amber-400 transition flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-500" />
                  Staff Management Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Hotel Policies
            </h3>
            <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
              <li>• Check-in: 2:00 PM (14:00)</li>
              <li>• Check-out: 12:00 PM (12:00)</li>
              <li>• Online booking requests hold for 24 hours awaiting staff approval.</li>
              <li>• Valid CNIC or Passport required upon arrival.</li>
            </ul>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wider uppercase mb-4">
              Contact & Location
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>Clifton Block 4, Marine Drive, Karachi, Pakistan</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                <span>+92 (21) 3587-0099</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                <span>reservations@grandhorizon.hotel</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-900 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Grand Horizon Hotel & Suites. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Powered by MySQL 8 & Next.js Full-Stack Architecture
          </p>
        </div>
      </div>
    </footer>
  );
}
