"use client";

import { DragEvent, FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  ScheduleShiftRecord,
  ScheduleTemplateRecord,
  ScheduleWeekView,
  createScheduleTemplate,
  patchScheduleTemplate,
  deleteScheduleShift,
  downloadScheduleExport,
  fetchScheduleTemplates,
  fetchScheduleWeekView,
  patchScheduleShift,
  publishScheduleWeek,
  reorderScheduleEmployees,
  updateScheduleEmployeeRowColor,
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
  is_time_off: boolean;
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
  is_time_off: false,
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

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

function formatTimeAmPm(value?: string | null) {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24)) return value;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute}${suffix}`;
}

function formatRangeAmPm(start?: string | null, end?: string | null) {
  return `${formatTimeAmPm(start)}-${formatTimeAmPm(end)}`;
}

function trimCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function parseHexColor(hex: string) {
  const value = hex.trim().replace("#", "");
  if (value.length !== 6) return null;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((part) => Number.isNaN(part))) return null;
  return { r, g, b };
}

function shiftTextColor(bgHex?: string | null) {
  const rgb = parseHexColor(bgHex || "");
  if (!rgb) return "#062A2A";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 165 ? "#062A2A" : "#F8FAFC";
}

function toRgba(hex: string | null | undefined, alpha: number) {
  const rgb = parseHexColor(hex || "");
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function splitBreakMinutes(totalMinutes: number) {
  const safe = Math.max(0, Number.isFinite(totalMinutes) ? totalMinutes : 0);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return { hours, minutes };
}

function formatBreakMinutes(totalMinutes: number) {
  const { hours, minutes } = splitBreakMinutes(totalMinutes);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseBreakHHMM(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function normalizeTimeInput(
  rawValue: string,
  meridiem: "am" | "pm"
): string | null {
  const value = rawValue.trim().toLowerCase();
  const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(value);
  if (!match) return null;
  const inputHour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (!Number.isFinite(inputHour) || inputHour > 23) return null;

  let hour = inputHour;
  if (inputHour <= 12) {
    if (meridiem === "pm") {
      hour = inputHour % 12;
      hour += 12;
    } else {
      hour = inputHour % 12;
    }
  }

  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type ScheduleGridProps = {
  weekDays: string[];
  todayKey: string;
  dayEventsByDate: Map<string, ScheduleWeekView["day_events"]>;
  activeEmployees: ScheduleWeekView["employees"];
  shiftMap: Map<string, ScheduleShiftRecord>;
  templateNameById: Map<number, string>;
  templateColorById: Map<number, string>;
  loading: boolean;
  onOpenEditor: (employeeId: number, employeeName: string, shiftDate: string) => void;
  onDropTemplateToCell: (employeeId: number, shiftDate: string, templateId: number) => void;
  onDropShiftToCell: (employeeId: number, shiftDate: string, shiftId: number) => void;
  onReorderEmployees: (sourceEmployeeId: number, targetEmployeeId: number) => void;
  onEmployeeRowColorChange: (employeeId: number, rowColor: string | null) => void;
};

const ScheduleGrid = memo(function ScheduleGrid({
  weekDays,
  todayKey,
  dayEventsByDate,
  activeEmployees,
  shiftMap,
  templateNameById,
  templateColorById,
  loading,
  onOpenEditor,
  onDropTemplateToCell,
  onDropShiftToCell,
  onReorderEmployees,
  onEmployeeRowColorChange,
}: ScheduleGridProps) {
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [dragOverEmployeeId, setDragOverEmployeeId] = useState<number | null>(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<number | null>(null);
  const [rowDropPosition, setRowDropPosition] = useState<"before" | "after" | null>(null);
  const [openDayInfo, setOpenDayInfo] = useState<string | null>(null);

  useEffect(() => {
    const resetDragUi = () => {
      setDragOverCellKey(null);
      setDragOverEmployeeId(null);
      setDraggingEmployeeId(null);
      setRowDropPosition(null);
    };

    window.addEventListener("dragend", resetDragUi);
    window.addEventListener("drop", resetDragUi);
    return () => {
      window.removeEventListener("dragend", resetDragUi);
      window.removeEventListener("drop", resetDragUi);
    };
  }, []);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-day-info-root='true']")) return;
      setOpenDayInfo(null);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  const handleCellDrop = (
    event: DragEvent,
    employeeId: number,
    day: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverCellKey(null);
    if (event.dataTransfer.types.includes("text/shift-id")) {
      const shiftId = Number(event.dataTransfer.getData("text/shift-id"));
      if (!Number.isFinite(shiftId)) return;
      onDropShiftToCell(employeeId, day, shiftId);
      return;
    }
    if (event.dataTransfer.types.includes("text/template-id")) {
      const templateId = Number(event.dataTransfer.getData("text/template-id"));
      if (!Number.isFinite(templateId)) return;
      onDropTemplateToCell(employeeId, day, templateId);
    }
  };

  return (
    <section className="ui-card min-w-0 overflow-hidden border border-slate-200 p-0">
      <div className="max-w-full overflow-x-auto rounded-2xl">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[clamp(110px,9vw,150px)]" />
            {weekDays.map((day) => (
              <col key={`col-${day}`} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700">
                Empleado
              </th>
              {weekDays.map((day) => (
                <th
                  key={day}
                  data-day-info-root="true"
                  className={`border-b border-l px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide ${
                    day === todayKey
                      ? "border-slate-300 bg-teal-50 text-teal-800 shadow-[inset_0_-2px_0_0_#14b8a6]"
                      : "border-slate-200 text-slate-700"
                  } relative`}
                >
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <span>{formatDayLabel(day)}</span>
                    {(dayEventsByDate.get(day)?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold normal-case text-slate-600"
                        aria-label="Ver eventos del día"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDayInfo((prev) => (prev === day ? null : day));
                        }}
                      >
                        i
                      </button>
                    ) : null}
                  </div>
                  {openDayInfo === day ? (
                    <div className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-left normal-case shadow-lg ring-1 ring-black/5 transition-all duration-150 ease-out">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Eventualidades
                      </p>
                      <ul className="space-y-1">
                        {(dayEventsByDate.get(day) ?? []).map((eventItem, index) => {
                          const prefix =
                            eventItem.kind === "holiday"
                              ? "Festivo"
                              : eventItem.kind === "birthday"
                                ? "Evento"
                                : "Evento";
                          return (
                            <li key={`${day}-${eventItem.kind}-${index}`} className="text-[11px] leading-4 text-slate-700">
                              <span className="font-semibold text-slate-900">{prefix}:</span>{" "}
                              {eventItem.label}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {activeEmployees.map((employee, rowIndex) => {
              const isRowDropTarget = dragOverEmployeeId === employee.id;
              const rowTint = toRgba(employee.row_color ?? null, 0.28);
              const rowBaseClass = rowTint
                ? ""
                : rowIndex % 2 === 0
                  ? "bg-white"
                  : "bg-slate-50/40";
              return (
                <tr
                  key={employee.id}
                  className={`${rowBaseClass} ${
                    draggingEmployeeId === employee.id
                      ? "relative z-10 bg-teal-100/60 shadow-[inset_0_0_0_2px_rgba(20,184,166,0.45)]"
                      : ""
                  }`}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("text/employee-row-id")) return;
                    event.preventDefault();
                    if (dragOverEmployeeId !== employee.id) {
                      setDragOverEmployeeId(employee.id);
                    }
                    const rect = (event.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                    const isAfter = event.clientY > rect.top + rect.height / 2;
                    setRowDropPosition(isAfter ? "after" : "before");
                  }}
                  onDragLeave={() => {
                    if (dragOverEmployeeId === employee.id) {
                      setDragOverEmployeeId(null);
                      setRowDropPosition(null);
                    }
                  }}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types.includes("text/employee-row-id")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const sourceEmployeeId = Number(
                      event.dataTransfer.getData("text/employee-row-id")
                    );
                    if (!Number.isFinite(sourceEmployeeId)) return;
                    setDragOverEmployeeId(null);
                    setDraggingEmployeeId(null);
                    setRowDropPosition(null);
                    onReorderEmployees(sourceEmployeeId, employee.id);
                  }}
                >
                  <td
                    className={`sticky left-0 z-10 border-b border-r border-slate-200 px-2.5 py-2.5 align-top transition ${
                      draggingEmployeeId === employee.id
                        ? "bg-teal-100/70"
                        : isRowDropTarget
                          ? "bg-teal-50"
                          : "bg-inherit"
                    } ${
                      isRowDropTarget
                        ? rowDropPosition === "after"
                          ? "shadow-[inset_0_-3px_0_0_rgba(20,184,166,0.95)]"
                          : "shadow-[inset_0_3px_0_0_rgba(20,184,166,0.95)]"
                        : ""
                    }`}
                    style={
                      rowTint && draggingEmployeeId !== employee.id && !isRowDropTarget
                        ? { backgroundColor: rowTint }
                        : undefined
                    }
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/employee-row-id", String(employee.id));
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingEmployeeId(employee.id);

                      const rowGhost = document.createElement("div");
                      rowGhost.id = `employee-row-drag-ghost-${employee.id}`;
                      rowGhost.style.position = "fixed";
                      rowGhost.style.top = "-9999px";
                      rowGhost.style.left = "-9999px";
                      rowGhost.style.pointerEvents = "none";
                      rowGhost.style.display = "flex";
                      rowGhost.style.alignItems = "center";
                      rowGhost.style.gap = "8px";
                      rowGhost.style.padding = "8px 10px";
                      rowGhost.style.borderRadius = "10px";
                      rowGhost.style.border = "1px solid rgba(20,184,166,0.45)";
                      rowGhost.style.background = "rgba(240,253,250,0.98)";
                      rowGhost.style.boxShadow =
                        "0 10px 24px rgba(15,23,42,0.2), 0 2px 8px rgba(15,23,42,0.12)";
                      rowGhost.style.fontFamily = "inherit";
                      rowGhost.style.maxWidth = "780px";
                      rowGhost.style.width = "max-content";

                      const shiftSummaries = weekDays.map((day) => {
                        const shiftForDay = shiftMap.get(`${employee.id}:${day}`);
                        if (!shiftForDay) return "—";
                        if (shiftForDay.is_time_off) return "Día libre";
                        return formatRangeAmPm(shiftForDay.start_time, shiftForDay.end_time);
                      });

                      rowGhost.innerHTML = `
                        <div style="min-width:180px;max-width:220px;padding-right:8px;border-right:1px dashed rgba(15,23,42,0.15);">
                          <div style="font-size:13px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${employee.name}
                          </div>
                          <div style="margin-top:2px;font-size:11px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.03em;">
                            Reordenando fila completa
                          </div>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(7,minmax(64px,1fr));gap:6px;min-width:500px;">
                          ${shiftSummaries
                            .map(
                              (item) => `
                                <div style="font-size:10px;font-weight:700;color:#0f172a;background:rgba(20,184,166,0.12);border:1px solid rgba(20,184,166,0.25);border-radius:7px;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">
                                  ${item}
                                </div>
                              `
                            )
                            .join("")}
                        </div>
                      `;
                      document.body.appendChild(rowGhost);
                      event.dataTransfer.setDragImage(rowGhost, 24, 18);
                    }}
                    onDragEnd={() => {
                      setDragOverEmployeeId(null);
                      setDraggingEmployeeId(null);
                      setRowDropPosition(null);
                      const rowGhost = document.getElementById(
                        `employee-row-drag-ghost-${employee.id}`
                      );
                      if (rowGhost) rowGhost.remove();
                    }}
                  >
                    <p className="truncate text-[13px] font-bold text-slate-800" title={employee.name}>
                      {employee.name}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={`text-[11px] font-medium ${
                          employee.status === "Activo" ? "text-emerald-700" : "text-rose-600"
                        }`}
                      >
                        {employee.status}
                      </p>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="color"
                          className="sr-only"
                          value={employee.row_color || "#94a3b8"}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const picked = event.target.value?.trim().toLowerCase();
                            if (!picked || picked === "transparent" || picked === "#00000000") {
                              onEmployeeRowColorChange(employee.id, null);
                              return;
                            }
                            onEmployeeRowColorChange(employee.id, picked);
                          }}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full ring-1 ring-slate-300/90"
                          style={{
                            backgroundColor: employee.row_color || "#94a3b8",
                          }}
                          aria-hidden="true"
                          title={employee.row_color ? "Cambiar color de fila" : "Sin color"}
                          onMouseDown={(event) => {
                            if (event.ctrlKey || event.metaKey) {
                              event.preventDefault();
                              event.stopPropagation();
                              onEmployeeRowColorChange(employee.id, null);
                            }
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onEmployeeRowColorChange(employee.id, null);
                          }}
                        />
                      </label>
                    </div>
                  </td>

                  {weekDays.map((day) => {
                    const shift = shiftMap.get(`${employee.id}:${day}`);
                    const cellKey = `${employee.id}:${day}`;
                    const isDropTarget = dragOverCellKey === cellKey;
                    return (
                      <td
                        key={day}
                        className={`border-b border-l p-0 align-top transition ${
                          draggingEmployeeId === employee.id
                            ? "bg-teal-100/55"
                            : isRowDropTarget
                              ? "bg-teal-50/80"
                              : ""
                        } ${
                          day === todayKey
                            ? "border-slate-300 bg-teal-50/45"
                            : "border-slate-200"
                        } ${
                          isDropTarget ? "bg-teal-100/70 ring-1 ring-inset ring-teal-300" : ""
                        }`}
                        style={
                          rowTint &&
                          draggingEmployeeId !== employee.id &&
                          !isRowDropTarget &&
                          !isDropTarget
                            ? { backgroundColor: rowTint }
                            : undefined
                        }
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dragOverCellKey !== cellKey) {
                            setDragOverCellKey(cellKey);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverCellKey === cellKey) setDragOverCellKey(null);
                        }}
                        onDrop={(event) => handleCellDrop(event, employee.id, day)}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenEditor(employee.id, employee.name, day)}
                          draggable={Boolean(shift)}
                          onDragStart={(event) => {
                            if (!shift) return;
                            event.dataTransfer.setData("text/shift-id", String(shift.id));
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragOverCellKey(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (dragOverCellKey !== cellKey) {
                              setDragOverCellKey(cellKey);
                            }
                          }}
                          onDrop={(event) => handleCellDrop(event, employee.id, day)}
                          className={`relative h-16 w-full px-2 text-left transition ${
                            shift
                              ? "bg-transparent hover:bg-teal-100/35"
                              : "bg-transparent hover:bg-slate-200/55"
                          }`}
                        >
                          {day === todayKey ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 z-0 bg-teal-100/35"
                            />
                          ) : null}
                          {!shift && <div className="relative z-10 h-full" />}

                          {shift && (
                            <div className="relative z-10 h-full flex items-center justify-center">
                              {(() => {
                                const shiftLabel =
                                  (shift.source_template_id
                                    ? templateNameById.get(shift.source_template_id)
                                    : null) || "Turno";
                                return (
                              <div
                                className="inline-flex w-full max-w-full flex-col items-center overflow-hidden rounded-lg px-2 py-1.5 shadow-sm ring-1 ring-black/10"
                                style={{
                                  backgroundColor:
                                    (shift.source_template_id
                                      ? templateColorById.get(shift.source_template_id)?.trim()
                                      : null) ||
                                    shift.color?.trim() ||
                                    "#0f766e",
                                  color: shiftTextColor(
                                    (shift.source_template_id
                                      ? templateColorById.get(shift.source_template_id)
                                      : null) || shift.color
                                  ),
                                }}
                                title={
                                  shift.source_template_id
                                    ? templateNameById.get(shift.source_template_id) ?? undefined
                                    : undefined
                                }
                              >
                                <span className="block w-full truncate text-center text-[10px] font-semibold uppercase leading-none tracking-[0.02em] opacity-90">
                                  {shiftLabel}
                                </span>
                                <span className="mt-0.5 w-full whitespace-nowrap text-center text-[12px] font-extrabold leading-none [font-variant-numeric:tabular-nums]">
                                  {shift.is_time_off
                                    ? "Día libre"
                                    : formatRangeAmPm(shift.start_time, shift.end_time)}
                                </span>
                              </div>
                                );
                              })()}
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
  const syncStatusTimerRef = useRef<number | null>(null);
  const [weekStart, setWeekStart] = useState(() =>
    toDateKey(getWeekStart(new Date()))
  );
  const [weekView, setWeekView] = useState<ScheduleWeekView | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
  const [templateStartInput, setTemplateStartInput] = useState(
    defaultTemplateState.start_time
  );
  const [templateEndInput, setTemplateEndInput] = useState(
    defaultTemplateState.end_time
  );
  const [templateBreakHHMM, setTemplateBreakHHMM] = useState(
    formatBreakMinutes(defaultTemplateState.break_minutes)
  );
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [shiftsById, setShiftsById] = useState<Map<number, ScheduleShiftRecord>>(new Map());
  const [employeeOrder, setEmployeeOrder] = useState<number[]>([]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const activeTemplates = useMemo(
    () => templates.filter((item) => item.is_active),
    [templates]
  );
  const weekEmployees = useMemo(() => weekView?.employees ?? [], [weekView]);
  const orderedWeekEmployees = useMemo(() => {
    if (!weekEmployees.length) return weekEmployees;
    const byId = new Map(weekEmployees.map((employee) => [employee.id, employee]));
    const ordered: ScheduleWeekView["employees"] = [];
    employeeOrder.forEach((id) => {
      const employee = byId.get(id);
      if (employee) ordered.push(employee);
    });
    weekEmployees.forEach((employee) => {
      if (!employeeOrder.includes(employee.id)) ordered.push(employee);
    });
    return ordered;
  }, [weekEmployees, employeeOrder]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, ScheduleShiftRecord>();
    for (const shift of weekView?.shifts ?? []) {
      map.set(`${shift.employee_id}:${shift.shift_date}`, shift);
    }
    return map;
  }, [weekView]);

  const templateNameById = useMemo(() => {
    const map = new Map<number, string>();
    templates.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [templates]);
  const templateColorById = useMemo(() => {
    const map = new Map<number, string>();
    templates.forEach((item) => {
      if (item.color?.trim()) map.set(item.id, item.color.trim());
    });
    return map;
  }, [templates]);

  const dayEventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleWeekView["day_events"]>();
    for (const event of weekView?.day_events ?? []) {
      const key = event.shift_date;
      const current = map.get(key) ?? [];
      current.push(event);
      map.set(key, current);
    }
    return map;
  }, [weekView]);

  useEffect(() => {
    const map = new Map<number, ScheduleShiftRecord>();
    for (const shift of weekView?.shifts ?? []) {
      map.set(shift.id, shift);
    }
    setShiftsById(map);
  }, [weekView]);

  useEffect(() => {
    if (!weekEmployees.length) return;
    setEmployeeOrder((prev) => {
      const activeIds = weekEmployees.map((employee) => employee.id);
      const prevFiltered = prev.filter((id) => activeIds.includes(id));
      const missing = activeIds.filter((id) => !prevFiltered.includes(id));
      return [...prevFiltered, ...missing];
    });
  }, [weekEmployees]);

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

  const markSyncSaved = useCallback(() => {
    setSyncStatus("saved");
    if (syncStatusTimerRef.current) {
      window.clearTimeout(syncStatusTimerRef.current);
    }
    syncStatusTimerRef.current = window.setTimeout(() => {
      setSyncStatus("idle");
      syncStatusTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (syncStatusTimerRef.current) {
        window.clearTimeout(syncStatusTimerRef.current);
      }
    };
  }, []);

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
      break_minutes: template.is_time_off ? 0 : template.break_minutes,
      color: template.color?.trim() || prev.color,
      position: template.position || prev.position,
      is_time_off: Boolean(template.is_time_off),
      source_template_id: template.id,
    }));
  };

  const applyTemplateToCell = async (
    template: ScheduleTemplateRecord,
    employeeId: number,
    shiftDate: string
  ) => {
    if (!token || !weekView) return;
    setSaving(true);
    setSyncStatus("saving");
    try {
      await upsertScheduleShift(token, {
        week_id: weekView.week.id,
        employee_id: employeeId,
        shift_date: shiftDate,
        start_time: template.is_time_off ? null : template.start_time,
        end_time: template.is_time_off ? null : template.end_time,
        break_minutes: template.is_time_off ? 0 : template.break_minutes,
        position: template.position ?? null,
        color: template.color ?? "#0ea5a4",
        is_time_off: Boolean(template.is_time_off),
        source_template_id: template.id,
      });
      setToast(`Plantilla aplicada: ${template.name}`);
      await refreshWeek();
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar plantilla.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const onDropTemplateToCell = (
    employeeId: number,
    shiftDate: string,
    templateId: number
  ) => {
    const template = activeTemplates.find((item) => item.id === templateId);
    if (!template) return;
    void applyTemplateToCell(template, employeeId, shiftDate);
  };

  const moveShiftToCell = async (targetEmployeeId: number, targetShiftDate: string, shiftId: number) => {
    if (!token || !weekView) return;
    const sourceShift = shiftsById.get(shiftId);
    if (!sourceShift) return;
    const isSameCell =
      sourceShift.employee_id === targetEmployeeId && sourceShift.shift_date === targetShiftDate;
    if (isSameCell) return;

    setSaving(true);
    setSyncStatus("saving");
    try {
      await upsertScheduleShift(token, {
        week_id: weekView.week.id,
        employee_id: targetEmployeeId,
        shift_date: targetShiftDate,
        start_time: sourceShift.start_time ?? null,
        end_time: sourceShift.end_time ?? null,
        break_minutes: sourceShift.break_minutes,
        position: sourceShift.position ?? null,
        color: sourceShift.color ?? null,
        note: sourceShift.note ?? null,
        is_time_off: sourceShift.is_time_off,
        source_template_id: sourceShift.source_template_id ?? null,
      });
      await deleteScheduleShift(token, sourceShift.id);
      await refreshWeek();
      setToast("Turno movido.");
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mover el turno.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const deleteShiftByDrag = async (shiftId: number) => {
    if (!token) return;
    setSaving(true);
    setSyncStatus("saving");
    try {
      await deleteScheduleShift(token, shiftId);
      await refreshWeek();
      setToast("Turno eliminado.");
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el turno.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const saveShift = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedCell || !weekView) return;

    setSaving(true);
    setSyncStatus("saving");
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
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el turno.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const removeShift = async () => {
    if (!token || !selectedCell?.shift?.id) return;
    setSaving(true);
    setSyncStatus("saving");
    try {
      await deleteScheduleShift(token, selectedCell.shift.id);
      setToast("Turno eliminado.");
      await refreshWeek();
      setSelectedCell(null);
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el turno.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const openCreateTemplateModal = () => {
    setEditingTemplateId(null);
    setNewTemplate(defaultTemplateState);
    setTemplateStartInput(defaultTemplateState.start_time);
    setTemplateEndInput(defaultTemplateState.end_time);
    setTemplateBreakHHMM(formatBreakMinutes(defaultTemplateState.break_minutes));
    setError(null);
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = (template: ScheduleTemplateRecord) => {
    setEditingTemplateId(template.id);
    setNewTemplate({
      name: template.name,
      start_time: template.start_time,
      end_time: template.end_time,
      break_minutes: template.break_minutes,
      color: template.color?.trim() || "#0ea5a4",
      is_time_off: Boolean(template.is_time_off),
    });
    setTemplateStartInput(template.start_time);
    setTemplateEndInput(template.end_time);
    setTemplateBreakHHMM(formatBreakMinutes(template.break_minutes));
    setError(null);
    setIsTemplateModalOpen(true);
  };

  const onSaveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const name = newTemplate.name.trim();
    if (!name) {
      setError("Debes indicar un nombre para la plantilla.");
      return;
    }

    try {
      setSyncStatus("saving");
      if (editingTemplateId) {
        const updated = await patchScheduleTemplate(token, editingTemplateId, {
          name,
          start_time: newTemplate.is_time_off ? "00:00" : newTemplate.start_time,
          end_time: newTemplate.is_time_off ? "00:00" : newTemplate.end_time,
          break_minutes: newTemplate.is_time_off ? 0 : newTemplate.break_minutes,
          color: newTemplate.color,
          is_time_off: newTemplate.is_time_off,
        });
        setTemplates((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        const created = await createScheduleTemplate(token, {
          name,
          start_time: newTemplate.is_time_off ? "00:00" : newTemplate.start_time,
          end_time: newTemplate.is_time_off ? "00:00" : newTemplate.end_time,
          break_minutes: newTemplate.is_time_off ? 0 : newTemplate.break_minutes,
          color: newTemplate.color,
          position: "",
          is_time_off: newTemplate.is_time_off,
          is_active: true,
          order_index: templates.length * 10,
        });
        setTemplates((prev) => [...prev, created]);
      }
      setNewTemplate(defaultTemplateState);
      setTemplateStartInput(defaultTemplateState.start_time);
      setTemplateEndInput(defaultTemplateState.end_time);
      setTemplateBreakHHMM(formatBreakMinutes(defaultTemplateState.break_minutes));
      setIsTemplateModalOpen(false);
      setEditingTemplateId(null);
      setToast(editingTemplateId ? "Plantilla actualizada." : "Plantilla creada.");
      markSyncSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingTemplateId
            ? "No se pudo actualizar la plantilla."
            : "No se pudo crear la plantilla."
      );
      setSyncStatus("error");
    }
  };

  const moveWeek = (offset: number) => {
    const base = new Date(`${weekStart}T00:00:00`);
    base.setDate(base.getDate() + offset * 7);
    setWeekStart(toDateKey(getWeekStart(base)));
  };

  const copyToNextWeek = async () => {
    if (!token || !weekView) return;
    const confirmed = window.confirm(
      "Vas a reemplazar completamente la semana siguiente con los turnos de la semana actual. Se perderán todos los cambios existentes en la semana siguiente. ¿Deseas continuar?"
    );
    if (!confirmed) return;

    const nextWeekStart = addDays(weekStart, 7);
    setSaving(true);
    setSyncStatus("saving");
    try {
      const targetWeekView = await fetchScheduleWeekView(token, nextWeekStart);
      const expectedShiftKeys = new Set(
        weekView.shifts.map((sourceShift) => `${sourceShift.employee_id}:${addDays(sourceShift.shift_date, 7)}`)
      );

      for (const existingShift of targetWeekView.shifts) {
        await deleteScheduleShift(token, existingShift.id);
      }

      for (const sourceShift of weekView.shifts) {
        await upsertScheduleShift(token, {
          week_id: targetWeekView.week.id,
          employee_id: sourceShift.employee_id,
          shift_date: addDays(sourceShift.shift_date, 7),
          start_time: sourceShift.start_time ?? null,
          end_time: sourceShift.end_time ?? null,
          break_minutes: sourceShift.break_minutes,
          position: sourceShift.position ?? null,
          color: sourceShift.color ?? null,
          note: sourceShift.note ?? null,
          is_time_off: sourceShift.is_time_off,
          source_template_id: sourceShift.source_template_id ?? null,
        });
      }

      let consistentView: ScheduleWeekView | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const refreshed = await fetchScheduleWeekView(token, nextWeekStart);
        const presentKeys = new Set(
          refreshed.shifts.map((shift) => `${shift.employee_id}:${shift.shift_date}`)
        );
        const isConsistent = Array.from(expectedShiftKeys).every((key) => presentKeys.has(key));
        if (isConsistent) {
          consistentView = refreshed;
          break;
        }
        await waitMs(250);
      }

      if (consistentView && weekStart === nextWeekStart) {
        setWeekView(consistentView);
      }

      setToast("Semana copiada a la siguiente (reemplazo completo).");
      markSyncSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo copiar la semana a la siguiente."
      );
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const publishWeek = async () => {
    if (!token || !weekView) return;
    setIsActionsMenuOpen(false);
    setSaving(true);
    setSyncStatus("saving");
    try {
      await publishScheduleWeek(token, weekView.week.id);
      await refreshWeek();
      setToast("Horario publicado.");
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const clearWeek = async () => {
    if (!token || !weekView) return;
    setIsActionsMenuOpen(false);
    const confirmed = window.confirm(
      "Vas a eliminar todos los turnos de esta semana. Esta acción no se puede deshacer. ¿Deseas continuar?"
    );
    if (!confirmed) return;

    setSaving(true);
    setSyncStatus("saving");
    try {
      for (const shift of weekView.shifts) {
        await deleteScheduleShift(token, shift.id);
      }
      await refreshWeek();
      setToast("Semana limpiada.");
      markSyncSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar la semana.");
      setSyncStatus("error");
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

  const buildScheduleImageBlob = async (): Promise<Blob | null> => {
    if (!weekView) return null;
    try {
      const employees = orderedWeekEmployees;
      const dayCount = weekDays.length;
      const employeeColWidth = 220;
      const dayColWidth = 170;
      const topHeaderHeight = 70;
      const tableHeaderHeight = 44;
      const rowHeight = 54;
      const canvasWidth = employeeColWidth + dayCount * dayColWidth;
      const canvasHeight = topHeaderHeight + tableHeaderHeight + employees.length * rowHeight;
      const scale = 2;

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth * scale;
      canvas.height = canvasHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.scale(scale, scale);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const weekLabel = formatWeekLabel(weekStart).toUpperCase();
      ctx.fillStyle = "#0f172a";
      ctx.font = "700 24px Arial";
      ctx.fillText("Horario Semanal", 20, 34);
      ctx.fillStyle = "#475569";
      ctx.font = "600 14px Arial";
      ctx.fillText(`Semana: ${weekLabel}`, 20, 56);

      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, topHeaderHeight, canvasWidth, tableHeaderHeight);

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, topHeaderHeight + tableHeaderHeight + 0.5);
      ctx.lineTo(canvasWidth, topHeaderHeight + tableHeaderHeight + 0.5);
      ctx.stroke();

      ctx.fillStyle = "#334155";
      ctx.font = "700 15px Arial";
      ctx.fillText("EMPLEADO", 16, topHeaderHeight + 28);

      weekDays.forEach((day, index) => {
        const x = employeeColWidth + index * dayColWidth;
        const dayDate = new Date(`${day}T00:00:00`);
        const dayTitle = new Intl.DateTimeFormat("es-CO", {
          weekday: "short",
          day: "numeric",
        })
          .format(dayDate)
          .toUpperCase();
        const isToday = day === todayKey;
        if (isToday) {
          ctx.fillStyle = "#ecfeff";
          ctx.fillRect(x, topHeaderHeight, dayColWidth, tableHeaderHeight);
        }
        ctx.fillStyle = isToday ? "#0f766e" : "#334155";
        ctx.font = "700 15px Arial";
        const textWidth = ctx.measureText(dayTitle).width;
        ctx.fillText(dayTitle, x + dayColWidth / 2 - textWidth / 2, topHeaderHeight + 28);
      });

      employees.forEach((employee, rowIndex) => {
        const y = topHeaderHeight + tableHeaderHeight + rowIndex * rowHeight;
        ctx.fillStyle =
          toRgba(employee.row_color ?? null, 0.30) ||
          (rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc");
        ctx.fillRect(0, y, canvasWidth, rowHeight);

        ctx.fillStyle = "#0f172a";
        ctx.font = "700 14px Arial";
        const employeeText = trimCanvasText(ctx, employee.name, employeeColWidth - 20);
        ctx.fillText(employeeText, 16, y + 24);

        ctx.fillStyle = employee.status === "Activo" ? "#047857" : "#b91c1c";
        ctx.font = "700 11px Arial";
        ctx.fillText(employee.status, 16, y + 42);

        weekDays.forEach((day, colIndex) => {
          const x = employeeColWidth + colIndex * dayColWidth;
          const key = `${employee.id}:${day}`;
          const shift = shiftMap.get(key);
          if (!shift) return;
          const pillX = x + 10;
          const pillY = y + 10;
          const pillW = dayColWidth - 20;
          const pillH = rowHeight - 20;
          const shiftColor =
            (shift.source_template_id
              ? templateColorById.get(shift.source_template_id)?.trim()
              : null) ||
            shift.color?.trim() ||
            "#0ea5a4";
          ctx.fillStyle = shiftColor;
          roundRectPath(ctx, pillX, pillY, pillW, pillH, 10);
          ctx.fill();

          const textColor = shiftTextColor(shiftColor);
          const templateName =
            (shift.source_template_id
              ? templateNameById.get(shift.source_template_id)
              : null) || "Turno";
          const timeLabel = shift.is_time_off
            ? "Día libre"
            : formatRangeAmPm(shift.start_time, shift.end_time);

          ctx.fillStyle = textColor;
          ctx.font = "700 10px Arial";
          const shortName = trimCanvasText(ctx, templateName.toUpperCase(), pillW - 12);
          const nameWidth = ctx.measureText(shortName).width;
          ctx.fillText(shortName, pillX + pillW / 2 - nameWidth / 2, pillY + 14);

          ctx.font = "700 13px Arial";
          const shortTime = trimCanvasText(ctx, timeLabel, pillW - 12);
          const timeWidth = ctx.measureText(shortTime).width;
          ctx.fillText(shortTime, pillX + pillW / 2 - timeWidth / 2, pillY + 30);
        });
      });

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      for (let i = 0; i <= dayCount; i += 1) {
        const x = employeeColWidth + i * dayColWidth + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, topHeaderHeight);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(employeeColWidth + 0.5, topHeaderHeight);
      ctx.lineTo(employeeColWidth + 0.5, canvasHeight);
      ctx.stroke();
      for (let i = 0; i <= employees.length; i += 1) {
        const y = topHeaderHeight + tableHeaderHeight + i * rowHeight + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
      ctx.strokeRect(0.5, topHeaderHeight + 0.5, canvasWidth - 1, canvasHeight - topHeaderHeight - 1);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png", 0.95);
      });
      return blob;
    } catch {
      return null;
    }
  };

  const downloadScheduleImage = async () => {
    const blob = await buildScheduleImageBlob();
    if (!blob) {
      setError("No se pudo generar la imagen del horario.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `horario_${weekStart}_a_${addDays(weekStart, 6)}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Imagen del horario descargada.");
  };

  const copyScheduleImage = async () => {
    if (typeof window === "undefined" || !navigator.clipboard || !("ClipboardItem" in window)) {
      setError("Tu navegador no soporta copiar imagen al portapapeles.");
      return;
    }
    setSyncStatus("saving");
    const blob = await buildScheduleImageBlob();
    if (!blob) {
      setError("No se pudo generar la imagen del horario.");
      setSyncStatus("error");
      return;
    }
    try {
      const clipboardItemCtor = (
        window as unknown as {
          ClipboardItem?: new (items: Record<string, Blob>) => unknown;
        }
      ).ClipboardItem;
      if (!clipboardItemCtor) {
        throw new Error("ClipboardItem no disponible");
      }
      await navigator.clipboard.write([
        new clipboardItemCtor({ "image/png": blob }) as ClipboardItem,
      ]);
      setToast("Imagen del horario copiada al portapapeles.");
      markSyncSaved();
    } catch {
      setError(
        "No se pudo copiar al portapapeles. Revisa permisos del navegador o usa Descargar imagen."
      );
      setSyncStatus("error");
    }
  };

  return (
    <div
      className="space-y-5"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/shift-id")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("text/shift-id")) return;
        const shiftRaw = event.dataTransfer.getData("text/shift-id");
        const shiftId = Number(shiftRaw);
        if (!Number.isFinite(shiftId)) return;
        if (shiftId <= 0) return;
        event.preventDefault();
        void deleteShiftByDrag(shiftId);
      }}
    >
      {error && (
        <div className="ui-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-2 xl:grid-cols-[clamp(150px,11vw,190px)_1fr]">
        <section className="ui-card border border-slate-200 p-2.5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Plantillas rápidas
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {activeTemplates.length}
            </span>
          </div>

          <button
            type="button"
            className="h-10 w-full rounded-xl border border-slate-900 bg-slate-900 text-[11px] font-semibold text-white transition hover:bg-slate-800"
            onClick={openCreateTemplateModal}
          >
            Nueva plantilla
          </button>

          <div className="mt-3 space-y-2">
            {activeTemplates.map((template) => (
              <div
                key={template.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/template-id", String(template.id));
                  event.dataTransfer.effectAllowed = "copyMove";

                  const dragGhost = document.createElement("div");
                  dragGhost.id = `schedule-template-drag-ghost-${template.id}`;
                  dragGhost.style.position = "fixed";
                  dragGhost.style.top = "-9999px";
                  dragGhost.style.left = "-9999px";
                  dragGhost.style.pointerEvents = "none";
                  dragGhost.style.padding = "8px 10px";
                  dragGhost.style.borderRadius = "10px";
                  dragGhost.style.border = "1px solid rgba(0,0,0,0.08)";
                  dragGhost.style.boxShadow =
                    "0 8px 18px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.12)";
                  dragGhost.style.background = template.color?.trim() || "#0ea5a4";
                  dragGhost.style.color = shiftTextColor(template.color);
                  dragGhost.style.fontFamily = "inherit";
                  dragGhost.style.maxWidth = "220px";
                  dragGhost.innerHTML = `
                    <div style="font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;line-height:1.1;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${template.name}
                    </div>
                    <div style="margin-top:3px;font-size:13px;font-weight:800;line-height:1;white-space:nowrap;">
                      ${template.is_time_off ? "DÍA LIBRE" : formatRangeAmPm(template.start_time, template.end_time)}
                    </div>
                  `;
                  document.body.appendChild(dragGhost);
                  event.dataTransfer.setDragImage(dragGhost, 16, 16);
                }}
                onDragEnd={() => {
                  const existing = document.getElementById(
                    `schedule-template-drag-ghost-${template.id}`
                  );
                  if (existing) existing.remove();
                }}
                className="cursor-grab select-none rounded-xl border border-slate-200 bg-white p-3 transition hover:border-teal-400 hover:bg-teal-50 active:cursor-grabbing"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="pointer-events-none select-none text-[12px] font-semibold text-slate-800">
                    {template.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                      aria-label={`Editar plantilla ${template.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditTemplateModal(template);
                      }}
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                        <path d="M4 13.5V16h2.5L14 8.5 11.5 6 4 13.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                        <path d="M10.7 6.8 13.2 9.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                    <span
                      className="h-3 w-3 rounded-full border border-white shadow"
                      style={{ backgroundColor: template.color || "#0ea5a4" }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedCell) {
                      setToast("Selecciona una celda o arrastra la plantilla al horario.");
                      return;
                    }
                    void applyTemplateToCell(
                      template,
                      selectedCell.employeeId,
                      selectedCell.shiftDate
                    );
                    setSelectedCell(null);
                  }}
                  className="w-full cursor-grab select-none rounded-lg text-left active:cursor-grabbing"
                >
                  <div
                    className="pointer-events-none inline-flex max-w-full items-center rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.03em] shadow-sm ring-1 ring-black/10"
                    style={{
                      backgroundColor: template.color?.trim() || "#0ea5a4",
                      color: shiftTextColor(template.color),
                    }}
                  >
                    {template.is_time_off
                      ? "Día libre"
                      : `${formatTimeAmPm(template.start_time)} - ${formatTimeAmPm(template.end_time)} · Descanso ${template.break_minutes}m`}
                  </div>
                </button>
              </div>
            ))}
            {activeTemplates.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">
                Aún no hay plantillas. Crea una para asignar turnos más rápido.
              </p>
            )}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Selecciona una celda del horario para aplicar una plantilla automáticamente.
          </p>
        </section>

        <div className="min-w-0 space-y-3">
          <section className="ui-card border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {formatWeekLabel(weekStart)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(
                    weekView?.week.status || "draft"
                  )}`}
                >
                  {weekView?.week.status === "published" ? "Publicado" : "Borrador"}
                </span>
                {syncStatus !== "idle" && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      syncStatus === "saving"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : syncStatus === "saved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {syncStatus === "saving"
                      ? "Guardando..."
                      : syncStatus === "saved"
                        ? "Guardado"
                        : "Error al guardar"}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => moveWeek(-1)}
                  aria-label="Semana anterior"
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                  >
                    <path
                      d="M12.5 4.5L7 10l5.5 5.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => moveWeek(1)}
                  aria-label="Semana siguiente"
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                  >
                    <path
                      d="M7.5 4.5L13 10l-5.5 5.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  onClick={() => setWeekStart(toDateKey(getWeekStart(new Date())))}
                >
                  Esta semana
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:opacity-60"
                  onClick={() => void copyToNextWeek()}
                  disabled={!weekView || saving}
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    fill="none"
                  >
                    <rect
                      x="3.5"
                      y="4"
                      width="9"
                      height="10"
                      rx="1.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M7.5 2.5h7A1.5 1.5 0 0 1 16 4v8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    fill="none"
                  >
                    <path
                      d="M4 10h10m0 0-3.5-3.5M14 10l-3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    aria-haspopup="menu"
                    aria-expanded={isActionsMenuOpen}
                    aria-label="Más acciones"
                    onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="currentColor"
                    >
                      <circle cx="10" cy="4" r="1.4" />
                      <circle cx="10" cy="10" r="1.4" />
                      <circle cx="10" cy="16" r="1.4" />
                    </svg>
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
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                        disabled={!weekView || saving}
                        onClick={() => {
                          void clearWeek();
                        }}
                      >
                        Limpiar semana
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        disabled={!weekView || saving}
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          void copyScheduleImage();
                        }}
                      >
                        Copiar imagen
                      </button>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        disabled={!weekView || saving}
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          void downloadScheduleImage();
                        }}
                      >
                        Descargar imagen
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
            todayKey={todayKey}
            dayEventsByDate={dayEventsByDate}
            activeEmployees={orderedWeekEmployees}
            shiftMap={shiftMap}
            templateNameById={templateNameById}
            templateColorById={templateColorById}
            loading={loading}
            onOpenEditor={openEditor}
            onDropTemplateToCell={onDropTemplateToCell}
            onDropShiftToCell={(employeeId, shiftDate, shiftId) => {
              void moveShiftToCell(employeeId, shiftDate, shiftId);
            }}
            onReorderEmployees={(sourceEmployeeId, targetEmployeeId) => {
              setEmployeeOrder((prev) => {
                const sourceIndex = prev.indexOf(sourceEmployeeId);
                const targetIndex = prev.indexOf(targetEmployeeId);
                if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
                  return prev;
                }
                const next = [...prev];
                const [moved] = next.splice(sourceIndex, 1);
                next.splice(targetIndex, 0, moved);
                if (token) {
                  setSyncStatus("saving");
                  void reorderScheduleEmployees(token, next)
                    .then(() => {
                      markSyncSaved();
                    })
                    .catch((err) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "No se pudo guardar el orden de empleados."
                      );
                      setSyncStatus("error");
                      void refreshWeek();
                    });
                }
                return next;
              });
            }}
            onEmployeeRowColorChange={(employeeId, rowColor) => {
              setWeekView((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  employees: prev.employees.map((employee) =>
                    employee.id === employeeId ? { ...employee, row_color: rowColor } : employee
                  ),
                };
              });
              if (!token) return;
              setSyncStatus("saving");
              void updateScheduleEmployeeRowColor(token, employeeId, rowColor)
                .then(() => {
                  markSyncSaved();
                })
                .catch((err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "No se pudo guardar el color del empleado."
                  );
                  setSyncStatus("error");
                  void refreshWeek();
                });
            }}
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

      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingTemplateId ? "Editar plantilla" : "Nueva plantilla"}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {editingTemplateId
                      ? "Actualiza la jornada para reutilizarla en el horario."
                      : "Crea una jornada base para aplicarla rápido en el horario."}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-9 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setIsTemplateModalOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <form className="space-y-3 px-6 py-5" onSubmit={onSaveTemplate}>
              <input
                className="ui-input h-10 w-full pl-4 text-left"
                placeholder="Nombre de turno"
                value={newTemplate.name}
                onChange={(event) =>
                  setNewTemplate((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={newTemplate.is_time_off}
                  onChange={(event) =>
                    setNewTemplate((prev) => ({ ...prev, is_time_off: event.target.checked }))
                  }
                />
                Día libre
              </label>
              {!newTemplate.is_time_off && (
                <>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="ui-input h-10 w-full pl-3"
                    placeholder="09:00"
                    value={templateStartInput}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^\d:]/g, "");
                      setTemplateStartInput(raw);
                      const parsed = normalizeTimeInput(raw, "am");
                      if (!parsed) return;
                      setNewTemplate((prev) => ({ ...prev, start_time: parsed }));
                    }}
                    onBlur={() => {
                      const parsed = normalizeTimeInput(templateStartInput, "am");
                      if (!parsed) return;
                      setTemplateStartInput(parsed);
                    }}
                  />
                  <span className="min-w-8 text-center text-xs font-semibold uppercase text-slate-500">
                    AM
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="ui-input h-10 w-full pl-3"
                    placeholder="05:00 o 17:00"
                    value={templateEndInput}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^\d:]/g, "");
                      setTemplateEndInput(raw);
                      const parsed = normalizeTimeInput(raw, "pm");
                      if (!parsed) return;
                      setNewTemplate((prev) => ({ ...prev, end_time: parsed }));
                    }}
                    onBlur={() => {
                      const parsed = normalizeTimeInput(templateEndInput, "pm");
                      if (!parsed) return;
                      setTemplateEndInput(parsed);
                    }}
                  />
                  <span className="min-w-8 text-center text-xs font-semibold uppercase text-slate-500">
                    PM
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Descanso (HH:MM)
                </p>
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                  <input
                    type="text"
                    className="ui-input h-10 w-full pl-3"
                    placeholder="00:30"
                    value={templateBreakHHMM}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^\d:]/g, "");
                      setTemplateBreakHHMM(raw);
                      const parsed = parseBreakHHMM(raw);
                      if (parsed == null) return;
                      setNewTemplate((prev) => ({
                        ...prev,
                        break_minutes: Math.min(parsed, 12 * 60),
                      }));
                    }}
                  />
                  <span className="text-xs font-medium text-slate-500">HH:MM</span>
                  <input
                    type="color"
                    className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1"
                    value={newTemplate.color}
                    onChange={(event) =>
                      setNewTemplate((prev) => ({ ...prev, color: event.target.value }))
                    }
                  />
                </div>
              </div>
                </>
              )}
              {newTemplate.is_time_off && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
                  Esta plantilla se aplicará como <span className="font-semibold text-slate-900">Día libre</span>.
                </div>
              )}
              {newTemplate.is_time_off && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Color de plantilla
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1"
                      value={newTemplate.color}
                      onChange={(event) =>
                        setNewTemplate((prev) => ({ ...prev, color: event.target.value }))
                      }
                    />
                    <span className="text-xs font-medium text-slate-500">{newTemplate.color}</span>
                  </div>
                </div>
              )}
              <button
                type="submit"
                className="h-10 w-full rounded-xl border border-slate-900 bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {editingTemplateId ? "Guardar cambios" : "Guardar plantilla"}
              </button>
            </form>
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
