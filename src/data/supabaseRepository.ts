import type {
  CargoItem,
  ContactSubmission,
  ContactPerson,
  Customer,
  CustomerUser,
  Location,
  MeasurementLink,
  Profile,
  Project,
  ProjectDocument,
  ProjectNote,
  ProjectTask,
  Supplier,
} from "../types";
import type { FreightCalculatorChangeLogEntry, FreightCalculatorConfig } from "../lib/freightCalculator";
import { supabase } from "../lib/supabase";

export interface LiveStoreData {
  customers: Customer[];
  contactPersons: ContactPerson[];
  projects: Project[];
  suppliers: Supplier[];
  profiles: Profile[];
  customerUsers: CustomerUser[];
  contactSubmissions: ContactSubmission[];
  freightCalculatorConfig: FreightCalculatorConfig | null;
  freightCalculatorChangeLog: FreightCalculatorChangeLogEntry[];
}

function client() {
  if (!supabase) throw new Error("Supabase är inte konfigurerat.");
  return supabase;
}

function assertResult(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function loadLiveStoreData(): Promise<LiveStoreData> {
  const db = client();
  const [customers, contacts, projects, suppliers, profiles, customerUsers, inquiries, locations, cargo, documents, notes, tasks, projectSuppliers, measurements, config, log] =
    await Promise.all([
      db.from("customers").select("*").order("company_name"),
      db.from("contact_persons").select("*").order("name"),
      db.from("projects").select("*").order("created_at", { ascending: false }),
      db.from("suppliers").select("*").order("company_name"),
      db.from("profiles").select("id, org_id, full_name, email, role, status, initials, invited_at").order("full_name"),
      db.from("customer_users").select("id, org_id, customer_id, contact_person_id, full_name, email, status, initials, invited_at").order("full_name"),
      db.from("contact_submissions").select("*").order("created_at", { ascending: false }),
      db.from("locations").select("*").order("order_index"),
      db.from("cargo_items").select("*"),
      db.from("documents").select("*").order("uploaded_at", { ascending: false }),
      db.from("notes").select("*").order("date", { ascending: false }),
      db.from("tasks").select("*"),
      db.from("project_suppliers").select("project_id, supplier_id, is_primary"),
      db.from("measurement_links").select("*"),
      db.from("freight_calculator_configs").select("config").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("freight_calculator_change_log").select("id, changed_at, changed_by_name, changes").order("changed_at", { ascending: false }),
    ]);

  for (const [result, label] of [
    [customers, "Kunder"], [contacts, "Kontaktpersoner"], [projects, "Projekt"], [suppliers, "Leverantörer"],
    [profiles, "Personal"], [customerUsers, "Kundanvändare"], [inquiries, "Förfrågningar"], [locations, "Platser"], [cargo, "Gods"], [documents, "Dokument"], [notes, "Kommentarer"],
    [tasks, "Uppgifter"], [projectSuppliers, "Projekttransportörer"], [measurements, "Mätningar"], [config, "Räknesnurra"], [log, "Ändringslogg"],
  ] as const) assertResult(result.error, `Kunde inte läsa ${label.toLowerCase()}`);

  const projectRows = (projects.data ?? []) as Project[];
  const locationRows = (locations.data ?? []) as Location[];
  const cargoRows = (cargo.data ?? []) as CargoItem[];
  const documentRows = (documents.data ?? []) as Array<ProjectDocument & { uploaded_by_name?: string | null }>;
  const storageDocuments = documentRows.filter((row) => row.storage_path && !row.storage_path.startsWith("drive:"));
  const signedUrls = new Map<string, string>();
  if (storageDocuments.length > 0) {
    const signed = await db.storage
      .from("project-documents")
      .createSignedUrls(storageDocuments.map((row) => row.storage_path as string), 60 * 60);
    assertResult(signed.error, "Kunde inte skapa dokumentlänkar");
    for (const item of signed.data ?? []) {
      if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
    }
  }
  const noteRows = (notes.data ?? []) as ProjectNote[];
  const taskRows = (tasks.data ?? []) as ProjectTask[];
  const projectSupplierRows = (projectSuppliers.data ?? []) as Array<{ project_id: string; supplier_id: string; is_primary: boolean }>;
  const measurementRows = (measurements.data ?? []) as MeasurementLink[];

  return {
    customers: (customers.data ?? []) as Customer[],
    contactPersons: (contacts.data ?? []) as ContactPerson[],
    suppliers: (suppliers.data ?? []) as Supplier[],
    profiles: (profiles.data ?? []) as Profile[],
    customerUsers: (customerUsers.data ?? []) as CustomerUser[],
    contactSubmissions: (inquiries.data ?? []) as ContactSubmission[],
    projects: projectRows.map((project) => {
      const supplierIds = projectSupplierRows
        .filter((row) => row.project_id === project.id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((row) => row.supplier_id);
      return {
        ...project,
        supplier_ids: supplierIds.length > 0 ? supplierIds : project.supplier_id ? [project.supplier_id] : [],
      locations: locationRows.filter((row) => row.project_id === project.id),
      cargo_items: cargoRows.filter((row) => row.project_id === project.id),
      documents: documentRows
        .filter((row) => row.project_id === project.id)
        .map((row) => ({
          ...row,
          uploaded_by: row.uploaded_by_name ?? row.uploaded_by ?? "Okänd",
          file_url: row.storage_path ? signedUrls.get(row.storage_path) ?? row.file_url : row.file_url,
        })),
      notes: noteRows.filter((row) => row.project_id === project.id),
      tasks: taskRows.filter((row) => row.project_id === project.id),
      measurement_link: measurementRows.find((row) => row.project_id === project.id) ?? null,
      };
    }),
    freightCalculatorConfig: (config.data?.config as FreightCalculatorConfig | undefined) ?? null,
    freightCalculatorChangeLog: ((log.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const payload = (row.changes ?? {}) as Partial<FreightCalculatorChangeLogEntry> & { changes?: FreightCalculatorChangeLogEntry["changes"] };
      return {
        id: String(row.id),
        changedAt: String(row.changed_at),
        changedBy: String(row.changed_by_name ?? "JK"),
        source: payload.source === "excel" ? "excel" : "app",
        summary: payload.summary ?? "Räknesnurran uppdaterades.",
        changes: payload.changes ?? [],
      };
    }),
  };
}

const PROJECT_COLUMNS = [
  "id", "org_id", "project_number", "name", "customer_id", "contact_person_id", "responsible_id", "status",
  "transport_type", "special_requirements", "planned_loading_date", "planned_delivery_date", "supplier_id", "price", "cost",
  "invoice_status", "customer_reference", "booking_source", "booking_approval_status", "requested_by_customer_user_id",
  "approved_at", "approved_by", "source_document_ref", "delivery_terms", "vehicle", "driver_name", "carrier_order_number",
  "route_distance_km", "created_at", "updated_at",
] as const;

function pick<T extends object>(value: T, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key as keyof T]]));
}

