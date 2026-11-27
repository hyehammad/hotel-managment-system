// In-app Notifications, Activity Audit Log, and Serious Issues Escalation Store
import fs from "fs";
import path from "path";

export interface NotificationItem {
  id: string;
  role: "admin" | "manager" | "receptionist" | "housekeeping" | "maintenance" | "all";
  title: string;
  message: string;
  timestamp: string;
  type: "checkout" | "cleaning" | "maintenance" | "checkin" | "override" | "system" | "serious_issue" | "online_booking";
  roomNumber?: string;
  taskId?: number;
  escalationId?: string;
  reservationId?: number;
  read?: boolean;
  link?: string;
}

export interface ActivityLogItem {
  id: string;
  staffName: string;
  staffRole: string;
  action: string;
  details: string;
  timestamp: string;
  roomNumber?: string;
}

export interface SeriousIssueItem {
  id: string;
  roomNumber?: string;
  title: string;
  description: string;
  estimatedCost?: string;
  reportedBy: string;
  reportedAt: string;
  status: "pending_approval" | "approved" | "in_progress" | "completed" | "rejected";
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

// In-memory persistent store during runtime
const notifications: NotificationItem[] = [
  {
    id: "notif-1",
    role: "housekeeping",
    title: "Checkout Cleaning Required",
    message: "Room 102 requires turnover cleaning. Guest completed checkout.",
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    type: "checkout",
    roomNumber: "102",
  },
  {
    id: "notif-2",
    role: "maintenance",
    title: "Maintenance Reported",
    message: "Maintenance required: Room 203 – Bathroom faucet leaking.",
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    type: "maintenance",
    roomNumber: "203",
  },
];

const activityLogs: ActivityLogItem[] = [
  {
    id: "act-1",
    staffName: "Frontdesk Receptionist",
    staffRole: "Receptionist",
    action: "Guest Check-out",
    details: "Checked out guest from Room 102. Cleaning task dispatched.",
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    roomNumber: "102",
  },
  {
    id: "act-2",
    staffName: "Lead Housekeeper",
    staffRole: "Housekeeping",
    action: "Maintenance Issue Reported",
    details: "Reported faucet leak in Room 203 during routine inspection.",
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    roomNumber: "203",
  },
  {
    id: "act-3",
    staffName: "System Administrator",
    staffRole: "Admin",
    action: "System Startup",
    details: "Initialized hotel management system and verified database.",
    timestamp: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
  },
];

const DATA_FILE = path.join(process.cwd(), "src", "data", "serious_issues.json");

function loadSeriousIssuesFromDisk(): SeriousIssueItem[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to load serious issues from disk:", err);
  }
  return [
    {
      id: "issue-1",
      roomNumber: "302",
      title: "Main AC Chiller Compressor Burnout",
      description: "HVAC central compressor in Room 302 burnt out. Requires replacement compressor unit and certified external HVAC technician.",
      estimatedCost: "PKR 145,000",
      reportedBy: "Chief Technician",
      reportedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      status: "in_progress",
      reviewedBy: "System Administrator",
      reviewedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      reviewNotes: "Authorized for procurement and specialized HVAC repair.",
      linkedTaskId: 10,
      startedBy: "Chief Technician",
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ];
}

function saveSeriousIssuesToDisk(issues: SeriousIssueItem[]): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(issues, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save serious issues to disk:", err);
  }
}

