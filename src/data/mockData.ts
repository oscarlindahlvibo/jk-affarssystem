import type {
  Customer,
  ContactPerson,
  Organization,
  Project,
  Profile,
  Supplier,
  MeasurementLink,
  MeasurementPoint,
} from "../types";

export const organizations: Organization[] = [
  { id: "org1", name: "JK Projektlogistik AB", created_at: "2024-01-01T08:00:00Z" },
  { id: "org2", name: "Exempel Spedition AB", created_at: "2025-05-01T08:00:00Z" },
];

// Profiler för flera roller/statusar/bolag – används bland annat för att testa
// rollbaserad behörighet och att bolag inte kan se varandras data (org2 är en
// separat testorganisation, helt skild från JK:s egen data).
export const profiles: Profile[] = [
  { id: "u1", org_id: "org1", full_name: "Jens Karlsson", email: "jens@jkprojektlogistik.se", role: "admin", status: "aktiv", initials: "JK" },
  { id: "u2", org_id: "org1", full_name: "Maria Lind", email: "maria@jkprojektlogistik.se", role: "projektledare", status: "aktiv", initials: "ML" },
  { id: "u3", org_id: "org1", full_name: "Peter Sund", email: "peter@jkprojektlogistik.se", role: "projektledare", status: "aktiv", initials: "PS" },
  { id: "u4", org_id: "org1", full_name: "Erik Ström", email: "erik@jkprojektlogistik.se", role: "ekonomi", status: "aktiv", initials: "ES" },
  { id: "u5", org_id: "org1", full_name: "Lisa Berg", email: "lisa@jkprojektlogistik.se", role: "lasare", status: "aktiv", initials: "LB" },
  { id: "u6", org_id: "org1", full_name: "Nina Ahl", email: "nina@jkprojektlogistik.se", role: "projektledare", status: "inbjuden", initials: "NA", invited_at: "2026-09-08T09:00:00Z" },
  { id: "u7", org_id: "org1", full_name: "Tom Nilsson", email: "tom@jkprojektlogistik.se", role: "lasare", status: "inaktiverad", initials: "TN" },
  { id: "u8", org_id: "org2", full_name: "Sara Holm", email: "sara@exempelspedition.se", role: "admin", status: "aktiv", initials: "SH" },
];

const rawCustomers: Omit<Customer, "org_id">[] = [
  {
    id: "c1",
    company_name: "Holtab AB",
    org_number: "556123-4567",
    invoice_address: "Industrigatan 12, 361 30 Tingsryd",
    visiting_address: "Industrigatan 12, 361 30 Tingsryd",
    phone: "0477-431 00",
    email: "info@holtab.se",
    website: "holtab.se",
    notes: "Tillverkare av transformatorstationer. Kräver ofta specialtransport med bred last.",
    status: "aktiv",
    created_at: "2025-02-10T08:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
  },
  {
    id: "c2",
    company_name: "Jinert",
    org_number: "556234-5678",
    invoice_address: "Verkstadsvägen 4, 392 39 Kalmar",
    visiting_address: "Verkstadsvägen 4, 392 39 Kalmar",
    phone: "0480-123 45",
    email: "kontakt@jinert.se",
    website: "jinert.se",
    notes: "Kranleverantör, återkommande krantransporter i södra Sverige.",
    status: "aktiv",
    created_at: "2025-03-15T08:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
  },
  {
    id: "c3",
    company_name: "ABB",
    org_number: "556003-1234",
    invoice_address: "Klarabergsviadukten 90, 111 64 Stockholm",
    visiting_address: "Finlandsgatan 8, 721 71 Västerås",
    phone: "021-32 00 00",
    email: "logistics.se@abb.com",
    website: "abb.se",
    notes: "Stora maskintransporter, kräver ofta tillståndshantering och följebil.",
    status: "aktiv",
    created_at: "2024-11-01T08:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
  },
  {
    id: "c4",
    company_name: "Sverigeexpressen",
    org_number: "556345-6789",
    invoice_address: "Speditionsvägen 2, 194 60 Upplands Väsby",
    visiting_address: "Speditionsvägen 2, 194 60 Upplands Väsby",
    phone: "08-590 100 00",
    email: "boka@sverigeexpressen.se",
    website: "sverigeexpressen.se",
    notes: "Speditör, samarbetspartner för styckegods och samlastning.",
    status: "aktiv",
    created_at: "2025-06-01T08:00:00Z",
    updated_at: "2026-07-14T10:00:00Z",
  },
  {
    id: "c5",
    company_name: "Nordisk Fraktpartner AB",
    org_number: "559911-2233",
    invoice_address: "Hamngatan 3, 411 06 Göteborg",
    visiting_address: "Hamngatan 3, 411 06 Göteborg",
    phone: "031-100 200",
    email: "info@nordiskfraktpartner.se",
    website: "nordiskfraktpartner.se",
    notes: "Testkund tillhörande Exempel Spedition AB – används för att visa att bolag inte kan se varandras data.",
    status: "aktiv",
    created_at: "2025-09-01T08:00:00Z",
    updated_at: "2025-09-01T08:00:00Z",
  },
];

