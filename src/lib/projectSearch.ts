import type { Project } from "../types";

// Avbokade och fakturerade projekt är avslutade. Levererade projekt som inte fakturerats räknas som öppna,
// eftersom arbete ofta rapporteras i efterhand efter leverans.
export function isProjectOpen(project: Project): boolean {
  return project.status !== "Avbokad" && project.status !== "Fakturerad" && project.invoice_status !== "Fakturerad";
}

// Allt som hjälper någon att hitta rätt projekt: nummer, namn, kund, referenser, orter, adresser, last och chaufför.
export function projectSearchText(project: Project): string {
  return [
    project.project_number,
    project.name,
    project.customer?.company_name,
    project.customer_reference,
    project.carrier_order_number,
    project.driver_name,
    project.status,
    ...(project.locations ?? []).flatMap((l) => [l.name, l.address, l.company_name, l.contact_name]),
    ...(project.cargo_items ?? []).map((item) => item.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("sv");
}

export function projectMatches(project: Project, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase("sv").split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = projectSearchText(project);
  return terms.every((term) => text.includes(term));
}

export function projectRoute(project: Project): string {
  const loading = (project.locations ?? []).find((l) => l.type === "lastning");
  const unloading = (project.locations ?? []).find((l) => l.type === "lossning");
  const from = loading?.name || loading?.address;
  const to = unloading?.name || unloading?.address;
  return [from, to].filter(Boolean).join(" → ");
}
