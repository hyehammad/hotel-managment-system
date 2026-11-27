import Link from "next/link";
import { bookingsApi } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Users,
  Bed,
  CheckCircle2,
  Calendar,
  Sparkles,
  Coffee,
  Car,
  Clock,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let roomTypes: any[] = [];
  let services: any[] = [];

  try {
    const data = await bookingsApi.getPublicHome();
    roomTypes = data.roomTypes || [];
    services = data.services || [];
  } catch (err) {
    console.error("Failed to load public home data from API:", err);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-28 md:pt-28 md:pb-36 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-widest mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Karachi's Premier Boutique Residence
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight font-serif text-white max-w-4xl mx-auto leading-tight">
            Sophisticated Luxury &amp; <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Unmatched Comfort</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Welcome to Grand Horizon Hotel &amp; Suites. Book your peaceful sanctuary with direct reservation approval, luxury suites, and 24/7 dedicated guest services.
          </p>

          {/* Action Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/book"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold shadow-xl shadow-amber-500/20 transition transform hover:-translate-y-0.5 active:translate-y-0 text-base flex items-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              Check Availability &amp; Book
            </Link>
            <Link
              href="#rooms"
              className="px-8 py-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold transition text-base flex items-center gap-2"
            >
              Explore Our Suites
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Policy Highlights Banner */}
          <div className="mt-16 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">24-Hour Approval Hold</h4>
                <p className="text-xs text-slate-400 mt-1">Room held immediately upon submission awaiting staff confirmation.</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">No Prepayment Required</h4>
                <p className="text-xs text-slate-400 mt-1">Pay either online upon confirmation or at the hotel reception.</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white">Zero Booking Fees</h4>
                <p className="text-xs text-slate-400 mt-1">Direct booking guarantee with transparent room rate snapshots.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rooms and Suites Section */}
      <section id="rooms" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold text-amber-500 uppercase tracking-widest block mb-2">
            Accommodations
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold font-serif text-white">
            Choose Your Suite
          </h2>
          <p className="text-slate-400 mt-3 text-sm sm:text-base">
            Every room type is curated with fine bedding, climate control, and modern amenities designed for both relaxation and productivity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
          {roomTypes.map((rt: any) => {
            const availableRooms = rt.rooms.filter((r: any) => r.status === "available").length;
            const price = parseFloat(rt.base_price.toString());

            return (
              <div
                key={rt.room_type_id}
                className="group rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 transition-all duration-300 flex flex-col overflow-hidden hover:shadow-2xl hover:shadow-amber-500/5"
              >
                {/* Room Image Header / Gradient Accent */}
                <div className="h-52 bg-gradient-to-tr from-slate-900 via-slate-800 to-amber-950/40 p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between z-10">
                    <span className="px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-amber-400 text-xs font-semibold border border-amber-500/20">
                      {rt.bed_type || "Premium Bed"}
                    </span>
                    <span className="text-xs font-medium text-slate-300 bg-slate-950/60 px-2.5 py-1 rounded-md">
                      {availableRooms} room{availableRooms !== 1 ? "s" : ""} on property
                    </span>
                  </div>

                  <div className="z-10">
                    <h3 className="text-2xl font-bold font-serif text-white">
                      {rt.name}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                      {rt.description}
                    </p>
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                  {/* Capacity Specs */}
                  <div className="flex items-center gap-6 text-xs text-slate-400 border-b border-slate-800/80 pb-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-500" />
                      <span>Up to {rt.max_adults} Adult{rt.max_adults > 1 ? "s" : ""}</span>
                    </div>
                    {rt.max_children > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-400/80" />
                        <span>Up to {rt.max_children} Child{rt.max_children > 1 ? "ren" : ""}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Bed className="w-4 h-4 text-amber-500" />
                      <span>{rt.bed_type}</span>
                    </div>
                  </div>

                  {/* Amenities Tags */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                      Included Amenities
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {rt.room_type_amenities.map((rta: any) => (
                        <span
                          key={rta.amenity_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/70 text-slate-300 text-xs border border-slate-700/60"
                        >
                          <CheckCircle2 className="w-3 h-3 text-amber-500" />
                          {rta.amenities.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Price & Action */}
                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Rate per night</div>
                      <div className="text-2xl font-bold font-serif text-amber-400">
                        PKR {price.toLocaleString()}
                        <span className="text-xs font-normal text-slate-400 ml-1">/ night</span>
                      </div>
                    </div>

                    <Link
                      href={`/book?type=${rt.room_type_id}`}
                      className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition shadow-md shadow-amber-500/10 flex items-center gap-1.5"
                    >
                      Book This Suite
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Hotel Services Showcase */}
      <section id="amenities" className="py-20 bg-slate-900/40 border-t border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-semibold text-amber-500 uppercase tracking-widest block mb-2">
              Guest Services
            </span>
            <h2 className="text-3xl font-bold font-serif text-white">
              Enhance Your Experience
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Order gourmet dining, luxury spa sessions, and private airport transfers directly to your stay.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s) => (
              <div
                key={s.service_id}
                className="p-5 rounded-xl bg-slate-900 border border-slate-800/80 flex items-start gap-4 hover:border-slate-700 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  {s.category === "restaurant" && <Coffee className="w-5 h-5" />}
                  {s.category === "transport" && <Car className="w-5 h-5" />}
                  {s.category === "spa" && <Sparkles className="w-5 h-5" />}
                  {!["restaurant", "transport", "spa"].includes(s.category) && (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                    <span className="text-xs font-medium text-amber-400">
                      PKR {parseFloat(s.price.toString()).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-xs capitalize text-slate-400 mt-1 block">
                    Category: {s.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
