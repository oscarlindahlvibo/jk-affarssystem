import type { Project } from "../types";

export interface MissingField {
  key: string;
  label: string;
}

export function getMissingFields(project: Project): MissingField[] {
  const missing: MissingField[] = [];
  const cargo = project.cargo_items?.[0];
  const hasLoading = project.locations?.some((l) => l.type === "lastning");
  const hasUnloading = project.locations?.some((l) => l.type === "lossning");

  if (!project.customer_id) missing.push({ key: "kund", label: "Kund" });
  if (!project.contact_person_id) missing.push({ key: "kontaktperson", label: "Kontaktperson" });
  if (!hasLoading) missing.push({ key: "lastningsplats", label: "Lastningsplats" });
  if (!hasUnloading) missing.push({ key: "lossningsplats", label: "Lossningsplats" });
  if (!cargo || cargo.height_m === null || cargo.height_m === undefined) missing.push({ key: "hojd", label: "Höjd" });
  if (!cargo || cargo.width_m === null || cargo.width_m === undefined) missing.push({ key: "bredd", label: "Bredd" });
  if (!cargo || cargo.weight_ton === null || cargo.weight_ton === undefined) missing.push({ key: "vikt", label: "Vikt" });
  if (!project.planned_loading_date && !project.planned_delivery_date) missing.push({ key: "datum", label: "Datum" });
  if (!project.responsible_id) missing.push({ key: "ansvarig", label: "Ansvarig" });
  if (!project.status) missing.push({ key: "status", label: "Status" });
  if (!project.documents || project.documents.length === 0) missing.push({ key: "dokument", label: "Dokument" });

  return missing;
}

export function isComplete(project: Project): boolean {
  return getMissingFields(project).length === 0;
}