export function addNotification(
  role: NotificationItem["role"],
  title: string,
  message: string,
  type: NotificationItem["type"],
  roomNumber?: string,
  link?: string,
  taskId?: number,
  escalationId?: string,
  reservationId?: number
) {
  let defaultLink = link;
  if (!defaultLink) {
    if (escalationId) {
      if (role === "maintenance") {
        defaultLink = `/staff/dashboard/maintenance?tab=serious&escalationId=${escalationId}`;
      } else {
        defaultLink = `/staff/dashboard?escalationId=${escalationId}`;
      }
    } else if (taskId) {
      if (type === "cleaning" || type === "checkout") {
        defaultLink = `/staff/dashboard/housekeeping?taskId=${taskId}&room=${roomNumber || ""}`;
      } else if (type === "maintenance") {
        defaultLink = `/staff/dashboard/maintenance?taskId=${taskId}&room=${roomNumber || ""}`;
      }
    } else if (reservationId) {
      defaultLink = `/staff/dashboard/reservations?reservationId=${reservationId}`;
    } else if (type === "checkout" || type === "cleaning") {
      defaultLink = roomNumber ? `/staff/dashboard/housekeeping?room=${roomNumber}` : "/staff/dashboard/housekeeping";
    } else if (type === "maintenance") {
      defaultLink = roomNumber ? `/staff/dashboard/maintenance?room=${roomNumber}` : "/staff/dashboard/maintenance";
    } else if (type === "checkin" || type === "online_booking") {
      defaultLink = "/staff/dashboard/reservations";
    } else if (type === "override") {
      defaultLink = roomNumber ? `/staff/dashboard/rooms?room=${roomNumber}` : "/staff/dashboard/rooms";
    } else if (type === "serious_issue") {
      defaultLink = role === "maintenance" ? "/staff/dashboard/maintenance?tab=serious" : "/staff/dashboard";
    } else {
      defaultLink = "/staff/dashboard";
    }
  }

  const item: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    role,
    title,
    message,
    timestamp: new Date().toISOString(),
    type,
    roomNumber,
    taskId,
    escalationId,
    reservationId,
    read: false,
    link: defaultLink,
  };
  notifications.unshift(item);
  if (notifications.length > 50) notifications.pop();
  return item;
}

export function markNotificationAsRead(id: string): NotificationItem | null {
  const notif = notifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    return notif;
  }
  return null;
}

export function markAllNotificationsAsRead(roleName: string): void {
  const r = roleName.toLowerCase();
  notifications.forEach((n) => {
    if (n.role === "all" || n.role === r) {
      n.read = true;
    }
  });
}

export function logActivity(
  staffName: string,
  staffRole: string,
  action: string,
  details: string,
  roomNumber?: string
) {
  const item: ActivityLogItem = {
    id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    staffName: staffName || "Unknown Staff",
    staffRole: staffRole || "Unknown",
    action,
    details,
    timestamp: new Date().toISOString(),
    roomNumber,
  };
  activityLogs.unshift(item);
  if (activityLogs.length > 100) activityLogs.pop();
  return item;
}

export function getNotificationsForRole(roleName: string): NotificationItem[] {
  const r = roleName.toLowerCase();
  return notifications.filter((n) => n.role === "all" || n.role === r);
}

export function getAllActivityLogs(): ActivityLogItem[] {
  return [...activityLogs];
}

// ─── Serious Issues (Requiring Manager / Admin Approval) ─────────────────────

