// Central datamodell för JK Projektlogistik – speglar Supabase/PostgreSQL-schemat i supabase/migrations

export type ProjectStatus =
  | "Ny bokning"
  | "Förfrågan"
  | "Bokad"
  | "Bekräftad"
  | "Rekning"
  | "På väg"
  | "Levererad"
  | "Avbokad"
  | "Pausad"
  | "Fakturerad";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "Ny bokning",
  "Förfrågan",
  "Bokad",
  "Bekräftad",
  "Rekning",
  "På väg",
  "Levererad",
  "Avbokad",
  "Pausad",
  "Fakturerad",
];

export type ProjectPriority = "Kommande" | "Planera" | "Prioriterad" | "Klar";

export const PROJECT_PRIORITIES: ProjectPriority[] = ["Kommande", "Planera", "Prioriterad", "Klar"];

export type TransportType =
  | "Specialtransport"
  | "Maskintransport"
  | "Krantransport"
  | "Styckegods"
  | "Container"
  | "Annat";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export type UserRole = "admin" | "projektledare" | "ekonomi" | "lasare";

export const USER_ROLES: UserRole[] = ["admin", "projektledare", "ekonomi", "lasare"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  projektledare: "Projektledare",
  ekonomi: "Ekonomi",
  lasare: "Läsare",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Full åtkomst till allt, inklusive inställningar, användare och radering.",
  projektledare: "Kan hantera kunder, projekt, kontakter, leverantörer och dokument.",
  ekonomi: "Kan se kunder, projekt, leverantörer och dokument samt hantera faktura-/kostnadsuppgifter.",
  lasare: "Kan endast läsa information, inte skapa, redigera eller radera.",
};

export type UserStatus = "aktiv" | "inbjuden" | "inaktiverad";

export const USER_STATUSES: UserStatus[] = ["aktiv", "inbjuden", "inaktiverad"];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  aktiv: "Aktiv",
  inbjuden: "Inbjuden",
  inaktiverad: "Inaktiverad",
};

export interface Customer {
  id: string;
  org_id: string;
  company_name: string;
  org_number: string | null;
  invoice_address: string | null;
  visiting_address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  status: "aktiv" | "inaktiv";
  // Styr om räknesnurran för fraktpris visas i kundportalen för den här kunden
  // (inte alla kunder ska kunna räkna på pris själva).
  freight_calculator_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactPerson {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  note: string | null;
  is_primary: boolean;
  created_at: string;
}

export type LocationType = "lastning" | "lossning" | "mellanpunkt";

export interface Location {
  company_name?: string | null;
  id: string;
  project_id: string;
  type: LocationType;
  name: string;
  address: string | null;
  // Kontaktperson på plats (t.ex. mottagare vid lossning) – vanligt förekommande på
  // kundens fraktorder (LTC/bokningsblad) men skild från projektets huvudkontakt.
  contact_name?: string | null;
  contact_phone?: string | null;
  order_index: number;
}

export interface CargoItem {
  id: string;
  project_id: string;
  description: string;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  weight_ton: number | null;
  quantity: number | null;
  lift_points: string | null;
  drawing_reference: string | null;
  technical_info: string | null;
}

export type DocumentCategory =
  | "Ritning"
  | "Tillstånd"
  | "Offert"
  | "Order"
  | "Fraktsedel"
  | "Foto"
  | "Övrigt";

export interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  category: DocumentCategory;
  storage_path: string | null;
  // Tillfällig lokal webbläsar-URL (object URL) till den uppladdade filen för
  // förhandsvisning/nedladdning under sessionen. Ersätts av en riktig molnlänk
  // (t.ex. Google Drive) när persistent fillagring kopplas in.
  file_url?: string | null;
  file_size?: number | null;
  drive_file_id?: string | null;
  uploaded_at: string;
  uploaded_by: string;
  visibility: "internal" | "customer";
  comment: string | null;
}

export type NoteCategory = "Allmänt" | "Kund" | "Transport" | "Tillstånd" | "Ekonomi";
export type NoteVisibility = "internal" | "customer";

export interface ProjectNote {
  id: string;
  project_id: string;
  date: string;
  user_name: string;
  text: string;
  category: NoteCategory;
  visibility?: NoteVisibility;
}

export type TaskStatus = "Ej påbörjad" | "Pågående" | "Klar";

