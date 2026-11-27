import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERIOUS_ISSUES_FILE = path.join(__dirname, "..", "data", "serious_issues.json");

export interface SeriousIssueItem {
  id: string;
  roomNumber?: string;
  title: string;
  description: string;
  estimatedCost?: string;
  reportedBy: string;
  reportedAt: string;
  status: "pending_approval" | "approved" | "rejected" | "in_progress" | "completed";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  linkedTaskId?: number;
  startedBy?: string;
  startedAt?: string;
  completedBy?: string;
  completedAt?: string;
  completionNotes?: string;
}

export function loadSeriousIssuesFromDisk(): SeriousIssueItem[] {
  try {
    if (fs.existsSync(SERIOUS_ISSUES_FILE)) {
      const data = fs.readFileSync(SERIOUS_ISSUES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read serious issues from disk:", err);
  }
  return [];
}

export function saveSeriousIssuesToDisk(issues: SeriousIssueItem[]) {
  try {
    const dir = path.dirname(SERIOUS_ISSUES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SERIOUS_ISSUES_FILE, JSON.stringify(issues, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save serious issues to disk:", err);
  }
}

export function getAllSeriousIssues(): SeriousIssueItem[] {
  return loadSeriousIssuesFromDisk();
}

export function getSeriousIssueById(id: string): SeriousIssueItem | undefined {
  const issues = loadSeriousIssuesFromDisk();
  return issues.find((i) => i.id === id);
}

export function submitSeriousIssueRecord(
  issue: Omit<SeriousIssueItem, "id" | "status" | "reportedAt">
): { item: SeriousIssueItem; isNew: boolean } {
  const issues = loadSeriousIssuesFromDisk();
  const existing = issues.find(
    (i) =>
      i.roomNumber === issue.roomNumber &&
      i.status !== "completed" &&
      i.status !== "rejected" &&
      (i.title.toLowerCase().includes(issue.title.toLowerCase().slice(0, 15)) ||
        issue.title.toLowerCase().includes(i.title.toLowerCase().slice(0, 15)))
  );

  if (existing) {
    return { item: existing, isNew: false };
  }

  const newItem: SeriousIssueItem = {
    ...issue,
    id: `issue-${Date.now()}`,
    status: "pending_approval",
    reportedAt: new Date().toISOString(),
  };

  issues.unshift(newItem);
  saveSeriousIssuesToDisk(issues);
  return { item: newItem, isNew: true };
}

export function updateSeriousIssueDecision(
  id: string,
  decision: "approved" | "rejected",
  notes: string,
  reviewerName: string,
  linkedTaskId?: number
) {
  const issues = loadSeriousIssuesFromDisk();
  const issue = issues.find((i) => i.id === id);
  if (issue) {
    issue.status = decision;
    issue.reviewedBy = reviewerName;
    issue.reviewedAt = new Date().toISOString();
    issue.reviewNotes = notes;
    if (linkedTaskId) {
      issue.linkedTaskId = linkedTaskId;
    }
    saveSeriousIssuesToDisk(issues);
  }
}

export function updateSeriousIssueProgress(
  id: string,
  status: "in_progress" | "completed",
  technicianName?: string,
  completionNotes?: string
) {
  const issues = loadSeriousIssuesFromDisk();
  const issue = issues.find((i) => i.id === id);
  if (issue) {
    issue.status = status;
    const now = new Date().toISOString();
    if (status === "in_progress") {
      issue.startedBy = technicianName;
      issue.startedAt = now;
    } else if (status === "completed") {
      issue.completedBy = technicianName;
      issue.completedAt = now;
      if (completionNotes) {
        issue.completionNotes = completionNotes;
      }
    }
    saveSeriousIssuesToDisk(issues);
  }
}

// ─── Live Notification Store ─────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  roleTarget: "admin" | "manager" | "receptionist" | "housekeeping" | "maintenance" | "all";
  title: string;
  message: string;
  type: "online_booking" | "walk_in_booking" | "checkin" | "checkout" | "cleaning" | "maintenance" | "system";
  roomNumber?: string;
  taskId?: number;
  link?: string;
  linkUrl?: string;
  timestamp: string;
  read: boolean;
}

let notificationStore: NotificationItem[] = [
  {
    id: "notif-init-1",
    roleTarget: "maintenance",
    title: "Maintenance Required: Room 302",
    message: "Room 302 – Major plumbing issue. High priority.",
    type: "maintenance",
    roomNumber: "302",
    timestamp: new Date().toISOString(),
    read: false,
  },
];

export function addNotification(
  roleTarget: NotificationItem["roleTarget"],
  title: string,
  message: string,
  type: NotificationItem["type"],
  roomNumber?: string,
  linkUrl?: string,
  taskId?: number
) {
  const notif: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    roleTarget,
    title,
    message,
    type,
    roomNumber,
    taskId,
    link: linkUrl,
    linkUrl,
    timestamp: new Date().toISOString(),
    read: false,
  };
  notificationStore.unshift(notif);
  if (notificationStore.length > 200) {
    notificationStore.pop();
  }
  return notif;
}

export function getNotificationsForRole(roleName: string): NotificationItem[] {
  const roleLower = roleName.toLowerCase();
  return notificationStore.filter(
    (n) => n.roleTarget === "all" || n.roleTarget.toLowerCase() === roleLower
  );
}

export function markNotificationAsRead(id: string) {
  const target = notificationStore.find((n) => n.id === id);
  if (target) target.read = true;
}

export function markAllNotificationsForRoleAsRead(roleName: string) {
  const roleLower = roleName.toLowerCase();
  notificationStore.forEach((n) => {
    if (n.roleTarget === "all" || n.roleTarget.toLowerCase() === roleLower) {
      n.read = true;
    }
  });
}

// ─── Activity Log Store ──────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  details: string;
  roomNumber?: string;
  timestamp: string;
}

let activityLogs: ActivityLog[] = [
  {
    id: "act-init-1",
    userName: "System Administrator",
    userRole: "Admin",
    action: "System Initialized",
    details: "Hotel Operations Platform initialized.",
    timestamp: new Date().toISOString(),
  },
];

export function logActivity(
  userName: string,
  userRole: string,
  action: string,
  details: string,
  roomNumber?: string
) {
  const log: ActivityLog = {
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userName,
    userRole,
    action,
    details,
    roomNumber,
    timestamp: new Date().toISOString(),
  };
  activityLogs.unshift(log);
  if (activityLogs.length > 300) {
    activityLogs.pop();
  }
}

export function getAllActivityLogs(): ActivityLog[] {
  return activityLogs;
}
