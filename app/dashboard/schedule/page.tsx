"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  ScheduleShiftRecord,
  ScheduleTemplateRecord,
  ScheduleWeekView,
  createScheduleTemplate,
  deleteScheduleShift,
  downloadScheduleExport,
  fetchScheduleTemplates,
  fetchScheduleWeekView,
  patchScheduleShift,
  publishScheduleWeek,
  upsertScheduleShift,
} from "@/lib/api/schedule";

type ShiftEditorState = {
  start_time: string;
  end_time: string;
  break_minutes: number;
  position: string;
  color: string;
  note: string;
  is_time_off: boolean;
  source_template_id?: number | null;
};

type CreateTemplateState = {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
};

const defaultShiftEditor: ShiftEditorState = {
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 30,
  position: "",
  color: "#0ea5a4",
  note: "",
  is_time_off: false,
  source_template_id: null,
};

const defaultTemplateState: CreateTemplateState = {
  name: "",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 30,
  color: "#0ea5a4",
};

function getWeekStart(dateValue: Date) {
  const clone = new Date(dateValue);
  const day = clone.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + distance);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function formatWeekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${addDays(weekStart, 6)}T00:00:00`);
  const formatter = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatDayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

function statusBadgeClass(status: string) {
  if (status === "published") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

type ScheduleGridProps = {
  weekDays: string[];
  activeEmployees: ScheduleWeekView["employees"];
  shiftMap: Map<string, ScheduleShiftRecord>;
  loading: boolean;
  onOpenEditor: (employeeId: number, employeeName: string, shiftDate: string) => void;
};

const ScheduleGrid = memo(function ScheduleGrid({
  weekDays,
  activeEmployees,
  shiftMap,
  loading,
  onOpenEditor,
}: ScheduleGridProps) {
  return (
    <section className="ui-card min-w-0 overflow-hidden border border-slate-200 p-0">
      <div className="max-w-full overflow-x-auto rounded-2xl">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[260px]" />
            {weekDays.map((day) => (
              <col key={`col-${day}`} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                Empleado
              </th>
              {weekDays.map((day) => (
                <th
                  key={day}
                  className="border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-700"
                >
                  {formatDayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {activeEmployees.map((employee, rowIndex) => {
              return (
                <tr
                  key={employee.id}
                  className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                >
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-inherit px-3 py-3 align-top">
                    <p className="text-base font-bold text-slate-800">{employee.name}</p>
                    <p
                      className={`text-xs font-medium ${
                        employee.status === "Activo" ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {employee.status}
                    </p>
                  </td>

                  {weekDays.map((day) => {
                    const shift = shiftMap.get(`${employee.id}:${day}`);
                    return (
                      <td
                        key={day}
                        className="border-b border-l border-slate-200 p-0 align-top"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenEditor(employee.id, employee.name, day)}
                          className={`h-16 w-full px-2 text-left transition ${
                            shift
                              ? "bg-teal-50 hover:bg-teal-100"
                              : "bg-slate-100 hover:bg-slate-200"
                          }`}
                        >
                          {!shift && <div className="h-full" />}

                          {shift && (
                            <div className="h-full flex items-center justify-center">
                              <p
                                className="inline-flex rounded-md px-2 py-1 text-sm font-bold text-white"
                                style={{ backgroundColor: shift.color?.trim() || "#0f766e" }}
                              >
                                {shift.is_time_off
                                  ? "Libre"
                                  : `${shift.start_time} - ${shift.end_time}`}
                              </p>
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="p-4 text-sm text-slate-500">Cargando horario semanal...</p>
      )}
    </section>
  );
});

export default function SchedulePage() {
  const { token } = useAuth();
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [weekStart, setWeekStart] = useState(() =>
    toDateKey(getWeekStart(new Date()))
  );
  const [weekView, setWeekView] = useState<ScheduleWeekView | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    employeeName: string;
    shiftDate: string;
    shift?: ScheduleShiftRecord | null;
  } | null>(null);
  const [editor, setEditor] = useState<ShiftEditorState>(defaultShiftEditor);
  const [newTemplate, setNewTemplate] = useState<CreateTemplateState>(
    defaultTemplateState
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const activeTemplates = useMemo(
    () => templates.filter((item) => item.is_active),
    [templates]
  );
  const activeEmployees = useMemo(
    () => (weekView?.employees ?? []).filter((employee) => employee.status === "Activo"),
    [weekView]
  );

  const shiftMap = useMemo(() => {
    const map = new Map<string, ScheduleShiftRecord>();
    for (const shift of weekView?.shifts ?? []) {
      map.set(`${shift.employee_id}:${shift.shift_date}`, shift);
    }
    return map;
  }, [weekView]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    fetchScheduleTemplates(token)
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar plantillas.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchScheduleWeekView(token, weekStart)
      .then((view) => {
        if (cancelled) return;
        setWeekView(view);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el horario.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, weekStart]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const refreshWeek = async () => {
    if (!token) return;
    const view = await fetchScheduleWeekView(token, weekStart);
    setWeekView(view);
  };

  const openEditor = useCallback((
    employeeId: number,
    employeeName: string,
    shiftDate: string
  ) => {
    const existing = shiftMap.get(`${employeeId}:${shiftDate}`);
    setSelectedCell({
      employeeId,
      employeeName,
      shiftDate,
      shift: existing ?? null,
    });

    if (existing) {
      setEditor({
        start_time: existing.start_time ?? "09:00",
        end_time: existing.end_time ?? "17:00",
        break_minutes: existing.break_minutes ?? 0,
        position: existing.position ?? "",
        color: existing.color ?? "#0ea5a4",
        note: existing.note ?? "",
        is_time_off: existing.is_time_off,
        source_template_id: existing.source_template_id ?? null,
      });
      return;
    }

    setEditor(defaultShiftEditor);
  }, [shiftMap]);

  const applyTemplate = (template: ScheduleTemplateRecord) => {
    setEditor((prev) => ({
      ...prev,
      start_time: template.start_time,
      end_time: template.end_time,
      break_minutes: template.break_minutes,
      color: template.color?.trim() || prev.color,
      position: template.position || prev.position,
      is_time_off: false,
      source_template_id: template.id,
    }));
  };

  const applyTemplateToCell = async (template: ScheduleTemplateRecord) => {
    if (!token || !selectedCell || !weekView) return;
    setSaving(true);
    try {
      await upsertScheduleShift(token, {
        week_id: weekView.week.id,
        employee_id: selectedCell.employeeId,
        shift_date: selectedCell.shiftDate,
        start_time: template.start_time,
        end_time: template.end_time,
        break_minutes: template.break_minutes,
        position: template.position ?? null,
        color: template.color ?? "#0ea5a4",
        is_time_off: false,
        source_template_id: template.id,
      });
      setToast(`Plantilla aplicada: ${template.name}`);
      await refreshWeek();
      setSelectedCell(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar plantilla.");
    } finally {
      setSaving(false);
    }
  };

  const saveShift = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCell || !weekView) return;

    setSaving(true);
    try {
      const payload = {
        week_id: weekView.week.id,
        employee_id: selectedCell.employeeId,
        shift_date: selectedCell.shiftDate,
        start_time: editor.is_time_off ? null : editor.start_time,
        end_time: editor.is_time_off ? null : editor.end_time,
        break_minutes: editor.is_time_off ? 0 : editor.break_minutes,
        position: editor.position || null,
        color: editor.color || null,
        note: editor.note || null,
        is_time_off: editor.is_time_off,
        source_template_id: editor.source_template_id ?? null,
      };

      if (selectedCell.shift?.id) {
        await patchScheduleShift(token, selectedCell.shift.id, payload);
      } else {
        await upsertScheduleShift(token, payload);
      }

      setToast("Turno guardado correctamente.");
      await refreshWeek();
      setSelectedCell(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el turno.");
    } finally {
      setSaving(false);
    }
  };

  const removeShift = async () => {
    if (!token || !selectedCell?.shift?.id) return;
    setSaving(true);
    try {
      await deleteScheduleShift(token, selectedCell.shift.id);
      setToast("Turno eliminado.");
      await refreshWeek();
      setSelectedCell(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el turno.");
    } finally {
      setSaving(false);
    }
  };

  const onCreateTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const name = newTemplate.name.trim();
    if (!name) {
      setError("Debes indicar un nombre para la plantilla.");
      return;
    }

    try {
      const created = await createScheduleTemplate(token, {
        name,
        start_time: newTemplate.start_time,
        end_time: newTemplate.end_time,
        break_minutes: newTemplate.break_minutes,
        color: newTemplate.color,
        position: "",
        is_active: true,
        order_index: templates.length * 10,
      });
      setTemplates((prev) => [...prev, created]);
      setNewTemplate(defaultTemplateState);
      setToast("Plantilla creada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la plantilla.");
    }
  };

  const moveWeek = (offset: number) => {
    const base = new Date(`${weekStart}T00:00:00`);
    base.setDate(base.getDate() + offset * 7);
    setWeekStart(toDateKey(getWeekStart(base)));
  };

  const publishWeek = async () => {
    if (!token || !weekView) return;
    setIsActionsMenuOpen(false);
    setSaving(true);
    try {
      await publishScheduleWeek(token, weekView.week.id);
      await refreshWeek();
      setToast("Horario publicado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar.");
    } finally {
      setSaving(false);
    }
  };

  const exportWeek = async (format: "csv" | "pdf") => {
    if (!token || !weekView) return;
    setIsActionsMenuOpen(false);
    try {
      await downloadScheduleExport(token, weekView.week.id, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar.");
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="ui-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <section className="ui-card border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold uppercase tracking-wide text-slate-800">
              Plantillas rápidas
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {activeTemplates.length}
            </span>
          </div>

          <form className="space-y-2" onSubmit={onCreateTemplate}>
            <input
              className="ui-input h-10 w-full"
              placeholder="Nombre de turno"
              value={newTemplate.name}
              onChange={(event) =>
                setNewTemplate((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                className="ui-input h-10 w-full"
                value={newTemplate.start_time}
                onChange={(event) =>
                  setNewTemplate((prev) => ({ ...prev, start_time: event.target.value }))
                }
              />
              <input
                type="time"
                className="ui-input h-10 w-full"
                value={newTemplate.end_time}
                onChange={(event) =>
                  setNewTemplate((prev) => ({ ...prev, end_time: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <input
                type="number"
                min={0}
                max={240}
                className="ui-input h-10 w-full"
                placeholder="Descanso en min"
                value={newTemplate.break_minutes}
                onChange={(event) =>
                  setNewTemplate((prev) => ({
                    ...prev,
                    break_minutes: Number(event.target.value || 0),
                  }))
                }
              />
              <input
                type="color"
                className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1"
                value={newTemplate.color}
                onChange={(event) =>
                  setNewTemplate((prev) => ({ ...prev, color: event.target.value }))
                }
              />
            </div>
            <button
              type="submit"
              className="h-10 w-full rounded-xl border border-slate-900 bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Guardar plantilla
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {activeTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={!selectedCell}
                onClick={() => applyTemplateToCell(template)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-teal-400 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{template.name}</p>
                  <span
                    className="h-3 w-3 rounded-full border border-white shadow"
                    style={{ backgroundColor: template.color || "#0ea5a4" }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {template.start_time} - {template.end_time} · Descanso {template.break_minutes}m
                </p>
              </button>
            ))}
            {activeTemplates.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                Aún no hay plantillas. Crea una para asignar turnos más rápido.
              </p>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Selecciona una celda del horario para aplicar una plantilla automáticamente.
          </p>
        </section>

        <div className="min-w-0 space-y-3">
          <section className="ui-card border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {formatWeekLabel(weekStart)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
                    weekView?.week.status || "draft"
                  )}`}
                >
                  {weekView?.week.status === "published" ? "Publicado" : "Borrador"}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => moveWeek(-1)}
                  aria-label="Semana anterior"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => moveWeek(1)}
                  aria-label="Semana siguiente"
                >
                  {">"}
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => setWeekStart(toDateKey(getWeekStart(new Date())))}
                >
                  Esta semana
                </button>
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-lg font-bold leading-none text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    aria-haspopup="menu"
                    aria-expanded={isActionsMenuOpen}
                    aria-label="Más acciones"
                    onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  >
                    ...
                  </button>

                  {isActionsMenuOpen && (
                    <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        disabled={!weekView || saving}
                        onClick={publishWeek}
                      >
                        Publicar horario
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        disabled={!weekView}
                        onClick={() => exportWeek("csv")}
                      >
                        Exportar CSV
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        disabled={!weekView}
                        onClick={() => exportWeek("pdf")}
                      >
                        Exportar PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <ScheduleGrid
            weekDays={weekDays}
            activeEmployees={activeEmployees}
            shiftMap={shiftMap}
            loading={loading}
            onOpenEditor={openEditor}
          />
        </div>
      </div>

      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedCell.employeeName} · {formatDayLabel(selectedCell.shiftDate)}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Configura horas, posición y notas del turno para este día.
                  </p>
                </div>
                <button
                  type="button"
                  className="h-9 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setSelectedCell(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {activeTemplates.length > 0 && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Aplicar plantilla rápida
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-teal-400 hover:text-teal-700"
                        onClick={() => applyTemplate(template)}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form className="grid gap-4 md:grid-cols-2" onSubmit={saveShift}>
                <label className="space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Hora inicio</span>
                  <input
                    type="time"
                    className="ui-input h-10 w-full"
                    disabled={editor.is_time_off}
                    value={editor.start_time}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, start_time: event.target.value }))
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Hora fin</span>
                  <input
                    type="time"
                    className="ui-input h-10 w-full"
                    disabled={editor.is_time_off}
                    value={editor.end_time}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, end_time: event.target.value }))
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Descanso (min)</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    className="ui-input h-10 w-full"
                    disabled={editor.is_time_off}
                    value={editor.break_minutes}
                    onChange={(event) =>
                      setEditor((prev) => ({
                        ...prev,
                        break_minutes: Number(event.target.value || 0),
                      }))
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Cargo para este turno</span>
                  <input
                    className="ui-input h-10 w-full"
                    value={editor.position}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, position: event.target.value }))
                    }
                  />
                </label>

                <label className="space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Color del turno</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1"
                    value={editor.color}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, color: event.target.value }))
                    }
                  />
                </label>

                <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={editor.is_time_off}
                    onChange={(event) =>
                      setEditor((prev) => ({
                        ...prev,
                        is_time_off: event.target.checked,
                      }))
                    }
                  />
                  Día libre / no disponible
                </label>

                <label className="md:col-span-2 space-y-1.5 text-sm text-slate-700">
                  <span className="font-medium">Nota interna</span>
                  <textarea
                    className="ui-input min-h-[110px] w-full resize-y py-2"
                    value={editor.note}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, note: event.target.value }))
                    }
                  />
                </label>

                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                  <div className="flex gap-2">
                    {selectedCell.shift?.id && (
                      <button
                        type="button"
                        className="h-10 rounded-xl border border-rose-300 px-4 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        disabled={saving}
                        onClick={removeShift}
                      >
                        Eliminar turno
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="h-10 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      onClick={() => setSelectedCell(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="h-10 rounded-xl border border-teal-600 bg-teal-600 px-4 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                      disabled={saving}
                    >
                      Guardar turno
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