const customerOrgOverrides: Record<string, string> = { c5: "org2" };

export const customers: Customer[] = rawCustomers.map((c) => ({ org_id: customerOrgOverrides[c.id] ?? "org1", ...c }));

export const contactPersons: ContactPerson[] = [
  { id: "p1", customer_id: "c1", name: "Anna Bergström", role: "Logistikansvarig", phone: "0477-431 10", mobile: "070-123 45 67", email: "anna.bergstrom@holtab.se", note: null, is_primary: true, created_at: "2025-02-10T08:00:00Z" },
  { id: "p2", customer_id: "c1", name: "Erik Nilsson", role: "Projektledare", phone: "0477-431 15", mobile: "070-234 56 78", email: "erik.nilsson@holtab.se", note: null, is_primary: false, created_at: "2025-02-10T08:00:00Z" },
  { id: "p3", customer_id: "c2", name: "Sofia Ek", role: "Transportsamordnare", phone: "0480-123 46", mobile: "070-345 67 89", email: "sofia.ek@jinert.se", note: null, is_primary: true, created_at: "2025-03-15T08:00:00Z" },
  { id: "p4", customer_id: "c3", name: "Marcus Holm", role: "Inköpare Logistik", phone: "021-32 00 10", mobile: "070-456 78 90", email: "marcus.holm@abb.com", note: "Föredrar kontakt via e-post.", is_primary: true, created_at: "2024-11-01T08:00:00Z" },
  { id: "p5", customer_id: "c4", name: "Lina Öberg", role: "Speditör", phone: "08-590 100 10", mobile: "070-567 89 01", email: "lina.oberg@sverigeexpressen.se", note: null, is_primary: true, created_at: "2025-06-01T08:00:00Z" },
  { id: "p6", customer_id: "c5", name: "Oskar Dahl", role: "Inköpare", phone: "031-100 210", mobile: "070-678 90 12", email: "oskar.dahl@nordiskfraktpartner.se", note: null, is_primary: true, created_at: "2025-09-01T08:00:00Z" },
];

const rawSuppliers: Omit<Supplier, "org_id">[] = [
  { id: "s1", company_name: "Sydtransport AB", type: "Åkeri", contact_person: "Johan Petersson", phone: "0470-100 200", email: "johan@sydtransport.se", area: "Södra Sverige", notes: "Van vid bred- och långtransporter.", created_at: "2025-01-10T08:00:00Z" },
  { id: "s2", company_name: "Kalmar Kranservice", type: "Kran", contact_person: "Fredrik Åkesson", phone: "0480-500 600", email: "fredrik@kalmarkran.se", area: "Kalmar/Öland", notes: null, created_at: "2025-01-12T08:00:00Z" },
  { id: "s3", company_name: "Följebil Väst", type: "Följebil", contact_person: "Camilla Strand", phone: "031-700 800", email: "camilla@foljebilvast.se", area: "Västra Sverige", notes: null, created_at: "2025-02-01T08:00:00Z" },
  { id: "s4", company_name: "Trafikverket Tillstånd", type: "Vägtransportledare", contact_person: "-", phone: null, email: "specialtransporter@trafikverket.se", area: "Riks", notes: "Tillståndsärenden BK-vägar och dispenser.", created_at: "2025-01-05T08:00:00Z" },
  { id: "s5", company_name: "Västkust Åkeri AB", type: "Åkeri", contact_person: "Petra Lund", phone: "031-500 600", email: "petra@vastkustakeri.se", area: "Västra Sverige", notes: "Testleverantör tillhörande Exempel Spedition AB.", created_at: "2025-09-01T08:00:00Z" },
];

