"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { getStaffSession } from "./auth";

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hms_staff_session")?.value;
  return {
    Cookie: cookieStore.toString(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function requireStaff() {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized: Please sign in");
  return session;
}

export async function requireRole(allowedRoles: string[]) {
  const session = await getStaffSession();
  if (!session) throw new Error("Unauthorized: Please sign in");
  const hasAccess = allowedRoles.some((r) => r.toLowerCase() === session.role_name.toLowerCase());
  if (!hasAccess) {
    throw new Error(`Access restricted for role '${session.role_name}'. Required: ${allowedRoles.join(" or ")}`);
  }
  return session;
}

// ─── Dashboard Stats & Active Stays ──────────────────────────────────────────

export async function getDashboardStats() {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/dashboard/stats", { headers });
  return res.stats;
}

export async function getActiveCheckedInStays() {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/dashboard/active-stays", { headers });
  return res.activeStays || [];
}

export async function getActivityHistory() {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/dashboard/activity-logs", { headers });
  return res.logs || [];
}

// ─── Reservations Management ─────────────────────────────────────────────────

export async function getStaffReservations(statusFilter?: string) {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/reservations", {
    headers,
    params: { status: statusFilter },
  });
  return res.reservations || [];
}

export async function confirmReservation(reservationId: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/reservations/${reservationId}/approve`, {
      method: "POST",
      headers,
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkInGuest(reservationId: number, roomId?: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/reservations/${reservationId}/check-in`, {
      method: "POST",
      headers,
      body: JSON.stringify({ roomId }),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkOutGuest(reservationId: number, roomId?: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/reservations/${reservationId}/check-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({ roomId }),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    revalidatePath("/staff/dashboard/housekeeping");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function cancelReservation(reservationId: number, reason: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/reservations/${reservationId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason }),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createWalkInReservation(formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const payload = {
      firstName: formData.get("firstName")?.toString().trim(),
      lastName: formData.get("lastName")?.toString().trim(),
      email: formData.get("email")?.toString().trim() || null,
      phone: formData.get("phone")?.toString().trim(),
      gender: formData.get("gender")?.toString() || "Other",
      nationality: formData.get("nationality")?.toString() || "Pakistan",
      roomId: formData.get("roomId")?.toString(),
      checkInDate: formData.get("checkInDate")?.toString(),
      checkOutDate: formData.get("checkOutDate")?.toString(),
      adults: parseInt(formData.get("adults")?.toString() || "1", 10),
      children: parseInt(formData.get("children")?.toString() || "0", 10),
      specialRequests: formData.get("specialRequests")?.toString() || null,
      directCheckIn: formData.get("directCheckIn") === "true",
      recordPayment: formData.get("recordPayment") === "true",
      paymentMethod: formData.get("paymentMethod")?.toString() || "cash",
    };

    const res = await apiFetch("/api/reservations/walk-in", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/reservations");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Room Inventory & Operations ─────────────────────────────────────────────

export async function getStaffRooms() {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/rooms", { headers });
  return res.rooms || [];
}

export async function adminOverrideRoomStatus(roomId: number, targetStatus: string, reason?: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/rooms/${roomId}/override`, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetStatus, reason }),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitRoomServiceRequest(
  roomId: number,
  requestType: "cleaning" | "maintenance",
  notes?: string
) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/rooms/${roomId}/service-request`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requestType, notes }),
    });
    revalidatePath("/staff/dashboard/rooms");
    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/maintenance");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Housekeeping Operations ─────────────────────────────────────────────────

export async function getHousekeepingDashboardData() {
  const headers = await getAuthHeaders();
  return apiFetch("/api/housekeeping/dashboard", { headers });
}

export async function startCleaningTask(taskId: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/housekeeping/tasks/${taskId}/start`, {
      method: "POST",
      headers,
    });
    revalidatePath("/staff/dashboard/housekeeping");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function completeCleaningTask(taskId: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/housekeeping/tasks/${taskId}/complete`, {
      method: "POST",
      headers,
    });
    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitHousekeepingRoomStatus(
  roomId: number,
  selectedStatus: "in_progress" | "cleaned" | "need_maintenance",
  comment?: string
) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/housekeeping/rooms/${roomId}/cleanliness`, {
      method: "POST",
      headers,
      body: JSON.stringify({ selectedStatus, comment }),
    });
    revalidatePath("/staff/dashboard/housekeeping");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Maintenance Operations ──────────────────────────────────────────────────

export async function getMaintenanceDashboardData() {
  const headers = await getAuthHeaders();
  return apiFetch("/api/maintenance/dashboard", { headers });
}

export async function startMaintenanceTask(taskId: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/maintenance/tasks/${taskId}/start`, {
      method: "POST",
      headers,
    });
    revalidatePath("/staff/dashboard/maintenance");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function completeMaintenanceTask(taskId: number, resolutionNotes: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/maintenance/tasks/${taskId}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ resolutionNotes }),
    });
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reportMaintenanceIssue(formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const payload = {
      roomNumber: formData.get("roomNumber")?.toString().trim(),
      issue: formData.get("issue")?.toString().trim(),
      severity: formData.get("severity")?.toString() || "Routine",
      source: "Maintenance",
    };
    const res = await apiFetch("/api/maintenance/report", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getSeriousEscalatedIssues() {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch("/api/maintenance/escalations", { headers });
    return res.issues || [];
  } catch {
    return [];
  }
}

export async function escalateSeriousIssue(
  roomNumberOrFormData?: string | FormData,
  title?: string,
  description?: string,
  estimatedCost?: string
) {
  try {
    const headers = await getAuthHeaders();
    let payload: any;
    if (roomNumberOrFormData instanceof FormData) {
      payload = {
        roomNumber: roomNumberOrFormData.get("roomNumber")?.toString().trim() || undefined,
        title: roomNumberOrFormData.get("title")?.toString().trim(),
        description: roomNumberOrFormData.get("description")?.toString().trim(),
        estimatedCost: roomNumberOrFormData.get("estimatedCost")?.toString().trim() || undefined,
      };
    } else {
      payload = {
        roomNumber: roomNumberOrFormData?.trim() || undefined,
        title: title?.trim(),
        description: description?.trim(),
        estimatedCost: estimatedCost?.trim() || undefined,
      };
    }
    const res = await apiFetch("/api/maintenance/escalations", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reviewEscalatedIssue(
  issueId: string,
  decision: "approved" | "rejected",
  reviewNotes: string
) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/maintenance/escalations/${issueId}/review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision, reviewNotes }),
    });
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/dashboard/maintenance");
    revalidatePath("/staff/dashboard/rooms");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function startSeriousEscalationRepair(issueId: string) {
  const issues = await getSeriousEscalatedIssues();
  const issue = issues.find((i: any) => i.id === issueId);
  if (!issue || !issue.linkedTaskId) {
    return { success: false, error: "Linked maintenance task not found for this escalation." };
  }
  return startMaintenanceTask(issue.linkedTaskId);
}

