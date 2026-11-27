// Type definitions for Notifications, Activity Logs, and Serious Issues Escalations

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
