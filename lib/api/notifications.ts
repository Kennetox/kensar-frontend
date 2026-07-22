import { getApiBase } from "@/lib/api/base";

export type DashboardNotification = {
  id: number;
  source: string;
  category: string;
  severity: "info" | "success" | "warning" | "critical";
  module_id?: string | null;
  title: string;
  message: string;
  action_label?: string | null;
  action_href?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
  expires_at?: string | null;
};

export type NotificationInbox = {
  items: DashboardNotification[];
  unread_count: number;
};

async function request(token: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Error ${response.status}`);
  }
  return response;
}

export async function fetchNotificationInbox(token: string): Promise<NotificationInbox> {
  const response = await request(token, "/notifications");
  return (await response.json()) as NotificationInbox;
}

export async function markNotificationRead(
  token: string,
  notificationId: number
): Promise<DashboardNotification> {
  const response = await request(token, `/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
  return (await response.json()) as DashboardNotification;
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await request(token, "/notifications/read-all", { method: "POST" });
}

export async function dismissNotification(
  token: string,
  notificationId: number
): Promise<void> {
  await request(token, `/notifications/${notificationId}/dismiss`, {
    method: "PATCH",
  });
}
