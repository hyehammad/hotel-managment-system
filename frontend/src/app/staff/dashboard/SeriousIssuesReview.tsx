"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { reviewEscalatedIssue } from "@/app/actions/staff";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Building,
  Wrench,
  CheckCheck,
  User,
  ArrowRight,
} from "lucide-react";
import type { SeriousIssueItem } from "@/lib/events";

export default function SeriousIssuesReview({
  issues,
  userRole,
  highlightEscalationId,
}: {
  issues: SeriousIssueItem[];
  userRole: string;
  highlightEscalationId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedIssue, setSelectedIssue] = useState<SeriousIssueItem | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewTab, setViewTab] = useState<"pending" | "approved" | "history">("pending");

  const canReview = userRole?.toLowerCase() === "admin" || userRole?.toLowerCase() === "manager";
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightEscalationId) {
      const target = issues.find((i) => i.id === highlightEscalationId);
      if (target) {
        if (target.status === "pending_approval") {
          setViewTab("pending");
        } else if (target.status === "approved" || target.status === "in_progress") {
          setViewTab("approved");
        } else {
          setViewTab("history");
        }
        setTimeout(() => {
          highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
      }
    }
  }, [highlightEscalationId, issues]);

  const pendingIssues = issues.filter((i) => i.status === "pending_approval");
  const activeApprovedIssues = issues.filter(
    (i) => i.status === "approved" || i.status === "in_progress"
  );
  const historyIssues = issues.filter(
    (i) => i.status === "completed" || i.status === "rejected"
  );

  const handleOpenDecisionModal = (issue: SeriousIssueItem, type: "approved" | "rejected") => {
    setSelectedIssue(issue);
    setDecision(type);
    setReviewNotes("");
    setFeedback(null);
  };

  const handleConfirmDecision = () => {
    if (!selectedIssue) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await reviewEscalatedIssue(selectedIssue.id, decision, reviewNotes);
      if (res.success) {
        setFeedback({
          type: "success",
          text: `Issue "${selectedIssue.title}" marked as ${decision}. Single approval recorded by ${userRole}. Maintenance task activated.`,
        });
        setSelectedIssue(null);
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to submit review." });
      }
    });
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-serif font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            Serious Escalations Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Major defects and budget authorizations submitted by Maintenance. Approval by either Admin or Manager activates the repair.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setViewTab("pending")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              viewTab === "pending"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Pending ({pendingIssues.length})
          </button>
          <button
            onClick={() => setViewTab("approved")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              viewTab === "approved"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            In Work ({activeApprovedIssues.length})
          </button>
          <button
            onClick={() => setViewTab("history")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              viewTab === "history"
                ? "bg-slate-800 text-slate-200"
                : "text-slate-400 hover:text-white"
            }`}
          >
            History ({historyIssues.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* PENDING APPROVAL TAB */}
      {viewTab === "pending" && (
        <>
          {pendingIssues.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No serious maintenance escalations awaiting approval.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingIssues.map((issue) => {
                const isTarget = issue.id === highlightEscalationId;
                return (
                  <div
                    key={issue.id}
                    ref={isTarget ? highlightRef : undefined}
                    className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isTarget
                        ? "bg-red-950/40 border-red-500 ring-2 ring-red-500/50"
                        : "bg-slate-950/70 border-slate-800"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{issue.title}</span>
                        {issue.roomNumber ? (
                          <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                            Room {issue.roomNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Building className="w-3 h-3" /> Property-wide
                          </span>
                        )}
                        {issue.estimatedCost && (
                          <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            Est: {issue.estimatedCost}
                          </span>
                        )}
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Waiting for Approval
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 max-w-2xl">{issue.description}</p>
                      <div className="text-[11px] text-slate-500">
                        Reported by <span className="text-slate-400">{issue.reportedBy}</span> on{" "}
                        {new Date(issue.reportedAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canReview ? (
                        <>
                          <button
                            onClick={() => handleOpenDecisionModal(issue, "approved")}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve / Authorize
                          </button>
                          <button
                            onClick={() => handleOpenDecisionModal(issue, "rejected")}
                            className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 italic px-3 py-1.5 rounded bg-slate-900 border border-slate-800">
                          Requires Manager/Admin Approval
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* APPROVED & IN PROGRESS TAB */}
      {viewTab === "approved" && (
        <>
          {activeApprovedIssues.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No approved serious escalations currently in repair.
            </div>
          ) : (
            <div className="space-y-3">
              {activeApprovedIssues.map((issue) => {
                const isTarget = issue.id === highlightEscalationId;
                const isInProgress = issue.status === "in_progress";
                return (
                  <div
                    key={issue.id}
                    ref={isTarget ? highlightRef : undefined}
                    className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isTarget
                        ? "bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/50"
                        : "bg-slate-950/70 border-slate-800"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{issue.title}</span>
                        {issue.roomNumber && (
                          <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                            Room {issue.roomNumber}
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            isInProgress
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {isInProgress ? "Maintenance in Progress" : "Approved – Ready to Start"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 max-w-2xl">{issue.description}</p>
                      <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                        <div>
                          Approved by <span className="text-white font-medium">{issue.reviewedBy}</span>
                          {issue.reviewNotes && ` — "${issue.reviewNotes}"`}
                        </div>
                        {isInProgress && issue.startedBy && (
                          <div className="text-sky-300">
                            Work started by technician <span className="font-semibold">{issue.startedBy}</span>
                            {issue.startedAt && ` at ${new Date(issue.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 shrink-0">
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 inline-flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-400" />
                        Assigned to Maintenance
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* HISTORY TAB */}
      {viewTab === "history" && (
        <>
          {historyIssues.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No historical serious issues recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {historyIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{issue.title}</span>
                      {issue.roomNumber && (
                        <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          Room {issue.roomNumber}
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          issue.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {issue.status === "completed" ? "Completed" : "Declined"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{issue.description}</p>
                    {issue.status === "completed" && (
                      <div className="text-[11px] text-emerald-400/90 pt-1">
                        Completed by {issue.completedBy || "Technician"}
                        {issue.completedAt && ` on ${new Date(issue.completedAt).toLocaleDateString()}`}.
                        {issue.completionNotes && ` Resolution: "${issue.completionNotes}"`}
                      </div>
                    )}
                    {issue.status === "rejected" && issue.reviewNotes && (
                      <div className="text-[11px] text-red-400/90 pt-1">
                        Reason: "{issue.reviewNotes}" (Reviewed by {issue.reviewedBy})
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Decision Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white font-serif flex items-center gap-2">
              {decision === "approved" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              {decision === "approved" ? "Approve Serious Issue & Authorize Work" : "Decline Request"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Issue: <span className="text-white font-medium">{selectedIssue.title}</span>
              {selectedIssue.roomNumber && ` (Room ${selectedIssue.roomNumber})`}
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Authorization Notes / Contractor Instructions
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  decision === "approved"
                    ? "e.g. Budget authorized. Technician authorized to start repair immediately."
                    : "e.g. In-house patch requested before outside vendor replacement."
                }
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedIssue(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmDecision}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                  decision === "approved"
                    ? "bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold"
                    : "bg-red-600 hover:bg-red-700 text-white font-bold"
                }`}
              >
                {isPending ? "Submitting..." : `Confirm ${decision === "approved" ? "Approval" : "Decline"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
