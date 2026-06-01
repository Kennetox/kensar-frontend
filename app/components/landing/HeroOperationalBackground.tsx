"use client";

import { useEffect, useRef } from "react";

const STREAM_COLUMNS = [
  { left: "4%", duration: "19s", delay: "-8s", opacity: 0.22 },
  { left: "11%", duration: "15s", delay: "-14s", opacity: 0.16 },
  { left: "18%", duration: "23s", delay: "-5s", opacity: 0.2 },
  { left: "26%", duration: "17s", delay: "-19s", opacity: 0.18 },
  { left: "34%", duration: "24s", delay: "-3s", opacity: 0.15 },
  { left: "42%", duration: "20s", delay: "-11s", opacity: 0.21 },
  { left: "50%", duration: "16s", delay: "-17s", opacity: 0.19 },
  { left: "58%", duration: "23s", delay: "-7s", opacity: 0.15 },
  { left: "66%", duration: "18s", delay: "-22s", opacity: 0.18 },
  { left: "74%", duration: "21s", delay: "-9s", opacity: 0.22 },
  { left: "82%", duration: "16s", delay: "-15s", opacity: 0.15 },
  { left: "90%", duration: "20s", delay: "-4s", opacity: 0.2 },
];

export default function HeroOperationalBackground() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let raf = 0;
    let tx = 50;
    let ty = 45;
    let cx = 50;
    let cy = 45;

    const setTargetFromEvent = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
      const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom;

      if (!insideX || !insideY) {
        tx = 50;
        ty = 45;
        return;
      }

      tx = ((event.clientX - rect.left) / rect.width) * 100;
      ty = ((event.clientY - rect.top) / rect.height) * 100;
    };

    const animate = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;

      const px = (cx - 50) / 50;
      const py = (cy - 50) / 50;

      node.style.setProperty("--hero-cx", `${cx.toFixed(2)}%`);
      node.style.setProperty("--hero-cy", `${cy.toFixed(2)}%`);
      node.style.setProperty("--hero-parallax-x", `${(px * 10).toFixed(2)}px`);
      node.style.setProperty("--hero-parallax-y", `${(py * 8).toFixed(2)}px`);

      raf = window.requestAnimationFrame(animate);
    };

    const onLeave = () => {
      tx = 50;
      ty = 45;
    };

    node.style.setProperty("--hero-cx", "50%");
    node.style.setProperty("--hero-cy", "45%");
    node.style.setProperty("--hero-parallax-x", "0px");
    node.style.setProperty("--hero-parallax-y", "0px");

    raf = window.requestAnimationFrame(animate);
    window.addEventListener("mousemove", setTargetFromEvent, { passive: true });
    window.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", setTargetFromEvent);
      window.removeEventListener("mouseleave", onLeave);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="hero-operational-bg pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div className="hero-operational-aura hero-operational-aura-main" />
      <div className="hero-operational-aura hero-operational-aura-side" />

      <div className="hero-operational-streams">
        {STREAM_COLUMNS.map((col, idx) => (
          <div
            key={idx}
            className="hero-operational-stream"
            style={{
              left: col.left,
              animationDuration: col.duration,
              animationDelay: col.delay,
              opacity: col.opacity,
            }}
          >
            <span className="hero-operational-stream-line" />
            <span className="hero-operational-stream-line short" />
            <span className="hero-operational-stream-dot" />
          </div>
        ))}
      </div>

      <div className="hero-operational-grid" />
    </div>
  );
}
