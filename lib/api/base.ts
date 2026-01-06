"use client";

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port === "3000" ? "8000" : window.location.port || "8000";
    return `${protocol}//${hostname}:${port}`;
  }
  return "http://127.0.0.1:8000";
}
