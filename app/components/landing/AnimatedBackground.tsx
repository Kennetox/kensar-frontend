"use client";

import { useEffect, useRef } from "react";

type Blob = {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  blur: number;
  color: string;
  alpha: number;
  phase: number;
  speed: number;
  blurPulse: number;
  alphaPulse: number;
};

const BLOBS: Blob[] = [
  { x: 0.14, y: 0.18, r: 0.3, dx: 0.2, dy: 0.16, blur: 64, color: "0,205,140", alpha: 0.76, phase: 0.3, speed: 0.34, blurPulse: 0.62, alphaPulse: 0.16 },
  { x: 0.82, y: 0.16, r: 0.34, dx: -0.24, dy: 0.18, blur: 72, color: "30,94,255", alpha: 0.78, phase: 1.1, speed: 0.3, blurPulse: 0.68, alphaPulse: 0.15 },
  { x: 0.76, y: 0.82, r: 0.31, dx: -0.22, dy: -0.18, blur: 68, color: "0,196,238", alpha: 0.74, phase: 2.2, speed: 0.32, blurPulse: 0.66, alphaPulse: 0.15 },
  { x: 0.33, y: 0.82, r: 0.24, dx: 0.17, dy: -0.16, blur: 58, color: "70,125,255", alpha: 0.68, phase: 2.9, speed: 0.36, blurPulse: 0.58, alphaPulse: 0.14 },
];

export default function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      const time = t * 0.001;
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#e7f2fd");
      bg.addColorStop(0.5, "#dbe8f8");
      bg.addColorStop(1, "#e2ebfa");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (const blob of BLOBS) {
        const cx = (blob.x + Math.sin(time * blob.speed + blob.phase) * blob.dx) * w;
        const cy = (blob.y + Math.cos(time * (blob.speed * 0.9) + blob.phase) * blob.dy) * h;
        const rr = blob.r * Math.min(w, h) * (0.93 + Math.sin(time * 0.24 + blob.phase) * 0.1);
        const blurAnimated = blob.blur * (1 + Math.sin(time * 0.95 + blob.phase) * blob.blurPulse);
        const alphaAnimated = Math.max(0.2, Math.min(1, blob.alpha + Math.sin(time * 0.82 + blob.phase) * blob.alphaPulse));

        const g = ctx.createRadialGradient(cx, cy, rr * 0.08, cx, cy, rr);
        g.addColorStop(0, `rgba(${blob.color},${Math.min(alphaAnimated + 0.1, 1)})`);
        g.addColorStop(0.24, `rgba(${blob.color},${Math.min(alphaAnimated + 0.04, 1)})`);
        g.addColorStop(0.56, `rgba(${blob.color},${alphaAnimated})`);
        g.addColorStop(1, `rgba(${blob.color},0)`);

        ctx.save();
        ctx.filter = `blur(${Math.max(16, blurAnimated).toFixed(2)}px)`;
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Global color lift layer for stronger overall intensity.
      const lift = ctx.createRadialGradient(w * 0.48, h * 0.5, Math.min(w, h) * 0.08, w * 0.5, h * 0.52, Math.max(w, h) * 0.72);
      lift.addColorStop(0, "rgba(255,255,255,0.08)");
      lift.addColorStop(0.36, "rgba(59,130,246,0.14)");
      lift.addColorStop(0.72, "rgba(16,185,129,0.12)");
      lift.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = lift;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    raf = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="metrik-animated-bg">
      <canvas ref={ref} aria-hidden className="metrik-bg-canvas" />
      <span className="metrik-ambient-grain" />
    </div>
  );
}