export type TaskCategory =
  | "Rekning"
  | "Dispensansökan"
  | "Följebil"
  | "VTL"
  | "Tillstånd"
  | "Bokning av transport"
  | "Bokning av mobilkran"
  | "Dokumentation"
  | "Övrigt";

export const TASK_CATEGORIES: TaskCategory[] = [
  "Rekning",
  "Dispensansökan",
  "Följebil",
  "VTL",
  "Tillstånd",
  "Bokning av transport",
  "Bokning av mobilkran",
  "Dokumentation",
  "Övrigt",
];

export interface ProjectTask {
  id: string;
  project_id: string;
  task: string;
  category: TaskCategory;
  // Fritextbeskrivning med instruktioner till den som blir tilldelad uppgiften.
  description: string | null;
  // Vilken sträcka/delsträcka som ska kontrolleras – används primärt för Rekning,
  // men kan sättas på vilken uppgift som helst där det är relevant.
  route_section: string | null;
  // Kopplar uppgiften till en registrerad JK-användare (för "Mina uppgifter").
  // `assignee` behålls som visningsnamn/fritext (t.ex. när uppgiften gäller en
  // extern part som inte är registrerad som användare i systemet).
  assignee_id: string | null;
  assignee: string | null;
  deadline: string | null;
  status: TaskStatus;
  comment: string | null;
  // Faktiskt nedlagd tid i minuter (t.ex. när någon rekat en sträcka).
  time_spent_minutes?: number | null;
}

export type MeasurementStatus = "Ej startad" | "Pågående" | "Klar" | "Bevakning";

export interface MeasurementLink {
  id: string;
  project_id: string;
  measurement_id: string;
  route_id: string;
  measurement_status: MeasurementStatus;
  measurement_date: string | null;
  measurement_summary: string | null;
  lowest_measured_height: number | null;
  transport_height: number | null;
  minimum_margin: number | null;
  number_of_measurement_points: number | null;
  link_to_measurement_map: string | null;
}

export type MeasurementPointStatus = "OK" | "Bevaka" | "Kritisk";

export interface MeasurementPoint {
  id: string;
  measurement_link_id: string;
  name: string;
  lat: number;
  lng: number;
  free_height: number | null;
  transport_height: number | null;
  margin: number | null;
  quality: "Hög" | "Medel" | "Låg";
  status: MeasurementPointStatus;
  comment: string | null;
  order_index: number;
}

export type SupplierType =
  | "Åkeri"
  | "Kran"
  | "Följebil"
  | "Vägtransportledare"
  | "Konsult"
  | "Annat";

export interface Supplier {
  id: string;
  org_id: string;
  company_name: string;
  type: SupplierType;
  service_types?: SupplierType[];
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  notes: string | null;
  created_at: string;
}

export type SupplierBookingDispatchStatus = "sent" | "failed";

export interface SupplierBookingDispatch {
  id: string;
  org_id: string;
  project_id: string;
  supplier_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  sent_at: string;
  sent_by: string | null;
  sent_by_name: string;
  subject: string;
  status: SupplierBookingDispatchStatus;
  external_message_id: string | null;
  error_message: string | null;
  supplier?: Supplier;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  initials: string;
  invited_at?: string;
}

export type CustomerUserStatus = "aktiv" | "inbjuden" | "inaktiverad";

export interface CustomerUser {
  id: string;
  org_id: string;
  customer_id: string;
  contact_person_id: string | null;
  full_name: string;
  email: string;
  status: CustomerUserStatus;
  initials: string;
  invited_at?: string;
}

export type ContactSubmissionStatus = "new" | "read" | "responded" | "archived";

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  service_type: string | null;
  status: ContactSubmissionStatus;
  created_at: string;
}

export type InvoiceStatus = "Ej fakturerad" | "Klar för fakturering" | "Fakturerad";

export const INVOICE_STATUSES: InvoiceStatus[] = ["Ej fakturerad", "Klar för fakturering", "Fakturerad"];

export type BookingApprovalStatus = "Väntar på godkännande" | "Godkänd" | "Avvisad";

export type BookingSource = "internal" | "customer_portal";

export type ProjectTemplateKey =
  | "Specialtransport"
  | "Tungt lyft"
  | "Ruttkontroll"
  | "Följebil / dispens"
  | "Transportförmedling"
  | "Projektlogistik";