const supplierOrgOverrides: Record<string, string> = { s5: "org2" };

export const suppliers: Supplier[] = rawSuppliers.map((s) => ({ org_id: supplierOrgOverrides[s.id] ?? "org1", ...s }));

// ---- Mätpunkter kopplade till JK-2026-0147 (Holtab, Tingsryd -> Växjö) ----
const measurementPoints147: MeasurementPoint[] = [
  { id: "mp1", measurement_link_id: "ml1", name: "Viadukt Rv23, km 12", lat: 56.5289, lng: 14.9906, free_height: 4.7, transport_height: 4.3, margin: 0.4, quality: "Hög", status: "OK", comment: "God marginal, inga åtgärder.", order_index: 1 },
  { id: "mp2", measurement_link_id: "ml1", name: "Järnvägsbro Ryd", lat: 56.6104, lng: 14.7028, free_height: 4.45, transport_height: 4.3, margin: 0.15, quality: "Hög", status: "Bevaka", comment: "Snäv marginal, kontrollmät vid lastning.", order_index: 2 },
  { id: "mp3", measurement_link_id: "ml1", name: "Rondell E4 Växjö Norra", lat: 56.8967, lng: 14.7561, free_height: 6.0, transport_height: 4.3, margin: 1.7, quality: "Medel", status: "OK", comment: null, order_index: 3 },
  { id: "mp4", measurement_link_id: "ml1", name: "Elledning korsning Rv25", lat: 56.7412, lng: 14.8203, free_height: 4.35, transport_height: 4.3, margin: 0.05, quality: "Låg", status: "Kritisk", comment: "Kräver avstängning/lyft av ledning. Kontakta nätägare innan transport.", order_index: 4 },
];

// ---- Mätpunkter kopplade till JK-2026-0148 (ABB, Västerås -> Oskarshamn) ----
const measurementPoints148: MeasurementPoint[] = [
  { id: "mp5", measurement_link_id: "ml2", name: "Bro E18 Köping", lat: 59.5153, lng: 16.0058, free_height: 5.1, transport_height: 4.6, margin: 0.5, quality: "Hög", status: "OK", comment: null, order_index: 1 },
  { id: "mp6", measurement_link_id: "ml2", name: "Tunnel Norrköping", lat: 58.5877, lng: 16.1924, free_height: 4.6, transport_height: 4.6, margin: 0.0, quality: "Hög", status: "Kritisk", comment: "Ingen marginal – alternativ rutt förbi tunnel krävs.", order_index: 2 },
  { id: "mp7", measurement_link_id: "ml2", name: "Viadukt Rv34 Vimmerby", lat: 57.6667, lng: 15.8578, free_height: 4.9, transport_height: 4.6, margin: 0.3, quality: "Medel", status: "Bevaka", comment: null, order_index: 3 },
];

export const measurementLinks: MeasurementLink[] = [
  {
    id: "ml1",
    project_id: "pr1",
    measurement_id: "MSY-2026-0091",
    route_id: "RT-TGY-VXO-04",
    measurement_status: "Klar",
    measurement_date: "2026-09-03",
    measurement_summary: "Rutt uppmätt med 4 kontrollpunkter. En kritisk punkt vid elledning kräver åtgärd innan transport.",
    lowest_measured_height: 4.35,
    transport_height: 4.3,
    minimum_margin: 0.05,
    number_of_measurement_points: 4,
    link_to_measurement_map: "https://matsystem.jkprojektlogistik.se/routes/RT-TGY-VXO-04",
  },
  {
    id: "ml2",
    project_id: "pr2",
    measurement_id: "MSY-2026-0088",
    route_id: "RT-VST-OSK-02",
    measurement_status: "Bevakning",
    measurement_date: "2026-08-28",
    measurement_summary: "Kritisk punkt vid tunnel Norrköping – alternativ rutt under utredning.",
    lowest_measured_height: 4.6,
    transport_height: 4.6,
    minimum_margin: 0.0,
    number_of_measurement_points: 3,
    link_to_measurement_map: "https://matsystem.jkprojektlogistik.se/routes/RT-VST-OSK-02",
  },
];

