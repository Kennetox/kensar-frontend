"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type HeroVisualMotionProps = {
  children: ReactNode;
};

export default function HeroVisualMotion({ children }: HeroVisualMotionProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const onMove = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width;
      const relY = (event.clientY - rect.top) / rect.height;
      const rx = (0.5 - relY) * 3.2;
      const ry = (relX - 0.5) * 4.6;
      node.style.setProperty("--mx", `${ry.toFixed(2)}deg`);
      node.style.setProperty("--my", `${rx.toFixed(2)}deg`);
    };

    const onLeave = () => {
      node.style.setProperty("--mx", "0deg");
      node.style.setProperty("--my", "0deg");
    };

    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="hero-tilt-card">
      {children}
    </div>
  );
}