export function submitSeriousIssueRecord(
  roomNumber: string | undefined,
  title: string,
  description: string,
  estimatedCost: string | undefined,
  reportedBy: string
): SeriousIssueItem {
  const issues = loadSeriousIssuesFromDisk();

  // Prevent duplicate active critical escalations for the same issue in the same room
  const normTitle = title.trim().toLowerCase();
  const existingActive = issues.find((i) => {
    if (i.status === "completed" || i.status === "rejected") return false;
    const sameRoom = roomNumber
      ? i.roomNumber === roomNumber.trim()
      : !i.roomNumber;
    if (!sameRoom) return false;
    const existingNorm = i.title.trim().toLowerCase();
    return (
      existingNorm === normTitle ||
      (normTitle.length > 5 && existingNorm.includes(normTitle)) ||
      (existingNorm.length > 5 && normTitle.includes(existingNorm))
    );
  });

  if (existingActive) {
    throw new Error(
      `A critical escalation for ${roomNumber ? `Room ${roomNumber}` : "this issue"} is already active (#${existingActive.id}: "${existingActive.title}"). Status: ${existingActive.status}.`
    );
  }

  const item: SeriousIssueItem = {
    id: `issue-${Date.now()}`,
    roomNumber: roomNumber?.trim() || undefined,
    title: title.trim(),
    description: description.trim(),
    estimatedCost: estimatedCost?.trim() || "Under Assessment",
    reportedBy,
    reportedAt: new Date().toISOString(),
    status: "pending_approval",
  };

  issues.unshift(item);
  saveSeriousIssuesToDisk(issues);

  // Notify ONLY Manager and Administrator
  addNotification(
    "manager",
    `Approval Required: ${item.title}`,
    `Serious maintenance escalation for ${item.roomNumber ? `Room ${item.roomNumber}` : "Property"}: ${item.description}. Requires review.`,
    "serious_issue",
    item.roomNumber,
    undefined,
    undefined,
    item.id
  );

  addNotification(
    "admin",
    `Approval Required: ${item.title}`,
    `Serious maintenance escalation for ${item.roomNumber ? `Room ${item.roomNumber}` : "Property"}: ${item.description}. Requires review.`,
    "serious_issue",
    item.roomNumber,
    undefined,
    undefined,
    item.id
  );

  return item;
}

export function getAllSeriousIssues(): SeriousIssueItem[] {
  return loadSeriousIssuesFromDisk();
}

export function getSeriousIssueById(issueId: string): SeriousIssueItem | null {
  const issues = loadSeriousIssuesFromDisk();
  return issues.find((i) => i.id === issueId) || null;
}

export function getSeriousIssueByTaskId(taskId: number): SeriousIssueItem | null {
  const issues = loadSeriousIssuesFromDisk();
  return issues.find((i) => i.linkedTaskId === taskId) || null;
}

export function updateSeriousIssueDecision(
  issueId: string,
  decision: "approved" | "rejected",
  reviewNotes: string,
  reviewedBy: string,
  linkedTaskId?: number
): SeriousIssueItem | null {
  const issues = loadSeriousIssuesFromDisk();
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) return null;

  // Idempotent: prevent re-approving an already approved/in-progress/completed issue
  if (
    issue.status === "approved" ||
    issue.status === "in_progress" ||
    issue.status === "completed"
  ) {
    return issue;
  }

  issue.status = decision;
  issue.reviewedBy = reviewedBy;
  issue.reviewedAt = new Date().toISOString();
  issue.reviewNotes =
    reviewNotes ||
    (decision === "approved"
      ? "Approved for repair/procurement."
      : "Declined by management.");
  if (linkedTaskId) {
    issue.linkedTaskId = linkedTaskId;
  }

  saveSeriousIssuesToDisk(issues);

  // Notify Maintenance staff of decision with exact task link
  addNotification(
    "maintenance",
    `Escalation ${decision.toUpperCase()}: ${issue.title}`,
    `Management decision by ${reviewedBy}: ${issue.reviewNotes}. ${
      decision === "approved" ? "Start Maintenance now." : ""
    }`,
    "serious_issue",
    issue.roomNumber,
    undefined,
    linkedTaskId,
    issue.id
  );

  return issue;
}

export function updateSeriousIssueProgress(
  issueId: string,
  newStatus: "in_progress" | "completed",
  staffName: string,
  notes?: string
): SeriousIssueItem | null {
  const issues = loadSeriousIssuesFromDisk();
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) return null;

  issue.status = newStatus;
  if (newStatus === "in_progress") {
    issue.startedBy = staffName;
    issue.startedAt = new Date().toISOString();
  } else if (newStatus === "completed") {
    issue.completedBy = staffName;
    issue.completedAt = new Date().toISOString();
    issue.completionNotes = notes || "Repair successfully finished and tested.";
  }

  saveSeriousIssuesToDisk(issues);
  return issue;
}
