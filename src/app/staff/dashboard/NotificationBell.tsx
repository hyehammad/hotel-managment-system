"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, ExternalLink, Sparkles, Wrench, Calendar, LogOut, CheckCircle2 } from "lucide-react";
import { markNotificationRead, markAllStaffNotificationsRead } from "@/app/actions/staff";
import type { NotificationItem } from "@/lib/events";

export default function NotificationBell({
  notifications: initialNotifications,
  role,
}: {
  notifications: NotificationItem[];
  role: string;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = (item: NotificationItem) => {
    startTransition(async () => {
      await markNotificationRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
    });

    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllStaffNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });
  };

  const getIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "checkout":
      case "cleaning":
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case "maintenance":
      case "serious_issue":
        return <Wrench className="w-4 h-4 text-orange-400" />;
      case "online_booking":
      case "checkin":
        return <Calendar className="w-4 h-4 text-indigo-400" />;
      default:
        return <Bell className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center shadow-sm"
        title="Live Department Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono font-bold text-[10px] flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Notifications
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {role}
                </span>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={isPending}
                  className="text-[11px] text-slate-400 hover:text-amber-400 transition cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-850">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No notifications for {role}.
                </div>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3.5 hover:bg-slate-850/60 transition cursor-pointer flex items-start gap-3 ${
                      !n.read ? "bg-slate-850/30" : ""
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-950 border border-slate-800 shrink-0">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>
                          {new Date(n.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {n.roomNumber && (
                          <span className="text-amber-400 font-semibold">
                            Room {n.roomNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
