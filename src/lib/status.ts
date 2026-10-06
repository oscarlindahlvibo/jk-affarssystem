import type { ProjectPriority, ProjectStatus, TaskStatus, TaskCategory, MeasurementPointStatus } from "../types";

export const STATUS_STYLES: Record<ProjectStatus, string> = {
  "Ny bokning": "bg-slate-100 text-slate-700",
  Förfrågan: "bg-sky-100 text-sky-700",
  Bokad: "bg-indigo-100 text-indigo-700",
  Bekräftad: "bg-teal-100 text-teal-700",
  "På väg": "bg-orange-100 text-orange-700",
  Levererad: "bg-lime-100 text-lime-700",
  Avbokad: "bg-red-100 text-red-600",
  Pausad: "bg-amber-100 text-amber-700",
  Fakturerad: "bg-green-100 text-green-700",
};

export const PRIORITY_STYLES: Record<ProjectPriority, string> = {
  Kommande: "bg-slate-100 text-slate-700",
  Planera: "bg-amber-100 text-amber-800",
  Prioriterad: "bg-red-100 text-red-700",
  Klar: "bg-green-100 text-green-700",
};

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  "Ej påbörjad": "bg-slate-100 text-slate-600",
  Pågående: "bg-orange-100 text-orange-700",
  Klar: "bg-green-100 text-green-700",
};

export const TASK_CATEGORY_STYLES: Record<TaskCategory, string> = {
  Rekning: "bg-cyan-100 text-cyan-700",
  Dispensansökan: "bg-rose-100 text-rose-700",
  Följebil: "bg-orange-100 text-orange-700",
  VTL: "bg-amber-100 text-amber-800",
  Tillstånd: "bg-purple-100 text-purple-700",
  "Bokning av transport": "bg-sky-100 text-sky-700",
  "Bokning av mobilkran": "bg-indigo-100 text-indigo-700",
  Dokumentation: "bg-slate-100 text-slate-600",
  Övrigt: "bg-slate-100 text-slate-500",
};

export const MEASUREMENT_POINT_STYLES: Record<MeasurementPointStatus, string> = {
  OK: "bg-green-100 text-green-700 border-green-300",
  Bevaka: "bg-amber-100 text-amber-700 border-amber-300",
  Kritisk: "bg-red-100 text-red-700 border-red-300",
};

export const MEASUREMENT_POINT_DOT: Record<MeasurementPointStatus, string> = {
  OK: "#16a34a",
  Bevaka: "#d97706",
  Kritisk: "#dc2626",
};
