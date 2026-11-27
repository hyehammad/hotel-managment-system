"use client";

import { useState } from "react";
import {
  ClipboardList,
  Search,
  Filter,
  User,
  Clock,
  BedDouble,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { ActivityLogItem } from "@/lib/events";

export default function ActivityClient({
  initialLogs,
  currentUserRole,
}: {
  initialLogs: ActivityLogItem[];
  currentUserRole: string;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const filtered = logs.filter((log) => {
    const matchesRole =
      roleFilter === "all" || log.staffRole.toLowerCase() === roleFilter.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      !query ||
      log.staffName.toLowerCase().includes(query) ||
      log.action.toLowerCase().includes(query) ||
      log.details.toLowerCase().includes(query) ||
      (log.roomNumber && log.roomNumber.toLowerCase().includes(query));

    return matchesRole && matchesQuery;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-amber-500" />
          Operational Activity History &amp; Audit Trail
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Complete accountability record of check-ins, check-outs, room status transitions, cleaning turnovers, and maintenance repairs.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search activity records by employee name, action, room number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {["all", "admin", "manager", "receptionist", "housekeeping", "maintenance"].map((rf) => (
            <button
              key={rf}
              onClick={() => setRoleFilter(rf)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider capitalize whitespace-nowrap transition cursor-pointer ${
                roleFilter === rf
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {rf}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Departmental Role</th>
                <th className="py-3.5 px-4">Action Executed</th>
                <th className="py-3.5 px-4">Operational Details</th>
                <th className="py-3.5 px-4 text-right">Room Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    No activity logs recorded matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const roleLower = log.staffRole.toLowerCase();

                  return (
                    <tr key={log.id} className="hover:bg-slate-850/40 transition">
                      <td className="py-4 px-4 text-xs text-slate-400 font-mono whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>

                      <td className="py-4 px-4 font-medium text-white">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          {log.staffName}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            roleLower === "admin"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : roleLower === "manager"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : roleLower === "receptionist"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : roleLower === "maintenance"
                              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {log.staffRole}
                        </span>
                      </td>

                      <td className="py-4 px-4 font-semibold text-amber-300/90 text-xs">
                        {log.action}
                      </td>

                      <td className="py-4 px-4 text-xs text-slate-300 max-w-md">
                        {log.details}
                      </td>

                      <td className="py-4 px-4 text-right">
                        {log.roomNumber ? (
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                            Room {log.roomNumber}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