export const measurementPointsByLink: Record<string, MeasurementPoint[]> = {
  ml1: measurementPoints147,
  ml2: measurementPoints148,
};

const rawProjects: Omit<
  Project,
  "org_id" | "supplier_id" | "price" | "cost" | "invoice_status" | "customer_reference" | "vehicle" | "driver_name" | "carrier_order_number"
>[] = [
  {
    id: "pr1",
    project_number: "JK-2026-0147",
    name: "Holtab – Transformator Tingsryd till Växjö",
    customer_id: "c1",
    contact_person_id: "p1",
    responsible_id: "u2",
    status: "Tillstånd",
    transport_type: "Specialtransport",
    special_requirements: "Bred last, kräver dispens och följebil. Elledning vid Rv25 måste hanteras.",
    planned_loading_date: "2026-09-22",
    planned_delivery_date: "2026-09-23",
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-09-09T14:20:00Z",
    locations: [
      { id: "l1", project_id: "pr1", type: "lastning", name: "Holtab AB, Tingsryd", address: "Industrigatan 12, 361 30 Tingsryd", order_index: 0 },
      { id: "l2", project_id: "pr1", type: "lossning", name: "Växjö Energi", address: "Sandviksvägen 1, 352 45 Växjö", order_index: 1 },
    ],
    cargo_items: [
      { id: "g1", project_id: "pr1", description: "Transformatorstation, komplett", length_m: 8.2, width_m: 3.4, height_m: 3.9, weight_ton: 42, quantity: 1, lift_points: "4 st, markerade enligt ritning", drawing_reference: "HLT-2026-118", technical_info: "Tyngdpunkt centrerad, ej stapelbar." },
    ],
    documents: [
      { id: "d1", project_id: "pr1", file_name: "Ritning_transformator_HLT-2026-118.pdf", file_type: "pdf", category: "Ritning", storage_path: "pr1/Ritning_transformator_HLT-2026-118.pdf", uploaded_at: "2026-08-11T10:00:00Z", uploaded_by: "Maria Lind", visibility: "internal", comment: "Från Holtab, mottagen via e-post." },
      { id: "d2", project_id: "pr1", file_name: "Dispensansokan_Rv25.pdf", file_type: "pdf", category: "Tillstånd", storage_path: "pr1/Dispensansokan_Rv25.pdf", uploaded_at: "2026-08-25T13:00:00Z", uploaded_by: "Peter Sund", visibility: "internal", comment: null },
    ],
    notes: [
      { id: "n1", project_id: "pr1", date: "2026-08-10T09:15:00Z", user_name: "Maria Lind", text: "Kund bekräftar mått per telefon. Väntar på slutgiltig ritning.", category: "Kund" },
      { id: "n2", project_id: "pr1", date: "2026-08-27T11:00:00Z", user_name: "Peter Sund", text: "Elledning vid Rv25 kräver samordning med nätägare innan transportdatum.", category: "Tillstånd" },
    ],
    tasks: [
      { id: "t1", project_id: "pr1", task: "Kontrollera transportmått", category: "Dokumentation", description: null, route_section: null, assignee_id: "u2", assignee: "Maria Lind", deadline: "2026-08-15", status: "Klar", comment: null },
      { id: "t2", project_id: "pr1", task: "Reka sträckan Tingsryd–Växjö", category: "Rekning", description: "Kontrollera fri höjd och bredd på hela sträckan, med extra fokus på broar och ledningar.", route_section: "Rv23/Rv25 Tingsryd → Växjö, hela sträckan", assignee_id: "u2", assignee: "Maria Lind", deadline: "2026-09-01", status: "Klar", comment: "Ruttmätning genomförd, se mätsystem." },
      { id: "t3", project_id: "pr1", task: "Ansök om dispens hos Trafikverket", category: "Dispensansökan", description: "Dispens krävs för bredden (3,4 m). Bifoga ritning HLT-2026-118 i ansökan.", route_section: "Rv23/Rv25 Tingsryd → Växjö", assignee_id: "u3", assignee: "Peter Sund", deadline: "2026-09-10", status: "Pågående", comment: "Väntar svar från Trafikverket." },
      { id: "t4", project_id: "pr1", task: "Boka följebil", category: "Följebil", description: "Följebil krävs fram enligt godsets bredd (3,4 m > 3,1 m).", route_section: null, assignee_id: "u3", assignee: "Peter Sund", deadline: "2026-09-15", status: "Ej påbörjad", comment: null },
      { id: "t5", project_id: "pr1", task: "Skicka information till kund", category: "Övrigt", description: null, route_section: null, assignee_id: "u2", assignee: "Maria Lind", deadline: "2026-09-18", status: "Ej påbörjad", comment: null },
    ],
  },
  {
    id: "pr2",
    project_number: "JK-2026-0148",
    name: "ABB – Maskintransport Västerås till Oskarshamn",
    customer_id: "c3",
    contact_person_id: "p4",
    responsible_id: "u1",
    status: "Ruttkontroll",
    transport_type: "Maskintransport",
    special_requirements: "Tunnelpassage vid Norrköping ej möjlig, alternativ rutt krävs.",
    planned_loading_date: "2026-09-29",
    planned_delivery_date: "2026-09-30",
    created_at: "2026-08-05T09:00:00Z",
    updated_at: "2026-09-08T09:40:00Z",
    locations: [
      { id: "l3", project_id: "pr2", type: "lastning", name: "ABB, Västerås", address: "Finlandsgatan 8, 721 71 Västerås", order_index: 0 },
      { id: "l4", project_id: "pr2", type: "lossning", name: "ABB Oskarshamn", address: "Fabriksvägen 3, 572 32 Oskarshamn", order_index: 1 },
    ],
    cargo_items: [
      { id: "g2", project_id: "pr2", description: "Industrimaskin, CNC-enhet", length_m: 6.5, width_m: 2.9, height_m: 3.1, weight_ton: 28, quantity: 1, lift_points: "2 st lyftöglor", drawing_reference: "ABB-M-4471", technical_info: "Känslig elektronik, stötdämpad transport." },
    ],
    documents: [
      { id: "d3", project_id: "pr2", file_name: "Maskinspecifikation_ABB-M-4471.pdf", file_type: "pdf", category: "Ritning", storage_path: "pr2/Maskinspecifikation_ABB-M-4471.pdf", uploaded_at: "2026-08-06T10:00:00Z", uploaded_by: "Jens Karlsson", visibility: "internal", comment: null },
    ],
    notes: [
      { id: "n3", project_id: "pr2", date: "2026-09-01T08:30:00Z", user_name: "Jens Karlsson", text: "Ruttmätning visar kritisk punkt vid tunnel Norrköping. Utreder alternativ väg via Rv34.", category: "Transport" },
    ],
    tasks: [
      { id: "t6", project_id: "pr2", task: "Kontrollera transportmått", category: "Dokumentation", description: null, route_section: null, assignee_id: "u1", assignee: "Jens Karlsson", deadline: "2026-08-12", status: "Klar", comment: null },
      { id: "t7", project_id: "pr2", task: "Reka alternativ rutt förbi tunnel Norrköping", category: "Rekning", description: "Tunneln vid Norrköping klarar inte transporthöjden (4,6 m). Hitta och kontrollera en alternativ väg, exempelvis via Rv34.", route_section: "Västerås → Oskarshamn, delsträcka runt Norrköping", assignee_id: "u1", assignee: "Jens Karlsson", deadline: "2026-09-05", status: "Pågående", comment: "Alternativ rutt utreds pga tunnel." },
      { id: "t8", project_id: "pr2", task: "Begär pris från transportör", category: "Bokning", description: null, route_section: null, assignee_id: "u1", assignee: "Jens Karlsson", deadline: "2026-09-12", status: "Ej påbörjad", comment: null },
    ],
  },
  {
    id: "pr3",
    project_number: "JK-2026-0149",
    name: "Jinert – Krantransport Kalmar till Malmö",
    customer_id: "c2",
    contact_person_id: "p3",
    responsible_id: "u3",
    status: "Order",
    transport_type: "Krantransport",
    special_requirements: null,
    planned_loading_date: "2026-09-18",
    planned_delivery_date: "2026-09-19",
    created_at: "2026-08-20T09:00:00Z",
    updated_at: "2026-09-06T15:10:00Z",
    locations: [
      { id: "l5", project_id: "pr3", type: "lastning", name: "Jinert, Kalmar", address: "Verkstadsvägen 4, 392 39 Kalmar", order_index: 0 },
      { id: "l6", project_id: "pr3", type: "lossning", name: "Byggarbetsplats Hyllie", address: "Hyllie Boulevard 20, 215 32 Malmö", order_index: 1 },
    ],
    cargo_items: [
      { id: "g3", project_id: "pr3", description: "Mobilkran, 60 ton", length_m: 12.0, width_m: 3.0, height_m: 3.9, weight_ton: 48, quantity: 1, lift_points: null, drawing_reference: null, technical_info: "Egen framdrift, körs delvis på egna hjul vid lossning." },
    ],
    documents: [],
    notes: [
      { id: "n4", project_id: "pr3", date: "2026-08-22T10:00:00Z", user_name: "Peter Sund", text: "Order bekräftad av Jinert. Inväntar exakt lastningstid.", category: "Kund" },
    ],
    tasks: [
      { id: "t9", project_id: "pr3", task: "Bekräfta lastning", category: "Övrigt", description: null, route_section: null, assignee_id: "u3", assignee: "Peter Sund", deadline: "2026-09-15", status: "Ej påbörjad", comment: null },
      { id: "t10", project_id: "pr3", task: "Boka följebil", category: "Följebil", description: null, route_section: null, assignee_id: "u3", assignee: "Peter Sund", deadline: "2026-09-14", status: "Ej påbörjad", comment: null },
    ],
  },
  {
    id: "pr4",
    project_number: "JK-2026-0150",
    name: "Sverigeexpressen – Styckegods Upplands Väsby till Örebro",
    customer_id: "c4",
    contact_person_id: "p5",
    responsible_id: "u2",
    status: "Pågående",
    transport_type: "Styckegods",
    special_requirements: null,
    planned_loading_date: "2026-09-11",
    planned_delivery_date: "2026-09-12",
    created_at: "2026-09-01T09:00:00Z",
    updated_at: "2026-09-10T08:00:00Z",
    locations: [
      { id: "l7", project_id: "pr4", type: "lastning", name: "Sverigeexpressen Terminal", address: "Speditionsvägen 2, 194 60 Upplands Väsby", order_index: 0 },
      { id: "l8", project_id: "pr4", type: "lossning", name: "Örebro Logistikpark", address: "Truckvägen 5, 702 27 Örebro", order_index: 1 },
    ],
    cargo_items: [
      { id: "g4", project_id: "pr4", description: "Pallgods, blandat", length_m: null, width_m: null, height_m: null, weight_ton: 6.2, quantity: 14, lift_points: null, drawing_reference: null, technical_info: null },
    ],
    documents: [
      { id: "d4", project_id: "pr4", file_name: "Fraktsedel_0150.pdf", file_type: "pdf", category: "Fraktsedel", storage_path: "pr4/Fraktsedel_0150.pdf", uploaded_at: "2026-09-11T07:00:00Z", uploaded_by: "Maria Lind", visibility: "customer", comment: null },
    ],
    notes: [],
    tasks: [
      { id: "t11", project_id: "pr4", task: "Skicka information till kund", category: "Övrigt", description: null, route_section: null, assignee_id: "u2", assignee: "Maria Lind", deadline: "2026-09-11", status: "Klar", comment: null },
    ],
  },
  {
    id: "pr5",
    project_number: "JK-2026-0151",
    name: "Holtab – Transformator Ljungby till Halmstad",
    customer_id: "c1",
    contact_person_id: "p2",
    responsible_id: "u3",
    status: "Under kalkylering",
    transport_type: "Specialtransport",
    special_requirements: null,
    planned_loading_date: null,
    planned_delivery_date: null,
    created_at: "2026-09-08T09:00:00Z",
    updated_at: "2026-09-08T09:00:00Z",
    locations: [],
    cargo_items: [],
    documents: [],
    notes: [],
    tasks: [
      { id: "t12", project_id: "pr5", task: "Kontrollera transportmått", category: "Dokumentation", description: null, route_section: null, assignee_id: "u3", assignee: "Peter Sund", deadline: "2026-09-15", status: "Ej påbörjad", comment: null },
    ],
  },
  {
    id: "pr6",
    project_number: "JK-2026-0152",
    name: "ABB – Maskintransport Ludvika till Sundsvall",
    customer_id: "c3",
    contact_person_id: "p4",
    responsible_id: "u1",
    status: "Ny",
    transport_type: "Maskintransport",
    special_requirements: "Förfrågan inkommen, ej bekräftad.",
    planned_loading_date: null,
    planned_delivery_date: null,
    created_at: "2026-09-09T13:00:00Z",
    updated_at: "2026-09-09T13:00:00Z",
    locations: [],
    cargo_items: [],
    documents: [],
    notes: [],
    tasks: [],
  },
  {
    id: "pr7",
    project_number: "JK-2026-0145",
    name: "Jinert – Krantransport Växjö till Kristianstad",
    customer_id: "c2",
    contact_person_id: "p3",
    responsible_id: "u2",
    status: "Klar för fakturering",
    transport_type: "Krantransport",
    special_requirements: null,
    planned_loading_date: "2026-08-28",
    planned_delivery_date: "2026-08-29",
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    locations: [
      { id: "l9", project_id: "pr7", type: "lastning", name: "Jinert, Växjö depå", address: "Sandsbro industriväg 2, 352 46 Växjö", order_index: 0 },
      { id: "l10", project_id: "pr7", type: "lossning", name: "Byggarbetsplats centrum", address: "Storgatan 1, 291 31 Kristianstad", order_index: 1 },
    ],
    cargo_items: [
      { id: "g5", project_id: "pr7", description: "Mobilkran, 40 ton", length_m: 10.5, width_m: 2.8, height_m: 3.7, weight_ton: 36, quantity: 1, lift_points: null, drawing_reference: null, technical_info: null },
    ],
    documents: [
      { id: "d5", project_id: "pr7", file_name: "Order_0145.pdf", file_type: "pdf", category: "Order", storage_path: "pr7/Order_0145.pdf", uploaded_at: "2026-08-02T10:00:00Z", uploaded_by: "Maria Lind", visibility: "internal", comment: null },
    ],
    notes: [],
    tasks: [
      { id: "t13", project_id: "pr7", task: "Markera klar för fakturering", category: "Övrigt", description: null, route_section: null, assignee_id: "u2", assignee: "Maria Lind", deadline: "2026-09-01", status: "Klar", comment: null },
    ],
  },
  {
    id: "pr8",
    project_number: "JK-2026-0140",
    name: "Sverigeexpressen – Styckegods Norrköping till Linköping",
    customer_id: "c4",
    contact_person_id: "p5",
    responsible_id: "u3",
    status: "Avslutad",
    transport_type: "Styckegods",
    special_requirements: null,
    planned_loading_date: "2026-08-10",
    planned_delivery_date: "2026-08-10",
    created_at: "2026-07-20T09:00:00Z",
    updated_at: "2026-08-15T10:00:00Z",
    locations: [],
    cargo_items: [],
    documents: [],
    notes: [],
    tasks: [],
  },
  {
    id: "pr9",
    project_number: "ESP-2025-0011",
    name: "Nordisk Fraktpartner – Containertransport Göteborg till Malmö",
    customer_id: "c5",
    contact_person_id: "p6",
    responsible_id: "u8",
    status: "Order",
    transport_type: "Container",
    special_requirements: null,
    planned_loading_date: "2025-09-15",
    planned_delivery_date: "2025-09-16",
    created_at: "2025-09-02T09:00:00Z",
    updated_at: "2025-09-02T09:00:00Z",
    locations: [
      { id: "l11", project_id: "pr9", type: "lastning", name: "Göteborgs hamn", address: null, order_index: 0 },
      { id: "l12", project_id: "pr9", type: "lossning", name: "Malmö hamn", address: null, order_index: 1 },
    ],
    cargo_items: [
      { id: "g6", project_id: "pr9", description: "40-fots container", length_m: 12.2, width_m: 2.4, height_m: 2.6, weight_ton: 24, quantity: 1, lift_points: null, drawing_reference: null, technical_info: null },
    ],
    documents: [],
    notes: [],
    tasks: [],
  },
];

