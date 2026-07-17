"use client";

/* eslint-disable @next/next/no-img-element */

import React, {
  memo,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import type { Product } from "../poscontext";

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

type PosCatalogGridProps = {
  tiles: GridTile[];
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
> & { tile: GridTile }) {
  if (tile.type === "back") {
    return (
      <button
        type="button"
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
  return (
    <section className="flex-1 flex flex-col">
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
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-300 shadow-sm transition hover:border-slate-400 hover:bg-slate-800 hover:text-slate-100"
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto px-3 py-3">
          <div ref={gridRef} className="grid w-full gap-4" style={gridStyle}>
            {tiles.map((tile) => (
              <CatalogTile
                key={tile.id}
                tile={tile}
                imageHeight={imageHeight}
                labelFontSize={labelFontSize}
                priceFontSize={priceFontSize}
                metaFontSize={metaFontSize}
                onTileClick={onTileClick}
                resolveAssetUrl={resolveAssetUrl}
              />
            ))}
            {tiles.length === 0 && !loading && (
              <div className="col-span-full text-center text-sm text-slate-400 py-6">
                No hay elementos para mostrar.
              </div>
            )}
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
