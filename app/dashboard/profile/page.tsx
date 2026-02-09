"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  fetchUserProfile,
  updateUserProfile,
  uploadUserAvatar,
  fetchUserDocuments,
  uploadUserDocument,
  deleteUserDocument,
  type UserProfileRecord,
  type UserDocumentRecord,
} from "@/lib/api/profile";
import { getApiBase } from "@/lib/api/base";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const CROP_SIZE = 240;

type ProfileFormState = {
  name: string;
  avatarUrl: string | null;
  birthDate: string | null;
  phone: string | null;
  location: string | null;
  bio: string | null;
};

type CropSize = {
  width: number;
  height: number;
};

const DOC_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
];
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const MAX_DOC_COUNT = 10;

function buildFormState(profile?: UserProfileRecord | null, fallbackName?: string | null) {
  return {
    name: profile?.name?.trim() || fallbackName?.trim() || "",
    avatarUrl: profile?.avatar_url ?? null,
    birthDate: profile?.birth_date ?? null,
    phone: profile?.phone ?? null,
    location: profile?.location ?? null,
    bio: profile?.bio ?? null,
  };
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "US"
  );
}

function resolveAvatarUrl(value: string | null) {
  if (!value) return "";
  return value.startsWith("/") ? `${getApiBase()}${value}` : value;
}

