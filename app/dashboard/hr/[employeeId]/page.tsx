"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../../../providers/AuthProvider";
import {
  createSystemUserForEmployee,
  clearHrEmployeeAvatar,
  deactivateSystemUserForEmployee,
  deleteSystemUserForEmployee,
  deleteHrEmployeeDocument,
  fetchHrEmployeeById,
  fetchHrEmployeeDocuments,
  fetchHrSystemUsers,
  linkSystemUserToEmployee,
  uploadHrEmployeeAvatar,
  updateHrEmployee,
  uploadHrEmployeeDocument,
  type HrEmployeeDocumentRecord,
  type HrEmployeeRecord,
  type HrSystemUserOption,
  type SystemRole,
} from "@/lib/api/hr";
import { defaultRolePermissions, fetchRolePermissions } from "@/lib/api/settings";
import { getApiBase } from "@/lib/api/base";

type PayrollFrequency = "diario" | "semanal" | "mensual";

type EmployeeFormState = {
  name: string;
  email: string;
  status: HrEmployeeRecord["status"];
  phone: string;
  position: string;
  birth_date: string;
  location: string;
  bio: string;
  notes: string;
  payroll_frequency: PayrollFrequency;
  payroll_amount: string;
  payroll_currency: string;
  payroll_payment_method: string;
  payroll_day_of_week: string;
  payroll_day_of_month: string;
  payroll_last_paid_at: string;
  payroll_next_due_at: string;
  payroll_reference: string;
  payroll_notes: string;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toFormState(employee: HrEmployeeRecord): EmployeeFormState {
  return {
    name: employee.name || "",
    email: employee.email || "",
    status: employee.status,
    phone: employee.phone || "",
    position: employee.position || "",
    birth_date: employee.birth_date || "",
    location: employee.location || "",
    bio: employee.bio || "",
    notes: employee.notes || "",
    payroll_frequency: employee.payroll_frequency || "mensual",
    payroll_amount:
      employee.payroll_amount === null || employee.payroll_amount === undefined
        ? ""
        : String(employee.payroll_amount),
    payroll_currency: employee.payroll_currency || "COP",
    payroll_payment_method: employee.payroll_payment_method || "Transferencia",
    payroll_day_of_week: employee.payroll_day_of_week || "",
    payroll_day_of_month:
      employee.payroll_day_of_month === null || employee.payroll_day_of_month === undefined
        ? ""
        : String(employee.payroll_day_of_month),
    payroll_last_paid_at: employee.payroll_last_paid_at || "",
    payroll_next_due_at: employee.payroll_next_due_at || "",
    payroll_reference: employee.payroll_reference || "",
    payroll_notes: employee.payroll_notes || "",
  };
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "HR"
  );
}

