"use client";

import React, {
  useEffect,
  useState,
  ChangeEvent,
  FormEvent,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Image from "next/image";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";

type Product = {
  id: number;
  sku: string | null;
  name: string;
  price: number;
  cost: number;
  barcode: string | null;
  unit: string | null;
  stock_min: number;
  active: boolean;
  service: boolean;
  includes_tax: boolean;
  // nuevos
  group_name: string | null;
  brand: string | null;
  supplier: string | null;
  preferred_qty: number;
  reorder_point: number;
  low_stock_alert: boolean;
  allow_price_change: boolean;
  image_url: string | null;
  image_thumb_url: string | null;
  tile_color: string | null;
};

type ProductGroup = {
  id: number;
  path: string;
  display_name: string;
  parent_path: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  tile_color: string | null;
};

type ProductForm = {
  sku: string;
  name: string;
  price: string;
  cost: string;
  barcode: string;
  unit: string;
  stock_min: string;
  active: boolean;
  service: boolean;
  includes_tax: boolean;
  // nuevos
  group_name: string;
  brand: string;
  supplier: string;
  preferred_qty: string;
  reorder_point: string;
  low_stock_alert: boolean;
  allow_price_change: boolean;
};

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  price: "",
  cost: "",
  barcode: "",
  unit: "",
  stock_min: "0",
  active: true,
  service: false,
  includes_tax: false,
  group_name: "",
  brand: "",
  supplier: "",
  preferred_qty: "0",
  reorder_point: "0",
  low_stock_alert: false,
  allow_price_change: false,
};

type UploadProductImageResponse = {
  url: string;
  thumb_url: string | null;
};


const API_BASE = getApiBase();
const DEFAULT_TILE_COLOR = "#1f2937";

function resolveImageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const absolute = new URL(url, API_BASE);
    return absolute.toString();
  } catch (err) {
    console.warn("URL de imagen inválida", url, err);
    return url;
  }
}