function resolveDocumentUrl(value: string) {
  if (!value) return "";
  return value.startsWith("/") ? `${getApiBase()}${value}` : value;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  const [form, setForm] = useState<ProfileFormState>(() => buildFormState(null, user?.name));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "documents">("profile");
  const [documents, setDocuments] = useState<UserDocumentRecord[]>([]);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docNote, setDocNote] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docStatus, setDocStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [docLoading, setDocLoading] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<UserDocumentRecord | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const [cropSize, setCropSize] = useState<CropSize | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchUserProfile(token)
      .then((data) => {
        if (cancelled) return;
        setForm(buildFormState(data, user?.name));
      })
      .catch((err) => {
        console.error("No pudimos cargar el perfil.", err);
        if (!cancelled) {
          setStatus({ type: "error", message: "No se pudo cargar el perfil." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.name]);

  useEffect(() => {
    if (!cropSourceUrl) return;
    return () => URL.revokeObjectURL(cropSourceUrl);
  }, [cropSourceUrl]);

  useEffect(() => {
    if (!status || status.type !== "success") {
      setToastVisible(false);
      return;
    }
    setToastMessage(status.message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastVisible(false);
    requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
      window.setTimeout(() => setToastMessage(null), 220);
    }, 3200);
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [status]);

  const clampOffset = (next: { x: number; y: number }) => {
    if (!cropSize) return next;
    const totalScale = baseScale * cropScale;
    const maxX = Math.max(0, (cropSize.width * totalScale - CROP_SIZE) / 2);
    const maxY = Math.max(0, (cropSize.height * totalScale - CROP_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setStatus({
        type: "error",
        message: "La imagen supera 2 MB. Usa una foto mas ligera.",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setStatus(null);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    setBaseScale(1);
    setCropSize(null);
    setCropSourceUrl(URL.createObjectURL(file));
    setCropModalOpen(true);
  };

  const handleRemoveAvatar = async () => {
    if (!token) return;
    setAvatarUploading(true);
    try {
      const updated = await updateUserProfile(token, { avatar_url: null });
      setForm((prev) => ({ ...prev, avatarUrl: updated.avatar_url ?? null }));
      window.dispatchEvent(new Event("kensar-profile:update"));
      setStatus({ type: "success", message: "Avatar eliminado." });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "No se pudo eliminar el avatar." });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    const name = form.name.trim() || user?.name || "Usuario";
    setSaving(true);
    try {
      const updated = await updateUserProfile(token, {
        name,
        phone: form.phone?.trim() || null,
        birth_date: form.birthDate || null,
        location: form.location?.trim() || null,
        bio: form.bio?.trim() || null,
      });
      setForm(buildFormState(updated, user?.name));
      window.dispatchEvent(new Event("kensar-profile:update"));
      setStatus({ type: "success", message: "Perfil actualizado." });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "No se pudo guardar el perfil." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const profile = await fetchUserProfile(token);
      setForm(buildFormState(profile, user?.name));
      setStatus({ type: "success", message: "Perfil restablecido." });
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "No se pudo restablecer el perfil." });
    } finally {
      setLoading(false);
    }
  };

  const handleCropImageLoad = () => {
    if (!cropImageRef.current || !cropContainerRef.current) return;
    const image = cropImageRef.current;
    const size = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    setCropSize(size);
    const coverScale = Math.max(CROP_SIZE / size.width, CROP_SIZE / size.height);
    setBaseScale(coverScale);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: cropOffset.x,
      y: cropOffset.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    setCropOffset((prev) => clampOffset({ x: dragRef.current!.x + deltaX, y: dragRef.current!.y + deltaY }));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleCropScaleChange = (value: number) => {
    setCropScale(value);
    setCropOffset((prev) => clampOffset(prev));
  };

  const handleApplyCrop = async () => {
    if (!token || !cropImageRef.current || !cropSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const totalScale = baseScale * cropScale;
    const drawWidth = cropSize.width * totalScale;
    const drawHeight = cropSize.height * totalScale;
    const drawX = CROP_SIZE / 2 + cropOffset.x - drawWidth / 2;
    const drawY = CROP_SIZE / 2 + cropOffset.y - drawHeight / 2;
    ctx.drawImage(cropImageRef.current, drawX, drawY, drawWidth, drawHeight);

    setAvatarUploading(true);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png", 0.92);
    });
    if (!blob) {
      setAvatarUploading(false);
      setStatus({ type: "error", message: "No se pudo procesar la imagen." });
      return;
    }

    try {
      const response = await uploadUserAvatar(token, blob, "avatar.png");
      setForm((prev) => ({ ...prev, avatarUrl: response.url }));
      window.dispatchEvent(new Event("kensar-profile:update"));
      setStatus({ type: "success", message: "Avatar actualizado." });
      setCropModalOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: "error", message: "No se pudo subir el avatar." });
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    if (!token || activeTab !== "documents") return;
    let cancelled = false;
    setDocLoading(true);
    fetchUserDocuments(token)
      .then((data) => {
        if (!cancelled) setDocuments(data);
      })
      .catch((err) => {
        console.error("No pudimos cargar documentos.", err);
        if (!cancelled) {
          setDocStatus({ type: "error", message: "No se pudieron cargar los documentos." });
        }
      })
      .finally(() => {
        if (!cancelled) setDocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeTab]);

  const handleDocumentsUpload = async () => {
    if (!token || !docFile) return;
    if (documents.length >= MAX_DOC_COUNT) {
      setDocStatus({ type: "error", message: "Se alcanzó el límite de 10 documentos." });
      return;
    }
    const extension = `.${docFile.name.split(".").pop() ?? ""}`.toLowerCase();
    if (!DOC_ALLOWED_EXTENSIONS.includes(extension)) {
      setDocStatus({
        type: "error",
        message: "Formato no permitido. Usa PDF, JPG, PNG, WEBP o DOC/DOCX.",
      });
      return;
    }
    if (docFile.size > MAX_DOC_BYTES) {
      setDocStatus({ type: "error", message: "El archivo supera los 5MB." });
      return;
    }
    setDocLoading(true);
    try {
      const created = await uploadUserDocument(token, docFile, docNote.trim() || undefined);
      setDocuments((prev) => [created, ...prev]);
      setDocStatus({ type: "success", message: "Documento subido." });
      setDocNote("");
      setDocFile(null);
      setDocModalOpen(false);
    } catch (err) {
      console.error(err);
      setDocStatus({ type: "error", message: "No se pudo subir el documento." });
    } finally {
      setDocLoading(false);
    }
  };

  const handleRemoveDocument = async (id: number) => {
    if (!token) return;
    setDocLoading(true);
    try {
      await deleteUserDocument(token, id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setDocStatus({ type: "success", message: "Documento eliminado." });
    } catch (err) {
      console.error(err);
      setDocStatus({ type: "error", message: "No se pudo eliminar el documento." });
    } finally {
      setDocLoading(false);
    }
  };

  const formatBytes = (value: number) => {
    if (value < 1024) return `${value} B`;
    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDateLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <span>Autenticando…</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-100">Perfil</h1>
          <p className="text-base text-slate-400">
            Personaliza tu informacion y tu avatar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
        >
          Volver
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
        <div className="flex gap-2 p-2">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "profile"
                ? "bg-emerald-400 text-slate-900"
                : "text-slate-300 hover:bg-slate-900"
            }`}
          >
            Perfil
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === "documents"
                ? "bg-emerald-400 text-slate-900"
                : "text-slate-300 hover:bg-slate-900"
            }`}
          >
            Documentos
          </button>
        </div>
      </div>

      {activeTab === "profile" && (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden flex items-center justify-center text-slate-200 text-xl font-semibold">
              {resolveAvatarUrl(form.avatarUrl) ? (
                <Image
                  src={resolveAvatarUrl(form.avatarUrl)}
                  alt={form.name}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <span>{getInitials(form.name)}</span>
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-slate-100">Foto de perfil</p>
              <p className="text-sm text-slate-400">
                Recorta la imagen para la miniatura circular.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-slate-200 hover:file:bg-slate-700"
            />
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={avatarUploading}
              className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 disabled:opacity-60"
            >
              Quitar foto
            </button>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-sm text-slate-400">
              Nombre de cuenta:{" "}
              <span className="text-slate-200">{user?.name ?? "Usuario"}</span>
            </p>
            <p className="text-sm text-slate-400">
              Rol: <span className="text-slate-200">{user?.role ?? "—"}</span>
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">Nombre visible</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Tu nombre publico"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-400">Email</span>
              <input
                value={user?.email ?? ""}
                disabled
                className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-base text-slate-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-400">Fecha de nacimiento</span>
              <input
                type="date"
                value={form.birthDate ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, birthDate: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-400">Telefono</span>
              <input
                value={form.phone ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="+57 300 000 0000"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">Ubicacion</span>
              <input
                value={form.location ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, location: event.target.value }))
                }
                placeholder="Ciudad, pais"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">Sobre mi</span>
              <textarea
                value={form.bio ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bio: event.target.value }))
                }
                rows={4}
                placeholder="Comparte algo que quieras mostrar en tu perfil."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>

          {status?.type === "error" && (
            <div
              className={`text-sm rounded-xl px-4 py-3 border ${
                "border-rose-500/50 text-rose-200 bg-rose-500/10"
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-900 text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-slate-500 disabled:opacity-60"
            >
              Restablecer
            </button>
          </div>
        </section>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Documentos</h2>
            <p className="text-sm text-slate-400">
              Sube contratos, identificaciones u otros archivos del usuario.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              {documents.length} / {MAX_DOC_COUNT} documentos cargados
            </div>
            <button
              type="button"
              onClick={() => setDocModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-900 text-sm font-semibold hover:bg-emerald-300"
            >
              Subir documento
            </button>
          </div>

          <div className="space-y-3">
            {docStatus && (
              <div
                className={`text-sm rounded-xl px-4 py-3 border ${
                  docStatus.type === "success"
                    ? "border-emerald-500/50 text-emerald-200 bg-emerald-500/10"
                    : "border-rose-500/50 text-rose-200 bg-rose-500/10"
                }`}
              >
                {docStatus.message}
              </div>
            )}
            {docLoading && documents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
                Cargando documentos…
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
                Aun no hay documentos cargados.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-800">
                <div className="grid grid-cols-[1.6fr_0.8fr_1fr_100px] bg-slate-900/70 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
                  <span>Documento</span>
                  <span>Fecha</span>
                  <span>Notas</span>
                  <span className="text-right">Acciones</span>
                </div>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="grid grid-cols-[1.6fr_0.8fr_1fr_100px] items-center border-t border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-100">{doc.file_name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(doc.file_size)}</p>
                    </div>
                    <div className="text-xs text-slate-300">{formatDateLabel(doc.created_at)}</div>
                    <div className="text-xs text-slate-300">
                      {doc.note || "Sin notas"}
                    </div>
                    <div className="text-right flex items-center justify-end gap-2">
                      <a
                        href={resolveDocumentUrl(doc.file_url)}
                        download
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
                      >
                        Descargar
                      </a>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDoc(doc)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-rose-400 hover:text-rose-300"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {cropModalOpen && cropSourceUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Recortar avatar</h2>
                <p className="text-xs text-slate-400">
                  Ajusta el zoom y arrastra la imagen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
            </div>

            <div className="flex items-center justify-center">
              <div
                ref={cropContainerRef}
                className="relative w-[240px] h-[240px] overflow-hidden rounded-full border border-slate-700 bg-slate-900"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={cropImageRef}
                  src={cropSourceUrl}
                  alt="Recorte"
                  onLoad={handleCropImageLoad}
                  className="absolute left-1/2 top-1/2 select-none max-w-none max-h-none"
                  style={{
                    transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${baseScale * cropScale})`,
                    touchAction: "none",
                    width: cropSize ? `${cropSize.width}px` : "auto",
                    height: cropSize ? `${cropSize.height}px` : "auto",
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Zoom</span>
                <span>{cropScale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={cropScale}
                onChange={(event) => handleCropScaleChange(Number(event.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyCrop}
                disabled={avatarUploading}
                className="px-4 py-2 rounded-lg bg-emerald-400 text-slate-900 text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60"
              >
                {avatarUploading ? "Subiendo…" : "Guardar avatar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {docModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Subir documento</h2>
                <p className="text-xs text-slate-400">
                  Agrega el archivo y una nota opcional.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
            </div>

            <div className="space-y-3">
              <label className="space-y-2">
                <span className="text-sm text-slate-400">Archivo</span>
                <input
                  type="file"
                  accept={DOC_ALLOWED_EXTENSIONS.join(",")}
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    setDocFile(next);
                  }}
                  className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-slate-200 hover:file:bg-slate-700"
                />
                {docFile && (
                  <p className="text-xs text-slate-400">
                    {docFile.name}
                  </p>
                )}
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-400">Notas</span>
                <textarea
                  value={docNote}
                  onChange={(event) => setDocNote(event.target.value)}
                  rows={3}
                  placeholder="Ej: Contrato firmado 2024"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDocumentsUpload}
                disabled={!docFile || docLoading}
                className="px-4 py-2 rounded-lg bg-emerald-400 text-slate-900 text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60"
              >
                {docLoading ? "Subiendo…" : "Subir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                ¿Eliminar documento?
              </h2>
              <p className="text-sm text-slate-400">
                Se borrará <span className="text-slate-200">{confirmDeleteDoc.file_name}</span>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const docId = confirmDeleteDoc.id;
                  setConfirmDeleteDoc(null);
                  void handleRemoveDocument(docId);
                }}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed right-6 top-24 z-[60] w-[340px] max-w-[90vw]">
          <div
            className={
              "rounded-2xl border border-emerald-400 bg-white px-4 py-3 text-emerald-900 shadow-[0_16px_40px_rgba(16,185,129,0.2)] transition-all duration-300 " +
              (toastVisible
                ? "translate-x-0 opacity-100"
                : "translate-x-4 opacity-0")
            }
          >
            <div className="text-sm font-semibold text-emerald-800">
              Éxito
            </div>
            <p className="mt-1 text-sm text-emerald-800/90">
              {toastMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
