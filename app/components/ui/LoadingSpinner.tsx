"use client";

import React from "react";

type LoadingSpinnerProps = {
  size?: number;
  label?: string;
  className?: string;
  labelClassName?: string;
};

export default function LoadingSpinner({
  size = 44,
  label,
  className = "",
  labelClassName = "",
}: LoadingSpinnerProps) {
  const center = size / 2;
  const maxThickness = Math.max(6, size * 0.18);
  const minThickness = Math.max(1.5, size * 0.025);
  const outerRadius = center - 1;
  const startDeg = -104;
  const endDeg = 200;
  const segments = 70;

  const toXY = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
  };

  const outerPoints: string[] = [];
  const innerPoints: string[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = startDeg + (endDeg - startDeg) * t;
    const thickness = minThickness + (maxThickness - minThickness) * t;
    const outer = toXY(angle, outerRadius);
    const inner = toXY(angle, outerRadius - thickness);
    outerPoints.push(`${outer.x.toFixed(3)},${outer.y.toFixed(3)}`);
    innerPoints.push(`${inner.x.toFixed(3)},${inner.y.toFixed(3)}`);
  }

  const pathD = `M ${outerPoints.join(" L ")} L ${innerPoints.reverse().join(" L ")} Z`;
  const startMid = toXY(startDeg, outerRadius - minThickness / 2);
  const endMid = toXY(endDeg, outerRadius - maxThickness / 2);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <span className="inline-flex animate-spin" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="metrik-spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#6ee7b7" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="url(#metrik-spinner-gradient)" />
          <circle cx={startMid.x} cy={startMid.y} r={minThickness / 2} fill="#5fdab4" />
          <circle cx={endMid.x} cy={endMid.y} r={maxThickness / 2} fill="#1fc68e" />
        </svg>
      </span>
      {label ? (
        <span className={`text-xs font-medium tracking-[0.04em] text-slate-400 ${labelClassName}`}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
