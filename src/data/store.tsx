import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Customer,
  ContactPerson,
  Profile,
  Project,
  ProjectNote,
  ProjectTask,
  ProjectDocument,
  ProjectStatus,
  Supplier,
  TransportType,
  UserRole,
} from "../types";
import * as mock from "./mockData";
import { useAuth } from "../lib/auth";
import { usePersonnel } from "./personnel";
import { can, canEditProjectFinance, type Action, type Resource } from "../lib/permissions";
import { DEFAULT_FREIGHT_CALCULATOR_CONFIG, type FreightCalculatorConfig } from "../lib/freightCalculator";

export interface CustomerBookingCargoInput {
  description: string;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  weight_ton: number | null;
  quantity: number | null;
}

export interface CustomerBookingInput {
  name: string;
  transport_type: TransportType;
  planned_loading_date: string;
  planned_delivery_date: string;
  loading_name: string;
  loading_address: string;
  loading_contact_name: string;
  loading_contact_phone: string;
  unloading_name: string;
  unloading_address: string;
  unloading_contact_name: string;
  unloading_contact_phone: string;
  cargo_items: CustomerBookingCargoInput[];
  customer_reference: string;
  special_requirements: string;
}

interface StoreShape {
  customers: Customer[];
  contactPersons: ContactPerson[];
  projects: Project[];
  suppliers: Supplier[];
  profiles: Profile[];
  currentRole: UserRole | null;
  freightCalculatorConfig: FreightCalculatorConfig;
  updateFreightCalculatorConfig: (next: FreightCalculatorConfig) => void;
  resetFreightCalculatorConfig: () => void;
  addCustomer: (c: Omit<Customer, "id" | "org_id" | "created_at" | "updated_at">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => { ok: boolean; reason?: string };
  addContactPerson: (c: Omit<ContactPerson, "id" | "created_at">) => ContactPerson;
  updateContactPerson: (id: string, patch: Partial<ContactPerson>) => void;
  deleteContactPerson: (id: string) => void;
  addSupplier: (s: Omit<Supplier, "id" | "org_id" | "created_at">) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => { ok: boolean; reason?: string };
  addProject: (p: Omit<Project, "id" | "org_id" | "created_at" | "updated_at">) => Project;
  submitCustomerBooking: (data: CustomerBookingInput) => Project;
  approveCustomerBooking: (projectId: string, data: { responsible_id: string | null; status: ProjectStatus }) => void;
  rejectCustomerBooking: (projectId: string, reason: string) => void;
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void;
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  updateProjectFinance: (projectId: string, patch: Partial<Pick<Project, "price" | "cost" | "invoice_status">>) => void;
  addNote: (projectId: string, note: Omit<ProjectNote, "id" | "project_id">) => void;
  addDocument: (projectId: string, doc: Omit<ProjectDocument, "id" | "project_id">) => void;
  deleteDocument: (projectId: string, documentId: string) => void;
  addTask: (projectId: string, task: Omit<ProjectTask, "id" | "project_id">) => void;
  updateTaskStatus: (projectId: string, taskId: string, status: ProjectTask["status"]) => void;
  updateTask: (projectId: string, taskId: string, patch: Partial<Omit<ProjectTask, "id" | "project_id">>) => void;
  getProject: (id: string) => Project | undefined;
  getCustomer: (id: string) => Customer | undefined;
  getContact: (id: string) => ContactPerson | undefined;
  getSupplier: (id: string) => Supplier | undefined;
  getContactsByCustomer: (customerId: string) => ContactPerson[];
  getProjectsByCustomer: (customerId: string) => Project[];
  // Personal/användarhantering (admin-only, se lib/permissions.ts)
  invitePersonnel: (data: { full_name: string; email: string; role: UserRole }) => { ok: boolean; reason?: string; profile?: Profile };
  updatePersonnel: (id: string, patch: Partial<Pick<Profile, "full_name" | "email" | "role">>) => { ok: boolean; reason?: string };
  deactivatePersonnel: (id: string) => { ok: boolean; reason?: string };
  reactivatePersonnel: (id: string) => { ok: boolean; reason?: string };
}

const StoreContext = createContext<StoreShape | null>(null);
const PROJECTS_STORAGE_KEY = "jk-mock-projects";
const FREIGHT_CALCULATOR_STORAGE_KEY = "jk-freight-calculator-config";

let idCounter = 2000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function loadProjects(): Project[] {
  if (typeof window === "undefined") return mock.projects;
  const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (!stored) return mock.projects;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return mock.projects;
    const storedIds = new Set(parsed.map((p: Project) => p.id));
    return [...parsed, ...mock.projects.filter((p) => !storedIds.has(p.id))];
  } catch {
    return mock.projects;
  }
}

