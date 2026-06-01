"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type RevealOnScrollProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  y?: number;
};

export default function RevealOnScroll({
  children,
  className = "",
  delayMs = 0,
  y = 14,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      const frame = window.requestAnimationFrame(() => setRevealed(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.16 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${revealed ? "is-visible" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${delayMs}ms`, ["--reveal-y" as string]: `${y}px` }}
    >
      {children}
    </div>
  );
}
