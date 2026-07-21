"use client";

/* eslint-disable @next/next/no-img-element */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import type { Product } from "../poscontext";
import {
  decideGridSwipeRelease,
  GRID_PAGE_GAP_PX,
  GRID_SWIPE_AXIS_LOCK_PX,
  GRID_SWIPE_DIRECTION_RATIO,
  GRID_SWIPE_VELOCITY_IDLE_MS,
} from "@/lib/pos/gridSwipe";

export type Path = string[];

export type ProductTile = {
  type: "product";
  id: string;
  product: Product;
};

export type GroupTile = {
  type: "group";
  id: string;
  label: string;
  path: Path;
  imageUrl?: string | null;
  color?: string | null;
};

export type BackTile = {
  type: "back";
  id: "back";
  label: string;
};

export type GridTile = ProductTile | GroupTile | BackTile;

type GridSwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  lastTime: number;
  velocityX: number;
  viewportWidth: number;
  startScrollLeft: number;
  direction: "pending" | "horizontal";
};

const GRID_SWIPE_CLICK_GUARD_MS = 450;

type PosCatalogGridProps = {
  tiles: GridTile[];
  previousPageTiles: GridTile[];
  nextPageTiles: GridTile[];
  loading: boolean;
  search: string;
  currentPath: Path;
  gridStyle: CSSProperties;
  gridZoom: number;
  imageHeight: number;
  labelFontSize: number;
  priceFontSize: number;
  metaFontSize: number;
  safePage: number;
  totalPages: number;
  zoomStep: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  setSearch: Dispatch<SetStateAction<string>>;
  setCurrentPath: Dispatch<SetStateAction<Path>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onTileClick: (tile: GridTile) => void;
  onZoomChange: (delta: number) => void;
  onZoomReset: () => void;
  resolveAssetUrl: (url?: string | null) => string | null;
};

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function CatalogTile({
  tile,
  imageHeight,
  labelFontSize,
  priceFontSize,
  metaFontSize,
  interactive,
  onTileClick,
  resolveAssetUrl,
}: Pick<
  PosCatalogGridProps,
  | "imageHeight"
  | "labelFontSize"
  | "priceFontSize"
  | "metaFontSize"
  | "onTileClick"
  | "resolveAssetUrl"
> & { tile: GridTile; interactive: boolean }) {
  if (tile.type === "back") {
    return (
      <button
        type="button"
        tabIndex={interactive ? 0 : -1}
        onClick={() => onTileClick(tile)}
        className="rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-sm font-semibold select-none"
      >
        ← Volver
      </button>
    );
  }

  if (tile.type === "group") {
    const groupStyle = tile.color ? { backgroundColor: tile.color } : undefined;
    return (
      <button
        type="button"
        tabIndex={interactive ? 0 : -1}
        onClick={() => onTileClick(tile)}
        className="rounded-lg bg-slate-800 hover:bg-slate-700 flex flex-col items-center justify-center text-sm font-semibold text-center px-3 py-4 select-none"
        style={groupStyle}
      >
        <div className="w-full flex flex-col items-center gap-2">
          {tile.imageUrl && (
            <div
              className="w-full rounded-lg flex items-center justify-center overflow-hidden p-2"
              style={{ height: `${imageHeight}px`, maxHeight: `${imageHeight}px` }}
            >
              <img
                src={tile.imageUrl}
                alt={tile.label}
                loading="lazy"
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          <span
            className="text-center font-semibold text-slate-100 leading-tight whitespace-normal break-words mt-1"
            style={{ fontSize: `${labelFontSize}rem` }}
          >
            {tile.label}
          </span>
        </div>
      </button>
    );
  }

  const product = tile.product;
  const productImageUrl = resolveAssetUrl(
    product.image_thumb_url ?? product.image_url
  );
  const hasProductImage = Boolean(productImageUrl);
  const isServiceTile =
    (!product.group_name || !product.group_name.trim()) &&
    (product.service || product.allow_price_change);
  const tileBgClass = hasProductImage
    ? "bg-slate-800 hover:bg-slate-700"
    : isServiceTile
      ? "bg-slate-800 hover:bg-slate-700"
      : "bg-slate-700 hover:bg-slate-600";
  const tileStyle = product.tile_color
    ? { backgroundColor: product.tile_color }
    : undefined;

  return (
    <button
      type="button"
      tabIndex={interactive ? 0 : -1}
      onClick={() => onTileClick(tile)}
      className={`group relative w-full h-full rounded-xl border border-slate-700/60 px-3 py-3 text-xs text-slate-50 overflow-hidden select-none ${tileBgClass}`}
      style={tileStyle}
    >
      {hasProductImage ? (
        <div className="flex h-full w-full flex-col items-center justify-between gap-2">
          <span
            className="line-clamp-2 text-center font-semibold mt-1"
            style={{ fontSize: `${labelFontSize}rem` }}
          >
            {product.name}
          </span>
          <div
            className="flex-1 w-full flex items-center justify-center py-2 overflow-hidden min-h-0"
            style={{ height: `${imageHeight}px`, maxHeight: `${imageHeight}px` }}
          >
            <img
              src={productImageUrl ?? undefined}
              alt={product.name}
              loading="lazy"
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <span
            className="font-bold mb-1"
            style={{ fontSize: `${priceFontSize}rem` }}
          >
            {formatMoney(product.price)}
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-between">
          <span
            className="mt-1 line-clamp-2 text-center font-semibold"
            style={{ fontSize: `${labelFontSize}rem` }}
          >
            {product.name}
          </span>
          <span
            className="mt-2 text-slate-300"
            style={{ fontSize: `${metaFontSize}rem` }}
          >
            {product.sku || product.barcode || " "}
          </span>
          <span
            className="mt-3 font-bold"
            style={{ fontSize: `${priceFontSize}rem` }}
          >
            {formatMoney(product.price)}
          </span>
        </div>
      )}
    </button>
  );
}

function PosCatalogGridComponent({
  tiles,
  previousPageTiles,
  nextPageTiles,
  loading,
  search,
  currentPath,
  gridStyle,
  gridZoom,
  imageHeight,
  labelFontSize,
  priceFontSize,
  metaFontSize,
  safePage,
  totalPages,
  zoomStep,
  searchInputRef,
  gridRef,
  setSearch,
  setCurrentPath,
  setCurrentPage,
  onSearchKeyDown,
  onTileClick,
  onZoomChange,
  onZoomReset,
  resolveAssetUrl,
}: PosCatalogGridProps) {
  const carouselViewportRef = useRef<HTMLDivElement | null>(null);
  const mouseGestureRef = useRef<GridSwipeGesture | null>(null);
  const pointerActiveRef = useRef(false);
  const rebasingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const clickGuardTimerRef = useRef<number | null>(null);
  const scrollSettleTimerRef = useRef<number | null>(null);

  const clearClickGuardTimer = useCallback(() => {
    if (clickGuardTimerRef.current == null) return;
    window.clearTimeout(clickGuardTimerRef.current);
    clickGuardTimerRef.current = null;
  }, []);

  const clearScrollSettleTimer = useCallback(() => {
    if (scrollSettleTimerRef.current == null) return;
    window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = null;
  }, []);

  const guardAgainstSwipeClick = useCallback(() => {
    suppressClickRef.current = true;
    clearClickGuardTimer();
    clickGuardTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      clickGuardTimerRef.current = null;
    }, GRID_SWIPE_CLICK_GUARD_MS);
  }, [clearClickGuardTimer]);

  const getPageDistance = useCallback(() => {
    const viewport = carouselViewportRef.current;
    return Math.max(1, viewport?.clientWidth ?? 1) + GRID_PAGE_GAP_PX;
  }, []);

  const centerCarousel = useCallback(() => {
    const viewport = carouselViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = getPageDistance();
  }, [getPageDistance]);

  useLayoutEffect(() => {
    rebasingRef.current = true;
    clearScrollSettleTimer();
    mouseGestureRef.current = null;
    pointerActiveRef.current = false;
    centerCarousel();
    const frame = window.requestAnimationFrame(() => {
      rebasingRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [centerCarousel, clearScrollSettleTimer, safePage, tiles]);

  useEffect(
    () => () => {
      clearClickGuardTimer();
      clearScrollSettleTimer();
    },
    [clearClickGuardTimer, clearScrollSettleTimer]
  );

  const commitSettledPage = useCallback(() => {
    const viewport = carouselViewportRef.current;
    if (!viewport || rebasingRef.current || pointerActiveRef.current) return;
    const pageDistance = getPageDistance();
    const slot = Math.round(viewport.scrollLeft / pageDistance);
    const direction = slot < 1 ? -1 : slot > 1 ? 1 : 0;
    const canChangePage =
      (direction === -1 && safePage > 1) ||
      (direction === 1 && safePage < totalPages);

    if (direction !== 0 && canChangePage) {
      rebasingRef.current = true;
      setCurrentPage((page) =>
        Math.max(1, Math.min(totalPages, page + direction))
      );
      return;
    }

    if (Math.abs(viewport.scrollLeft - pageDistance) > 1) {
      viewport.scrollTo({ left: pageDistance, behavior: "smooth" });
    }
  }, [getPageDistance, safePage, setCurrentPage, totalPages]);

  const scheduleScrollSettle = useCallback(() => {
    clearScrollSettleTimer();
    scrollSettleTimerRef.current = window.setTimeout(
      commitSettledPage,
      80
    );
  }, [clearScrollSettleTimer, commitSettledPage]);

  const clampCarouselPosition = useCallback(() => {
    const viewport = carouselViewportRef.current;
    if (!viewport) return;
    const pageDistance = getPageDistance();
    const minScrollLeft = safePage > 1 ? 0 : pageDistance;
    const maxScrollLeft = safePage < totalPages ? pageDistance * 2 : pageDistance;
    const clampedScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(minScrollLeft, viewport.scrollLeft)
    );
    if (Math.abs(clampedScrollLeft - viewport.scrollLeft) > 1) {
      viewport.scrollLeft = clampedScrollLeft;
    }
  }, [getPageDistance, safePage, totalPages]);

  const handleCarouselScroll = useCallback(() => {
    if (rebasingRef.current) return;
    clampCarouselPosition();
    if (pointerActiveRef.current) return;
    scheduleScrollSettle();
  }, [clampCarouselPosition, scheduleScrollSettle]);

  useEffect(() => {
    const viewport = carouselViewportRef.current;
    if (!viewport) return;
    const handleScrollEnd = () => {
      if (pointerActiveRef.current || rebasingRef.current) return;
      clearScrollSettleTimer();
      commitSettledPage();
    };
    viewport.addEventListener("scrollend", handleScrollEnd);
    return () => viewport.removeEventListener("scrollend", handleScrollEnd);
  }, [clearScrollSettleTimer, commitSettledPage]);

  const handleGridPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointerActiveRef.current = true;
      clearScrollSettleTimer();
      if (event.pointerType !== "mouse" || totalPages <= 1) return;

      const viewport = carouselViewportRef.current;
      if (!viewport) return;
      viewport.style.scrollSnapType = "none";
      mouseGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startTime: event.timeStamp,
        lastTime: event.timeStamp,
        velocityX: 0,
        viewportWidth: viewport.clientWidth,
        startScrollLeft: viewport.scrollLeft,
        direction: "pending",
      };
    },
    [clearScrollSettleTimer, totalPages]
  );

  const handleGridPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = mouseGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (gesture.direction === "pending") {
        if (
          absDeltaY >= GRID_SWIPE_AXIS_LOCK_PX &&
          absDeltaY > absDeltaX * GRID_SWIPE_DIRECTION_RATIO
        ) {
          mouseGestureRef.current = null;
          return;
        }
        if (
          absDeltaX < GRID_SWIPE_AXIS_LOCK_PX ||
          absDeltaX <= absDeltaY * GRID_SWIPE_DIRECTION_RATIO
        ) {
          return;
        }
        gesture.direction = "horizontal";
        event.currentTarget.style.cursor = "grabbing";
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const elapsed = event.timeStamp - gesture.lastTime;
      if (elapsed > 0 && elapsed <= GRID_SWIPE_VELOCITY_IDLE_MS) {
        const velocity = (event.clientX - gesture.lastX) / elapsed;
        gesture.velocityX =
          gesture.velocityX === 0
            ? velocity
            : gesture.velocityX * 0.6 + velocity * 0.4;
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;

      event.preventDefault();
      const viewport = carouselViewportRef.current;
      if (viewport) viewport.scrollLeft = gesture.startScrollLeft - deltaX;
    },
    []
  );

  const handleGridPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointerActiveRef.current = false;
      const gesture = mouseGestureRef.current;
      mouseGestureRef.current = null;
      event.currentTarget.style.cursor = "";
      const viewport = carouselViewportRef.current;
      if (viewport) viewport.style.scrollSnapType = "x mandatory";

      if (gesture?.pointerId === event.pointerId && gesture.direction === "horizontal") {
        event.preventDefault();
        guardAgainstSwipeClick();
        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        const { direction } = decideGridSwipeRelease({
          deltaX,
          deltaY,
          velocityX: gesture.velocityX,
          elapsedMs: Math.max(1, event.timeStamp - gesture.startTime),
          viewportWidth: gesture.viewportWidth,
          canGoPrevious: safePage > 1,
          canGoNext: safePage < totalPages,
        });
        viewport?.scrollTo({
          left: gesture.startScrollLeft + direction * getPageDistance(),
          behavior: "smooth",
        });
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      scheduleScrollSettle();
    },
    [getPageDistance, guardAgainstSwipeClick, safePage, scheduleScrollSettle, totalPages]
  );

  const handleGridPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointerActiveRef.current = false;
      mouseGestureRef.current = null;
      event.currentTarget.style.cursor = "";
      const viewport = carouselViewportRef.current;
      if (viewport) viewport.style.scrollSnapType = "x mandatory";
      scheduleScrollSettle();
    },
    [scheduleScrollSettle]
  );

  const handleGridClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      clearClickGuardTimer();
      event.preventDefault();
      event.stopPropagation();
    },
    [clearClickGuardTimer]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Buscar productos por nombre, código o código de barras"
              className="w-full rounded-xl bg-slate-950 border border-emerald-400/60 px-4 py-3.5 pr-12 text-lg outline-none focus:border-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
            />
            {search.trim() !== "" && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  window.requestAnimationFrame(() => {
                    searchInputRef.current?.focus();
                  });
                }}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-rose-400/50 bg-rose-500/15 text-rose-200 shadow-sm transition hover:border-rose-300 hover:bg-rose-500/25 hover:text-rose-50"
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400 whitespace-nowrap">
            {currentPath.length === 0 ? (
              <span>Inicio</span>
            ) : (
              <span>{["Inicio", ...currentPath].join(" › ")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={carouselViewportRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          style={{
            touchAction: "pan-x pan-y pinch-zoom",
            scrollSnapType: "x mandatory",
            overscrollBehaviorX: "none",
            scrollbarWidth: "none",
            overflowX: totalPages > 1 ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch",
          }}
          onScroll={handleCarouselScroll}
          onWheel={scheduleScrollSettle}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerCancel}
          onClickCapture={handleGridClickCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: "repeat(3, 100%)",
              columnGap: `${GRID_PAGE_GAP_PX}px`,
            }}
          >
            {[
              {
                pageNumber: safePage - 1,
                pageTiles: previousPageTiles,
                current: false,
              },
              {
                pageNumber: safePage,
                pageTiles: tiles,
                current: true,
              },
              {
                pageNumber: safePage + 1,
                pageTiles: nextPageTiles,
                current: false,
              },
            ].map(({ pageNumber, pageTiles, current }) => {
              const isAvailablePage =
                pageNumber >= 1 && pageNumber <= totalPages;
              return (
              <div
                key={`grid-page-${pageNumber}`}
                className="h-full min-h-0 w-full overflow-y-auto px-3 py-3"
                style={{
                  scrollSnapAlign: isAvailablePage ? "center" : "none",
                  scrollSnapStop: "always",
                  overscrollBehaviorY: "contain",
                }}
                aria-hidden={!current}
              >
                <div
                  ref={current ? gridRef : undefined}
                  className="grid w-full gap-4"
                  style={gridStyle}
                >
                  {pageTiles.map((tile) => (
                    <CatalogTile
                      key={tile.id}
                      tile={tile}
                      imageHeight={imageHeight}
                      labelFontSize={labelFontSize}
                      priceFontSize={priceFontSize}
                      metaFontSize={metaFontSize}
                      interactive={current}
                      onTileClick={onTileClick}
                      resolveAssetUrl={resolveAssetUrl}
                    />
                  ))}
                  {current && pageTiles.length === 0 && !loading && (
                    <div className="col-span-full py-6 text-center text-sm text-slate-400">
                      No hay elementos para mostrar.
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="h-14 border-t border-slate-800 flex items-center justify-between px-6 text-sm bg-slate-900">
          <span className="whitespace-nowrap">
            Página {safePage} / {totalPages}
          </span>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-xs text-slate-300 lg:flex">
              <span className="text-slate-400">Grid</span>
              <button
                type="button"
                onClick={() => onZoomChange(-zoomStep)}
                className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
              >
                –
              </button>
              <button
                type="button"
                onClick={onZoomReset}
                className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
              >
                {Math.round(gridZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => onZoomChange(zoomStep)}
                className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                disabled={safePage === 1}
                onClick={() => setCurrentPage(1)}
              >
                ⏮
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                disabled={safePage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                ◀
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                disabled={safePage === totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
              >
                ▶
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                ⏭
              </button>
              <button
                type="button"
                className="ml-4 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700"
                onClick={() => {
                  setCurrentPath([]);
                  setCurrentPage(1);
                  setSearch("");
                }}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const PosCatalogGrid = memo(PosCatalogGridComponent);
