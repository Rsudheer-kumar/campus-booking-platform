/**
 * CampusFlow Web - API Client
 * Centralized, typed API abstraction connecting the Next.js frontend to the Express backend.
 * Provides resilient credential handling, authorization header injection,
 * and transparent 401 refresh token retry.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type UserRole =
  | "STUDENT"
  | "FACULTY"
  | "STAFF"
  | "CUSTODIAN"
  | "DEPARTMENT_HEAD"
  | "FACILITY_MANAGER"
  | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  department?: string;
  identifier?: string;
}

export interface ResourceLocation {
  building: string;
  floor?: string;
  roomNumber?: string;
  campus?: string;
}

export interface ResourceType {
  _id: string;
  name: string;
  code: string;
  category: string;
}

export interface Resource {
  _id: string;
  name: string;
  code: string;
  resourceType?: ResourceType;
  description?: string;
  capacity: number;
  location: ResourceLocation;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED";
  isActive: boolean;
}

export interface TimetableEntry {
  _id: string;
  resource: string | { _id: string; name: string; code: string };
  academicTerm: string;
  courseCode: string;
  courseTitle: string;
  instructorName?: string;
  startAt: string; // ISO 8601 string
  endAt: string; // ISO 8601 string
  timezone: string;
  isPublished: boolean;
  version: number;
  publicationBatchId: string;
}

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export interface Reservation {
  _id: string;
  resource: Resource | string;
  user: User | string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: ReservationStatus;
  title: string;
  description?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
  available: boolean;
  reason?: string;
}

// ─── Token Management ─────────────────────────────────────────────────────────

let memoryAccessToken: string | null = null;

export function getStoredAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  if (typeof window !== "undefined") {
    return localStorage.getItem("cf_access_token");
  }
  return null;
}

export function setStoredAccessToken(token: string | null): void {
  memoryAccessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("cf_access_token", token);
    } else {
      localStorage.removeItem("cf_access_token");
    }
  }
}

// ─── HTTP Core Transport ───────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include", // Transmit cf_refresh cookie
  };

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (netErr) {
    throw new ApiError(
      "Unable to connect to CampusFlow server. Please check your network or server status.",
      "NETWORK_ERROR",
      0
    );
  }

  // Handle 401 Unauthorized transparent token refresh
  if (res.status === 401 && !isRetry && !endpoint.includes("/auth/")) {
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as {
          data: { accessToken: string };
        };
        if (refreshData?.data?.accessToken) {
          setStoredAccessToken(refreshData.data.accessToken);
          return request<T>(endpoint, options, true);
        }
      } else {
        // Refresh token failed or expired
        setStoredAccessToken(null);
      }
    } catch {
      setStoredAccessToken(null);
    }
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const errorBody = body as ApiErrorResponse | null;
    const errorCode = errorBody?.error?.code || `HTTP_${res.status}`;
    const errorMessage =
      errorBody?.error?.message || res.statusText || "An unexpected error occurred";
    const details = errorBody?.error?.details;

    throw new ApiError(errorMessage, errorCode, res.status, details);
  }

  const successBody = body as ApiResponse<T>;
  return successBody.data;
}

// ─── API Client Methods ─────────────────────────────────────────────────────────

export const api = {
  // Authentication
  auth: {
    login: async (email: string, password: string): Promise<{ user: User; accessToken: string }> => {
      const data = await request<{ user: User; accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setStoredAccessToken(data.accessToken);
      return data;
    },

    refresh: async (): Promise<{ user: User; accessToken: string }> => {
      const data = await request<{ user: User; accessToken: string }>("/auth/refresh", {
        method: "POST",
      });
      setStoredAccessToken(data.accessToken);
      return data;
    },

    logout: async (): Promise<void> => {
      try {
        await request("/auth/logout", { method: "POST" });
      } finally {
        setStoredAccessToken(null);
      }
    },
  },

  // Resources
  resources: {
    list: async (params: {
      search?: string;
      building?: string;
      status?: string;
      resourceType?: string;
      page?: number;
      limit?: number;
    } = {}): Promise<{
      resources: Resource[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> => {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.building) searchParams.set("building", params.building);
      if (params.status) searchParams.set("status", params.status);
      if (params.resourceType) searchParams.set("resourceType", params.resourceType);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.limit) searchParams.set("limit", String(params.limit));

      const query = searchParams.toString();
      return request<{
        resources: Resource[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/resources${query ? `?${query}` : ""}`);
    },

    getById: async (id: string): Promise<Resource> => {
      return request<Resource>(`/resources/${id}`);
    },
  },

  // Timetable Sessions (Phase 3.1)
  timetables: {
    list: async (params: {
      resourceId?: string;
      academicTerm?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    } = {}): Promise<{ entries: TimetableEntry[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params.resourceId) searchParams.set("resourceId", params.resourceId);
      if (params.academicTerm) searchParams.set("academicTerm", params.academicTerm);
      if (params.startDate) searchParams.set("startDate", params.startDate);
      if (params.endDate) searchParams.set("endDate", params.endDate);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.limit) searchParams.set("limit", String(params.limit));

      const query = searchParams.toString();
      return request<{ entries: TimetableEntry[]; total: number }>(
        `/timetables${query ? `?${query}` : ""}`
      );
    },
  },

  // Bookings & Availability
  bookings: {
    list: async (params: {
      status?: string;
      resourceId?: string;
      page?: number;
      limit?: number;
    } = {}): Promise<{
      bookings: Reservation[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set("status", params.status);
      if (params.resourceId) searchParams.set("resourceId", params.resourceId);
      if (params.page) searchParams.set("page", String(params.page));
      if (params.limit) searchParams.set("limit", String(params.limit));

      const query = searchParams.toString();
      return request<{
        bookings: Reservation[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/bookings${query ? `?${query}` : ""}`);
    },

    getById: async (id: string): Promise<Reservation> => {
      return request<Reservation>(`/bookings/${id}`);
    },

    create: async (payload: {
      resourceId: string;
      title: string;
      description?: string;
      startAt: string;
      endAt: string;
      timezone: string;
    }): Promise<{ booking: Reservation }> => {
      return request<{ booking: Reservation }>("/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    cancel: async (id: string, reason?: string): Promise<{ booking: Reservation }> => {
      return request<{ booking: Reservation }>(`/bookings/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      });
    },

    checkAvailability: async (params: {
      resourceId: string;
      startAt: string;
      endAt: string;
    }): Promise<{
      available: boolean;
      conflicts?: Array<{ type: string; startAt: string; endAt: string }>;
    }> => {
      const searchParams = new URLSearchParams({
        resourceId: params.resourceId,
        startAt: params.startAt,
        endAt: params.endAt,
      });
      return request<{
        available: boolean;
        conflicts?: Array<{ type: string; startAt: string; endAt: string }>;
      }>(`/bookings/availability?${searchParams.toString()}`);
    },

    getSlots: async (params: {
      resourceId: string;
      date: string;
      timezone?: string;
      durationMinutes?: number;
    }): Promise<{
      date: string;
      timezone: string;
      slots: AvailabilitySlot[];
    }> => {
      const searchParams = new URLSearchParams({
        resourceId: params.resourceId,
        date: params.date,
      });
      if (params.timezone) searchParams.set("timezone", params.timezone);
      if (params.durationMinutes) searchParams.set("durationMinutes", String(params.durationMinutes));

      return request<{
        date: string;
        timezone: string;
        slots: AvailabilitySlot[];
      }>(`/bookings/slots?${searchParams.toString()}`);
    },
  },
};