const projectOverrides: Record<string, Partial<Pick<Project, "org_id" | "supplier_id" | "price" | "cost" | "invoice_status">>> = {
  pr1: { supplier_id: "s1", price: 68000, cost: 41000, invoice_status: "Ej fakturerad" },
  pr2: { supplier_id: "s1", price: 54000, cost: 33000, invoice_status: "Ej fakturerad" },
  pr3: { supplier_id: "s2", price: 39500, cost: 24000, invoice_status: "Ej fakturerad" },
  pr4: { supplier_id: null, price: 8200, cost: 5100, invoice_status: "Fakturerad" },
  pr7: { supplier_id: "s2", price: 45500, cost: 27500, invoice_status: "Klar för fakturering" },
  pr8: { supplier_id: null, price: 6100, cost: 3900, invoice_status: "Fakturerad" },
  pr9: { org_id: "org2", supplier_id: "s5", price: 18500, cost: 11200, invoice_status: "Ej fakturerad" },
};

export const projects: Project[] = rawProjects.map((p) => ({
  org_id: "org1",
  supplier_id: null,
  price: null,
  cost: null,
  invoice_status: "Ej fakturerad",
  customer_reference: null,
  vehicle: null,
  driver_name: null,
  carrier_order_number: null,
  ...p,
  ...(projectOverrides[p.id] ?? {}),
}));

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getContactById(id: string | null): ContactPerson | undefined {
  if (!id) return undefined;
  return contactPersons.find((p) => p.id === id);
}

