export const GRID_SWIPE_AXIS_LOCK_PX = 6;
export const GRID_SWIPE_DIRECTION_RATIO = 1.08;
export const GRID_SWIPE_VELOCITY_IDLE_MS = 80;
export const GRID_PAGE_GAP_PX = 16;

const PAGE_THRESHOLD_RATIO = 0.28;
const MIN_FLICK_DISTANCE_PX = 56;
const MIN_FLICK_VELOCITY_PX_MS = 0.5;

type GridSwipeReleaseInput = {
  deltaX: number;
  deltaY: number;
  velocityX: number;
  elapsedMs: number;
  viewportWidth: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

export type GridSwipeReleaseDecision = {
  direction: -1 | 0 | 1;
  releaseVelocity: number;
};

export function decideGridSwipeRelease({
  deltaX,
  deltaY,
  velocityX,
  elapsedMs,
  viewportWidth,
  canGoPrevious,
  canGoNext,
}: GridSwipeReleaseInput): GridSwipeReleaseDecision {
  const absoluteDeltaX = Math.abs(deltaX);
  const safeViewportWidth = Math.max(1, viewportWidth);
  const swipeProgress = absoluteDeltaX / safeViewportWidth;
  const recentVelocity =
    Math.sign(velocityX) === Math.sign(deltaX) ? Math.abs(velocityX) : 0;
  const averageVelocity = absoluteDeltaX / Math.max(1, elapsedMs);
  const releaseVelocity = Math.max(recentVelocity, averageVelocity);
  const hasDistanceIntent = swipeProgress >= PAGE_THRESHOLD_RATIO;
  const hasFlickIntent =
    absoluteDeltaX >= MIN_FLICK_DISTANCE_PX &&
    releaseVelocity >= MIN_FLICK_VELOCITY_PX_MS;
  const isHorizontal =
    absoluteDeltaX > Math.abs(deltaY) * GRID_SWIPE_DIRECTION_RATIO;

  if ((!hasDistanceIntent && !hasFlickIntent) || !isHorizontal) {
    return { direction: 0, releaseVelocity };
  }

  const direction = deltaX < 0 ? 1 : -1;
  const canChangePage =
    (direction === 1 && canGoNext) ||
    (direction === -1 && canGoPrevious);
  return {
    direction: canChangePage ? direction : 0,
    releaseVelocity,
  };
}
