"use client";

const normalizeUrl = (value: string): string => value.replace(/\/$/, "");

export function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    return normalizeUrl(envUrl);
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://127.0.0.1:8000";
  }

  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}