export async function insertProject(project: Project) {
  await saveProject(project, "Kunde inte skapa projektet");
}

export async function updateProjectRecord(project: Project) {
  await saveProject(project, "Kunde inte uppdatera projektet");
}

async function saveProject(project: Project, label: string) {
  const payload = {
    ...pick(project, PROJECT_COLUMNS),
    supplier_ids: project.supplier_ids ?? project.suppliers?.map((supplier) => supplier.id) ?? (project.supplier_id ? [project.supplier_id] : []),
    locations: (project.locations ?? []).map((row) => pick(row, ["id", "project_id", "type", "name", "address", "contact_name", "contact_phone", "order_index"])),
    cargo_items: (project.cargo_items ?? []).map((row) => pick(row, ["id", "project_id", "description", "length_m", "width_m", "height_m", "weight_ton", "quantity", "lift_points", "drawing_reference", "technical_info"])),
    notes: (project.notes ?? []).map((row) => ({ ...pick(row, ["id", "project_id", "date", "user_name", "text", "category", "visibility"]), user_id: null })),
    tasks: (project.tasks ?? []).map((row) => pick(row, ["id", "project_id", "task", "category", "description", "route_section", "assignee_id", "assignee", "deadline", "status", "comment"])),
    documents: (project.documents ?? []).map((row) => ({
      ...pick(row, ["id", "project_id", "file_name", "file_type", "category", "storage_path", "file_url", "file_size", "drive_file_id", "uploaded_at", "visibility", "comment"]),
      uploaded_by: null,
      uploaded_by_name: row.uploaded_by,
    })),
  };
  const result = await client().rpc("save_internal_project", { p_project: payload });
  assertResult(result.error, label);
}

export async function insertRow(table: string, row: object, label: string) {
  const result = await client().from(table).insert(row);
  assertResult(result.error, `Kunde inte skapa ${label}`);
}

export async function updateRow(table: string, id: string, patch: object, label: string) {
  const result = await client().from(table).update(patch).eq("id", id);
  assertResult(result.error, `Kunde inte uppdatera ${label}`);
}

export async function deleteRow(table: string, id: string, label: string) {
  const result = await client().from(table).delete().eq("id", id);
  assertResult(result.error, `Kunde inte radera ${label}`);
}

export async function saveFreightCalculator(config: FreightCalculatorConfig, entry: FreightCalculatorChangeLogEntry, orgId: string, profileId: string) {
  const db = client();
  const existing = await db.from("freight_calculator_configs").select("id").eq("org_id", orgId).maybeSingle();
  assertResult(existing.error, "Kunde inte läsa räknesnurrans inställningar");
  const configResult = existing.data?.id
    ? await db.from("freight_calculator_configs").update({ config, updated_by: profileId }).eq("id", existing.data.id)
    : await db.from("freight_calculator_configs").insert({ org_id: orgId, config, updated_by: profileId });
  assertResult(configResult.error, "Kunde inte spara räknesnurran");
  const logResult = await db.from("freight_calculator_change_log").insert({
    id: entry.id,
    org_id: orgId,
    changed_by: profileId,
    changed_by_name: entry.changedBy,
    changed_at: entry.changedAt,
    changes: { source: entry.source, summary: entry.summary, changes: entry.changes },
  });
  assertResult(logResult.error, "Kunde inte spara ändringsloggen");
}
