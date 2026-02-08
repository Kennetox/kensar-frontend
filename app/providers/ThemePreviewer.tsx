"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { getApiBase } from "@/lib/api/base";
import type { ThemeOption } from "@/lib/api/settings";

const THEME_STORAGE_KEY = "kensar_theme_mode";
const BG_STORAGE_KEY = "kensar_bg_style";
const ACCENT_STORAGE_KEY = "kensar_accent_color";
const DEFAULT_ACCENT = "#10b981";
const DEFAULT_BG_BY_THEME: Record<ThemeOption, BackgroundStyle> = {
  dark: "pattern",
  midnight: "clean",
  light: "soft",
};

type BackgroundStyle = "clean" | "soft" | "pattern";

const isTheme = (value: string | null | undefined): value is ThemeOption =>
  value === "dark" || value === "midnight" || value === "light";

const isBackgroundStyle = (
  value: string | null | undefined
): value is BackgroundStyle =>
  value === "clean" || value === "soft" || value === "pattern";

const normalizeAccent = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : null;
};

const getAccentContrast = (hex: string): string => {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#0f172a";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  return luminance > 0.55 ? "#0f172a" : "#f8fafc";
};

const applyTheme = (theme: ThemeOption, bg: BackgroundStyle, accent: string) => {
  if (typeof document === "undefined") return;
  document.body.dataset.theme = theme;
  document.body.dataset.bg = bg;
  document.body.style.setProperty("--accent", accent);
  document.body.style.setProperty("--accent-contrast", getAccentContrast(accent));
};

export function ThemePreviewer() {
  const searchParams = useSearchParams();
  const { token } = useAuth();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const forcedTheme = searchParams.get("theme");
    const forcedBg = searchParams.get("bg");
    let storedTheme: string | null = null;
    let storedBg: string | null = null;
    let storedAccent: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      storedBg = window.localStorage.getItem(BG_STORAGE_KEY);
      storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    } catch {
      storedTheme = null;
      storedBg = null;
      storedAccent = null;
    }
    const resolvedTheme = isTheme(forcedTheme)
      ? forcedTheme
      : isTheme(storedTheme)
        ? storedTheme
        : "dark";
    const resolvedBg = isBackgroundStyle(forcedBg)
      ? forcedBg
      : isBackgroundStyle(storedBg)
        ? storedBg
        : DEFAULT_BG_BY_THEME[resolvedTheme];
    const resolvedAccent =
      normalizeAccent(storedAccent) ?? DEFAULT_ACCENT;
    applyTheme(resolvedTheme, resolvedBg, resolvedAccent);
    if (forcedTheme) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
      } catch {
        /* ignore */
      }
    }
    if (forcedBg) {
      try {
        window.localStorage.setItem(BG_STORAGE_KEY, resolvedBg);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token || typeof document === "undefined") return;
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/pos/settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          theme_mode?: ThemeOption;
          accent_color?: string;
        };
        if (cancelled) return;
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        const storedBg = window.localStorage.getItem(BG_STORAGE_KEY);
        const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
        const defaultTheme = isTheme(payload.theme_mode)
          ? payload.theme_mode
          : "dark";
        const defaultAccent =
          normalizeAccent(payload.accent_color) ?? DEFAULT_ACCENT;
        const resolvedTheme = isTheme(storedTheme) ? storedTheme : defaultTheme;
        const resolvedAccent = normalizeAccent(storedAccent) ?? defaultAccent;
        const resolvedBg = isBackgroundStyle(storedBg)
          ? storedBg
          : DEFAULT_BG_BY_THEME[resolvedTheme];
        applyTheme(resolvedTheme, resolvedBg, resolvedAccent);
        if (!storedTheme) {
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
          } catch {
            /* ignore */
          }
        }
        if (!storedAccent) {
          try {
            window.localStorage.setItem(ACCENT_STORAGE_KEY, resolvedAccent);
          } catch {
            /* ignore */
          }
        }
        if (!storedBg) {
          try {
            window.localStorage.setItem(BG_STORAGE_KEY, resolvedBg);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("No se pudo cargar preferencias de tema:", err);
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return null;
}