export function getProfileById(id: string | null): Profile | undefined {
  if (!id) return undefined;
  return profiles.find((p) => p.id === id);
}

export function getContactsByCustomer(customerId: string): ContactPerson[] {
  return contactPersons.filter((p) => p.customer_id === customerId);
}

export function getProjectsByCustomer(customerId: string): Project[] {
  return projects.filter((p) => p.customer_id === customerId);
}

export function getMeasurementLinkByProject(projectId: string): MeasurementLink | undefined {
  return measurementLinks.find((m) => m.project_id === projectId);
}

export function getMeasurementPoints(linkId: string): MeasurementPoint[] {
  return measurementPointsByLink[linkId] ?? [];
}

export function getSupplierById(id: string | null): Supplier | undefined {
  if (!id) return undefined;
  return suppliers.find((s) => s.id === id);
}

export function enrichProject(project: Project): Project {
  return {
    ...project,
    customer: getCustomerById(project.customer_id),
    contact_person: getContactById(project.contact_person_id) ?? null,
    responsible: getProfileById(project.responsible_id) ?? null,
    supplier: getSupplierById(project.supplier_id) ?? null,
    measurement_link: getMeasurementLinkByProject(project.id) ?? null,
  };
}

export function getAllProjectsEnriched(): Project[] {
  return projects.map(enrichProject);
}

export function getProjectById(id: string): Project | undefined {
  const project = projects.find((p) => p.id === id);
  return project ? enrichProject(project) : undefined;
}