export async function completeSeriousEscalationRepair(issueId: string, resolutionNotes: string) {
  const issues = await getSeriousEscalatedIssues();
  const issue = issues.find((i: any) => i.id === issueId);
  if (!issue || !issue.linkedTaskId) {
    return { success: false, error: "Linked maintenance task not found for this escalation." };
  }
  return completeMaintenanceTask(issue.linkedTaskId, resolutionNotes);
}

// ─── Staff Administration ───────────────────────────────────────────────────

export async function getStaffMembers() {
  const headers = await getAuthHeaders();
  const res = await apiFetch("/api/staff", { headers });
  return { staff: res.staff || [], roles: res.roles || [] };
}

export async function createStaffAccount(formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const payload = {
      firstName: formData.get("firstName")?.toString().trim(),
      lastName: formData.get("lastName")?.toString().trim(),
      username: formData.get("username")?.toString().trim(),
      password: formData.get("password")?.toString(),
      email: formData.get("email")?.toString().trim() || undefined,
      phone: formData.get("phone")?.toString().trim() || undefined,
      roleId: formData.get("roleId")?.toString(),
    };
    const res = await apiFetch("/api/staff", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    revalidatePath("/staff/dashboard/staff");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleStaffActive(targetStaffId: number) {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch(`/api/staff/${targetStaffId}/toggle`, {
      method: "PATCH",
      headers,
    });
    revalidatePath("/staff/dashboard/staff");
    return res;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getRoleNotifications() {
  try {
    const headers = await getAuthHeaders();
    const res = await apiFetch("/api/dashboard/notifications", { headers });
    return res.notifications || [];
  } catch {
    return [];
  }
}

export async function getStaffNotifications() {
  return getRoleNotifications();
}

export async function markNotificationRead(id: string) {
  const headers = await getAuthHeaders();
  return apiFetch(`/api/dashboard/notifications/${id}/read`, {
    method: "POST",
    headers,
  });
}

export async function markAllStaffNotificationsRead() {
  const headers = await getAuthHeaders();
  return apiFetch("/api/dashboard/notifications/read-all", {
    method: "POST",
    headers,
  });
}
