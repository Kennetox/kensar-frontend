"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const NAVIGATION_TIMEOUT_MS = 10_000;

export type PosNavigationState = {
  route: string;
  title: string;
  detail: string;
};

type NavigateOptions = {
  replace?: boolean;
  beforeNavigate?: () => void;
};

export function useGuardedPosNavigation() {
  const router = useRouter();
  const lockRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [navigation, setNavigation] = useState<PosNavigationState | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lockRef.current = false;
    };
  }, []);

  const prefetch = useCallback(
    (route: string) => {
      router.prefetch(route);
    },
    [router]
  );

  const navigate = useCallback(
    (
      route: string,
      title: string,
      detail: string,
      options: NavigateOptions = {}
    ) => {
      if (lockRef.current) return false;
      lockRef.current = true;
      options.beforeNavigate?.();
      setNavigation({ route, title, detail });
      const startedAt = performance.now();
      timerRef.current = window.setTimeout(() => {
        const durationMs = Math.round(performance.now() - startedAt);
        console.warn(
          `pos_route_navigation_slow route=${route} duration_ms=${durationMs}`
        );
        window.location.assign(route);
      }, NAVIGATION_TIMEOUT_MS);
      if (options.replace) {
        router.replace(route);
      } else {
        router.push(route);
      }
      return true;
    },
    [router]
  );

  return { navigation, navigate, prefetch };
}
