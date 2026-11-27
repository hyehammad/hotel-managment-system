const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...rest } = options;

  let url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  }

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    headers: { ...defaultHeaders, ...headers },
    credentials: "include", // send/receive session cookies across ports
    cache: "no-store",
    ...rest,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

// ─── AUTH API ────────────────────────────────────────────────────────────────
export const authApi = {
  login: (credentials: { username: string; password: string }) =>
    apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  logout: () =>
    apiFetch("/api/auth/logout", {
      method: "POST",
    }),
  getMe: () => apiFetch("/api/auth/me"),
};

// ─── BOOKINGS API ────────────────────────────────────────────────────────────
export const bookingsApi = {
  getPublicHome: () => apiFetch("/api/bookings/public-home"),
  getAvailableRooms: (roomTypeId: number, checkInDate: string, checkOutDate: string) =>
    apiFetch("/api/bookings/available-rooms", {
      params: { roomTypeId, checkInDate, checkOutDate },
    }),
  createBooking: (bookingData: any) =>
    apiFetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify(bookingData),
    }),
  lookupBooking: (reference: string, contact: string) =>
    apiFetch("/api/bookings/lookup", {
      params: { reference, contact },
    }),
};

// ─── RESERVATIONS API ────────────────────────────────────────────────────────
export const reservationsApi = {
  getReservations: (statusFilter?: string) =>
    apiFetch("/api/reservations", {
      params: { status: statusFilter },
    }),
  approveReservation: (id: number) =>
    apiFetch(`/api/reservations/${id}/approve`, {
      method: "POST",
    }),
  checkInGuest: (id: number, roomId?: number) =>
    apiFetch(`/api/reservations/${id}/check-in`, {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),
  checkOutGuest: (id: number, roomId?: number) =>
    apiFetch(`/api/reservations/${id}/check-out`, {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),
  cancelReservation: (id: number, reason: string) =>
    apiFetch(`/api/reservations/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  createWalkIn: (walkInData: any) =>
    apiFetch("/api/reservations/walk-in", {
      method: "POST",
      body: JSON.stringify(walkInData),
    }),
};

// ─── ROOMS API ───────────────────────────────────────────────────────────────
export const roomsApi = {
  getStaffRooms: () => apiFetch("/api/rooms"),
  overrideStatus: (id: number, targetStatus: string, reason?: string) =>
    apiFetch(`/api/rooms/${id}/override`, {
      method: "POST",
      body: JSON.stringify({ targetStatus, reason }),
    }),
  submitServiceRequest: (id: number, requestType: "cleaning" | "maintenance", notes?: string) =>
    apiFetch(`/api/rooms/${id}/service-request`, {
      method: "POST",
      body: JSON.stringify({ requestType, notes }),
    }),
};

// ─── HOUSEKEEPING API ────────────────────────────────────────────────────────
export const housekeepingApi = {
  getDashboardData: () => apiFetch("/api/housekeeping/dashboard"),
  startCleaningTask: (taskId: number) =>
    apiFetch(`/api/housekeeping/tasks/${taskId}/start`, {
      method: "POST",
    }),
  completeCleaningTask: (taskId: number) =>
    apiFetch(`/api/housekeeping/tasks/${taskId}/complete`, {
      method: "POST",
    }),
  updateCleanliness: (roomId: number, selectedStatus: string, comment?: string) =>
    apiFetch(`/api/housekeeping/rooms/${roomId}/cleanliness`, {
      method: "POST",
      body: JSON.stringify({ selectedStatus, comment }),
    }),
};

// ─── MAINTENANCE API ─────────────────────────────────────────────────────────
export const maintenanceApi = {
  getDashboardData: () => apiFetch("/api/maintenance/dashboard"),
  startRepairTask: (taskId: number) =>
    apiFetch(`/api/maintenance/tasks/${taskId}/start`, {
      method: "POST",
    }),
  completeRepairTask: (taskId: number, resolutionNotes: string) =>
    apiFetch(`/api/maintenance/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify({ resolutionNotes }),
    }),
  reportIssue: (data: { roomNumber: string; issue: string; severity?: string; source?: string }) =>
    apiFetch("/api/maintenance/report", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getEscalations: () => apiFetch("/api/maintenance/escalations"),
  submitEscalation: (data: { roomNumber?: string; title: string; description: string; estimatedCost?: string }) =>
    apiFetch("/api/maintenance/escalations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  reviewEscalation: (id: string, decision: "approved" | "rejected", reviewNotes?: string) =>
    apiFetch(`/api/maintenance/escalations/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, reviewNotes }),
    }),
};

// ─── STAFF API ───────────────────────────────────────────────────────────────
export const staffApi = {
  getStaffList: () => apiFetch("/api/staff"),
  createStaff: (staffData: any) =>
    apiFetch("/api/staff", {
      method: "POST",
      body: JSON.stringify(staffData),
    }),
  toggleStaffActive: (id: number) =>
    apiFetch(`/api/staff/${id}/toggle`, {
      method: "PATCH",
    }),
};

// ─── DASHBOARD API ───────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => apiFetch("/api/dashboard/stats"),
  getActiveStays: () => apiFetch("/api/dashboard/active-stays"),
  getActivityLogs: () => apiFetch("/api/dashboard/activity-logs"),
  getNotifications: () => apiFetch("/api/dashboard/notifications"),
  markNotificationRead: (id: string) =>
    apiFetch(`/api/dashboard/notifications/${id}/read`, {
      method: "POST",
    }),
  markAllNotificationsRead: () =>
    apiFetch("/api/dashboard/notifications/read-all", {
      method: "POST",
    }),
};
