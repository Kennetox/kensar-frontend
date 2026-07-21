import assert from "node:assert/strict";
import test from "node:test";

import {
  decideGridSwipeRelease,
} from "../../lib/pos/gridSwipe.ts";

test("un arrastre corto y lento regresa a la página actual", () => {
  const decision = decideGridSwipeRelease({
    deltaX: -120,
    deltaY: 8,
    velocityX: -0.2,
    elapsedMs: 800,
    viewportWidth: 1000,
    canGoPrevious: true,
    canGoNext: true,
  });

  assert.equal(decision.direction, 0);
});

test("un arrastre que supera el umbral proporcional cambia de página", () => {
  const next = decideGridSwipeRelease({
    deltaX: -300,
    deltaY: 20,
    velocityX: -0.1,
    elapsedMs: 900,
    viewportWidth: 1000,
    canGoPrevious: true,
    canGoNext: true,
  });
  const previous = decideGridSwipeRelease({
    deltaX: 300,
    deltaY: 20,
    velocityX: 0.1,
    elapsedMs: 900,
    viewportWidth: 1000,
    canGoPrevious: true,
    canGoNext: true,
  });

  assert.equal(next.direction, 1);
  assert.equal(previous.direction, -1);
});

test("un flick deliberado puede completar la navegación", () => {
  const decision = decideGridSwipeRelease({
    deltaX: -80,
    deltaY: 5,
    velocityX: 0,
    elapsedMs: 100,
    viewportWidth: 1000,
    canGoPrevious: true,
    canGoNext: true,
  });

  assert.equal(decision.direction, 1);
});

test("no navega más allá de la primera o última página", () => {
  const firstPage = decideGridSwipeRelease({
    deltaX: 400,
    deltaY: 0,
    velocityX: 1,
    elapsedMs: 200,
    viewportWidth: 1000,
    canGoPrevious: false,
    canGoNext: true,
  });
  const lastPage = decideGridSwipeRelease({
    deltaX: -400,
    deltaY: 0,
    velocityX: -1,
    elapsedMs: 200,
    viewportWidth: 1000,
    canGoPrevious: true,
    canGoNext: false,
  });

  assert.equal(firstPage.direction, 0);
  assert.equal(lastPage.direction, 0);
});