export interface Project {
  id: string;
  org_id: string;
  project_number: string;
  name: string;
  customer_id: string;
  contact_person_id: string | null;
  responsible_id: string | null;
  status: ProjectStatus;
  priority?: ProjectPriority | null;
  priority_is_manual?: boolean;
  transport_type: TransportType;
  special_requirements: string | null;
  planned_loading_date: string | null;
  planned_loading_time?: string | null;
  planned_delivery_date: string | null;
  planned_delivery_time?: string | null;
  supplier_id: string | null;
  price: number | null;
  cost: number | null;
  invoice_status: InvoiceStatus;
  customer_reference: string | null;
  booking_source?: BookingSource;
  booking_approval_status?: BookingApprovalStatus | null;
  requested_by_customer_user_id?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  // Sätts när en kund begär en ändring av en bokning via kundportalen.
  // Rensas av personal när begäran är hanterad.
  edit_requested_at?: string | null;
  edit_request_message?: string | null;
  // Referensnummer på källdokumentet (t.ex. Holtabs LTC-nr) som hela ordern/bokningen
  // skapades från – skilt från customer_reference som är per kolli/gods (Order-nr).
  source_document_ref: string | null;
  delivery_terms: string | null;
  vehicle: string | null;
  driver_name: string | null;
  carrier_order_number: string | null;
  route_distance_km?: number | null;
  created_at: string;
  updated_at: string;

  // Utökade relationer (joinas in i mockdata/vyer)
  customer?: Customer;
  contact_person?: ContactPerson | null;
  responsible?: Profile | null;
  supplier?: Supplier | null;
  supplier_ids?: string[];
  suppliers?: Supplier[];
  supplier_booking_dispatches?: SupplierBookingDispatch[];
  locations?: Location[];
  cargo_items?: CargoItem[];
  documents?: ProjectDocument[];
  notes?: ProjectNote[];
  tasks?: ProjectTask[];
  measurement_link?: MeasurementLink | null;
}

// ---- Rapporterat arbete, fakturaunderlag och transportörer ----

export type WorkReportPerformerType = "employee" | "carrier";

export const WORK_TYPES: { key: string; label: string }[] = [
  { key: "transport", label: "Transport" },
  { key: "rekning", label: "Rekning" },
  { key: "kran", label: "Kran / lyft" },
  { key: "foljebil", label: "Följebil / VTL" },
  { key: "vantetid", label: "Väntetid" },
  { key: "ovrigt", label: "Övrigt" },
];

export interface WorkReport {
  id: string;
  org_id: string;
  project_id: string;
  task_id: string | null;
  report_date: string;
  performer_type: WorkReportPerformerType;
  performer_profile_id: string | null;
  performer_carrier_user_id: string | null;
  performer_supplier_id: string | null;
  performer_name: string;
  hours: number | null;
  // Körsträcka lagras alltid i kilometer. 1 mil = 10 km.
  distance_km: number | null;
  waiting_hours: number | null;
  work_type: string;
  billable: boolean;
  comment: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  edited_by: string | null;
  edited_at: string | null;
  // Intern kostnad finns i en separat tabell och visas bara för behöriga.
  internal_cost?: number | null;
}

export interface WorkReportBilling {
  report_id: string;
  org_id: string;
  billable_hours: number | null;
  billable_distance_km: number | null;
  billable_waiting_hours: number | null;
  hours_rate: number | null;
  distance_rate: number | null;
  waiting_rate: number | null;
  adjust_reason: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  invoiced_at: string | null;
  invoiced_by: string | null;
  invoice_reference: string | null;
}

export type BillingRateType = "hours" | "distance" | "waiting";

export interface BillingRate {
  id: string;
  org_id: string;
  customer_id: string | null;
  project_id: string | null;
  rate_type: BillingRateType;
  // Pris per timme, per mil (10 km) respektive per timme väntetid.
  unit_price: number;
}

export interface BillingExtraLine {
  id: string;
  org_id: string;
  project_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  invoiced_at: string | null;
  invoice_reference: string | null;
  created_at: string;
}

export interface CarrierUser {
  id: string;
  org_id: string;
  supplier_id: string;
  full_name: string;
  email: string;
  status: "aktiv" | "inbjuden" | "inaktiverad";
  initials: string;
  invited_at?: string;
}

