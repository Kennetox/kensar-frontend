"use client";

import { getApiBase } from "@/lib/api/base";

export type ComercioWebHomeVideo = {
  id: number;
  slot: number;
  enabled: boolean;
  video_url?: string | null;
  sort_order: number;
  content_updated_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ComercioWebHomeVideoUpdate = Partial<
  Pick<ComercioWebHomeVideo, "enabled" | "video_url" | "sort_order">
>;

function buildHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  const detail = typeof body?.detail === "string" ? body.detail : `Error ${res.status}`;
  const err = new Error(detail) as Error & { status?: number };
  err.status = res.status;
  return err;
}

export async function fetchComercioWebHomeVideos(
  token: string
): Promise<ComercioWebHomeVideo[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/home-videos`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebHomeVideo[];
}

export async function updateComercioWebHomeVideo(
  token: string,
  slot: number,
  input: ComercioWebHomeVideoUpdate
): Promise<ComercioWebHomeVideo> {
  const res = await fetch(`${getApiBase()}/comercio-web/home-videos/${slot}`, {
    method: "PUT",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebHomeVideo;
}
