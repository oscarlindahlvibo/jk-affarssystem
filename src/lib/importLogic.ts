import type { InvoiceStatus, Project, ProjectStatus, TransportType } from "../types";
import { PROJECT_STATUSES } from "../types";

export type ImportFieldKey =
  | "projectNumber"
  | "customerReference"
  | "customer"
  | "contactPerson"
  | "phone"
  | "email"
  | "loadingPlace"
  | "unloadingPlace"
  | "waypoint"
  | "loadingDate"
  | "loadingTime"
  | "deliveryDate"
  | "deliveryTime"
  | "cargo"
  | "length"
  | "width"
  | "height"
  | "weight"
  | "quantity"
  | "transportType"
  | "vehicle"
  | "driver"
  | "status"
  | "responsible"
  | "supplier"
  | "carrierOrderNumber"
  | "carrierContactStatus"
  | "routeChecked"
  | "customerContactStatus"
  | "escortVtl"
  | "mobileCrane"
  | "price"
  | "cost"
  | "comment"
  | "documentRef"
  | "invoiceStatus";

export interface ImportFieldDef {
  key: ImportFieldKey;
  label: string;
  required?: boolean;
  synonyms: string[];
}

// Synonymerna inkluderar rubrikerna från JK:s nuvarande Excel-bokningsblad
// (Bokningsnr, Lastplats/Tid, Lossplats/Tid, Åkeri, Fordon, Chaufför, B-ordernummer m.fl.)
export const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "projectNumber", label: "Projektnummer", required: true, synonyms: ["projektnr", "projektnummer", "projekt", "nr", "ärendenr", "bokningsnr", "bokningsnummer"] },
  { key: "customerReference", label: "Kundens ordernummer", synonyms: ["kunds order.nmr", "kunds ordernummer", "kundorder", "kundreferens", "referens"] },
  { key: "customer", label: "Kund", required: true, synonyms: ["kund", "kundnamn", "företag", "beställare"] },
  { key: "contactPerson", label: "Kontaktperson", synonyms: ["kontaktperson", "kontakt", "kontaktnamn"] },
  { key: "phone", label: "Telefon", synonyms: ["telefon", "tel", "mobil"] },
  { key: "email", label: "E-post", synonyms: ["e-post", "epost", "email", "mejl"] },
  { key: "loadingPlace", label: "Lastningsplats", required: true, synonyms: ["från", "lastningsplats", "lastplats", "lastplats/tid", "avgång", "upphämtning"] },
  { key: "unloadingPlace", label: "Lossningsplats", required: true, synonyms: ["till", "lossningsplats", "lossplats", "lossplats/tid", "destination", "leveransplats"] },
  { key: "waypoint", label: "Mellanpunkt / via", synonyms: ["via", "mellanpunkt", "waypoint"] },
  { key: "loadingDate", label: "Lastningsdatum", synonyms: ["lastdatum", "lastningsdatum", "avgångsdatum"] },
  { key: "loadingTime", label: "Lastningstid", synonyms: ["lastningstid", "lasttid", "avgångstid"] },
  { key: "deliveryDate", label: "Leveransdatum", synonyms: ["leveransdatum", "leverans", "ankomstdatum", "lossningsdatum", "lossdatum"] },
  { key: "deliveryTime", label: "Lossningstid", synonyms: ["lossningstid", "losstid", "ankomsttid", "leveranstid"] },
  { key: "cargo", label: "Gods", synonyms: ["gods", "godsbeskrivning", "beskrivning"] },
  { key: "length", label: "Längd", synonyms: ["längd", "längd (m)", "l"] },
  { key: "width", label: "Bredd", synonyms: ["bredd", "bredd (m)", "b"] },
  { key: "height", label: "Höjd", synonyms: ["höjd", "höjd (m)", "h"] },
  { key: "weight", label: "Vikt", synonyms: ["vikt", "vikt (ton)", "vikt (kg)"] },
  { key: "quantity", label: "Antal", synonyms: ["antal", "antal kollin", "st"] },
  { key: "transportType", label: "Transporttyp", synonyms: ["typ", "transporttyp"] },
  { key: "vehicle", label: "Fordon", synonyms: ["fordon", "bil", "ekipage"] },
  { key: "driver", label: "Chaufför", synonyms: ["chaufför", "förare"] },
  { key: "status", label: "Status", synonyms: ["status"] },
  { key: "responsible", label: "Ansvarig", synonyms: ["ansvarig", "handläggare"] },
  { key: "supplier", label: "Transportör / leverantör", synonyms: ["transportör", "leverantör", "åkeri"] },
  { key: "carrierOrderNumber", label: "Transportörens ordernummer", synonyms: ["b-ordernummer", "b ordernummer", "transportörens ordernummer"] },
  { key: "carrierContactStatus", label: "Transportör kontaktad", synonyms: ["åkeri ringt/mejlat tid", "transportör kontaktad"] },
  { key: "routeChecked", label: "Rekat", synonyms: ["rekat", "rutt kontrollerad", "ruttkontroll"] },
  { key: "customerContactStatus", label: "Kund kontaktad", synonyms: ["kund ringt/mejlat tid", "kund kontaktad"] },
  { key: "escortVtl", label: "Följebil / VTL", synonyms: ["följebil/vtl", "följebil", "vtl"] },
  { key: "mobileCrane", label: "Mobilkran", synonyms: ["mobilkran", "kran"] },
  { key: "price", label: "Pris / offertbelopp", synonyms: ["pris", "offertbelopp", "offert"] },
  { key: "cost", label: "Kostnad", synonyms: ["kostnad", "inköpspris"] },
  { key: "comment", label: "Kommentar", synonyms: ["kommentar", "anteckning", "notering"] },
  { key: "documentRef", label: "Dokument / filreferens", synonyms: ["dokument", "filreferens", "fil", "bilaga"] },
  { key: "invoiceStatus", label: "Faktureringsstatus", synonyms: ["fakturering", "faktureringsstatus", "fakturastatus", "fakturerad"] },
];

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeEntityName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("sv-SE")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "");
}