// Det en transportör får se om en tilldelad transportorder (ingen ekonomi eller intern information).
export interface CarrierAssignment {
  id: string;
  project_number: string;
  name: string;
  status: string;
  planned_loading_date: string | null;
  planned_loading_time: string | null;
  planned_delivery_date: string | null;
  planned_delivery_time: string | null;
  special_requirements: string | null;
  carrier_order_number: string | null;
  locations: { type: LocationType; name: string; address: string | null; company_name: string | null; contact_name: string | null; contact_phone: string | null }[];
  cargo: { description: string; length_m: number | null; width_m: number | null; height_m: number | null; weight_ton: number | null; quantity: number | null }[];
}

// ---- Stämpelklocka (närvaro), löneunderlag och export ----

export type AttendanceEntryType = "work" | "break" | "lunch";
export type AttendanceSource = "clock" | "manual" | "correction" | "admin";

export interface AttendanceEntry {
  id: string;
  org_id: string;
  user_id: string;
  entry_type: AttendanceEntryType;
  start_time: string;
  end_time: string | null;
  total_minutes: number;
  source: AttendanceSource;
  comment: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  edited_by: string | null;
  edited_at: string | null;
}

export const ABSENCE_KINDS: { key: string; label: string }[] = [
  { key: "absence_sick", label: "Sjukfrånvaro" },
  { key: "absence_vab", label: "VAB" },
  { key: "absence_vacation", label: "Semester" },
  { key: "absence_leave", label: "Ledighet" },
  { key: "absence_other", label: "Annan frånvaro" },
];

export interface AttendanceAbsence {
  id: string;
  org_id: string;
  user_id: string;
  absence_date: string;
  kind: string;
  minutes: number;
  comment: string;
  created_by: string | null;
  created_at: string;
}

export interface AttendanceAudit {
  id: number | string;
  org_id: string;
  user_id: string;
  entry_id: string | null;
  action: "create" | "update" | "delete";
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export interface AttendanceCorrection {
  id: string;
  org_id: string;
  user_id: string;
  action: "change" | "add" | "delete";
  entry_id: string | null;
  proposed_type: AttendanceEntryType | null;
  proposed_start: string | null;
  proposed_end: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface OvertimeRuleSetRow {
  id: string;
  org_id: string;
  name: string;
  config: Record<string, unknown>;
  active: boolean;
  // Satt av admin när regelmallen bekräftats mot JK:s avtal. Utan godkännande kan inget attesteras.
  approved_at: string | null;
  approved_by: string | null;
  approval_note: string | null;
}

export interface EmployeeTermsRow {
  id: string;
  org_id: string;
  user_id: string;
  valid_from: string;
  employment_number: string | null;
  employment_type: string | null;
  weekly_hours: number | null;
  employment_rate: number | null;
  schedule: Record<string, number>;
  rule_set_id: string | null;
  external_employee_ref: string | null;
  note: string | null;
}

export interface PayrollCodeMapping {
  id: string;
  org_id: string;
  time_type: string;
  external_code: string;
  label: string;
}

export interface PayrollPeriod {
  id: string;
  org_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export type PayrollStatementStatus = "preliminary" | "submitted" | "attested" | "reviewed" | "exported";

export interface PayrollStatement {
  id: string;
  org_id: string;
  period_id: string;
  user_id: string;
  status: PayrollStatementStatus;
  totals: Record<string, unknown> | null;
  days: unknown[] | null;
  rule_snapshot: Record<string, unknown> | null;
  submitted_at: string | null;
  attested_at: string | null;
  attested_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  exported_at: string | null;
  last_export_id: string | null;
  pending_adjustment: boolean;
}

export interface PayrollAdjustment {
  id: string;
  org_id: string;
  statement_id: string;
  user_id: string;
  time_type: string;
  minutes_delta: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  export_id: string | null;
}

export interface PayrollExportRecord {
  id: string;
  org_id: string;
  period_id: string;
  format: string;
  kind: "regular" | "correction" | "reexport";
  statement_ids: string[];
  row_count: number;
  checksum: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PayrollLogRow {
  id: number | string;
  org_id: string;
  statement_id: string | null;
  period_id: string | null;
  user_id: string | null;
  action: string;
  reason: string | null;
  details: Record<string, unknown> | null;
  actor: string | null;
  at: string;
}

// ---- Uppdrag på stämpelklockan ----
// Underlag för rapportering (projekt, väntetid). Påverkar aldrig lönegrundande närvarotid.
export interface AssignmentSession {
  id: string;
  org_id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  waiting_started_at: string | null;
  waiting_minutes: number;
  report_id: string | null;
  created_at: string;
}