type SortOption = "recent" | "oldest" | "sku_asc" | "name_asc";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successToastVisible, setSuccessToastVisible] = useState(false);
  const successToastTimerRef = useRef<number | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  // creación
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProductForm>(emptyForm);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createSkuLocked, setCreateSkuLocked] = useState(true);
  const [createBarcodeLocked, setCreateBarcodeLocked] = useState(true);

  // edición
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteCloseOnSuccess, setDeleteCloseOnSuccess] = useState(false);
  const [editSkuLocked, setEditSkuLocked] = useState(true);
  const [editBarcodeLocked, setEditBarcodeLocked] = useState(true);

  // filtros / orden
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("recent");

  // paginación
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const PRODUCTS_FILTERS_STORAGE_KEY = "metrik_products_filters_v1";

  // importar / exportar
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"filtered" | "all">("all");
  const [exportFileName, setExportFileName] = useState("productos");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // gestor de imágenes (modal separado)
  const [imageManagerOpen, setImageManagerOpen] = useState(false);
  const [imageManagerSearch, setImageManagerSearch] = useState("");
  const [imageManagerSelectedPath, setImageManagerSelectedPath] =
    useState<string | null>(null);
  const [imageManagerUploading, setImageManagerUploading] = useState(false);
  const [imageManagerError, setImageManagerError] = useState<string | null>(null);
  const [imageManagerSuccess, setImageManagerSuccess] = useState<string | null>(null);
  const [groupColorValue, setGroupColorValue] = useState<string>(DEFAULT_TILE_COLOR);
  const [productAppearanceLoading, setProductAppearanceLoading] = useState(false);
  const [productAppearanceError, setProductAppearanceError] = useState<string | null>(null);
  const [productAppearanceSuccess, setProductAppearanceSuccess] = useState<string | null>(null);
  const [productTileColorValue, setProductTileColorValue] =
    useState<string>(DEFAULT_TILE_COLOR);
  const [showAppearanceSettings, setShowAppearanceSettings] = useState(false);
  const isRestoringFiltersRef = useRef(true);

  // refs
  const imageManagerFileInputRef = useRef<HTMLInputElement | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const { token } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const exportableColumns = useMemo(
    () => [
      { key: "sku", label: "SKU", required: true },
      { key: "name", label: "Nombre", required: true },
      { key: "id", label: "ID" },
      { key: "group_name", label: "Grupo" },
      { key: "brand", label: "Marca" },
      { key: "supplier", label: "Proveedor" },
      { key: "price", label: "Precio" },
      { key: "cost", label: "Costo" },
      { key: "barcode", label: "Código barras" },
      { key: "unit", label: "Unidad" },
      { key: "preferred_qty", label: "Cant. preferida" },
      { key: "reorder_point", label: "Punto pedido" },
      { key: "stock_min", label: "Stock mínimo" },
      { key: "low_stock_alert", label: "Alerta stock" },
      { key: "allow_price_change", label: "Cambio $ permitido" },
      { key: "active", label: "Activo" },
      { key: "service", label: "Servicio" },
      { key: "includes_tax", label: "IVA incl." },
    ],
    []
  );
  const [selectedExportColumns, setSelectedExportColumns] = useState(() => {
    const initial: Record<string, boolean> = {};
    exportableColumns.forEach((col) => {
      initial[col.key] = true;
    });
    return initial;
  });

  // cerrar menú de exportar al hacer click fuera

  // debounce de búsqueda
  useEffect(() => {
    if (isRestoringFiltersRef.current) {
      setSearch(searchInput);
      return;
    }
    const id = window.setTimeout(() => {
      setSearch(searchInput);
    }, 200);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // restaurar filtros mientras la sesión esté activa
  useEffect(() => {
    if (typeof window === "undefined") return;
    isRestoringFiltersRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(PRODUCTS_FILTERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          searchInput?: string;
          search?: string;
          showOnlyActive?: boolean;
          selectedGroupFilter?: string;
          selectedBrand?: string;
          selectedSupplier?: string;
          priceMinInput?: string;
          priceMaxInput?: string;
          sortOption?: SortOption;
          page?: number;
        };
        setSearchInput(parsed.searchInput ?? "");
        setSearch(parsed.search ?? parsed.searchInput ?? "");
        setShowOnlyActive(Boolean(parsed.showOnlyActive));
        setSelectedGroupFilter(parsed.selectedGroupFilter ?? "");
        setSelectedBrand(parsed.selectedBrand ?? "");
        setSelectedSupplier(parsed.selectedSupplier ?? "");
        setPriceMinInput(parsed.priceMinInput ?? "");
        setPriceMaxInput(parsed.priceMaxInput ?? "");
        setSortOption(parsed.sortOption ?? "recent");
        setPage(
          typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1
        );
      }
    } catch {
      // ignore storage errors
    } finally {
      window.setTimeout(() => {
        isRestoringFiltersRef.current = false;
      }, 0);
    }
  }, []);

  // persistir filtros mientras la sesión esté activa
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRestoringFiltersRef.current) return;
    const payload = {
      searchInput,
      search,
      showOnlyActive,
      selectedGroupFilter,
      selectedBrand,
      selectedSupplier,
      priceMinInput,
      priceMaxInput,
      sortOption,
      page,
    };
    window.sessionStorage.setItem(
      PRODUCTS_FILTERS_STORAGE_KEY,
      JSON.stringify(payload)
    );
  }, [
    searchInput,
    search,
    showOnlyActive,
    selectedGroupFilter,
    selectedBrand,
    selectedSupplier,
    priceMinInput,
    priceMaxInput,
    sortOption,
    page,
  ]);

  // reset de página cuando cambian filtros
  useEffect(() => {
    if (isRestoringFiltersRef.current) return;
    setPage(1);
  }, [
    search,
    showOnlyActive,
    sortOption,
    selectedGroupFilter,
    selectedBrand,
    selectedSupplier,
    priceMinInput,
    priceMaxInput,
  ]);

  // utilidades
  function handleFormChange(
    e: ChangeEvent<HTMLInputElement>,
    setState: React.Dispatch<React.SetStateAction<ProductForm>>,
  ) {
    const { name, value, type, checked } = e.target;
    setState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function formatMoneyInput(value: string): string {
    const sanitized = value.replace(/[^\d,]/g, "");
    const [rawInt = "", ...rawDecimals] = sanitized.split(",");
    const intPart = rawInt.replace(/^0+(?=\d)/, "");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimalPart = rawDecimals.join("");

    if (decimalPart.length > 0) {
      return `${formattedInt || "0"},${decimalPart}`;
    }
    return formattedInt;
  }

  function formatMoneyFromNumber(value: number): string {
    return formatMoneyInput(String(value).replace(".", ","));
  }

  function parseMoneyValue(value: string): number {
    if (!value) return 0;
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function confirmUngroupedProduct(groupName: string): boolean {
    if (groupName.trim()) return true;
    if (typeof window === "undefined") return true;
    return window.confirm(
      "Este producto no tiene grupo asignado. ¿Deseas guardarlo así?"
    );
  }

  const optionalExportKeys = useMemo(
    () => exportableColumns.filter((col) => !col.required).map((col) => col.key),
    [exportableColumns]
  );
  const allOptionalSelected = useMemo(
    () => optionalExportKeys.every((key) => selectedExportColumns[key]),
    [optionalExportKeys, selectedExportColumns]
  );

  function handleMoneyChange(
    e: ChangeEvent<HTMLInputElement>,
    setState: React.Dispatch<React.SetStateAction<ProductForm>>,
  ) {
    const { name, value } = e.target;
    const formatted = formatMoneyInput(value);
    setState((prev) => ({
      ...prev,
      [name]: formatted,
    }));
  }

  function getSuggestedFromField(
    items: Product[],
    field: "sku" | "barcode",
  ): string {
    const numericValues = items
      .map((p) => p[field])
      .filter((v): v is string => v !== null)
      .map((v) => v.trim())
      .filter((v) => v !== "")
      .map((v) => {
        const n = Number(v);
        return Number.isNaN(n) ? null : { raw: v, num: n };
      })
      .filter((v): v is { raw: string; num: number } => v !== null);

    if (numericValues.length === 0) {
      return "1";
    }

    const maxItem = numericValues.reduce((max, curr) =>
      curr.num > max.num ? curr : max,
    );

    const next = maxItem.num + 1;
    const targetLength = maxItem.raw.length;
    const nextStr = String(next);
    if (nextStr.length >= targetLength) return nextStr;
    return nextStr.padStart(targetLength, "0");
  }

  function prepareCreateFormWithSuggestions() {
    const suggestedSku = getSuggestedFromField(products, "sku");
    const suggestedBarcode = getSuggestedFromField(products, "barcode");

    setCreateForm({
      ...emptyForm,
      sku: suggestedSku,
      barcode: suggestedBarcode,
    });
    setCreateSkuLocked(true);
    setCreateBarcodeLocked(true);
  }
  function handleCloseCreateModal() {
    setCreateOpen(false);
    setCreateForm(emptyForm);
    setCreateSkuLocked(true);
    setCreateBarcodeLocked(true);
  }

  function handleCloseEditModal() {
    setEditOpen(false);
    setEditId(null);
    setEditForm(emptyForm);
    setProductAppearanceError(null);
    setProductAppearanceSuccess(null);
    setProductAppearanceLoading(false);
    setProductTileColorValue(DEFAULT_TILE_COLOR);
    setShowAppearanceSettings(false);
    setConfirmDeleteOpen(false);
    setDeleteOptionsOpen(false);
    setDeleteTargetId(null);
    setDeleteCloseOnSuccess(false);
    setEditSkuLocked(true);
    setEditBarcodeLocked(true);
    if (productImageInputRef.current) {
      productImageInputRef.current.value = "";
    }
  }

  function openDeleteOptions(
    id: number,
    options?: { closeOnSuccess?: boolean; isActive?: boolean },
  ) {
    setDeleteTargetId(id);
    setDeleteCloseOnSuccess(Boolean(options?.closeOnSuccess));
    const productIsActive =
      typeof options?.isActive === "boolean"
        ? options.isActive
        : products.find((p) => p.id === id)?.active ?? true;
    if (productIsActive) {
      setConfirmDeleteOpen(false);
      setDeleteOptionsOpen(true);
    } else {
      setDeleteOptionsOpen(false);
      setConfirmDeleteOpen(true);
    }
  }

  function closeDeleteDialogs() {
    setDeleteOptionsOpen(false);
    setConfirmDeleteOpen(false);
    setDeleteTargetId(null);
    setDeleteCloseOnSuccess(false);
  }

  const productGroupPaths = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.group_name) {
        const trimmed = p.group_name.trim();
        if (!trimmed) return;
        const segments = trimmed
          .split("/")
          .map((seg) => seg.trim())
          .filter((seg) => seg.length > 0);
        segments.forEach((_, idx) => {
          const path = segments.slice(0, idx + 1).join("/");
          if (path) set.add(path);
        });
      }
    });
    return Array.from(set);
  }, [products]);

  const editedProduct = useMemo(() => {
    if (editId == null) return null;
    return products.find((p) => p.id === editId) ?? null;
  }, [editId, products]);

  const editedProductPreview = useMemo(() => {
    if (!editedProduct) return null;
    return resolveImageUrl(
      editedProduct.image_thumb_url ?? editedProduct.image_url,
    );
  }, [editedProduct]);

  const editedProductHasImage = Boolean(
    editedProduct?.image_url || editedProduct?.image_thumb_url,
  );

  const imageManagerGroups = useMemo(() => {
  const entries: {
      path: string;
      displayName: string;
      record: ProductGroup | null;
    }[] = [];
    const usedPaths = new Set<string>();

    groups.forEach((g) => {
      usedPaths.add(g.path);
      entries.push({
        path: g.path,
        displayName: g.display_name || g.path,
        record: g,
      });
    });

    productGroupPaths.forEach((path) => {
      if (usedPaths.has(path)) return;
      const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
      const name = segments[segments.length - 1] ?? path;
      entries.push({
        path,
        displayName: name,
        record: null,
      });
    });

    const term = imageManagerSearch.toLowerCase().trim();
    const filtered = entries.filter((entry) => {
      if (term === "") return true;
      const pathLower = entry.path.toLowerCase();
      const nameLower = entry.displayName.toLowerCase();
      return pathLower.includes(term) || nameLower.includes(term);
    });

    filtered.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es")
    );
    return filtered;
  }, [groups, productGroupPaths, imageManagerSearch]);

  useEffect(() => {
    if (!editedProduct) {
      setProductTileColorValue(DEFAULT_TILE_COLOR);
      setProductAppearanceError(null);
      setProductAppearanceSuccess(null);
      if (productImageInputRef.current) {
        productImageInputRef.current.value = "";
      }
      setShowAppearanceSettings(false);
      return;
    }
    setProductTileColorValue(
      editedProduct.tile_color ?? DEFAULT_TILE_COLOR,
    );
    if (productImageInputRef.current) {
      productImageInputRef.current.value = "";
    }
  }, [editedProduct]);

  useEffect(() => {
    if (!imageManagerOpen) return;
    if (imageManagerGroups.length === 0) {
      setImageManagerSelectedPath(null);
      return;
    }
    const exists = imageManagerSelectedPath
      ? imageManagerGroups.some((g) => g.path === imageManagerSelectedPath)
      : false;
    if (!exists) {
      setImageManagerSelectedPath(imageManagerGroups[0].path);
    }
  }, [imageManagerOpen, imageManagerGroups, imageManagerSelectedPath]);

  useEffect(() => {
    if (!imageManagerOpen) return;
    setImageManagerError(null);
    setImageManagerSuccess(null);
    if (imageManagerFileInputRef.current) {
      imageManagerFileInputRef.current.value = "";
    }
  }, [imageManagerSelectedPath, imageManagerOpen]);

  const selectedGroupOption = useMemo(() => {
    if (!imageManagerSelectedPath) return null;
    return imageManagerGroups.find((g) => g.path === imageManagerSelectedPath) ?? null;
  }, [imageManagerSelectedPath, imageManagerGroups]);

  const selectedGroup = selectedGroupOption?.record ?? null;

  useEffect(() => {
    if (!imageManagerSelectedPath) {
      setGroupColorValue(DEFAULT_TILE_COLOR);
      return;
    }
    const nextColor = selectedGroup?.tile_color ?? DEFAULT_TILE_COLOR;
    setGroupColorValue(nextColor);
  }, [imageManagerSelectedPath, selectedGroup?.tile_color]);

  const selectedGroupPreview = useMemo(() => {
    if (!selectedGroup) return null;
    return resolveImageUrl(
      selectedGroup.image_thumb_url ?? selectedGroup.image_url
    );
  }, [selectedGroup]);

  function openImageManagerModal() {
    setImageManagerSearch("");
    setImageManagerError(null);
    setImageManagerSuccess(null);
    setImageManagerOpen(true);
    if (groups.length === 0) {
      void loadGroups();
    }
  }

  function closeImageManagerModal() {
    setImageManagerOpen(false);
    setImageManagerSelectedPath(null);
    setImageManagerUploading(false);
    setImageManagerError(null);
    setImageManagerSuccess(null);
    if (imageManagerFileInputRef.current) {
      imageManagerFileInputRef.current.value = "";
    }
  }

  function deriveGroupMetadataFromPath(path: string) {
    const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
    const displayName = segments[segments.length - 1] ?? path;
    const parent_path = segments.length > 1 ? segments.slice(0, -1).join("/") : null;
    return { display_name: displayName, parent_path };
  }

  async function ensureGroupRecord(path: string): Promise<ProductGroup> {
    const existing = groups.find((g) => g.path === path);
    if (existing) return existing;
    if (!authHeaders) throw new Error("Debes iniciar sesión para crear el grupo.");

    const meta = deriveGroupMetadataFromPath(path);
    const res = await fetch(`${API_BASE}/product-groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      credentials: "include",
      body: JSON.stringify({ path, ...meta }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const msg =
        (data && (data.detail as string)) ||
        `Error al crear el grupo (código ${res.status})`;
      throw new Error(msg);
    }

    const created: ProductGroup = await res.json();
    setGroups((prev) => [...prev, created]);
    return created;
  }

  async function uploadImageForSelectedGroup(file: File) {
    if (!imageManagerSelectedPath) return;
    if (!authHeaders) {
      setImageManagerError("Debes iniciar sesión para subir la imagen.");
      return;
    }
    setImageManagerUploading(true);
    setImageManagerError(null);
    setImageManagerSuccess(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${API_BASE}/uploads/product-images`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al subir imagen (código ${uploadRes.status})`;
        throw new Error(msg);
      }

      const data: UploadProductImageResponse = await uploadRes.json();
      const groupRecord = await ensureGroupRecord(imageManagerSelectedPath);

      const payload = {
        image_url: data.url,
        image_thumb_url: data.thumb_url,
      };

      const updateRes = await fetch(`${API_BASE}/product-groups/${groupRecord.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!updateRes.ok) {
        const resp = await updateRes.json().catch(() => null);
        const msg =
          (resp && (resp.detail as string)) ||
          `Error al actualizar el grupo (código ${updateRes.status})`;
        throw new Error(msg);
      }

      const updated: ProductGroup = await updateRes.json();
      setGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g))
      );
      setImageManagerSuccess("Imagen del grupo actualizada.");
    } catch (err: unknown) {
      setImageManagerError(
        err instanceof Error ? err.message : "No se pudo subir la imagen."
      );
    } finally {
      setImageManagerUploading(false);
      if (imageManagerFileInputRef.current) {
        imageManagerFileInputRef.current.value = "";
      }
    }
  }

  async function removeImageForSelectedGroup() {
    if (!selectedGroup) {
      setImageManagerError("Debes crear el grupo antes de eliminar su imagen.");
      return;
    }
    if (!authHeaders) {
      setImageManagerError("Debes iniciar sesión para actualizar la imagen.");
      return;
    }
    setImageManagerUploading(true);
    setImageManagerError(null);
    setImageManagerSuccess(null);

    try {
      const payload = { image_url: null, image_thumb_url: null };
      const res = await fetch(`${API_BASE}/product-groups/${selectedGroup.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar el grupo (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: ProductGroup = await res.json();
      setGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g))
      );
      setImageManagerSuccess("Imagen eliminada del grupo.");
    } catch (err: unknown) {
      setImageManagerError(
        err instanceof Error ? err.message : "No se pudo eliminar la imagen."
      );
    } finally {
      setImageManagerUploading(false);
      if (imageManagerFileInputRef.current) {
        imageManagerFileInputRef.current.value = "";
      }
    }
  }

  function handleImageManagerFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadImageForSelectedGroup(file);
  }

  function handleProductImageInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadImageForProduct(file);
  }

  async function uploadImageForProduct(file: File) {
    if (editId == null) return;
    if (!authHeaders) {
      setProductAppearanceError("Debes iniciar sesión para subir la imagen.");
      return;
    }
    setProductAppearanceLoading(true);
    setProductAppearanceError(null);
    setProductAppearanceSuccess(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${API_BASE}/uploads/product-images`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al subir imagen (código ${uploadRes.status})`;
        throw new Error(msg);
      }

      const data: UploadProductImageResponse = await uploadRes.json();
      const res = await fetch(`${API_BASE}/products/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({
          image_url: data.url,
          image_thumb_url: data.thumb_url,
        }),
      });

      if (!res.ok) {
        const resp = await res.json().catch(() => null);
        const msg =
          (resp && (resp.detail as string)) ||
          `Error al actualizar el producto (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setProductAppearanceSuccess("Imagen del producto actualizada.");
    } catch (err: unknown) {
      setProductAppearanceError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la imagen del producto.",
      );
    } finally {
      setProductAppearanceLoading(false);
      if (productImageInputRef.current) {
        productImageInputRef.current.value = "";
      }
    }
  }

  async function removeImageForProduct() {
    if (editId == null) return;
    if (!authHeaders) {
      setProductAppearanceError("Debes iniciar sesión para actualizar la imagen.");
      return;
    }
    setProductAppearanceLoading(true);
    setProductAppearanceError(null);
    setProductAppearanceSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/products/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ image_url: null, image_thumb_url: null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar el producto (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setProductAppearanceSuccess("Imagen eliminada del producto.");
    } catch (err: unknown) {
      setProductAppearanceError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar la imagen del producto.",
      );
    } finally {
      setProductAppearanceLoading(false);
      if (productImageInputRef.current) {
        productImageInputRef.current.value = "";
      }
    }
  }

  async function saveProductTileColorValue() {
    if (editId == null) return;
    if (!authHeaders) {
      setProductAppearanceError("Debes iniciar sesión para guardar el color.");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(productTileColorValue)) {
      setProductAppearanceError("El color debe tener el formato #RRGGBB.");
      return;
    }
    setProductAppearanceLoading(true);
    setProductAppearanceError(null);
    setProductAppearanceSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/products/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ tile_color: productTileColorValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar el color (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setProductAppearanceSuccess("Color del producto actualizado.");
    } catch (err: unknown) {
      setProductAppearanceError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el color del producto.",
      );
    } finally {
      setProductAppearanceLoading(false);
    }
  }

  async function clearProductTileColorValue() {
    if (editId == null) return;
    if (!authHeaders) {
      setProductAppearanceError("Debes iniciar sesión para quitar el color.");
      return;
    }
    setProductAppearanceLoading(true);
    setProductAppearanceError(null);
    setProductAppearanceSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/products/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ tile_color: null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al quitar el color (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setProductTileColorValue(DEFAULT_TILE_COLOR);
      setProductAppearanceSuccess("Color restablecido al predeterminado.");
    } catch (err: unknown) {
      setProductAppearanceError(
        err instanceof Error
          ? err.message
          : "No se pudo quitar el color del producto.",
      );
    } finally {
      setProductAppearanceLoading(false);
    }
  }

  async function saveGroupTileColor() {
    if (!imageManagerSelectedPath) return;
    if (!authHeaders) {
      setImageManagerError("Debes iniciar sesión para guardar el color.");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(groupColorValue)) {
      setImageManagerError("El color debe tener el formato #RRGGBB.");
      return;
    }
    setImageManagerUploading(true);
    setImageManagerError(null);
    setImageManagerSuccess(null);
    try {
      const groupRecord = await ensureGroupRecord(imageManagerSelectedPath);
      const res = await fetch(`${API_BASE}/product-groups/${groupRecord.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ tile_color: groupColorValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar el color (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: ProductGroup = await res.json();
      setGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g))
      );
      setImageManagerSuccess("Color del grupo actualizado.");
    } catch (err: unknown) {
      setImageManagerError(
        err instanceof Error ? err.message : "No se pudo guardar el color."
      );
    } finally {
      setImageManagerUploading(false);
    }
  }

  async function clearGroupTileColor() {
    if (!selectedGroup) {
      setImageManagerError("Crea el grupo antes de quitar el color.");
      return;
    }
    if (!authHeaders) {
      setImageManagerError("Debes iniciar sesión para actualizar el color.");
      return;
    }
    setImageManagerUploading(true);
    setImageManagerError(null);
    setImageManagerSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/product-groups/${selectedGroup.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ tile_color: null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar el color (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: ProductGroup = await res.json();
      setGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g))
      );
      setGroupColorValue(DEFAULT_TILE_COLOR);
      setImageManagerSuccess("Color restablecido al predeterminado.");
    } catch (err: unknown) {
      setImageManagerError(
        err instanceof Error ? err.message : "No se pudo quitar el color."
      );
    } finally {
      setImageManagerUploading(false);
    }
  }

  // cargar productos (inicial + después de importar)
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      if (!authHeaders) throw new Error("Debes iniciar sesión para ver productos.");
      const res = await fetch(`${API_BASE}/products/?limit=5000`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Product[] = await res.json();
      setProducts(data);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error loading products");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authHeaders) return;
    void loadProducts();
  }, [authHeaders, loadProducts]);

  const loadGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      setGroupsError(null);
      if (!authHeaders) throw new Error("Debes iniciar sesión para ver grupos.");
      const res = await fetch(`${API_BASE}/product-groups`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: ProductGroup[] = await res.json();
      setGroups(data);
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : "Error al cargar grupos");
    } finally {
      setGroupsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authHeaders) return;
    void loadGroups();
  }, [authHeaders, loadGroups]);

  // crear producto
  async function handleSubmitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmUngroupedProduct(createForm.group_name)) {
      return;
    }
    try {
      setSavingCreate(true);
      setError(null);

      const payload = {
        sku: createForm.sku || null,
        name: createForm.name,
        price: parseMoneyValue(createForm.price),
        cost: parseMoneyValue(createForm.cost),
        barcode: createForm.barcode || null,
        unit: createForm.unit || null,
        stock_min: parseInt(createForm.stock_min || "0", 10),
        active: createForm.active,
        service: createForm.service,
        includes_tax: createForm.includes_tax,
        group_name: createForm.group_name || null,
        brand: createForm.brand || null,
        supplier: createForm.supplier || null,
        preferred_qty: parseInt(createForm.preferred_qty || "0", 10),
        reorder_point: parseInt(createForm.reorder_point || "0", 10),
        low_stock_alert: createForm.low_stock_alert,
        allow_price_change: createForm.allow_price_change,
      };


      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${API_BASE}/products/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al guardar (código ${res.status})`;
        throw new Error(msg);
      }

      const created: Product = await res.json();
      setProducts((prev) => [...prev, created]);

      handleCloseCreateModal();
      setSuccessMessage("Producto creado correctamente.");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido al guardar");
    } finally {
      setSavingCreate(false);
    }
  }

  // abrir modal de edición
  function openEdit(product: Product) {
    setEditId(product.id);
    setEditForm({
      sku: product.sku ?? "",
      name: product.name,
      price: formatMoneyFromNumber(product.price),
      cost: formatMoneyFromNumber(product.cost),
      barcode: product.barcode ?? "",
      unit: product.unit ?? "",
      stock_min: product.stock_min.toString(),
      active: product.active,
      service: product.service,
      includes_tax: product.includes_tax,
      group_name: product.group_name ?? "",
      brand: product.brand ?? "",
      supplier: product.supplier ?? "",
      preferred_qty: (product.preferred_qty ?? 0).toString(),
      reorder_point: (product.reorder_point ?? 0).toString(),
      low_stock_alert: product.low_stock_alert,
      allow_price_change: product.allow_price_change,

    });
    setEditSkuLocked(true);
    setEditBarcodeLocked(true);
    setEditOpen(true);
  }

  // guardar cambios
  async function handleSubmitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editId == null) return;
    if (!confirmUngroupedProduct(editForm.group_name)) {
      return;
    }

    try {
      setSavingEdit(true);
      setError(null);

      const payload: Partial<Product> = {};

      if (editForm.name.trim() !== "") payload.name = editForm.name.trim();
      if (editForm.sku !== "") payload.sku = editForm.sku;
      if (editForm.price !== "")
        payload.price = parseMoneyValue(editForm.price);
      if (editForm.cost !== "")
        payload.cost = parseMoneyValue(editForm.cost);
      if (editForm.stock_min !== "")
        payload.stock_min = parseInt(editForm.stock_min || "0", 10);
      if (editForm.preferred_qty !== "")
        payload.preferred_qty = parseInt(editForm.preferred_qty || "0", 10);
      if (editForm.reorder_point !== "")
        payload.reorder_point = parseInt(editForm.reorder_point || "0", 10);

      payload.barcode = editForm.barcode || null;
      payload.unit = editForm.unit || null;
      payload.active = editForm.active;
      payload.service = editForm.service;
      payload.includes_tax = editForm.includes_tax;
      payload.group_name = editForm.group_name || null;
      payload.brand = editForm.brand || null;
      payload.supplier = editForm.supplier || null;
      payload.low_stock_alert = editForm.low_stock_alert;
      payload.allow_price_change = editForm.allow_price_change;

      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${API_BASE}/products/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al actualizar (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );

      handleCloseEditModal();
      setSuccessMessage("Producto actualizado correctamente.");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido al actualizar");
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    if (!successMessage) {
      setSuccessToastVisible(false);
      return;
    }
    if (successToastTimerRef.current) {
      window.clearTimeout(successToastTimerRef.current);
    }
    setSuccessToastVisible(false);
    requestAnimationFrame(() => setSuccessToastVisible(true));
    successToastTimerRef.current = window.setTimeout(() => {
      setSuccessToastVisible(false);
      window.setTimeout(() => setSuccessMessage(null), 220);
    }, 3200);
    return () => {
      if (successToastTimerRef.current) {
        window.clearTimeout(successToastTimerRef.current);
      }
    };
  }, [successMessage]);

  // eliminar producto
  async function handleDelete(
    id: number,
    options?: { closeOnSuccess?: boolean },
  ) {
    try {
      setError(null);
      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders },
        credentials: "include",
      });

      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al eliminar (código ${res.status})`;
        throw new Error(msg);
      }

      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (options?.closeOnSuccess) {
        handleCloseEditModal();
      } else {
        closeDeleteDialogs();
      }
      setSuccessMessage("Producto eliminado correctamente.");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido al eliminar");
    }
  }

  async function handleDeactivateProduct(
    id: number,
    options?: { closeOnSuccess?: boolean },
  ) {
    try {
      setError(null);
      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({ active: false }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al desactivar (código ${res.status})`;
        throw new Error(msg);
      }

      const updated: Product = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (editId === updated.id) {
        setEditForm((prev) => ({ ...prev, active: updated.active }));
      }
      if (options?.closeOnSuccess) {
        handleCloseEditModal();
      } else {
        closeDeleteDialogs();
      }
      setSuccessMessage("Producto desactivado correctamente.");
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido al desactivar");
    }
  }

  async function handleExport(format: "xlsx" | "csv") {
    setExportDialogOpen(false);
    if (!authHeaders) {
      setError("Debes iniciar sesión para exportar.");
      return;
    }
    try {
      const selectedKeys = exportableColumns
        .filter((col) => col.required || selectedExportColumns[col.key])
        .map((col) => col.key);
      if (selectedKeys.length === 0) {
        setError("Selecciona al menos una columna para exportar.");
        return;
      }

      const payload = {
        scope: exportScope,
        search: exportScope === "filtered" ? search : "",
        show_only_active:
          exportScope === "filtered" ? showOnlyActive : false,
        group: exportScope === "filtered" ? selectedGroupFilter : "",
        brand: exportScope === "filtered" ? selectedBrand : "",
        supplier: exportScope === "filtered" ? selectedSupplier : "",
        price_min: exportScope === "filtered" ? priceMinInput : "",
        price_max: exportScope === "filtered" ? priceMaxInput : "",
        columns: selectedKeys,
        file_name: exportFileName.trim() || "productos",
      };
      const res = await fetch(`${API_BASE}/products/export/${format}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Error ${res.status} al exportar`);
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = exportFileName.trim() || "productos";
      link.href = downloadUrl;
      link.download = `${safeName}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo exportar el archivo."
      );
    }
  }

  // importar
  async function handleImport() {
    if (!importFile) return;
    try {
      setImporting(true);
      setImportResult(null);
      setError(null);

      const formData = new FormData();
      formData.append("file", importFile);

      if (!authHeaders) throw new Error("Sesión expirada.");
      const res = await fetch(`${API_BASE}/products/import/xlsx`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && (data.detail as string)) ||
          `Error al importar (código ${res.status})`;
        throw new Error(msg);
      }

      const data = await res.json();
      const msg = `Importación completada. Creados: ${data.created}, Actualizados: ${data.updated}.`;
      setImportResult(msg);

      await loadProducts();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Error desconocido al importar");
    } finally {
      setImporting(false);
    }
  }

  // filtros + orden con useMemo
  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    const minPrice = parseMoneyValue(priceMinInput);
    const maxPrice = parseMoneyValue(priceMaxInput);

    return products.filter((p) => {
      const matchesSearch =
        term === "" ||
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.group_name && p.group_name.toLowerCase().includes(term)) ||
        (p.brand && p.brand.toLowerCase().includes(term)) ||
        (p.supplier && p.supplier.toLowerCase().includes(term));

      const matchesActive = !showOnlyActive || p.active;
      const matchesGroup =
        !selectedGroupFilter || (p.group_name ?? "") === selectedGroupFilter;
      const matchesBrand =
        !selectedBrand || (p.brand ?? "") === selectedBrand;
      const matchesSupplier =
        !selectedSupplier || (p.supplier ?? "") === selectedSupplier;
      const matchesMinPrice = minPrice <= 0 || p.price >= minPrice;
      const matchesMaxPrice = maxPrice <= 0 || p.price <= maxPrice;

      return (
        matchesSearch &&
        matchesActive &&
        matchesGroup &&
        matchesBrand &&
        matchesSupplier &&
        matchesMinPrice &&
        matchesMaxPrice
      );
    });
  }, [
    products,
    search,
    showOnlyActive,
    selectedGroupFilter,
    selectedBrand,
    selectedSupplier,
    priceMinInput,
    priceMaxInput,
  ]);

  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];

    arr.sort((a, b) => {
      switch (sortOption) {
        case "recent":
          return b.id - a.id;
        case "oldest":
          return a.id - b.id;
        case "sku_asc": {
          const aSku = a.sku ?? "";
          const bSku = b.sku ?? "";
          return aSku.localeCompare(bSku, "es");
        }
        case "name_asc":
          return a.name.localeCompare(b.name, "es");
        default:
          return 0;
      }
    });

    return arr;
  }, [filteredProducts, sortOption]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.group_name) {
        set.add(p.group_name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.brand) {
        set.add(p.brand);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.supplier) {
        set.add(p.supplier);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const [createGroupFocused, setCreateGroupFocused] = useState(false);
  const [editGroupFocused, setEditGroupFocused] = useState(false);

  const totalCount = products.length;
  const filteredCount = filteredProducts.length;
  const hasActiveFilters =
    searchInput.trim() !== "" ||
    showOnlyActive ||
    selectedGroupFilter !== "" ||
    selectedBrand !== "" ||
    selectedSupplier !== "" ||
    priceMinInput.trim() !== "" ||
    priceMaxInput.trim() !== "";

  const buildExportFileName = useCallback(() => {
    const parts: string[] = ["productos"];
    if (exportScope === "filtered" && hasActiveFilters) {
      if (search) parts.push(`q-${search}`);
      if (showOnlyActive) parts.push("activos");
      if (selectedGroupFilter) parts.push(`grupo-${selectedGroupFilter}`);
      if (selectedBrand) parts.push(`marca-${selectedBrand}`);
      if (selectedSupplier) parts.push(`prov-${selectedSupplier}`);
      if (priceMinInput || priceMaxInput) {
        parts.push(
          `precio-${priceMinInput || "0"}-${priceMaxInput || "max"}`
        );
      }
    }
    const raw = parts.join("_");
    return raw
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+/g, "-");
  }, [
    exportScope,
    hasActiveFilters,
    search,
    showOnlyActive,
    selectedGroupFilter,
    selectedBrand,
    selectedSupplier,
    priceMinInput,
    priceMaxInput,
  ]);

  useEffect(() => {
    if (!exportDialogOpen) return;
    setExportScope(hasActiveFilters ? "filtered" : "all");
    setExportFileName(buildExportFileName());
  }, [exportDialogOpen, hasActiveFilters, buildExportFileName]);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setShowOnlyActive(false);
    setSelectedGroupFilter("");
    setSelectedBrand("");
    setSelectedSupplier("");
    setPriceMinInput("");
    setPriceMaxInput("");
  };

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

  // sincronizar scroll horizontal entre barra superior y tabla
  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    const table = tableRef.current;
    if (!wrapper || !table) return;
    const updateWidth = () => {
      setTableScrollWidth(table.scrollWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [paginatedProducts, sortedProducts]);

  const syncTopScroll = useCallback(() => {
    const wrapper = tableWrapperRef.current;
    const top = topScrollRef.current;
    if (!wrapper || !top) return;
    if (top.scrollLeft !== wrapper.scrollLeft) {
      top.scrollLeft = wrapper.scrollLeft;
    }
  }, []);

  const syncMainScroll = useCallback(() => {
    const wrapper = tableWrapperRef.current;
    const top = topScrollRef.current;
    if (!wrapper || !top) return;
    if (wrapper.scrollLeft !== top.scrollLeft) {
      wrapper.scrollLeft = top.scrollLeft;
    }
  }, []);

  // UI
  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* HEADER + TOOLBAR */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Productos</h1>
            <p className="text-sm text-slate-400">
              Gestión del catálogo base de Metrik, la suite de Kensar Electronic.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
            <button
              onClick={() => {
                prepareCreateFormWithSuggestions();
                setCreateOpen(true);
              }}
              className="inline-flex items-center rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition"
            >
              + Nuevo producto
            </button>

            <button
              onClick={openImageManagerModal}
              className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              Gestionar imágenes de grupos
            </button>

            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              Importar
            </button>

            <button
              onClick={() => setExportDialogOpen(true)}
              className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              Exportar
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Ordenar por:</span>
              <select
                value={sortOption}
                onChange={(e) =>
                  setSortOption(e.target.value as SortOption)
                }
                className="rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400"
              >
                <option value="recent">Más recientes</option>
                <option value="oldest">Más antiguos</option>
                <option value="sku_asc">SKU ascendente</option>
                <option value="name_asc">Nombre A–Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:items-center">
            <input
              type="text"
              placeholder="Buscar por nombre, SKU o código..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full md:w-72 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <label className="inline-flex items-center gap-2 text-xs md:text-sm text-slate-300">
              <input
                type="checkbox"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900"
              />
              Mostrar solo activos
            </label>
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="w-full md:w-56 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="">Todos los grupos</option>
              {groupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full md:w-48 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="">Todas las marcas</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full md:w-48 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="">Todos los proveedores</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier} value={supplier}>
                  {supplier}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Precio min"
                value={priceMinInput}
                onChange={(e) =>
                  setPriceMinInput(formatMoneyInput(e.target.value))
                }
                className="w-full md:w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="Precio max"
                value={priceMaxInput}
                onChange={(e) =>
                  setPriceMaxInput(formatMoneyInput(e.target.value))
                }
                className="w-full md:w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-emerald-400/70 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="text-xs md:text-sm text-slate-400 text-right">
            Mostrando{" "}
            <span className="text-slate-100 font-semibold">
              {filteredCount}
            </span>{" "}
            productos (de{" "}
            <span className="text-slate-100 font-semibold">
              {totalCount}
            </span>{" "}
            totales)
          </div>
        </div>
      </header>

      {/* LISTA DE PRODUCTOS */}
      <section className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`products-skeleton-${idx}`}
                className="h-12 rounded-lg bg-slate-800/60 animate-pulse"
              />
            ))}
          </div>
        )}
        {error && (
          <p className="text-red-400 mb-2">
            Error: {error}
          </p>
        )}

        {!loading && !error && (
          <div className="overflow-hidden rounded-xl ui-surface dashboard-kpi-card shadow-lg">
            <div
              ref={topScrollRef}
              onScroll={syncMainScroll}
              className="overflow-x-auto scrollbar-thin border-b dashboard-border"
            >
              <div
                style={{ width: tableScrollWidth || "100%" }}
                className="h-3"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-xs ui-text-muted border-b dashboard-border">
              <div>
                Página{" "}
                <span className="font-semibold ui-text">
                  {currentPage}
                </span>{" "}
                de{" "}
                <span className="font-semibold ui-text">
                  {totalPages}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(1)}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  ⇤ Primera
                </button>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  Siguiente →
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  Última ⇥
                </button>
              </div>
            </div>
            <div
              ref={tableWrapperRef}
              onScroll={syncTopScroll}
              className="overflow-x-auto"
            >
              <table ref={tableRef} className="min-w-full text-sm">
                <thead className="dashboard-table-head">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">ID</th>
                    <th className="px-4 py-3 text-left font-semibold">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[260px]">
                      Nombre
                    </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Grupo
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Marca
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Precio
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Costo
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Código barras
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Unidad
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Cant. preferida
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Punto pedido
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Stock mínimo
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Alerta stock
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Cambio $ permitido
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Activo
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Servicio
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    IVA incl.
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Acciones
                  </th>
                  </tr>
                </thead>
                <tbody>
                {paginatedProducts.map((p, rowIndex) => (
                  <tr
                    key={p.id}
                    onDoubleClick={() => openEdit(p)}
                    className={`border-b dashboard-border transition cursor-pointer ${
                      rowIndex % 2 === 0 ? "dashboard-row" : "dashboard-row-alt"
                    }`}
                  >

                    <td className="px-4 py-3">{p.id}</td>
                    <td className="px-4 py-3">{p.sku}</td>
                    <td className="px-4 py-3 min-w-[260px]">{p.name}</td>
                    <td className="px-4 py-3">{p.group_name}</td>
                    <td className="px-4 py-3">{p.brand}</td>
                    <td className="px-4 py-3">{p.supplier}</td>
                    <td className="px-4 py-3 text-right">
                      {p.price.toLocaleString("es-ES", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                        useGrouping: true,
                      })}

                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.cost.toLocaleString("es-ES", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                        useGrouping: true,
                      })}
                    </td>
                    <td className="px-4 py-3">{p.barcode}</td>
                    <td className="px-4 py-3">{p.unit}</td>
                    <td className="px-4 py-3 text-right">
                      {p.preferred_qty}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.reorder_point}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.low_stock_alert ? "⚠️" : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.stock_min}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.allow_price_change ? "✅" : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.active ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.service ? "🛠️" : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.includes_tax ? "✔️" : "—"}
                    </td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="inline-flex items-center rounded-md border border-emerald-400 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() =>
                          openDeleteOptions(p.id, { isActive: p.active })
                        }
                        className="inline-flex items-center rounded-md border border-red-400 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}

                {paginatedProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={17}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No hay productos que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 text-xs dashboard-table-footer ui-text-muted">
              <div>
                Página{" "}
                <span className="font-semibold ui-text">
                  {currentPage}
                </span>{" "}
                de{" "}
                <span className="font-semibold ui-text">
                  {totalPages}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(1)}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  ⇤ Primera
                </button>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  Siguiente →
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="px-2 py-1 rounded-md dashboard-button text-xs disabled:opacity-40"
                >
                  Última ⇥
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Modal preferir desactivar antes de eliminar */}
      {deleteOptionsOpen && deleteTargetId != null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-100">
                ¿Qué quieres hacer con el producto #{deleteTargetId}?
              </p>
              <p className="text-xs text-slate-400">
                Recomendado: desactivar para conservar historial y evitar ventas nuevas.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialogs}
                className="px-3 py-2 text-xs rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleDeactivateProduct(deleteTargetId, {
                    closeOnSuccess: deleteCloseOnSuccess,
                  })
                }
                className="px-3 py-2 text-xs rounded-md border border-emerald-400 text-emerald-200 hover:bg-emerald-500/10"
              >
                Desactivar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOptionsOpen(false);
                  setConfirmDeleteOpen(true);
                }}
                className="px-3 py-2 text-xs rounded-md bg-red-500 text-white font-semibold hover:bg-red-400"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminar */}
      {confirmDeleteOpen && deleteTargetId != null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4">
            <div className="text-sm text-slate-200">
              ¿Eliminar el producto #{deleteTargetId}? Esta acción no se puede deshacer.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialogs}
                className="px-3 py-2 text-xs rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleDelete(deleteTargetId, {
                    closeOnSuccess: deleteCloseOnSuccess,
                  })
                }
                className="px-3 py-2 text-xs rounded-md bg-red-500 text-white font-semibold hover:bg-red-400"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREACIÓN */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-xl rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Nuevo producto</h2>
              <button
                onClick={handleCloseCreateModal}
                className="text-slate-400 hover:text-slate-100 text-sm"
              >
                Cerrar ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmitCreate}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
            >
              <div className="space-y-1">
                <label className="block text-slate-300">SKU</label>
                <div className="relative">
                  <input
                    name="sku"
                    value={createForm.sku}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    disabled={createSkuLocked}
                    className={`w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 pr-10 outline-none focus:border-emerald-400 ${createSkuLocked ? "text-slate-400" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setCreateSkuLocked((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    aria-pressed={!createSkuLocked}
                    aria-label={
                      createSkuLocked
                        ? "Desbloquear campo SKU"
                        : "Bloquear campo SKU"
                    }
                  >
                    {createSkuLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-300">Nombre</label>
                <input
                  name="name"
                  value={createForm.name}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  required
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Grupo</label>
                <div className="relative">
                  <input
                    name="group_name"
                    value={createForm.group_name}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    onFocus={() => setCreateGroupFocused(true)}
                    onBlur={() => {
                      // pequeño retardo para permitir click en la sugerencia
                      setTimeout(() => setCreateGroupFocused(false), 100);
                    }}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                    autoComplete="off"
                  />

                  {createGroupFocused && groupOptions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 text-xs shadow-lg z-20">
                      {groupOptions
                        .filter((g) =>
                          g.toLowerCase().includes(createForm.group_name.toLowerCase()),
                        )
                        .map((g) => (
                          <button
                            key={g}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setCreateForm((prev) => ({ ...prev, group_name: g }));
                              setCreateGroupFocused(false);
                            }}
                            className="block w-full text-left px-3 py-1.5 hover:bg-slate-800"
                          >
                            {g}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>


              <div className="space-y-1">
                <label className="block text-slate-300">Marca</label>
                <input
                  name="brand"
                  value={createForm.brand}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-300">Proveedor</label>
                <input
                  name="supplier"
                  value={createForm.supplier}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Precio</label>
                <input
                  name="price"
                  type="text"
                  inputMode="decimal"
                  value={createForm.price}
                  onChange={(e) => handleMoneyChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Costo</label>
                <input
                  name="cost"
                  type="text"
                  inputMode="decimal"
                  value={createForm.cost}
                  onChange={(e) => handleMoneyChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">
                  Stock mínimo
                </label>
                <input
                  name="stock_min"
                  type="number"
                  value={createForm.stock_min}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Cantidad preferida</label>
                <input
                  name="preferred_qty"
                  type="number"
                  value={createForm.preferred_qty}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Punto de pedido</label>
                <input
                  name="reorder_point"
                  type="number"
                  value={createForm.reorder_point}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col justify-center gap-1">
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="low_stock_alert"
                    checked={createForm.low_stock_alert}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Alerta de stock bajo
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="allow_price_change"
                    checked={createForm.allow_price_change}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Permitir cambiar precio en ventas
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">
                  Código de barras
                </label>
                <div className="relative">
                  <input
                    name="barcode"
                    value={createForm.barcode}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    disabled={createBarcodeLocked}
                    className={`w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 pr-10 outline-none focus:border-emerald-400 ${createBarcodeLocked ? "text-slate-400" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setCreateBarcodeLocked((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    aria-pressed={!createBarcodeLocked}
                    aria-label={
                      createBarcodeLocked
                        ? "Desbloquear campo código de barras"
                        : "Bloquear campo código de barras"
                    }
                  >
                    {createBarcodeLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Unidad</label>
                <input
                  name="unit"
                  value={createForm.unit}
                  onChange={(e) => handleFormChange(e, setCreateForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col justify-center gap-1">
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="active"
                    checked={createForm.active}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Activo
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="service"
                    checked={createForm.service}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Servicio (sin stock)
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="includes_tax"
                    checked={createForm.includes_tax}
                    onChange={(e) => handleFormChange(e, setCreateForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Precio incluye impuestos
                </label>
              </div>

              <div className="md:col-span-2 flex justify-end mt-2 gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCreate}
                  className="px-4 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-700 font-semibold text-slate-950"
                >
                  {savingCreate ? "Guardando..." : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-xl rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Editar producto #{editId}
              </h2>
              <button
                onClick={handleCloseEditModal}
                className="text-slate-400 hover:text-slate-100 text-sm"
              >
                Cerrar ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmitEdit}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
            >
              <div className="space-y-1">
                <label className="block text-slate-300">SKU</label>
                <div className="relative">
                  <input
                    name="sku"
                    value={editForm.sku}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    disabled={editSkuLocked}
                    className={`w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 pr-10 outline-none focus:border-emerald-400 ${editSkuLocked ? "text-slate-400" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setEditSkuLocked((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    aria-pressed={!editSkuLocked}
                    aria-label={
                      editSkuLocked
                        ? "Desbloquear campo SKU"
                        : "Bloquear campo SKU"
                    }
                  >
                    {editSkuLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-300">Nombre</label>
                <input
                  name="name"
                  value={editForm.name}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  required
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Grupo</label>
                <div className="relative">
                  <input
                    name="group_name"
                    value={editForm.group_name}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    onFocus={() => setEditGroupFocused(true)}
                    onBlur={() => {
                      setTimeout(() => setEditGroupFocused(false), 100);
                    }}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                    autoComplete="off"
                  />

                  {editGroupFocused && groupOptions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 text-xs shadow-lg z-20">
                      {groupOptions
                        .filter((g) =>
                          g.toLowerCase().includes(editForm.group_name.toLowerCase()),
                        )
                        .map((g) => (
                          <button
                            key={g}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEditForm((prev) => ({ ...prev, group_name: g }));
                              setEditGroupFocused(false);
                            }}
                            className="block w-full text-left px-3 py-1.5 hover:bg-slate-800"
                          >
                            {g}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>


              <div className="space-y-1">
                <label className="block text-slate-300">Marca</label>
                <input
                  name="brand"
                  value={editForm.brand}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-slate-300">Proveedor</label>
                <input
                  name="supplier"
                  value={editForm.supplier}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Precio</label>
                <input
                  name="price"
                  type="text"
                  inputMode="decimal"
                  value={editForm.price}
                  onChange={(e) => handleMoneyChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Costo</label>
                <input
                  name="cost"
                  type="text"
                  inputMode="decimal"
                  value={editForm.cost}
                  onChange={(e) => handleMoneyChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">
                  Stock mínimo
                </label>
                <input
                  name="stock_min"
                  type="number"
                  value={editForm.stock_min}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Cantidad preferida</label>
                <input
                  name="preferred_qty"
                  type="number"
                  value={editForm.preferred_qty}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Punto de pedido</label>
                <input
                  name="reorder_point"
                  type="number"
                  value={editForm.reorder_point}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col justify-center gap-1">
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="low_stock_alert"
                    checked={editForm.low_stock_alert}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Alerta de stock bajo
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="allow_price_change"
                    checked={editForm.allow_price_change}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Permitir cambiar precio en ventas
                </label>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">
                  Código de barras
                </label>
                <div className="relative">
                  <input
                    name="barcode"
                    value={editForm.barcode}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    disabled={editBarcodeLocked}
                    className={`w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 pr-10 outline-none focus:border-emerald-400 ${editBarcodeLocked ? "text-slate-400" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setEditBarcodeLocked((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    aria-pressed={!editBarcodeLocked}
                    aria-label={
                      editBarcodeLocked
                        ? "Desbloquear campo código de barras"
                        : "Bloquear campo código de barras"
                    }
                  >
                    {editBarcodeLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300">Unidad</label>
                <input
                  name="unit"
                  value={editForm.unit}
                  onChange={(e) => handleFormChange(e, setEditForm)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex flex-col justify-center gap-1">
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="active"
                    checked={editForm.active}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Activo
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="service"
                    checked={editForm.service}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Servicio (sin stock)
                </label>
                <label className="inline-flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    name="includes_tax"
                    checked={editForm.includes_tax}
                    onChange={(e) => handleFormChange(e, setEditForm)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Precio incluye impuestos
                </label>
              </div>

              {editedProduct && (
                <div className="md:col-span-2 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowAppearanceSettings((prev) => !prev)}
                    className="w-full flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-left text-sm font-semibold text-slate-100 hover:bg-slate-800"
                  >
                    <span>Apariencia en POS (opcional)</span>
                    <span className="text-xs text-slate-400">
                      {showAppearanceSettings ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>
                  {showAppearanceSettings && (
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        {editedProductPreview ? (
                          <Image
                            src={editedProductPreview}
                            alt={editedProduct.name}
                            width={96}
                            height={96}
                            unoptimized
                            className="h-24 w-24 rounded-lg object-cover border border-slate-800"
                          />
                        ) : (
                          <div className="h-24 w-24 rounded-lg border border-dashed border-slate-700 text-slate-400 text-xs flex items-center justify-center">
                            Sin imagen
                          </div>
                        )}
                        <div className="text-xs text-slate-400">
                          <p>
                            Esta imagen y el color seleccionado se mostrarán en el POS para este producto.
                          </p>
                          {editedProduct.image_url && (
                            <p className="mt-1 text-slate-500 break-all">
                              URL actual: {editedProduct.image_url}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-slate-300 text-sm">
                          Imagen del producto
                        </label>
                        <input
                          type="file"
                          ref={productImageInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          disabled={productAppearanceLoading}
                          onChange={handleProductImageInputChange}
                          className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700 disabled:opacity-50"
                        />
                        <p className="text-xs text-slate-500">
                          Puedes reemplazar o eliminar la imagen actual. (JPG, PNG o WebP · máx. 2 MB)
                        </p>
                        <button
                          type="button"
                          disabled={productAppearanceLoading || !editedProductHasImage}
                          onClick={() => void removeImageForProduct()}
                          className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                        >
                          Quitar imagen
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-slate-300 text-sm">
                          Color del tile
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={productTileColorValue}
                            onChange={(e) => setProductTileColorValue(e.target.value)}
                            className="h-10 w-16 rounded border border-slate-600 bg-transparent"
                          />
                          <span className="text-xs text-slate-400">
                            {productTileColorValue}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={productAppearanceLoading}
                            onClick={() => void saveProductTileColorValue()}
                            className="px-3 py-2 rounded-lg border border-emerald-500 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                          >
                            Guardar color
                          </button>
                          <button
                            type="button"
                            disabled={productAppearanceLoading || !editedProduct.tile_color}
                            onClick={() => void clearProductTileColorValue()}
                            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                          >
                            Quitar color
                          </button>
                        </div>
                      </div>

                      {productAppearanceLoading && (
                        <div className="text-xs text-emerald-300">Procesando...</div>
                      )}
                      {productAppearanceError && (
                        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                          {productAppearanceError}
                        </div>
                      )}
                      {productAppearanceSuccess && (
                        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
                          {productAppearanceSuccess}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="md:col-span-2 flex justify-between items-center mt-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (editId != null) {
                      openDeleteOptions(editId, {
                        closeOnSuccess: true,
                        isActive: editForm.active,
                      });
                    }
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-red-400/60 text-red-200 hover:bg-red-500/10"
                >
                  Eliminar producto
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-700 font-semibold text-slate-950"
                  >
                    {savingEdit ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {imageManagerOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-5xl rounded-xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Gestión de imágenes de grupos</h2>
                <p className="text-slate-400 text-xs">
                  Selecciona un grupo existente para actualizar o eliminar su imagen.
                </p>
              </div>
              <button
                onClick={closeImageManagerModal}
                className="text-slate-400 hover:text-slate-100 text-sm"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <input
                  type="text"
                  value={imageManagerSearch}
                  onChange={(e) => setImageManagerSearch(e.target.value)}
                  placeholder="Buscar por nombre o ruta del grupo"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800">
                  {imageManagerGroups.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => setImageManagerSelectedPath(item.path)}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-800 ${
                        imageManagerSelectedPath === item.path
                          ? "bg-slate-800/80"
                          : "bg-slate-900"
                      }`}
                    >
                      <div className="font-semibold text-slate-100">
                        {item.displayName}
                      </div>
                      <div className="text-xs text-slate-400">Ruta: {item.path}</div>
                      {!item.record && (
                        <div className="text-[11px] text-amber-300 mt-1">
                          Se creará al subir la imagen
                        </div>
                      )}
                    </button>
                  ))}
                  {imageManagerGroups.length === 0 && !groupsLoading && (
                    <div className="px-3 py-4 text-center text-slate-400 text-xs">
                      No hay grupos que coincidan con la búsqueda.
                    </div>
                  )}
                  {groupsLoading && (
                    <div className="px-3 py-4 text-center text-slate-400 text-xs">
                      Cargando grupos...
                    </div>
                  )}
                  {groupsError && (
                    <div className="px-3 py-4 text-center text-red-400 text-xs">
                      Error: {groupsError}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {selectedGroupOption ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-100">
                        {selectedGroupOption.displayName}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Ruta completa: {selectedGroupOption.path}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 flex items-center gap-4">
                      {selectedGroupPreview ? (
                        <Image
                          src={selectedGroupPreview}
                          alt={
                            selectedGroup?.display_name ??
                            selectedGroupOption.displayName
                          }
                          width={96}
                          height={96}
                          unoptimized
                          className="h-24 w-24 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-lg bg-slate-800/50 flex items-center justify-center text-xs text-slate-400">
                          Sin imagen
                        </div>
                      )}
                      <div className="text-xs text-slate-300">
                        <p>
                          {selectedGroup?.image_url
                            ? "Esta imagen se mostrará en el POS para este grupo."
                            : "Este grupo todavía no tiene imagen."}
                        </p>
                        {selectedGroup?.image_url && (
                          <p className="mt-1 text-slate-500 break-all">
                            URL: {selectedGroup.image_url}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-slate-300 text-sm">
                        Actualizar imagen
                      </label>
                      <input
                        type="file"
                        ref={imageManagerFileInputRef}
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleImageManagerFileChange}
                        disabled={imageManagerUploading}
                        className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
                      />
                      <p className="text-xs text-slate-500">
                        Formatos permitidos: JPG, PNG o WebP (máx. 2 MB)
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={imageManagerUploading || !selectedGroup?.image_url}
                        onClick={() => void removeImageForSelectedGroup()}
                        className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                      >
                        Quitar imagen del grupo
                      </button>
                      {imageManagerUploading && (
                        <span className="text-xs text-emerald-300 self-center">
                          Procesando...
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="block text-slate-300 text-sm">
                        Color del tile
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={groupColorValue}
                          onChange={(e) => setGroupColorValue(e.target.value)}
                          className="h-10 w-16 rounded border border-slate-600 bg-transparent"
                        />
                        <span className="text-xs text-slate-400">{groupColorValue}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={imageManagerUploading}
                          onClick={() => void saveGroupTileColor()}
                          className="px-3 py-2 rounded-lg border border-emerald-500 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                        >
                          Guardar color
                        </button>
                        <button
                          type="button"
                          disabled={imageManagerUploading || !selectedGroup?.tile_color}
                          onClick={() => void clearGroupTileColor()}
                          className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                        >
                          Usar color predeterminado
                        </button>
                      </div>
                    </div>

                    {imageManagerError && (
                      <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                        {imageManagerError}
                      </div>
                    )}
                    {imageManagerSuccess && (
                      <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                        {imageManagerSuccess}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 text-sm">
                    No hay grupos disponibles para gestionar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTACIÓN */}
      {importOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Importar productos</h2>
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="text-slate-400 hover:text-slate-100 text-sm"
              >
                Cerrar ✕
              </button>
            </div>

            <p className="text-sm text-slate-300 mb-3">
              Selecciona un archivo Excel (.xlsx) con tus productos. Las
              columnas mínimas requeridas son: <code>sku</code>,{" "}
              <code>nombre</code>, <code>precio</code>, <code>costo</code>. Puedes
              incluir también <code>grupo</code>, <code>marca</code>,{" "}
              <code>proveedor</code>, <code>codigo_barras</code>,{" "}
              <code>unidad_medida</code>, <code>cantidad_stock_bajo</code>,{" "}
              <code>precio_incluye_impuestos</code>,{" "}
              <code>servicio_no_stock</code>, <code>producto_activo</code>.
            </p>

            <div className="space-y-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImportFile(file);
                  setImportResult(null);
                }}
                className="block w-full text-sm text-slate-200
                           file:mr-4 file:rounded-md file:border-0
                           file:bg-emerald-500 file:px-3 file:py-2
                           file:text-xs file:font-semibold file:text-slate-950
                           hover:file:bg-emerald-400"
              />

              {importResult && (
                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded-md px-3 py-2">
                  {importResult}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-4 gap-2">
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                disabled={!importFile || importing}
                onClick={() => void handleImport()}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-700 font-semibold text-slate-950"
              >
                {importing ? "Importando..." : "Importar archivo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {exportDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">
                  Exportar productos
                </h3>
                <p className="text-sm text-slate-400">
                  Elige qué datos exportar y en qué formato.
                </p>
              </div>
              <button
                onClick={() => setExportDialogOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xl"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Alcance
                </div>
                <label className="flex items-center gap-3 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="export-scope"
                    value="filtered"
                    checked={exportScope === "filtered"}
                    onChange={() => setExportScope("filtered")}
                    className="accent-emerald-400"
                  />
                  Exportar resultados filtrados ({filteredProducts.length})
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="export-scope"
                    value="all"
                    checked={exportScope === "all"}
                    onChange={() => setExportScope("all")}
                    className="accent-emerald-400"
                  />
                  Exportar todo el catálogo ({products.length})
                </label>
                {!hasActiveFilters && (
                  <p className="text-xs text-slate-500">
                    No hay filtros activos. Exportar filtrados equivale a todo el catálogo.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Columnas
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={allOptionalSelected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedExportColumns((prev) => {
                          const next = { ...prev };
                          optionalExportKeys.forEach((key) => {
                            next[key] = checked;
                          });
                          return next;
                        });
                      }}
                      className="accent-emerald-400"
                    />
                    Seleccionar todas
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {exportableColumns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-sm text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportColumns[col.key]}
                        disabled={Boolean(col.required)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedExportColumns((prev) => ({
                            ...prev,
                            [col.key]: checked,
                          }));
                        }}
                        className="accent-emerald-400"
                      />
                      {col.label}
                      {col.required && (
                        <span className="text-xs text-emerald-300">(obligatoria)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Nombre de archivo
                </div>
                <input
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                  placeholder="productos_filtros"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setExportDialogOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => handleExport("xlsx")}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-400 font-semibold text-slate-950"
              >
                Exportar Excel
              </button>
            </div>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="fixed right-6 top-24 z-[60] w-[340px] max-w-[90vw]">
          <div
            className={
              "rounded-2xl border border-emerald-400 bg-white px-4 py-3 text-emerald-900 shadow-[0_16px_40px_rgba(16,185,129,0.2)] transition-all duration-300 " +
              (successToastVisible
                ? "translate-x-0 opacity-100"
                : "translate-x-4 opacity-0")
            }
          >
            <div className="text-sm font-semibold text-emerald-800">
              Éxito
            </div>
            <p className="mt-1 text-sm text-emerald-800/90">
              {successMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
