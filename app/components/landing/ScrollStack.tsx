"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ScrollStackProps = {
  topPanel: ReactNode;
  bottomPanel: ReactNode;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ScrollStack({ topPanel, bottomPanel }: ScrollStackProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bottomPanelRef = useRef<HTMLDivElement | null>(null);
  const [enableStack, setEnableStack] = useState(false);

  useEffect(() => {
    const shouldEnable = window.matchMedia(
      "(min-width: 1280px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
    ).matches;
    setEnableStack(shouldEnable);
  }, []);

  useEffect(() => {
    if (!enableStack) return;

    const stage = stageRef.current;
    const bottom = bottomPanelRef.current;
    if (!stage || !bottom) return;

    let raf = 0;
    let transitionDistance = 0;

    const getViewportHeight = () => {
      const visualHeight = window.visualViewport?.height;
      return Math.max(visualHeight ?? window.innerHeight, 1);
    };

    const syncDimensions = () => {
      const topOffsetPx = 0;
      const stickyViewportHeight = Math.max(getViewportHeight(), 520);
      transitionDistance = clamp(stickyViewportHeight * 1.05, 700, 1200);
      const stageHeight = stickyViewportHeight + transitionDistance;

      stage.style.setProperty("--landing-stack-top", `${topOffsetPx}px`);
      stage.style.setProperty("--landing-stack-vh", `${stickyViewportHeight.toFixed(2)}px`);
      stage.style.setProperty("--landing-stack-stage-height", `${stageHeight.toFixed(2)}px`);
    };

    const update = () => {
      const rect = stage.getBoundingClientRect();
      const topOffset = 0;
      const moved = clamp(topOffset - rect.top, 0, Math.max(transitionDistance, 1));
      const progress = moved / Math.max(transitionDistance, 1);
      const translateY = (1 - progress) * 100;
      bottom.style.transform = `translate3d(0, ${translateY.toFixed(3)}%, 0)`;
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    const onResize = () => {
      syncDimensions();
      onScroll();
    };

    syncDimensions();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [enableStack]);

  if (!enableStack) {
    return (
      <section>
        <div>{topPanel}</div>
        <div>{bottomPanel}</div>
      </section>
    );
  }

  return (
    <section ref={stageRef} className="landing-stack-stage">
      <div className="landing-stack-viewport">
        <div
          className="landing-stack-panel landing-stack-panel-top"
          style={{ transform: "translateY(0%)" }}
        >
          {topPanel}
        </div>

        <div
          ref={bottomPanelRef}
          className="landing-stack-panel landing-stack-panel-bottom"
          style={{ transform: "translate3d(0, 100%, 0)" }}
        >
          {bottomPanel}
        </div>
      </div>
    </section>
  );
}
