"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { staffLogin } from "@/app/actions/auth";
import { Hotel, Lock, User, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";

const DEMO_ACCOUNTS = [
  { role: "Admin", username: "admin", password: "Admin123!@#" },
  { role: "Manager", username: "manager", password: "Manager123!@#" },
  { role: "Receptionist", username: "receptionist", password: "Receptionist123!@#" },
  { role: "Housekeeping", username: "housekeeper", password: "Housekeeping123!@#" },
  { role: "Maintenance", username: "maintenance", password: "Maintenance123!@#" },
];

export default function LoginClient() {
  const [state, formAction, isPending] = useActionState(staffLogin, null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const fillCredentials = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12 relative overflow-hidden text-slate-100">
      {/* Background radial glow */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 group mb-4"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Hotel className="w-6 h-6 text-amber-500" />
              </div>
            </div>
            <div className="text-left">
              <span className="font-serif text-xl font-bold tracking-tight text-white block">
                Grand Horizon
              </span>
              <span className="text-[10px] uppercase tracking-widest text-amber-500/80 font-medium block">
                Staff &amp; Management Portal
              </span>
            </div>
          </Link>
          <p className="text-xs text-slate-400">
            Sign in with your staff credentials to access role-specific operations
          </p>
        </div>

        {/* Card Form */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-7 shadow-2xl backdrop-blur-xl">
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <span className="font-semibold">Error:</span> {state.error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Staff Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. manager, receptionist, housekeeper"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer mt-2"
            >
              {isPending ? (
                <>Verifying Credentials...</>
              ) : (
                <>
                  Access Dashboard
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Fill Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-2.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              Quick-Fill Staff Accounts (Click to test):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => fillCredentials(acc.username, acc.password)}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-[11px] font-medium text-slate-300 transition cursor-pointer"
                >
                  {acc.role}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-5">
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-amber-400 transition"
          >
            &larr; Return to Guest Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
