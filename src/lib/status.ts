import type { ProjectStatus, TaskStatus, TaskCategory, MeasurementPointStatus } from "../types";

export const STATUS_STYLES: Record<ProjectStatus, string> = {
  Ny: "bg-slate-100 text-slate-700",
  "Under kalkylering": "bg-sky-100 text-sky-700",
  "Offert skickad": "bg-indigo-100 text-indigo-700",
  "Väntar på kund": "bg-amber-100 text-amber-700",
  Order: "bg-emerald-100 text-emerald-700",
  Planering: "bg-cyan-100 text-cyan-700",
  Ruttkontroll: "bg-purple-100 text-purple-700",
  Tillstånd: "bg-rose-100 text-rose-700",
  "Transport bokad": "bg-teal-100 text-teal-700",
  Pågående: "bg-orange-100 text-orange-700",
  Levererad: "bg-lime-100 text-lime-700",
  "Klar för fakturering": "bg-green-100 text-green-700",
  Avslutad: "bg-gray-200 text-gray-600",
  Avbruten: "bg-red-100 text-red-600",
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
  Tillstånd: "bg-purple-100 text-purple-700",
  Bokning: "bg-sky-100 text-sky-700",
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
