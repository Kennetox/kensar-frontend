"use client";

import { getApiBase } from "@/lib/api/base";

export type ComercioWebHomeSliderLinkType =
  | "sin_link"
  | "catalogo"
  | "categoria"
  | "subcategoria"
  | "personalizacion"
  | "contacto"
  | "url_interna";

export type ComercioWebHomeSlider = {
  id: number;
  slot: number;
  enabled: boolean;
  image_url?: string | null;
  mobile_image_url?: string | null;
  alt_text?: string | null;
  cta_label?: string | null;
  cta_x_percent: number;
  cta_y_percent: number;
  link_type: ComercioWebHomeSliderLinkType;
  link_value?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ComercioWebHomeSliderUpdate = Partial<
  Pick<
    ComercioWebHomeSlider,
    "enabled" | "image_url" | "alt_text" | "cta_label" | "link_type" | "link_value" | "sort_order"
    | "mobile_image_url"
    | "cta_x_percent"
    | "cta_y_percent"
  >
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

export async function fetchComercioWebHomeSliders(token: string): Promise<ComercioWebHomeSlider[]> {
  const res = await fetch(`${getApiBase()}/comercio-web/home-sliders`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebHomeSlider[];
}

export async function updateComercioWebHomeSlider(
  token: string,
  slot: number,
  input: ComercioWebHomeSliderUpdate
): Promise<ComercioWebHomeSlider> {
  const res = await fetch(`${getApiBase()}/comercio-web/home-sliders/${slot}`, {
    method: "PUT",
    headers: buildHeaders(token),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ComercioWebHomeSlider;
}
