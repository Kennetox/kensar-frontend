import { getApiBase } from "@/lib/api/base";
import type {
  WebBrandCollageImages,
  WebHomeSectionsMode,
  WebPersonalizationBindings,
  WebPersonalizationHomeImages,
} from "@/lib/api/settings";

export type ComercioWebSettings = {
  web_personalization_bindings: WebPersonalizationBindings;
  web_personalization_home_images: WebPersonalizationHomeImages;
  web_brand_collage_images: WebBrandCollageImages;
  web_home_sections_mode: WebHomeSectionsMode;
};

async function parseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error(
    typeof body?.detail === "string" ? body.detail : `Error ${response.status}`
  );
}

export async function fetchComercioWebSettings(
  token: string
): Promise<ComercioWebSettings> {
  const response = await fetch(`${getApiBase()}/comercio-web/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as ComercioWebSettings;
}

export async function updateComercioWebSettings(
  payload: Partial<ComercioWebSettings>,
  token: string
): Promise<ComercioWebSettings> {
  const response = await fetch(`${getApiBase()}/comercio-web/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as ComercioWebSettings;
}