function loadFreightCalculatorConfig(): FreightCalculatorConfig {
  if (typeof window === "undefined") return DEFAULT_FREIGHT_CALCULATOR_CONFIG;
  const stored = window.localStorage.getItem(FREIGHT_CALCULATOR_STORAGE_KEY);
  if (!stored) return DEFAULT_FREIGHT_CALCULATOR_CONFIG;
  try {
    return { ...DEFAULT_FREIGHT_CALCULATOR_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_FREIGHT_CALCULATOR_CONFIG;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { currentProfile, currentCustomerUser } = useAuth();
  const personnel = usePersonnel();
  const orgId = currentProfile?.org_id ?? currentCustomerUser?.org_id ?? "";
  const role = currentProfile?.role ?? null;

  const [allCustomers, setAllCustomers] = useState<Customer[]>(mock.customers);
  const [allContactPersons, setAllContactPersons] = useState<ContactPerson[]>(mock.contactPersons);
  const [allProjects, setAllProjects] = useState<Project[]>(loadProjects);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>(mock.suppliers);
  const [freightCalculatorConfig, setFreightCalculatorConfig] = useState<FreightCalculatorConfig>(loadFreightCalculatorConfig);

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(allProjects));
  }, [allProjects]);

  useEffect(() => {
    window.localStorage.setItem(FREIGHT_CALCULATOR_STORAGE_KEY, JSON.stringify(freightCalculatorConfig));
  }, [freightCalculatorConfig]);

  // Skydd i datalagret: även om ett UI-element av misstag visas ska mutationer
  // blockeras här om rollen saknar rättighet eller kontot inte längre är aktivt.
  // I en riktig Supabase-uppkoppling görs motsvarande spärr av RLS-policyer
  // (se supabase/migrations) – detta är klientsidans motsvarighet så länge
  // datalagret är in-memory.
  const authorize = useCallback(
    (resource: Resource, action: Action) => {
      if (!currentProfile || currentProfile.status !== "aktiv") {
        throw new Error("Kontot är inte aktivt – åtgärden nekas.");
      }
      if (!can(role, resource, action)) {
        throw new Error(`Rollen "${role}" saknar behörighet att ${action} ${resource}.`);
      }
    },
    [currentProfile, role]
  );

  const updateFreightCalculatorConfig: StoreShape["updateFreightCalculatorConfig"] = useCallback(
    (next) => {
      authorize("settings", "edit");
      setFreightCalculatorConfig(next);
    },
    [authorize]
  );

  const resetFreightCalculatorConfig: StoreShape["resetFreightCalculatorConfig"] = useCallback(() => {
    authorize("settings", "edit");
    setFreightCalculatorConfig(DEFAULT_FREIGHT_CALCULATOR_CONFIG);
  }, [authorize]);

  const customers = useMemo(() => {
    const orgCustomers = allCustomers.filter((c) => c.org_id === orgId);
    if (currentCustomerUser) return orgCustomers.filter((c) => c.id === currentCustomerUser.customer_id);
    return orgCustomers;
  }, [allCustomers, orgId, currentCustomerUser]);
  const contactPersons = useMemo(() => {
    const orgCustomerIds = new Set(customers.map((c) => c.id));
    return allContactPersons.filter((c) => orgCustomerIds.has(c.customer_id));
  }, [allContactPersons, customers]);
  const projects = useMemo(() => {
    const orgProjects = allProjects.filter((p) => p.org_id === orgId);
    if (currentCustomerUser) return orgProjects.filter((p) => p.customer_id === currentCustomerUser.customer_id);
    return orgProjects;
  }, [allProjects, orgId, currentCustomerUser]);
  const suppliers = useMemo(() => allSuppliers.filter((s) => s.org_id === orgId), [allSuppliers, orgId]);
  const profiles = useMemo(() => personnel.allProfiles.filter((p) => p.org_id === orgId), [personnel.allProfiles, orgId]);

  const enrich = useCallback(
    (p: Project): Project => ({
      ...p,
      customer: allCustomers.find((c) => c.id === p.customer_id),
      contact_person: allContactPersons.find((c) => c.id === p.contact_person_id) ?? null,
      responsible: personnel.getById(p.responsible_id ?? "") ?? null,
      supplier: allSuppliers.find((s) => s.id === p.supplier_id) ?? null,
      measurement_link: mock.getMeasurementLinkByProject(p.id) ?? null,
    }),
    [allCustomers, allContactPersons, allSuppliers, personnel]
  );

  const addCustomer: StoreShape["addCustomer"] = useCallback(
    (c) => {
      authorize("customers", "create");
      const now = new Date().toISOString();
      const newCustomer: Customer = { ...c, id: nextId("c"), org_id: orgId, created_at: now, updated_at: now };
      setAllCustomers((prev) => [newCustomer, ...prev]);
      return newCustomer;
    },
    [authorize, orgId]
  );

  const updateCustomer: StoreShape["updateCustomer"] = useCallback(
    (id, patch) => {
      authorize("customers", "edit");
      setAllCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c))
      );
    },
    [authorize]
  );

  const deleteCustomer: StoreShape["deleteCustomer"] = useCallback(
    (id) => {
      if (!can(role, "customers", "delete")) return { ok: false, reason: "Du saknar behörighet att radera kunder." };
      const linkedProjects = allProjects.filter((p) => p.customer_id === id);
      if (linkedProjects.length > 0) {
        return { ok: false, reason: `Kunden har ${linkedProjects.length} kopplade projekt och kan inte raderas. Flytta eller radera projekten först.` };
      }
      setAllCustomers((prev) => prev.filter((c) => c.id !== id));
      setAllContactPersons((prev) => prev.filter((c) => c.customer_id !== id));
      return { ok: true };
    },
    [role, allProjects]
  );

  const addContactPerson: StoreShape["addContactPerson"] = useCallback(
    (c) => {
      authorize("contacts", "create");
      const newContact: ContactPerson = { ...c, id: nextId("p"), created_at: new Date().toISOString() };
      setAllContactPersons((prev) => [newContact, ...prev]);
      return newContact;
    },
    [authorize]
  );

  const updateContactPerson: StoreShape["updateContactPerson"] = useCallback(
    (id, patch) => {
      authorize("contacts", "edit");
      setAllContactPersons((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [authorize]
  );

  const deleteContactPerson: StoreShape["deleteContactPerson"] = useCallback(
    (id) => {
      authorize("contacts", "delete");
      setAllContactPersons((prev) => prev.filter((c) => c.id !== id));
      setAllProjects((prev) => prev.map((p) => (p.contact_person_id === id ? { ...p, contact_person_id: null } : p)));
    },
    [authorize]
  );

  const addSupplier: StoreShape["addSupplier"] = useCallback(
    (s) => {
      authorize("suppliers", "create");
      const newSupplier: Supplier = { ...s, id: nextId("s"), org_id: orgId, created_at: new Date().toISOString() };
      setAllSuppliers((prev) => [newSupplier, ...prev]);
      return newSupplier;
    },
    [authorize, orgId]
  );

  const updateSupplier: StoreShape["updateSupplier"] = useCallback(
    (id, patch) => {
      authorize("suppliers", "edit");
      setAllSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [authorize]
  );

  const deleteSupplier: StoreShape["deleteSupplier"] = useCallback(
    (id) => {
      if (!can(role, "suppliers", "delete")) return { ok: false, reason: "Du saknar behörighet att radera leverantörer." };
      const linkedProjects = allProjects.filter((p) => p.supplier_id === id);
      if (linkedProjects.length > 0) {
        return { ok: false, reason: `Leverantören har ${linkedProjects.length} kopplade projekt och kan inte raderas.` };
      }
      setAllSuppliers((prev) => prev.filter((s) => s.id !== id));
      return { ok: true };
    },
    [role, allProjects]
  );

  const addProject: StoreShape["addProject"] = useCallback(
    (p) => {
      authorize("projects", "create");
      const now = new Date().toISOString();
      const newProject: Project = {
        ...p,
        id: nextId("pr"),
        org_id: orgId,
        created_at: now,
        updated_at: now,
        locations: p.locations ?? [],
        cargo_items: p.cargo_items ?? [],
        documents: p.documents ?? [],
        notes: p.notes ?? [],
        tasks: p.tasks ?? [],
      };
      setAllProjects((prev) => [newProject, ...prev]);
      return newProject;
    },
    [authorize, orgId]
  );

  const submitCustomerBooking: StoreShape["submitCustomerBooking"] = useCallback(
    (data) => {
      if (!currentCustomerUser || currentCustomerUser.status !== "aktiv") {
        throw new Error("Kundkontot är inte aktivt.");
      }
      const now = new Date().toISOString();
      const id = nextId("pr");
      const customer = allCustomers.find((c) => c.id === currentCustomerUser.customer_id);
      const contact = allContactPersons.find((c) => c.id === currentCustomerUser.contact_person_id);
      const projectName =
        data.name.trim() ||
        `${customer?.company_name ?? "Kund"} – Bokningsförfrågan ${data.loading_name || "lastning"} till ${data.unloading_name || "lossning"}`;
      const cargoItems = data.cargo_items.filter((item) => item.description.trim());
      const newProject: Project = {
        id,
        org_id: currentCustomerUser.org_id,
        project_number: `WEB-${new Date().getFullYear()}-${id.replace(/\D/g, "").padStart(4, "0")}`,
        name: projectName,
        customer_id: currentCustomerUser.customer_id,
        contact_person_id: currentCustomerUser.contact_person_id,
        responsible_id: null,
        status: "Ny",
        transport_type: data.transport_type,
        special_requirements: data.special_requirements.trim() || null,
        planned_loading_date: data.planned_loading_date || null,
        planned_delivery_date: data.planned_delivery_date || null,
        supplier_id: null,
        price: null,
        cost: null,
        invoice_status: "Ej fakturerad",
        customer_reference: data.customer_reference.trim() || null,
        booking_source: "customer_portal",
        booking_approval_status: "Väntar på godkännande",
        requested_by_customer_user_id: currentCustomerUser.id,
        approved_at: null,
        approved_by: null,
        source_document_ref: null,
        delivery_terms: null,
        vehicle: null,
        driver_name: null,
        carrier_order_number: null,
        created_at: now,
        updated_at: now,
        locations: [
          {
            id: nextId("l"),
            project_id: id,
            type: "lastning",
            name: data.loading_name.trim(),
            address: data.loading_address.trim() || null,
            contact_name: data.loading_contact_name.trim() || contact?.name || null,
            contact_phone: data.loading_contact_phone.trim() || contact?.mobile || contact?.phone || null,
            order_index: 0,
          },
          {
            id: nextId("l"),
            project_id: id,
            type: "lossning",
            name: data.unloading_name.trim(),
            address: data.unloading_address.trim() || null,
            contact_name: data.unloading_contact_name.trim() || null,
            contact_phone: data.unloading_contact_phone.trim() || null,
            order_index: 1,
          },
        ],
        cargo_items: cargoItems.map((item) => ({
          id: nextId("g"),
          project_id: id,
          description: item.description.trim(),
          length_m: item.length_m,
          width_m: item.width_m,
          height_m: item.height_m,
          weight_ton: item.weight_ton,
          quantity: item.quantity,
          lift_points: null,
          drawing_reference: null,
          technical_info: "Skapad via kundportalen.",
        })),
        documents: [],
        notes: [
          {
            id: nextId("n"),
            project_id: id,
            date: now,
            user_name: currentCustomerUser.full_name,
            text: "Bokning skapad av kund i kundportalen.",
            category: "Kund",
          },
        ],
        tasks: [],
      };
      setAllProjects((prev) => [newProject, ...prev]);
      return newProject;
    },
    [allContactPersons, allCustomers, currentCustomerUser]
  );

  const approveCustomerBooking: StoreShape["approveCustomerBooking"] = useCallback(
    (projectId, data) => {
      authorize("projects", "edit");
      const now = new Date().toISOString();
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                responsible_id: data.responsible_id,
                status: data.status,
                booking_approval_status: "Godkänd",
                approved_at: now,
                approved_by: currentProfile?.full_name ?? null,
                updated_at: now,
                notes: [
                  {
                    id: nextId("n"),
                    project_id: projectId,
                    date: now,
                    user_name: currentProfile?.full_name ?? "JK",
                    text: "Kundbokningen är godkänd och kan planeras vidare.",
                    category: "Kund",
                  },
                  ...(p.notes ?? []),
                ],
              }
            : p
        )
      );
    },
    [authorize, currentProfile]
  );

  const rejectCustomerBooking: StoreShape["rejectCustomerBooking"] = useCallback(
    (projectId, reason) => {
      authorize("projects", "edit");
      const now = new Date().toISOString();
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                status: "Avbruten",
                booking_approval_status: "Avvisad",
                updated_at: now,
                notes: [
                  {
                    id: nextId("n"),
                    project_id: projectId,
                    date: now,
                    user_name: currentProfile?.full_name ?? "JK",
                    text: reason.trim() ? `Kundbokningen avvisades: ${reason.trim()}` : "Kundbokningen avvisades.",
                    category: "Kund",
                  },
                  ...(p.notes ?? []),
                ],
              }
            : p
        )
      );
    },
    [authorize, currentProfile]
  );

  const updateProjectStatus: StoreShape["updateProjectStatus"] = useCallback(
    (projectId, status) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status, updated_at: new Date().toISOString() } : p))
      );
    },
    [authorize]
  );

  const updateProject: StoreShape["updateProject"] = useCallback(
    (projectId, patch) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p))
      );
    },
    [authorize]
  );

  const updateProjectFinance: StoreShape["updateProjectFinance"] = useCallback(
    (projectId, patch) => {
      if (!currentProfile || currentProfile.status !== "aktiv" || !canEditProjectFinance(role)) {
        throw new Error("Saknar behörighet att redigera faktura-/kostnadsuppgifter.");
      }
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p))
      );
    },
    [currentProfile, role]
  );

  const addNote: StoreShape["addNote"] = useCallback(
    (projectId, note) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, notes: [{ ...note, id: nextId("n"), project_id: projectId }, ...(p.notes ?? [])] }
            : p
        )
      );
    },
    [authorize]
  );

  const addDocument: StoreShape["addDocument"] = useCallback(
    (projectId, doc) => {
      authorize("documents", "create");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, documents: [{ ...doc, id: nextId("d"), project_id: projectId }, ...(p.documents ?? [])] }
            : p
        )
      );
    },
    [authorize]
  );

  const deleteDocument: StoreShape["deleteDocument"] = useCallback(
    (projectId, documentId) => {
      authorize("documents", "delete");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, documents: (p.documents ?? []).filter((d) => d.id !== documentId) } : p
        )
      );
    },
    [authorize]
  );

  const addTask: StoreShape["addTask"] = useCallback(
    (projectId, task) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: [...(p.tasks ?? []), { ...task, id: nextId("t"), project_id: projectId }] }
            : p
        )
      );
    },
    [authorize]
  );

  const updateTask: StoreShape["updateTask"] = useCallback(
    (projectId, taskId, patch) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: (p.tasks ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
            : p
        )
      );
    },
    [authorize]
  );

  const updateTaskStatus: StoreShape["updateTaskStatus"] = useCallback(
    (projectId, taskId, status) => {
      authorize("projects", "edit");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: (p.tasks ?? []).map((t) => (t.id === taskId ? { ...t, status } : t)) }
            : p
        )
      );
    },
    [authorize]
  );

  const getProject = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      return p ? enrich(p) : undefined;
    },
    [projects, enrich]
  );

  const getCustomer = useCallback((id: string) => customers.find((c) => c.id === id), [customers]);
  const getContact = useCallback((id: string) => contactPersons.find((c) => c.id === id), [contactPersons]);
  const getSupplier = useCallback((id: string) => suppliers.find((s) => s.id === id), [suppliers]);

  const getContactsByCustomer = useCallback(
    (customerId: string) => contactPersons.filter((c) => c.customer_id === customerId),
    [contactPersons]
  );

  const getProjectsByCustomer = useCallback(
    (customerId: string) => projects.filter((p) => p.customer_id === customerId).map(enrich),
    [projects, enrich]
  );

  const invitePersonnel: StoreShape["invitePersonnel"] = useCallback(
    (data) => {
      if (!can(role, "users", "create")) return { ok: false, reason: "Du saknar behörighet att bjuda in användare." };
      if (personnel.getByEmail(data.email)) return { ok: false, reason: "Det finns redan en användare med den e-postadressen." };
      const profile = personnel.addProfile({ ...data, org_id: orgId });
      return { ok: true, profile };
    },
    [role, personnel, orgId]
  );

  const updatePersonnel: StoreShape["updatePersonnel"] = useCallback(
    (id, patch) => {
      if (!can(role, "users", "edit")) return { ok: false, reason: "Du saknar behörighet att redigera användare." };
      personnel.updateProfile(id, patch);
      return { ok: true };
    },
    [role, personnel]
  );

  const deactivatePersonnel: StoreShape["deactivatePersonnel"] = useCallback(
    (id) => {
      if (!can(role, "users", "delete")) return { ok: false, reason: "Du saknar behörighet att inaktivera användare." };
      if (id === currentProfile?.id) return { ok: false, reason: "Du kan inte inaktivera ditt eget konto." };
      personnel.deactivateProfile(id);
      return { ok: true };
    },
    [role, personnel, currentProfile]
  );

  const reactivatePersonnel: StoreShape["reactivatePersonnel"] = useCallback(
    (id) => {
      if (!can(role, "users", "edit")) return { ok: false, reason: "Du saknar behörighet att aktivera användare." };
      personnel.reactivateProfile(id);
      return { ok: true };
    },
    [role, personnel]
  );

  const value = useMemo<StoreShape>(
    () => ({
      customers,
      contactPersons,
      projects: projects.map(enrich),
      suppliers,
      profiles,
      currentRole: role,
      freightCalculatorConfig,
      updateFreightCalculatorConfig,
      resetFreightCalculatorConfig,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addContactPerson,
      updateContactPerson,
      deleteContactPerson,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      addProject,
      submitCustomerBooking,
      approveCustomerBooking,
      rejectCustomerBooking,
      updateProjectStatus,
      updateProject,
      updateProjectFinance,
      addNote,
      addDocument,
      deleteDocument,
      addTask,
      updateTask,
      updateTaskStatus,
      getProject,
      getCustomer,
      getContact,
      getSupplier,
      getContactsByCustomer,
      getProjectsByCustomer,
      invitePersonnel,
      updatePersonnel,
      deactivatePersonnel,
      reactivatePersonnel,
    }),
    [
      customers,
      contactPersons,
      projects,
      suppliers,
      profiles,
      role,
      freightCalculatorConfig,
      updateFreightCalculatorConfig,
      resetFreightCalculatorConfig,
      enrich,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addContactPerson,
      updateContactPerson,
      deleteContactPerson,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      addProject,
      submitCustomerBooking,
      approveCustomerBooking,
      rejectCustomerBooking,
      updateProjectStatus,
      updateProject,
      updateProjectFinance,
      addNote,
      addDocument,
      deleteDocument,
      addTask,
      updateTask,
      updateTaskStatus,
      getProject,
      getCustomer,
      getContact,
      getSupplier,
      getContactsByCustomer,
      getProjectsByCustomer,
      invitePersonnel,
      updatePersonnel,
      deactivatePersonnel,
      reactivatePersonnel,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