export default function HrEmployeeDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const employeeId = Number(params?.employeeId || 0);

  const [employee, setEmployee] = useState<HrEmployeeRecord | null>(null);
  const [form, setForm] = useState<EmployeeFormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<EmployeeFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "access" | "payroll" | "documents">(
    "profile"
  );

  const [documents, setDocuments] = useState<HrEmployeeDocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docNote, setDocNote] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [downloadingDocKey, setDownloadingDocKey] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [linkingAccess, setLinkingAccess] = useState(false);
  const [deactivatingAccess, setDeactivatingAccess] = useState(false);
  const [deletingAccess, setDeletingAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [systemUserEmail, setSystemUserEmail] = useState("");
  const [systemUserRole, setSystemUserRole] = useState<SystemRole>("Vendedor");
  const [systemUserPassword, setSystemUserPassword] = useState("");
  const [systemUserPin, setSystemUserPin] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkOptions, setLinkOptions] = useState<HrSystemUserOption[]>([]);
  const [linkOptionsLoading, setLinkOptionsLoading] = useState(false);
  const [linkUserId, setLinkUserId] = useState<number | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!token || !Number.isFinite(employeeId) || employeeId <= 0) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setIsEditing(false);
    });

    fetchRolePermissions(token)
      .then((modules) => {
        if (cancelled) return;
        const hrModule =
          modules.find((module) => module.id === "hr") ??
          defaultRolePermissions.find((module) => module.id === "hr");
        const manageAction = hrModule?.actions.find((action) => action.id === "hr.manage");
        const role = user?.role as SystemRole | undefined;
        setCanManage(Boolean(role && manageAction?.roles?.[role]));
      })
      .catch(() => {
        if (cancelled) return;
        setCanManage(false);
      });

    fetchHrEmployeeById(employeeId, token)
      .then((data) => {
        if (cancelled) return;
        setEmployee(data);
        const nextForm = toFormState(data);
        setForm(nextForm);
        setSavedSnapshot(nextForm);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error al cargar empleado.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, token, user?.role]);

  useEffect(() => {
    if (!token || !Number.isFinite(employeeId) || employeeId <= 0) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setDocsLoading(true);
      setDocsError(null);
    });
    fetchHrEmployeeDocuments(employeeId, token)
      .then((rows) => {
        if (cancelled) return;
        setDocuments(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setDocsError(err instanceof Error ? err.message : "Error al cargar documentos.");
      })
      .finally(() => {
        if (cancelled) return;
        setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, token]);

  useEffect(() => {
    if (!employee) return;
    if (!systemUserEmail && employee.email) {
      setSystemUserEmail(employee.email);
    }
  }, [employee, systemUserEmail]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [employee?.avatar_url, employee?.id]);

  useEffect(() => {
    if (!token || !canManage || !employee || employee.system_user) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLinkOptionsLoading(true);
      setAccessError(null);
    });
    fetchHrSystemUsers(token, { only_unlinked: true })
      .then((rows) => {
        if (cancelled) return;
        setLinkOptions(rows);
        setLinkUserId(rows[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAccessError(
          err instanceof Error ? err.message : "No se pudieron cargar usuarios de sistema."
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLinkOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, canManage, employee]);

  const title = useMemo(
    () => (loading ? "Empleado" : employee?.name || "Empleado"),
    [employee, loading]
  );
  const accessBusy =
    creatingAccess || linkingAccess || deactivatingAccess || deletingAccess;
  const canEditFields = canManage && isEditing;
  const isDirty = useMemo(() => {
    if (!form || !savedSnapshot) return false;
    return JSON.stringify(form) !== JSON.stringify(savedSnapshot);
  }, [form, savedSnapshot]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isEditing || !isDirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isEditing, saving]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(false);
    requestAnimationFrame(() => setToastVisible(true));
    window.setTimeout(() => {
      setToastVisible(false);
      window.setTimeout(() => setToastMessage(null), 220);
    }, 3200);
  };

  const refreshEmployee = async () => {
    if (!token || !employee) return;
    const data = await fetchHrEmployeeById(employee.id, token);
    setEmployee(data);
    const nextForm = toFormState(data);
    setForm(nextForm);
    setSavedSnapshot(nextForm);
    return data;
  };

  const handleRefreshLinkOptions = async () => {
    if (!token || !canManage || !employee || employee.system_user) return;
    try {
      setLinkOptionsLoading(true);
      setAccessError(null);
      const rows = await fetchHrSystemUsers(token, {
        q: linkQuery,
        only_unlinked: true,
      });
      setLinkOptions(rows);
      setLinkUserId(rows[0]?.id ?? null);
    } catch (err) {
      setAccessError(
        err instanceof Error ? err.message : "No se pudieron cargar usuarios de sistema."
      );
    } finally {
      setLinkOptionsLoading(false);
    }
  };

  const handleCreateSystemUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !employee) return;
    const email = systemUserEmail.trim() || employee.email?.trim() || "";
    if (!email) {
      setAccessError("Debes indicar un correo para crear el acceso.");
      return;
    }
    try {
      setCreatingAccess(true);
      setAccessError(null);
      await createSystemUserForEmployee(
        employee.id,
        {
          email,
          role: systemUserRole,
          password: systemUserPassword.trim() || undefined,
          pin_plain: systemUserPin.trim() || undefined,
        },
        token
      );
      await refreshEmployee();
      setSystemUserPassword("");
      setSystemUserPin("");
      showToast("Acceso de sistema creado y vinculado.");
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "No se pudo crear el acceso.");
    } finally {
      setCreatingAccess(false);
    }
  };

  const handleLinkExistingUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !employee || !linkUserId) return;
    try {
      setLinkingAccess(true);
      setAccessError(null);
      await linkSystemUserToEmployee(employee.id, linkUserId, token);
      await refreshEmployee();
      showToast("Usuario del sistema vinculado correctamente.");
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "No se pudo vincular el usuario.");
    } finally {
      setLinkingAccess(false);
    }
  };

  const handleDeactivateSystemUser = async () => {
    if (!token || !employee || !employee.system_user) return;
    const confirmed = window.confirm(
      "Se desactivará el acceso al sistema para este usuario. ¿Deseas continuar?"
    );
    if (!confirmed) return;
    try {
      setDeactivatingAccess(true);
      setAccessError(null);
      await deactivateSystemUserForEmployee(employee.id, token);
      await refreshEmployee();
      showToast("Acceso desactivado correctamente.");
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "No se pudo desactivar el acceso.");
    } finally {
      setDeactivatingAccess(false);
    }
  };

  const handleDeleteSystemUser = async () => {
    if (!token || !employee || !employee.system_user) return;
    const preferDeactivate = window.confirm(
      "Por trazabilidad recomendamos desactivar en lugar de borrar. ¿Quieres desactivarlo ahora?"
    );
    if (preferDeactivate) {
      await handleDeactivateSystemUser();
      return;
    }

    const confirmedDelete = window.confirm(
      "Esto intentará borrar el usuario de forma permanente. ¿Continuar?"
    );
    if (!confirmedDelete) return;

    try {
      setDeletingAccess(true);
      setAccessError(null);
      await deleteSystemUserForEmployee(employee.id, token);
      await refreshEmployee();
      showToast("Usuario eliminado correctamente.");
    } catch (err) {
      setAccessError(
        err instanceof Error
          ? err.message
          : "No se pudo borrar el usuario. Se recomienda desactivar."
      );
    } finally {
      setDeletingAccess(false);
    }
  };

  const handleChange = <K extends keyof EmployeeFormState>(
    key: K,
    value: EmployeeFormState[K]
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !form || !employee || !isEditing) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await updateHrEmployee(
        employee.id,
        {
          name: form.name.trim(),
          email: form.email.trim() || null,
          status: form.status,
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
          birth_date: form.birth_date || null,
          location: form.location.trim() || null,
          bio: form.bio.trim() || null,
          notes: form.notes.trim() || null,
          payroll_frequency: form.payroll_frequency,
          payroll_amount: form.payroll_amount.trim()
            ? Number(form.payroll_amount)
            : null,
          payroll_currency: form.payroll_currency.trim() || null,
          payroll_payment_method: form.payroll_payment_method.trim() || null,
          payroll_day_of_week: form.payroll_day_of_week.trim() || null,
          payroll_day_of_month: form.payroll_day_of_month.trim()
            ? Number(form.payroll_day_of_month)
            : null,
          payroll_last_paid_at: form.payroll_last_paid_at || null,
          payroll_next_due_at: form.payroll_next_due_at || null,
          payroll_reference: form.payroll_reference.trim() || null,
          payroll_notes: form.payroll_notes.trim() || null,
        },
        token
      );
      setEmployee(updated);
      const nextForm = toFormState(updated);
      setForm(nextForm);
      setSavedSnapshot(nextForm);
      setIsEditing(false);
      showToast("Cambios guardados correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (isEditing && isDirty && !saving) {
      const confirmed = window.confirm(
        "Tienes cambios sin guardar. ¿Seguro que quieres salir?"
      );
      if (!confirmed) return;
    }
    router.push("/dashboard/hr");
  };

  const handleUploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !employee || !docFile) return;
    try {
      setUploadingDoc(true);
      setDocsError(null);
      const created = await uploadHrEmployeeDocument(employee.id, docFile, docNote, token);
      setDocuments((prev) => [created, ...prev]);
      setDocFile(null);
      setDocNote("");
      if (docInputRef.current) docInputRef.current.value = "";
      showToast("Documento cargado correctamente.");
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "No se pudo cargar el documento.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDownloadDocument = async (doc: HrEmployeeDocumentRecord) => {
    const docKey = `${doc.source ?? "hr"}-${doc.id}`;
    try {
      setDownloadingDocKey(docKey);
      const response = await fetch(getDocumentUrl(doc.file_url));
      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = doc.file_name || "documento";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setDocsError(
        err instanceof Error ? err.message : "No se pudo descargar el documento."
      );
    } finally {
      setDownloadingDocKey(null);
    }
  };

  const handleDeleteDocument = async (
    docId: number,
    source: "hr" | "profile" = "hr"
  ) => {
    if (!token || !employee) return;
    try {
      setDeletingDocId(docId);
      setDocsError(null);
      await deleteHrEmployeeDocument(employee.id, docId, source, token);
      setDocuments((prev) =>
        prev.filter(
          (doc) => !(doc.id === docId && (doc.source ?? "hr") === source)
        )
      );
      showToast("Documento eliminado.");
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "No se pudo eliminar el documento.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token || !employee) return;
    try {
      setAvatarUploading(true);
      setError(null);
      await uploadHrEmployeeAvatar(employee.id, file, token);
      await refreshEmployee();
      showToast("Foto de perfil actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la foto.");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!token || !employee) return;
    try {
      setAvatarUploading(true);
      setError(null);
      const updated = await clearHrEmployeeAvatar(employee.id, token);
      setEmployee(updated);
      const nextForm = toFormState(updated);
      setForm(nextForm);
      setSavedSnapshot(nextForm);
      showToast("Foto de perfil eliminada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la foto.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const getDocumentUrl = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${getApiBase()}${path}`;
  const getAvatarUrl = (path?: string | null) =>
    path ? (/^https?:\/\//i.test(path) ? path : `${getApiBase()}${path}`) : "";

  if (!token) return null;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="ui-text-muted mt-1">Ficha HR y acceso de sistema.</p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border ui-border px-3 py-2 text-sm hover:bg-white/60 transition"
        >
          Volver
        </button>
      </header>

      {loading ? (
        <article className="rounded-2xl border ui-border dashboard-card p-4 ui-text-muted">
          Cargando empleado...
        </article>
      ) : error ? (
        <article className="rounded-2xl border ui-border dashboard-card p-4 text-rose-600">
          {error}
        </article>
      ) : !employee || !form ? (
        <article className="rounded-2xl border ui-border dashboard-card p-4 ui-text-muted">
          Empleado no encontrado.
        </article>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <article className="rounded-2xl border ui-border dashboard-card p-4 space-y-3 text-sm">
            <p>
              <strong>Nombre:</strong> {employee.name}
            </p>
            <p>
              <strong>Estado HR:</strong> {employee.status}
            </p>
            <p>
              <strong>Creado:</strong> {formatDateTime(employee.created_at)}
            </p>
            <p>
              <strong>Actualizado:</strong> {formatDateTime(employee.updated_at)}
            </p>
            <hr className="ui-border" />
            <div>
              <p className="font-semibold">Foto de perfil</p>
              <div className="mt-2 flex items-center gap-3">
                {employee.avatar_url && !avatarLoadError ? (
                  <Image
                    src={getAvatarUrl(employee.avatar_url)}
                    alt={`Avatar de ${employee.name}`}
                    className="h-16 w-16 rounded-full object-cover border ui-border"
                    width={64}
                    height={64}
                    unoptimized
                    onError={() => setAvatarLoadError(true)}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full border ui-border bg-slate-100 text-slate-700 grid place-content-center font-semibold">
                    {getInitials(employee.name)}
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void handleAvatarFileChange(event)}
                    disabled={!canManage || avatarUploading}
                    className="block w-full text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRemoveAvatar()}
                    disabled={!canManage || avatarUploading || !employee.avatar_url}
                    className="rounded-md border ui-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {avatarUploading ? "Procesando..." : "Quitar foto"}
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="rounded-2xl border ui-border dashboard-card p-4 space-y-4">
            <div className="flex gap-2 border-b ui-border pb-3">
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === "profile"
                    ? "bg-emerald-500 text-slate-900"
                    : "border ui-border hover:bg-white/60"
                }`}
              >
                Perfil
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("access")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === "access"
                    ? "bg-emerald-500 text-slate-900"
                    : "border ui-border hover:bg-white/60"
                }`}
              >
                Acceso
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("payroll")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === "payroll"
                    ? "bg-emerald-500 text-slate-900"
                    : "border ui-border hover:bg-white/60"
                }`}
              >
                Nómina
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("documents")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === "documents"
                    ? "bg-emerald-500 text-slate-900"
                    : "border ui-border hover:bg-white/60"
                }`}
              >
                Documentos
              </button>
            </div>

            {activeTab === "profile" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Nombre</span>
                    <input
                      value={form.name}
                      onChange={(event) => handleChange("name", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Correo HR</span>
                    <input
                      value={form.email}
                      onChange={(event) => handleChange("email", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Estado HR</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        handleChange("status", event.target.value as HrEmployeeRecord["status"])
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Cargo</span>
                    <input
                      value={form.position}
                      onChange={(event) => handleChange("position", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Telefono</span>
                    <input
                      value={form.phone}
                      onChange={(event) => handleChange("phone", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Fecha nacimiento</span>
                    <input
                      type="date"
                      value={form.birth_date}
                      onChange={(event) => handleChange("birth_date", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="block mb-1 ui-text-muted">Ubicación</span>
                    <input
                      value={form.location}
                      onChange={(event) => handleChange("location", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                </div>
                <label className="text-sm block">
                  <span className="block mb-1 ui-text-muted">Sobre mi</span>
                  <textarea
                    value={form.bio}
                    onChange={(event) => handleChange("bio", event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                    disabled={!canEditFields}
                  />
                </label>
                <label className="text-sm block">
                  <span className="block mb-1 ui-text-muted">Notas</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => handleChange("notes", event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                    disabled={!canEditFields}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={!canManage || isEditing}
                    className="rounded-md border ui-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    Editar
                  </button>
                  <button
                    type="submit"
                    disabled={!canEditFields || !isDirty || saving}
                    className="rounded-md bg-emerald-500 text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            ) : activeTab === "access" ? (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">Acceso al sistema</p>
                  {employee.system_user ? (
                    <p className="ui-text-muted mt-1">
                      Usuario #{employee.system_user.id} - {employee.system_user.email}
                      <br />
                      {employee.system_user.role} ({employee.system_user.status})
                    </p>
                  ) : (
                    <p className="ui-text-muted mt-1">Sin acceso vinculado.</p>
                  )}
                </div>
                {employee.system_user ? (
                  canManage && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDeactivateSystemUser()}
                        disabled={accessBusy || employee.system_user.status === "Inactivo"}
                        className="rounded-md border ui-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        {deactivatingAccess ? "Desactivando..." : "Desactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSystemUser()}
                        disabled={accessBusy}
                        className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                        title="Recomendado: desactivar para trazabilidad"
                      >
                        {deletingAccess ? "Borrando..." : "Borrar usuario"}
                      </button>
                    </div>
                  )
                ) : canManage ? (
                  <div className="space-y-3 rounded-xl border ui-border p-3">
                    <form onSubmit={handleCreateSystemUser} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">
                        Crear acceso nuevo
                      </p>
                      <input
                        value={systemUserEmail}
                        onChange={(event) => setSystemUserEmail(event.target.value)}
                        placeholder="Correo de acceso"
                        className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                        disabled={accessBusy}
                      />
                      <div className="grid gap-2 grid-cols-2">
                        <select
                          value={systemUserRole}
                          onChange={(event) =>
                            setSystemUserRole(event.target.value as SystemRole)
                          }
                          className="rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                          disabled={accessBusy}
                        >
                          <option value="Administrador">Administrador</option>
                          <option value="Supervisor">Supervisor</option>
                          <option value="Vendedor">Vendedor</option>
                          <option value="Auditor">Auditor</option>
                        </select>
                        <input
                          value={systemUserPin}
                          onChange={(event) => setSystemUserPin(event.target.value)}
                          placeholder="PIN (4-8)"
                          className="rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                          disabled={accessBusy}
                        />
                      </div>
                      <input
                        value={systemUserPassword}
                        onChange={(event) => setSystemUserPassword(event.target.value)}
                        placeholder="Contrasena temporal (opcional)"
                        className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                        disabled={accessBusy}
                      />
                      <button
                        type="submit"
                        disabled={accessBusy}
                        className="w-full rounded-md bg-emerald-500 text-slate-900 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        {creatingAccess ? "Creando..." : "Crear y vincular acceso"}
                      </button>
                    </form>

                    <hr className="ui-border" />

                    <form onSubmit={handleLinkExistingUser} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">
                        Vincular acceso existente
                      </p>
                      <div className="flex gap-2">
                        <input
                          value={linkQuery}
                          onChange={(event) => setLinkQuery(event.target.value)}
                          placeholder="Buscar por nombre o correo"
                          className="min-w-0 flex-1 rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                          disabled={accessBusy || linkOptionsLoading}
                        />
                        <button
                          type="button"
                          onClick={() => void handleRefreshLinkOptions()}
                          disabled={accessBusy || linkOptionsLoading}
                          className="rounded-md border ui-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                        >
                          {linkOptionsLoading ? "..." : "Buscar"}
                        </button>
                      </div>
                      <select
                        value={linkUserId ?? ""}
                        onChange={(event) =>
                          setLinkUserId(event.target.value ? Number(event.target.value) : null)
                        }
                        className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2 text-sm"
                        disabled={
                          accessBusy ||
                          linkOptionsLoading ||
                          linkOptions.length === 0
                        }
                      >
                        {linkOptions.length === 0 ? (
                          <option value="">No hay usuarios disponibles</option>
                        ) : (
                          linkOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              #{option.id} - {option.name} ({option.email})
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="submit"
                        disabled={
                          accessBusy ||
                          !linkUserId ||
                          linkOptionsLoading ||
                          linkOptions.length === 0
                        }
                        className="w-full rounded-md border ui-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        {linkingAccess ? "Vinculando..." : "Vincular usuario seleccionado"}
                      </button>
                    </form>
                  </div>
                ) : null}
                {accessError && <p className="text-sm text-rose-600">{accessError}</p>}
              </div>
            ) : activeTab === "payroll" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Frecuencia de pago</span>
                    <select
                      value={form.payroll_frequency}
                      onChange={(event) =>
                        handleChange(
                          "payroll_frequency",
                          event.target.value as PayrollFrequency
                        )
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    >
                      <option value="diario">Diario</option>
                      <option value="semanal">Semanal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Monto</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.payroll_amount}
                      onChange={(event) => handleChange("payroll_amount", event.target.value)}
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="0"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Moneda</span>
                    <input
                      value={form.payroll_currency}
                      onChange={(event) =>
                        handleChange("payroll_currency", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="COP"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Método</span>
                    <input
                      value={form.payroll_payment_method}
                      onChange={(event) =>
                        handleChange("payroll_payment_method", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="Transferencia, efectivo..."
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Día semanal</span>
                    <input
                      value={form.payroll_day_of_week}
                      onChange={(event) =>
                        handleChange("payroll_day_of_week", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="Lunes, viernes..."
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Día del mes</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.payroll_day_of_month}
                      onChange={(event) =>
                        handleChange("payroll_day_of_month", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="15"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Último pago</span>
                    <input
                      type="date"
                      value={form.payroll_last_paid_at}
                      onChange={(event) =>
                        handleChange("payroll_last_paid_at", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Próximo pago</span>
                    <input
                      type="date"
                      value={form.payroll_next_due_at}
                      onChange={(event) =>
                        handleChange("payroll_next_due_at", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="block mb-1 ui-text-muted">Referencia</span>
                    <input
                      value={form.payroll_reference}
                      onChange={(event) =>
                        handleChange("payroll_reference", event.target.value)
                      }
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canEditFields}
                      placeholder="Cuenta/beneficiario/contrato"
                    />
                  </label>
                </div>
                <label className="text-sm block">
                  <span className="block mb-1 ui-text-muted">Notas de nómina</span>
                  <textarea
                    value={form.payroll_notes}
                    onChange={(event) => handleChange("payroll_notes", event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                    disabled={!canEditFields}
                    placeholder="Bonos, descuentos, observaciones..."
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={!canManage || isEditing}
                    className="rounded-md border ui-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    Editar
                  </button>
                  <button
                    type="submit"
                    disabled={!canEditFields || !isDirty || saving}
                    className="rounded-md bg-emerald-500 text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar nómina"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <form
                  onSubmit={handleUploadDocument}
                  className="rounded-xl border ui-border p-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                >
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Archivo</span>
                    <input
                      ref={docInputRef}
                      type="file"
                      onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
                      className="hidden"
                      disabled={!canManage || uploadingDoc}
                    />
                    <div className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        disabled={!canManage || uploadingDoc}
                        className="rounded-md border ui-border px-3 py-1.5 text-sm font-semibold hover:bg-white disabled:opacity-60"
                      >
                        Seleccionar archivo
                      </button>
                      <span className="text-sm ui-text-muted truncate">
                        {docFile?.name ?? "Ningún archivo seleccionado"}
                      </span>
                    </div>
                  </label>
                  <label className="text-sm">
                    <span className="block mb-1 ui-text-muted">Nota</span>
                    <input
                      value={docNote}
                      onChange={(event) => setDocNote(event.target.value)}
                      placeholder="Contrato, renuncia, permiso, etc."
                      className="w-full rounded-lg border ui-border bg-white/80 px-3 py-2"
                      disabled={!canManage || uploadingDoc}
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={!canManage || !docFile || uploadingDoc}
                      className="rounded-md bg-emerald-500 text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {uploadingDoc ? "Subiendo..." : "Subir"}
                    </button>
                  </div>
                </form>
                {docsError && <p className="text-sm text-rose-600">{docsError}</p>}
                {docsLoading ? (
                  <p className="text-sm ui-text-muted">Cargando documentos...</p>
                ) : documents.length === 0 ? (
                  <p className="text-sm ui-text-muted">No hay documentos cargados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead>
                        <tr className="text-left border-b ui-border">
                          <th className="px-3 py-2 font-semibold">Documento</th>
                          <th className="px-3 py-2 font-semibold">Origen</th>
                          <th className="px-3 py-2 font-semibold">Nota</th>
                          <th className="px-3 py-2 font-semibold">Fecha</th>
                          <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc) => (
                          <tr
                            key={`${doc.source ?? "hr"}-${doc.id}`}
                            className="border-b ui-border last:border-b-0"
                          >
                            <td className="px-3 py-2">{doc.file_name}</td>
                            <td className="px-3 py-2">
                              <span className="rounded-md border ui-border px-2 py-0.5 text-xs">
                                {doc.source === "profile" ? "Perfil" : "HR"}
                              </span>
                            </td>
                            <td className="px-3 py-2">{doc.note || "-"}</td>
                            <td className="px-3 py-2">{formatDateTime(doc.created_at)}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <a
                                  href={getDocumentUrl(doc.file_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-md border ui-border px-3 py-1.5 hover:bg-white/60"
                                >
                                  Abrir
                                </a>
                                <button
                                  type="button"
                                  onClick={() => void handleDownloadDocument(doc)}
                                  disabled={downloadingDocKey === `${doc.source ?? "hr"}-${doc.id}`}
                                  className="rounded-md border ui-border px-3 py-1.5 hover:bg-white/60 disabled:opacity-60"
                                >
                                  {downloadingDocKey === `${doc.source ?? "hr"}-${doc.id}`
                                    ? "Descargando..."
                                    : "Descargar"}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canManage ||
                                    doc.can_delete === false ||
                                    deletingDocId === doc.id
                                  }
                                  onClick={() =>
                                    void handleDeleteDocument(
                                      doc.id,
                                      doc.source === "profile" ? "profile" : "hr"
                                    )
                                  }
                                  className="rounded-md border border-rose-300 px-3 py-1.5 text-rose-700 disabled:opacity-60"
                                >
                                  {deletingDocId === doc.id ? "Eliminando..." : "Eliminar"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>
      )}

      {toastMessage && (
        <div
          className={[
            "fixed bottom-6 right-6 z-50 min-w-[240px] max-w-sm rounded-xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-emerald-700 shadow-lg backdrop-blur transition-all duration-200",
            toastVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0 pointer-events-none",
          ].join(" ")}
        >
          {toastMessage}
        </div>
      )}
    </section>
  );
}