const HOLTAB_CUSTOMER_ALIASES = new Set([
  "holtab ab",
  "holtab projekt",
  "holtab produkt",
  "holtab service",
]);

export function normalizeCustomerName(value: string): string {
  const normalized = normalizeEntityName(value);
  return HOLTAB_CUSTOMER_ALIASES.has(normalized) ? "holtab ab" : normalized;
}

export function canonicalCustomerName(value: string): string {
  return normalizeCustomerName(value) === "holtab ab" ? "Holtab AB" : value.trim();
}

export function splitSupplierNames(value: string): string[] {
  const seen = new Set<string>();
  return cleanCell(value)
    .split(/\s*(?:\/|;|\n|\s+\+\s+|\s+&\s+|\s+och\s+)\s*/i)
    .map((name) => name.trim())
    .filter((name) => {
      const key = normalizeEntityName(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  // Exakta träffar först (viktigt eftersom t.ex. "Lastdatum" annars kan matcha "lastplats").
  headers.forEach((header, index) => {
    const norm = normalize(header);
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      if (norm === normalize(field.label) || field.synonyms.some((syn) => norm === normalize(syn))) {
        mapping[field.key] = index;
      }
    }
  });
  // Delsträngsträffar som fallback för fält som fortfarande saknar mappning.
  headers.forEach((header, index) => {
    const norm = normalize(header);
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      if (field.synonyms.some((syn) => {
        const normalizedSynonym = normalize(syn);
        return normalizedSynonym.length >= 6 && norm.includes(normalizedSynonym);
      })) {
        mapping[field.key] = index;
      }
    }
  });
  return mapping;
}

export interface MappedRowData {
  projectNumber: string;
  customerReference: string;
  customer: string;
  contactPerson: string;
  phone: string;
  email: string;
  loadingPlace: string;
  unloadingPlace: string;
  waypoint: string;
  loadingDate: string;
  loadingTime: string;
  deliveryDate: string;
  deliveryTime: string;
  cargo: string;
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  quantity: number | null;
  transportType: string;
  vehicle: string;
  driver: string;
  status: string;
  responsible: string;
  supplier: string;
  supplierNames: string[];
  carrierOrderNumber: string;
  carrierContactStatus: string;
  routeChecked: string;
  customerContactStatus: string;
  escortVtl: string;
  mobileCrane: string;
  price: number | null;
  cost: number | null;
  comment: string;
  documentRef: string;
  invoiceStatus: string;
}

const EXCEL_ERROR_PATTERN = /^#(VÄRDEFEL|REFERENS|REF|N\/A|DIV\/0|NAMN|NULL|TAL)!?$/i;

function cleanCell(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (EXCEL_ERROR_PATTERN.test(trimmed)) return "";
  return trimmed;
}

function parseNumber(raw: string): number | null {
  const cleaned = cleanCell(raw).replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

// JK:s Excel blandar vikt i ton (t.ex. "5,2") och kg (t.ex. "20701"), samt ibland
// text som "17 ton". Tolkas som ton om talet är litet, annars antas kg och konverteras.
function parseWeightTons(raw: string): number | null {
  const cleaned = cleanCell(raw);
  if (!cleaned) return null;
  const explicitTon = /ton/i.test(cleaned);
  const n = parseNumber(cleaned);
  if (n === null) return null;
  if (explicitTon) return Math.round(n * 100) / 100;
  return n > 200 ? Math.round((n / 1000) * 100) / 100 : n;
}

function parseDate(raw: string): string {
  const cleaned = cleanCell(raw);
  if (!cleaned) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  const parts = cleaned.split(/[./-]/);
  if (parts.length === 3) {
    const [a, b, y] = parts;
    if (y && y.length === 4) {
      // Excel-exporten använder både D/M/ÅÅÅÅ och M/D/ÅÅÅÅ beroende på lokal inställning;
      // dagar > 12 avgör vilket fält som är dag.
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      const day = aNum > 12 ? aNum : bNum > 12 ? bNum : aNum;
      const month = aNum > 12 ? bNum : bNum > 12 ? aNum : bNum;
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return cleaned;
}

function parseTime(raw: string): string {
  const cleaned = cleanCell(raw);
  if (!cleaned) return "";
  const match = /(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})/i.exec(cleaned);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Plats-kolumnerna innehåller ibland en klockslagsangivelse, t.ex. "Tingsryd kl.14".
// Vi behåller hela texten men kan i framtiden separera ut tiden vid behov.
function cleanPlace(raw: string): string {
  return cleanCell(raw);
}

const DIMENSION_PATTERN = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/;
const QUANTITY_PATTERN = /^\s*(\d+)\s*(?:st\.?|kolli|pall)\b/i;

export function parseDimensionsFromText(text: string): { length: number; width: number; height: number } | null {
  const match = DIMENSION_PATTERN.exec(text);
  if (!match) return null;
  const [, l, w, h] = match;
  const toNum = (s: string) => parseFloat(s.replace(",", "."));
  return { length: toNum(l), width: toNum(w), height: toNum(h) };
}

export function parseQuantityFromText(text: string): number | null {
  const match = QUANTITY_PATTERN.exec(text);
  return match ? Number(match[1]) : null;
}

export function mapRow(row: string[], mapping: ColumnMapping): MappedRowData {
  const get = (key: ImportFieldKey): string => {
    const idx = mapping[key];
    return idx !== undefined ? cleanCell(row[idx] ?? "") : "";
  };

  const cargo = get("cargo");
  const dims = parseDimensionsFromText(cargo);
  const supplier = get("supplier");

  return {
    projectNumber: get("projectNumber"),
    customerReference: get("customerReference"),
    customer: get("customer"),
    contactPerson: get("contactPerson"),
    phone: get("phone"),
    email: get("email"),
    loadingPlace: cleanPlace(get("loadingPlace")),
    unloadingPlace: cleanPlace(get("unloadingPlace")),
    waypoint: get("waypoint"),
    loadingDate: parseDate(get("loadingDate")),
    loadingTime: parseTime(get("loadingTime")),
    deliveryDate: parseDate(get("deliveryDate")),
    deliveryTime: parseTime(get("deliveryTime")),
    cargo,
    length: parseNumber(get("length")) ?? dims?.length ?? null,
    width: parseNumber(get("width")) ?? dims?.width ?? null,
    height: parseNumber(get("height")) ?? dims?.height ?? null,
    weight: parseWeightTons(get("weight")),
    quantity: parseNumber(get("quantity")) ?? parseQuantityFromText(cargo),
    transportType: get("transportType"),
    vehicle: get("vehicle"),
    driver: get("driver"),
    status: get("status"),
    responsible: get("responsible"),
    supplier,
    supplierNames: splitSupplierNames(supplier),
    carrierOrderNumber: get("carrierOrderNumber"),
    carrierContactStatus: get("carrierContactStatus"),
    routeChecked: get("routeChecked"),
    customerContactStatus: get("customerContactStatus"),
    escortVtl: get("escortVtl"),
    mobileCrane: get("mobileCrane"),
    price: parseNumber(get("price")),
    cost: parseNumber(get("cost")),
    comment: get("comment"),
    documentRef: get("documentRef"),
    invoiceStatus: get("invoiceStatus"),
  };
}

export type ImportStatusKey =
  | "klar"
  | "saknar_kund"
  | "saknar_lastning"
  | "saknar_lossning"
  | "saknar_matt"
  | "dubblett"
  | "granska";

export const IMPORT_STATUS_LABEL: Record<ImportStatusKey, string> = {
  klar: "Klar att importera",
  saknar_kund: "Saknar kund",
  saknar_lastning: "Saknar lastningsplats",
  saknar_lossning: "Saknar lossningsplats",
  saknar_matt: "Saknar mått",
  dubblett: "Möjlig dubblett",
  granska: "Behöver granskas",
};

export interface DuplicateMatch {
  project: Project;
  reasons: string[];
}

export function findDuplicate(row: MappedRowData, existingProjects: Project[]): DuplicateMatch | null {
  for (const project of existingProjects) {
    const reasons: string[] = [];
    const sameCustomer = row.customer && normalizeCustomerName(project.customer?.company_name ?? "") === normalizeCustomerName(row.customer);
    const loading = normalizeEntityName(project.locations?.find((l) => l.type === "lastning")?.name ?? "");
    const unloading = normalizeEntityName(project.locations?.find((l) => l.type === "lossning")?.name ?? "");
    const sameLoading = row.loadingPlace && loading === normalizeEntityName(row.loadingPlace);
    const sameUnloading = row.unloadingPlace && unloading === normalizeEntityName(row.unloadingPlace);
    const sameNumber = row.projectNumber && normalizeEntityName(project.project_number) === normalizeEntityName(row.projectNumber);
    const cargoDesc = project.cargo_items?.[0]?.description?.toLowerCase() ?? "";
    const similarCargo = row.cargo && cargoDesc && (cargoDesc.includes(row.cargo.toLowerCase()) || row.cargo.toLowerCase().includes(cargoDesc));
    const closeDate =
      row.loadingDate && project.planned_loading_date && Math.abs(new Date(row.loadingDate).getTime() - new Date(project.planned_loading_date).getTime()) < 1000 * 60 * 60 * 24 * 3;

    if (sameNumber) reasons.push("samma projektnummer");
    if (sameCustomer) reasons.push("samma kund");
    if (sameLoading) reasons.push("samma lastningsplats");
    if (sameUnloading) reasons.push("samma lossningsplats");
    if (closeDate) reasons.push("nära lastningsdatum");
    if (similarCargo) reasons.push("liknande gods");

    const score = [sameNumber, sameCustomer && (sameLoading || sameUnloading), closeDate && sameCustomer].filter(Boolean).length;
    if (sameNumber || (sameCustomer && sameLoading && sameUnloading) || (sameCustomer && similarCargo && closeDate) || score >= 2) {
      return { project, reasons };
    }
  }
  return null;
}

export interface ImportRow {
  index: number;
  data: MappedRowData;
  status: ImportStatusKey;
  duplicate: DuplicateMatch | null;
  issues: ImportIssue[];
  action: "import" | "skip" | "update";
}

export type ImportIssueSeverity = "error" | "warning" | "info";

export interface ImportIssue {
  code: string;
  severity: ImportIssueSeverity;
  message: string;
}

export function evaluateRow(index: number, row: string[], mapping: ColumnMapping, existingProjects: Project[]): ImportRow {
  const data = mapRow(row, mapping);
  const duplicate = findDuplicate(data, existingProjects);
  const issues: ImportIssue[] = [];

  if (!data.customer) issues.push({ code: "missing_customer", severity: "error", message: "Kund saknas." });
  if (!data.loadingPlace) issues.push({ code: "missing_loading", severity: "error", message: "Lastningsort saknas." });
  if (!data.unloadingPlace) issues.push({ code: "missing_unloading", severity: "error", message: "Lossningsort saknas." });
  if (!data.height && !data.weight) issues.push({ code: "missing_dimensions", severity: "warning", message: "Höjd och vikt saknas. Komplettera projektet efter import." });
  if (!data.projectNumber) issues.push({ code: "missing_project_number", severity: "warning", message: "Bokningsnummer saknas och genereras av systemet." });
  if (data.supplierNames.length > 1) issues.push({ code: "multiple_suppliers", severity: "info", message: `${data.supplierNames.length} transportörer kopplas till projektet.` });
  if (duplicate) issues.push({ code: "possible_duplicate", severity: "warning", message: `Möjlig dubblett: ${duplicate.reasons.join(", ")}.` });

  let status: ImportStatusKey = "klar";
  if (!data.customer) status = "saknar_kund";
  else if (!data.loadingPlace) status = "saknar_lastning";
  else if (!data.unloadingPlace) status = "saknar_lossning";
  else if (!data.height && !data.weight) status = "saknar_matt";
  else if (duplicate) status = "dubblett";
  else if (!data.projectNumber) status = "granska";

  const action: ImportRow["action"] = issues.some((issue) => issue.severity === "error") || duplicate ? "skip" : "import";

  return { index, data, status, duplicate, issues, action };
}

// JK:s Excel-status skiljer sig från systemets statusflöde. Mappa deras
// vardagsspråkliga statusar mot närmaste steg i flödet.
const STATUS_SYNONYMS: Record<string, ProjectStatus> = {
  "ny": "Ny bokning",
  "under kalkylering": "Förfrågan",
  "offert skickad": "Förfrågan",
  "väntar på kund": "Förfrågan",
  "planerad": "Bekräftad",
  "order": "Bekräftad",
  "planering": "Bekräftad",
  "ruttkontroll": "Bekräftad",
  "tillstånd": "Bekräftad",
  "transport bokad": "Bokad",
  "pågående": "På väg",
  "pågår": "På väg",
  "levererad": "Levererad",
  "klar för fakturering": "Levererad",
  "avslutad": "Levererad",
  "fakturerad": "Fakturerad",
  "avbokad": "Avbokad",
  "avbruten": "Avbokad",
  "klar": "Levererad",
};

export function resolveStatus(raw: string): ProjectStatus {
  const cleaned = cleanCell(raw).toLowerCase();
  if (!cleaned) return "Ny bokning";
  const direct = PROJECT_STATUSES.find((s) => s.toLowerCase() === cleaned);
  if (direct) return direct;
  return STATUS_SYNONYMS[cleaned] ?? "Ny bokning";
}

// Om Excel-statusen redan speglar fakturering (t.ex. "Fakturerad") sätts
// faktureringsstatusen automatiskt, annars läses en eventuell separat kolumn.
export function resolveInvoiceStatus(statusRaw: string, invoiceStatusRaw: string): InvoiceStatus {
  const status = cleanCell(statusRaw).toLowerCase();
  if (status === "fakturerad") return "Fakturerad";
  const invoice = cleanCell(invoiceStatusRaw).toLowerCase();
  if (invoice === "fakturerad") return "Fakturerad";
  if (invoice === "klar för fakturering") return "Klar för fakturering";
  return "Ej fakturerad";
}

export function resolveTransportType(raw: string): TransportType {
  const known: TransportType[] = ["Specialtransport", "Maskintransport", "Krantransport", "Styckegods", "Container", "Annat"];
  const cleaned = cleanCell(raw).toLowerCase();
  const match = known.find((t) => t.toLowerCase() === cleaned);
  return match ?? "Annat";
}
