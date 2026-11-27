"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  startMaintenanceTask,
  completeMaintenanceTask,
  requestCleaningFromMaintenance,
  escalateSeriousIssue,
  startSeriousEscalationRepair,
  completeSeriousEscalationRepair,
  markNotificationRead,
} from "@/app/actions/staff";
import {
  Wrench,
  CheckCircle2,
  Clock,
  User,
  Play,
  Bell,
  History,
  AlertCircle,
  ShieldAlert,
  Send,
  Building,
  Check,
  Sparkles,
} from "lucide-react";
import type { SeriousIssueItem } from "@/lib/events";

interface MaintTaskItem {
  task_id: number;
  room_id: number;
  room_number: string;
  room_type: string;
  floor: number | null;
  status: "pending" | "in_progress" | "done";
  assigned_to: string;
  assigned_to_id: number | null;
  issue_description: string;
  request_source?: string;
  created_at: string;
  completed_at: string | null;
}

interface RoomMaintItem {
  room_id: number;
  room_number: string;
  floor: number | null;
  room_type: string;
  status: string;
  notes?: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: string;
  roomNumber?: string;
}

export default function MaintenanceClient({
  data,
  seriousIssues,
  currentUserRole,
  initialTab,
  highlightEscalationId,
  highlightTaskId,
}: {
  data: {
    pendingRepairs: MaintTaskItem[];
    inProgressRepairs: MaintTaskItem[];
    completedRepairs: MaintTaskItem[];
    roomsUnderMaintenance: RoomMaintItem[];
    notifications: NotificationItem[];
  };
  seriousIssues: SeriousIssueItem[];
  currentUserRole: string;
  initialTab?: "pending" | "in_progress" | "serious" | "rooms" | "completed" | "notifications";
  highlightEscalationId?: string;
  highlightTaskId?: number;
}) {
  const [activeTab, setActiveTab] = useState<
    "pending" | "in_progress" | "serious" | "rooms" | "completed" | "notifications"
  >(
    initialTab ||
      (highlightEscalationId
        ? "serious"
        : highlightTaskId
        ? "pending"
        : "pending")
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Complete Repair Modal (Normal repairs)
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [requestCleaningAfterRepair, setRequestCleaningAfterRepair] = useState(true);

  // Report Serious Issue Modal (Only in Maintenance)
  const [seriousModalOpen, setSeriousModalOpen] = useState(false);
  const [seriousRoomNumber, setSeriousRoomNumber] = useState("");
  const [seriousTitle, setSeriousTitle] = useState("");
  const [seriousDescription, setSeriousDescription] = useState("");
  const [seriousEstimatedCost, setSeriousEstimatedCost] = useState("");

  // Complete Serious Issue Modal
  const [completeSeriousModalOpen, setCompleteSeriousModalOpen] = useState(false);
  const [selectedSeriousIssue, setSelectedSeriousIssue] = useState<SeriousIssueItem | null>(null);
  const [seriousCompletionNotes, setSeriousCompletionNotes] = useState("");

  const highlightRef = useRef<HTMLTableRowElement | HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightEscalationId) {
      setActiveTab("serious");
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    } else if (highlightTaskId) {
      const inProg = data.inProgressRepairs.some((t) => t.task_id === highlightTaskId);
      if (inProg) {
        setActiveTab("in_progress");
      } else {
        setActiveTab("pending");
      }
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightEscalationId, highlightTaskId, data]);

  const handleStartRepair = (taskId: number, roomNumber: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await startMaintenanceTask(taskId);
      if (res.success) {
        setMessage({
          type: "success",
          text: `Repair started for Room ${roomNumber}. Status updated to 'In Progress'.`,
        });
      } else {
        setMessage({ type: "error", text: res.error || "Failed to start repair." });
      }
    });
  };

  const handleOpenCompleteModal = (taskId: number, roomNumber: string) => {
    setSelectedTaskId(taskId);
    setSelectedRoomNumber(roomNumber);
    setResolutionNotes("");
    setCompleteModalOpen(true);
  };

  const handleConfirmComplete = () => {
    if (!selectedTaskId) return;
    setMessage(null);
    startTransition(async () => {
      const res = await completeMaintenanceTask(
        selectedTaskId,
        resolutionNotes,
        requestCleaningAfterRepair
      );
      if (res.success) {
        setMessage({
          type: "success",
          text: `Repair completed for Room ${selectedRoomNumber}. ${requestCleaningAfterRepair ? "Turnover cleaning dispatched to Housekeeping." : "System verified room status."}`,
        });
        setCompleteModalOpen(false);
      } else {
        setMessage({ type: "error", text: res.error || "Failed to complete repair task." });
      }
    });
  };

  const handleRequestCleaning = (roomId: number, roomNumber: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await requestCleaningFromMaintenance(roomId);
      if (res.success) {
        setMessage({
          type: "success",
          text: res.message || `Cleaning requested for Room ${roomNumber}.`,
        });
      } else {
        setMessage({ type: "error", text: res.error || "Failed to request cleaning." });
      }
    });
  };

  const handleSubmitSeriousIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seriousTitle.trim() || !seriousDescription.trim()) {
      setMessage({ type: "error", text: "Please provide a title and detailed problem description." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const res = await escalateSeriousIssue(
        seriousRoomNumber || undefined,
        seriousTitle,
        seriousDescription,
        seriousEstimatedCost || undefined
      );

      if (res.success) {
        setMessage({
          type: "success",
          text: "Serious issue submitted with status 'WAITING FOR APPROVAL'. Manager and Administrator notified.",
        });
        setSeriousModalOpen(false);
        setSeriousRoomNumber("");
        setSeriousTitle("");
        setSeriousDescription("");
        setSeriousEstimatedCost("");
        setActiveTab("serious");
      } else {
        setMessage({ type: "error", text: res.error || "Failed to submit serious issue." });
      }
    });
  };

  // Serious Escalation Lifecycle: Step 3 (Start Maintenance)
  const handleStartSeriousMaintenance = (issueId: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await startSeriousEscalationRepair(issueId);
      if (res.success) {
        setMessage({
          type: "success",
          text: "Serious maintenance started! Status updated to 'MAINTENANCE IN PROGRESS'.",
        });
      } else {
        setMessage({ type: "error", text: res.error || "Failed to start maintenance." });
      }
    });
  };

  // Serious Escalation Lifecycle: Step 4 (Complete Maintenance)
  const handleOpenCompleteSeriousModal = (issue: SeriousIssueItem) => {
    setSelectedSeriousIssue(issue);
    setSeriousCompletionNotes("");
    setCompleteSeriousModalOpen(true);
  };

  const handleConfirmCompleteSerious = () => {
    if (!selectedSeriousIssue) return;
    setMessage(null);
    startTransition(async () => {
      const res = await completeSeriousEscalationRepair(
        selectedSeriousIssue.id,
        seriousCompletionNotes
      );
      if (res.success) {
        setMessage({
          type: "success",
          text: `Serious maintenance completed! Room ${selectedSeriousIssue.roomNumber || ""} returned to service (or cleaning queue if turnover is needed).`,
        });
        setCompleteSeriousModalOpen(false);
        setSelectedSeriousIssue(null);
      } else {
        setMessage({ type: "error", text: res.error || "Failed to complete maintenance." });
      }
    });
  };

  const pendingSeriousCount = seriousIssues.filter(
    (i) => i.status === "pending_approval"
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white flex items-center gap-3">
            <Wrench className="w-7 h-7 text-amber-500" />
            Maintenance Operations
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Resolve normal room repairs dispatched from Housekeeping/Reception, or report serious issues requiring management authorization.
          </p>
        </div>

        {/* Section 2 B: Report Issue button specifically for serious problems */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSeriousModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-2 shadow-md shadow-red-950/40"
          >
            <ShieldAlert className="w-4 h-4" />
            Report Issue (Serious / Major)
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab("pending")}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === "pending"
              ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Pending Normal Repairs
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {data.pendingRepairs.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Awaiting technician pickup</div>
        </div>

        <div
          onClick={() => setActiveTab("in_progress")}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === "in_progress"
              ? "bg-sky-500/10 border-sky-500/40 text-sky-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5" />
            Repairs In Progress
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {data.inProgressRepairs.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Under active work</div>
        </div>

        <div
          onClick={() => setActiveTab("serious")}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === "serious"
              ? "bg-red-500/10 border-red-500/40 text-red-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            Serious Escalations
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {seriousIssues.length}
          </div>
          <div className="text-[10px] text-red-400 mt-1">
            {pendingSeriousCount} awaiting Manager/Admin approval
          </div>
        </div>

        <div
          onClick={() => setActiveTab("completed")}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            activeTab === "completed"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
              : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Completed History
          </div>
          <div className="text-3xl font-bold font-serif text-white mt-2">
            {data.completedRepairs.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Resolved work orders</div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "pending"
              ? "bg-amber-500 text-slate-950 font-bold"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          Pending Normal Repairs ({data.pendingRepairs.length})
        </button>
        <button
          onClick={() => setActiveTab("in_progress")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "in_progress"
              ? "bg-sky-500 text-slate-950 font-bold"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          In Progress ({data.inProgressRepairs.length})
        </button>
        <button
          onClick={() => setActiveTab("serious")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition flex items-center gap-1.5 ${
            activeTab === "serious"
              ? "bg-red-600 text-white font-bold"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Serious Escalations ({seriousIssues.length})
        </button>
        <button
          onClick={() => setActiveTab("rooms")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "rooms"
              ? "bg-slate-800 text-white font-bold"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          Rooms Out of Order ({data.roomsUnderMaintenance.length})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition ${
            activeTab === "completed"
              ? "bg-emerald-500 text-slate-950 font-bold"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          History ({data.completedRepairs.length})
        </button>
      </div>

      {/* 1. Pending Normal Repairs */}
      {activeTab === "pending" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <h2 className="text-sm font-semibold text-white">
              Repairs Awaiting Technician Pickup
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Normal repairs reported by Housekeeping or Reception. Click &quot;Start Repair&quot; to begin work.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Ticket</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Reported Issue / Defect</th>
                  <th className="py-3.5 px-4">Dispatched At</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.pendingRepairs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                      No pending repairs awaiting attention.
                    </td>
                  </tr>
                ) : (
                  data.pendingRepairs.map((task) => {
                    const isTarget = task.task_id === highlightTaskId;
                    return (
                      <tr
                        key={task.task_id}
                        ref={isTarget ? (highlightRef as any) : undefined}
                        className={`transition ${
                          isTarget
                            ? "bg-amber-950/40 ring-2 ring-amber-500"
                            : "hover:bg-slate-850/40"
                        }`}
                      >
                        <td className="py-4 px-4 font-mono text-xs text-slate-400">
                          #{task.task_id}
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-serif font-bold text-white text-base">
                            Room {task.room_number}
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            {task.room_type} (Floor {task.floor})
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-sm text-slate-200">{task.issue_description}</div>
                          {task.request_source && (
                            <span className="text-[10px] text-slate-500">
                              via {task.request_source}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-400">
                          {new Date(task.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => handleStartRepair(task.task_id, task.room_number)}
                            disabled={isPending}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto shadow-sm"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Start Repair
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. In Progress Repairs */}
      {activeTab === "in_progress" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <h2 className="text-sm font-semibold text-white">
              Repairs Currently Under Work
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Technicians actively troubleshooting. Click &quot;Mark Repair Completed&quot; when the defect is resolved.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Ticket</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Technician</th>
                  <th className="py-3.5 px-4">Problem</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.inProgressRepairs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                      No repairs currently in progress.
                    </td>
                  </tr>
                ) : (
                  data.inProgressRepairs.map((task) => {
                    const isTarget = task.task_id === highlightTaskId;
                    return (
                      <tr
                        key={task.task_id}
                        ref={isTarget ? (highlightRef as any) : undefined}
                        className={`transition ${
                          isTarget
                            ? "bg-sky-950/40 ring-2 ring-sky-500"
                            : "hover:bg-slate-850/40"
                        }`}
                      >
                        <td className="py-4 px-4 font-mono text-xs text-slate-400">
                          #{task.task_id}
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-serif font-bold text-white text-base">
                            Room {task.room_number}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs">
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-medium inline-flex items-center gap-1.5">
                            <User className="w-3 h-3 text-sky-400" />
                            {task.assigned_to}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-300">
                          {task.issue_description}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => handleOpenCompleteModal(task.task_id, task.room_number)}
                            disabled={isPending}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Repair Completed
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Serious Escalations (Section 2 B: Approval Workflow) */}
      {activeTab === "serious" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Serious Problems Requiring Manager / Administrator Approval
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete Sequence: WAITING FOR APPROVAL &rarr; APPROVED &rarr; MAINTENANCE IN PROGRESS &rarr; COMPLETED.
              </p>
            </div>
            <button
              onClick={() => setSeriousModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Report New Serious Issue
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Issue / Title</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Estimated Budget</th>
                  <th className="py-3.5 px-4">Status &amp; Authorization</th>
                  <th className="py-3.5 px-4">Technician / Progress</th>
                  <th className="py-3.5 px-4 text-right">Available Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {seriousIssues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                      No serious issues currently escalated.
                    </td>
                  </tr>
                ) : (
                  seriousIssues.map((issue) => {
                    const isTarget = issue.id === highlightEscalationId;
                    return (
                      <tr
                        key={issue.id}
                        ref={isTarget ? (highlightRef as any) : undefined}
                        className={`transition ${
                          isTarget
                            ? "bg-red-950/30 ring-2 ring-red-500"
                            : "hover:bg-slate-850/40"
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="font-semibold text-white text-sm">{issue.title}</div>
                          <div className="text-xs text-slate-400 mt-1 max-w-sm">{issue.description}</div>
                        </td>

                        <td className="py-4 px-4 text-xs">
                          {issue.roomNumber ? (
                            <span className="font-serif font-bold text-amber-400">
                              Room {issue.roomNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-1">
                              <Building className="w-3 h-3" /> Property-wide
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 font-mono text-xs text-slate-300">
                          {issue.estimatedCost || "Not specified"}
                        </td>

                        <td className="py-4 px-4">
                          {issue.status === "pending_approval" && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" />
                                WAITING FOR APPROVAL
                              </span>
                              <div className="text-[10px] text-slate-500 mt-1">
                                Needs Manager or Admin review
                              </div>
                            </div>
                          )}

                          {issue.status === "approved" && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                APPROVED
                              </span>
                              <div className="text-[10px] text-emerald-400 mt-1">
                                Authorized by {issue.reviewedBy}
                              </div>
                              {issue.reviewNotes && (
                                <div className="text-[10px] text-slate-400 italic">
                                  &quot;{issue.reviewNotes}&quot;
                                </div>
                              )}
                            </div>
                          )}

                          {issue.status === "in_progress" && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                <Play className="w-3 h-3" />
                                MAINTENANCE IN PROGRESS
                              </span>
                              <div className="text-[10px] text-sky-300 mt-1">
                                Started by {issue.startedBy || "Technician"}
                              </div>
                            </div>
                          )}

                          {issue.status === "completed" && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                COMPLETED
                              </span>
                              <div className="text-[10px] text-slate-400 mt-1">
                                Resolved by {issue.completedBy || "Technician"}
                              </div>
                            </div>
                          )}

                          {issue.status === "rejected" && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                <AlertCircle className="w-3 h-3" />
                                DECLINED
                              </span>
                              <div className="text-[10px] text-red-400 mt-1">
                                {issue.reviewNotes || "Declined by management"}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 text-xs text-slate-300">
                          {issue.status === "completed" && issue.completionNotes && (
                            <div className="text-emerald-300/90 text-xs">
                              Resolution: &quot;{issue.completionNotes}&quot;
                            </div>
                          )}
                          {issue.status === "in_progress" && issue.startedAt && (
                            <div className="text-slate-400 text-[11px]">
                              Active since {new Date(issue.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {issue.status === "pending_approval" && (
                            <div className="text-slate-500 text-[11px]">
                              Reported by {issue.reportedBy}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right">
                          {issue.status === "approved" && (
                            <button
                              onClick={() => handleStartSeriousMaintenance(issue.id)}
                              disabled={isPending}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto shadow-md shadow-emerald-950/40"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Start Maintenance
                            </button>
                          )}

                          {issue.status === "in_progress" && (
                            <button
                              onClick={() => handleOpenCompleteSeriousModal(issue)}
                              disabled={isPending}
                              className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ml-auto shadow-md shadow-sky-950/40"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Finish Maintenance
                            </button>
                          )}

                          {issue.status === "pending_approval" && (
                            <span className="text-xs text-amber-400/80 italic">
                              Awaiting Manager/Admin Approval
                            </span>
                          )}

                          {issue.status === "completed" && (
                            <span className="text-xs text-emerald-400 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Work Finished
                            </span>
                          )}

                          {issue.status === "rejected" && (
                            <span className="text-xs text-slate-500 italic">
                              Closed
                            </span>
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
      )}

      {/* 4. Rooms Under Maintenance */}
      {activeTab === "rooms" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.roomsUnderMaintenance.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 text-sm">
              All hotel rooms are functional with zero technical defects.
            </div>
          ) : (
            data.roomsUnderMaintenance.map((r) => (
              <div
                key={r.room_id}
                className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-xl font-bold text-white">
                      Room {r.room_number}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Under Maintenance
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    <div>Type: {r.room_type}</div>
                    <div>Floor: {r.floor}</div>
                  </div>
                  {r.notes && (
                    <div className="mt-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300">
                      {r.notes}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleRequestCleaning(r.room_id, r.room_number)}
                    disabled={isPending}
                    className="w-full py-1.5 px-3 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Request Cleaning
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. Completed History */}
      {activeTab === "completed" && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Ticket</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Technician</th>
                  <th className="py-3.5 px-4">Resolution Details</th>
                  <th className="py-3.5 px-4">Completed</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.completedRepairs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                      No completed repairs on record yet.
                    </td>
                  </tr>
                ) : (
                  data.completedRepairs.map((task) => (
                    <tr key={task.task_id} className="hover:bg-slate-850/40 transition">
                      <td className="py-4 px-4 font-mono text-xs text-slate-400">
                        #{task.task_id}
                      </td>
                      <td className="py-4 px-4 font-serif font-bold text-white">
                        Room {task.room_number}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-300">
                        {task.assigned_to}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-300 max-w-xs">
                        {task.issue_description}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-400">
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Notifications */}
      {activeTab === "notifications" && (
        <div className="space-y-3">
          {data.notifications.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm rounded-2xl bg-slate-900 border border-slate-800">
              No new maintenance notifications.
            </div>
          ) : (
            data.notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  startTransition(async () => {
                    await markNotificationRead(notif.id);
                  });
                  if (notif.roomNumber) {
                    setActiveTab("pending");
                  }
                }}
                className="p-4 rounded-xl bg-slate-900 hover:bg-slate-850 cursor-pointer transition border border-slate-800 hover:border-amber-500/30 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{notif.title}</h4>
                      <span className="text-[10px] text-amber-400 font-medium">Click to view task</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">{notif.message}</p>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {new Date(notif.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {notif.roomNumber && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-xs font-semibold text-amber-400">
                    Room {notif.roomNumber}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Complete Repair Modal (Normal Repairs) */}
      {completeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Complete Repair for Room {selectedRoomNumber}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Add technical resolution notes. The system will verify if cleaning is also pending before making the room Available.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Resolution Notes
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Replaced AC capacitor and verified thermostat functionality. Room cooling verified."
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="reqCleaning"
                checked={requestCleaningAfterRepair}
                onChange={(e) => setRequestCleaningAfterRepair(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="reqCleaning" className="text-xs text-slate-300 cursor-pointer">
                Dispatch post-repair turnover cleaning to Housekeeping (Recommended)
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setCompleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmComplete}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                {isPending ? "Completing..." : "Verify & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Serious Escalation Modal */}
      {completeSeriousModalOpen && selectedSeriousIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Finish Serious Maintenance: {selectedSeriousIssue.title}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {selectedSeriousIssue.roomNumber && `Room ${selectedSeriousIssue.roomNumber} — `}
              Record technician completion notes. The system will recalculate room availability.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Technician Completion Notes
              </label>
              <textarea
                value={seriousCompletionNotes}
                onChange={(e) => setSeriousCompletionNotes(e.target.value)}
                placeholder="e.g. Compressor replaced by HVAC contractor. Temperature calibrated to 21°C. System running smoothly."
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCompleteSeriousModalOpen(false);
                  setSelectedSeriousIssue(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompleteSerious}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                {isPending ? "Completing..." : "Record Completion & Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 2 B: Report Serious Issue Modal (Escalation to Manager/Admin) */}
      {seriousModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-red-500/40 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-serif">
                  Report Serious Problem / Budget Escalation
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  For major issues requiring Manager or Administrator approval (e.g., major electrical defects, water pipe leakage, structural damage, or external contractor expense).
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitSeriousIssue} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Affected Room Number <span className="text-slate-500 text-[10px] lowercase">(leave blank if property-wide)</span>
                </label>
                <input
                  type="text"
                  value={seriousRoomNumber}
                  onChange={(e) => setSeriousRoomNumber(e.target.value)}
                  placeholder="e.g. 204 or Boiler Room"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Issue Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={seriousTitle}
                  onChange={(e) => setSeriousTitle(e.target.value)}
                  placeholder="e.g. HVAC Compressor Failure or Main Pipe Rupture"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Estimated Budget / Contractor Cost <span className="text-slate-500 text-[10px] lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={seriousEstimatedCost}
                  onChange={(e) => setSeriousEstimatedCost(e.target.value)}
                  placeholder="e.g. $850 (OEM part + contractor labor)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Detailed Description &amp; Justification <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  value={seriousDescription}
                  onChange={(e) => setSeriousDescription(e.target.value)}
                  placeholder="Describe the severity, damage assessment, risk to operations, and reasons why external authorization or replacement is necessary..."
                  rows={4}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSeriousModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-red-950/40"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPending ? "Submitting..." : "Submit to Manager & Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
