// Central datamodell för JK Projektlogistik – speglar Supabase/PostgreSQL-schemat i supabase/migrations

export type ProjectStatus =
  | "Ny"
  | "Under kalkylering"
  | "Offert skickad"
  | "Väntar på kund"
  | "Order"
  | "Planering"
  | "Ruttkontroll"
  | "Tillstånd"
  | "Transport bokad"
  | "Pågående"
  | "Levererad"
  | "Klar för fakturering"
  | "Avslutad"
  | "Avbruten";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "Ny",
  "Under kalkylering",
  "Offert skickad",
  "Väntar på kund",
  "Order",
  "Planering",
  "Ruttkontroll",
  "Tillstånd",
  "Transport bokad",
  "Pågående",
  "Levererad",
  "Klar för fakturering",
  "Avslutad",
  "Avbruten",
];

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

export interface ProjectNote {
  id: string;
  project_id: string;
  date: string;
  user_name: string;
  text: string;
  category: NoteCategory;
}

export type TaskStatus = "Ej påbörjad" | "Pågående" | "Klar";

export type TaskCategory =
  | "Rekning"
  | "Dispensansökan"
  | "Följebil"
  | "Tillstånd"
  | "Bokning"
  | "Dokumentation"
  | "Övrigt";

export const TASK_CATEGORIES: TaskCategory[] = [
  "Rekning",
  "Dispensansökan",
  "Följebil",
  "Tillstånd",
  "Bokning",
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
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  notes: string | null;
  created_at: string;
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

export type InvoiceStatus = "Ej fakturerad" | "Klar för fakturering" | "Fakturerad";

export const INVOICE_STATUSES: InvoiceStatus[] = ["Ej fakturerad", "Klar för fakturering", "Fakturerad"];

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
  transport_type: TransportType;
  special_requirements: string | null;
  planned_loading_date: string | null;
  planned_delivery_date: string | null;
  supplier_id: string | null;
  price: number | null;
  cost: number | null;
  invoice_status: InvoiceStatus;
  customer_reference: string | null;
  // Referensnummer på källdokumentet (t.ex. Holtabs LTC-nr) som hela ordern/bokningen
  // skapades från – skilt från customer_reference som är per kolli/gods (Order-nr).
  source_document_ref: string | null;
  delivery_terms: string | null;
  vehicle: string | null;
  driver_name: string | null;
  carrier_order_number: string | null;
  created_at: string;
  updated_at: string;

  // Utökade relationer (joinas in i mockdata/vyer)
  customer?: Customer;
  contact_person?: ContactPerson | null;
  responsible?: Profile | null;
  supplier?: Supplier | null;
  locations?: Location[];
  cargo_items?: CargoItem[];
  documents?: ProjectDocument[];
  notes?: ProjectNote[];
  tasks?: ProjectTask[];
  measurement_link?: MeasurementLink | null;
}
