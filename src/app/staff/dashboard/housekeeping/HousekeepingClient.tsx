"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { submitHousekeepingRoomStatus, markNotificationRead } from "@/app/actions/staff";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Bell,
  BedDouble,
  Wrench,
} from "lucide-react";

interface TaskItem {
  task_id: number;
  room_id: number;
  room_number: string;
  room_type: string;
  floor: number | null;
  status: "pending" | "in_progress" | "done";
  assigned_to: string;
  assigned_to_id: number | null;
  notes: string;
  created_at: string;
  completed_at: string | null;
}

interface RoomCleaningItem {
  room_id: number;
  room_number: string;
  floor: number | null;
  room_type: string;
  status: string;
}

interface RoomMaintenanceItem {
  room_id: number;
  room_number: string;
  floor: number | null;
  room_type: string;
  status: string;
  notes: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: string;
  roomNumber?: string;
}

export default function HousekeepingClient({
  data,
  currentUserRole,
  highlightTaskId,
  highlightRoom,
}: {
  data: {
    pendingTasks: TaskItem[];
    inProgressTasks: TaskItem[];
    completedTasks: TaskItem[];
    roomsAwaitingCleaning: RoomCleaningItem[];
    roomsWaitingForMaintenance?: RoomMaintenanceItem[];
    notifications: NotificationItem[];
  };
  currentUserRole: string;
  highlightTaskId?: number;
  highlightRoom?: string;
}) {
  const [selectedActionRoom, setSelectedActionRoom] = useState<number | null>(null);
  const [maintenanceComment, setMaintenanceComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightTaskId || highlightRoom) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightTaskId, highlightRoom]);

  // Combine rooms requiring attention
  const activeRooms = data.roomsAwaitingCleaning;
  const inProgressList = data.inProgressTasks;
  const pendingList = data.pendingTasks;

  // Handle the single 3-option dropdown change
  const handleDropdownChange = (
    roomId: number,
    value: "in_progress" | "cleaned" | "need_maintenance"
  ) => {
    setFeedback(null);

    if (value === "need_maintenance") {
      // Open the inline comment field for this room
      setSelectedActionRoom(roomId);
      setMaintenanceComment("");
      return;
    }

    setSelectedActionRoom(null);
    startTransition(async () => {
      const res = await submitHousekeepingRoomStatus(roomId, value);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Room status updated." });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to update room." });
      }
    });
  };

  const handleMaintenanceSubmit = (roomId: number) => {
    if (!maintenanceComment.trim()) {
      setFeedback({ type: "error", text: "Please enter a comment describing the maintenance problem." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await submitHousekeepingRoomStatus(roomId, "need_maintenance", maintenanceComment);
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Maintenance request dispatched." });
        setSelectedActionRoom(null);
        setMaintenanceComment("");
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to submit request." });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-serif font-bold text-white flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-emerald-400" />
          Housekeeping – Room Cleanliness
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage room turnaround. Select a status for each room to update cleaning progress, complete turnover, or dispatch maintenance.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {feedback.text}
        </div>
      )}

      {/* Summary Counters */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Awaiting Cleaning
          </div>
          <div className="text-2xl font-bold font-serif text-white mt-1">
            {activeRooms.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            In Progress
          </div>
          <div className="text-2xl font-bold font-serif text-white mt-1">
            {inProgressList.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Cleaned Today
          </div>
          <div className="text-2xl font-bold font-serif text-white mt-1">
            {data.completedTasks.length}
          </div>
        </div>
      </div>

      {/* Main Room Cleanliness Table with Single Status Dropdown */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Rooms Assigned for Cleaning
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            {pendingList.length + inProgressList.length} rooms in queue
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Room</th>
                <th className="py-3 px-4">Floor / Category</th>
                <th className="py-3 px-4">Current Cleaning State</th>
                <th className="py-3 px-4">Turnover Notes</th>
                <th className="py-3 px-4 text-right">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pendingList.length === 0 && inProgressList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500 text-xs">
                    No rooms currently requiring cleaning. All rooms are clean.
                  </td>
                </tr>
              ) : (
                [...inProgressList, ...pendingList].map((t) => {
                  const isInProgress = t.status === "in_progress";
                  const isCommentOpen = selectedActionRoom === t.room_id;
                  const isTarget = t.task_id === highlightTaskId || t.room_number === highlightRoom;

                  return (
                    <tr
                      key={t.task_id}
                      ref={isTarget ? highlightRef : undefined}
                      className={`transition ${
                        isTarget
                          ? "bg-violet-950/40 ring-2 ring-violet-500"
                          : "hover:bg-slate-850/40"
                      }`}
                    >
                      <td className="py-3.5 px-4 font-serif font-bold text-white text-sm">
                        Room {t.room_number}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        <div>{t.room_type}</div>
                        <div className="text-slate-500 text-[11px]">Floor {t.floor}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            isInProgress
                              ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {isInProgress ? "In Progress" : "Pending Cleaning"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 max-w-xs">
                        {t.notes}
                      </td>

                      {/* Single Status Dropdown with 3 options */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex flex-col items-end gap-2">
                          <select
                            disabled={isPending}
                            value={isCommentOpen ? "need_maintenance" : isInProgress ? "in_progress" : ""}
                            onChange={(e) =>
                              handleDropdownChange(
                                t.room_id,
                                e.target.value as "in_progress" | "cleaned" | "need_maintenance"
                              )
                            }
                            className="py-1.5 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                          >
                            <option value="" disabled>
                              Select Status...
                            </option>
                            <option value="in_progress">In Progress</option>
                            <option value="cleaned">Cleaned</option>
                            <option value="need_maintenance">Need Maintenance</option>
                          </select>

                          {/* Inline comment field when Need Maintenance is selected */}
                          {isCommentOpen && (
                            <div className="w-72 p-3 rounded-lg bg-slate-950 border border-orange-500/40 text-left space-y-2 mt-1 shadow-lg">
                              <label className="block text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
                                Describe Maintenance Issue
                              </label>
                              <input
                                type="text"
                                value={maintenanceComment}
                                onChange={(e) => setMaintenanceComment(e.target.value)}
                                placeholder="e.g. Air conditioning is not working properly."
                                className="w-full p-2 rounded-md bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedActionRoom(null)}
                                  className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMaintenanceSubmit(t.room_id)}
                                  disabled={isPending || !maintenanceComment.trim()}
                                  className="px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-slate-950 font-semibold text-[11px] rounded-md transition"
                                >
                                  Submit Request
                                </button>
                              </div>
                            </div>
                          )}
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

      {/* Rooms Awaiting Maintenance Section */}
      {data.roomsWaitingForMaintenance && data.roomsWaitingForMaintenance.length > 0 && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-2 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-orange-400" />
            Rooms Awaiting Maintenance ({data.roomsWaitingForMaintenance.length})
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            These rooms are currently under active repair or blocked by maintenance. Cleaning turnover will be dispatched once technicians complete repairs.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data.roomsWaitingForMaintenance.map((r) => (
              <div key={r.room_id} className="p-3 rounded-lg bg-slate-950 border border-orange-500/30 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Room {r.room_number}</span>
                  <span className="text-[10px] uppercase font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                    Maintenance
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{r.room_type} (Floor {r.floor})</div>
                {r.notes && (
                  <div className="text-[11px] text-amber-300/80 italic mt-1 line-clamp-2">
                    Issue: {r.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checkout Notifications Section */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-amber-400" />
          Recent Checkout Notifications
        </h3>

        {data.notifications.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 text-center">
            No recent checkout notifications.
          </div>
        ) : (
          <div className="space-y-2">
            {data.notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  startTransition(async () => {
                    await markNotificationRead(notif.id);
                  });
                }}
                className="p-3 rounded-lg bg-slate-950 hover:bg-slate-850 hover:border-emerald-500/30 cursor-pointer transition border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{notif.title}</span>
                  <span className="text-slate-400 ml-2">{notif.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  {notif.roomNumber && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-amber-400">
                      Room {notif.roomNumber}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(notif.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
