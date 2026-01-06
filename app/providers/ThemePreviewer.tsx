"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "kensar_theme_mode";

export function ThemePreviewer() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const forced = searchParams.get("theme");
    let preferred: string | null = null;
    try {
      preferred = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      preferred = null;
    }
    const nextTheme = forced ?? preferred ?? "dark";
    document.body.dataset.theme = nextTheme;
    if (forced) {
      try {
        window.localStorage.setItem(STORAGE_KEY, forced);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  return null;
}
