import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Customer,
  CustomerUser,
  ContactPerson,
  ContactSubmission,
  ContactSubmissionStatus,
  Profile,
  Project,
  ProjectNote,
  ProjectTask,
  ProjectDocument,
  ProjectPriority,
  ProjectStatus,
  Supplier,
  SupplierBookingDispatch,
  TransportType,
  UserRole,
} from "../types";
import * as mock from "./mockData";
import { useAuth } from "../lib/auth";
import { usePersonnel } from "./personnel";
import { can, canEditProjectFinance, type Action, type Resource } from "../lib/permissions";
import {
  collectFreightCalculatorChanges,
  DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG,
  DEFAULT_FREIGHT_CALCULATOR_CONFIG,
  type FreightCalculatorChangeLogEntry,
  type FreightCalculatorConfig,
} from "../lib/freightCalculator";
import { suggestedTransportTasks } from "../lib/transportRules";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  deleteRow,
  insertProject,
  insertRow,
  loadLiveStoreData,
  saveFreightCalculator,
  updateProjectRecord,
  updateRow,
} from "./supabaseRepository";
import { inviteCustomerAccount, invitePersonnelAccount } from "../lib/userInvitations";
import { calculateProjectPriority, projectHasPriority } from "../lib/projectPriority";
import { sendSupplierBookingRequest, type SupplierBookingSendResult } from "../lib/supplierBookings";
import { notifyTaskAssignee } from "../lib/taskNotifications";

export interface CustomerBookingCargoInput {
  description: string;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  weight_ton: number | null;
  quantity: number | null;
}

export interface CustomerShippingDocumentInput {
  file_name: string;
  file_type: string;
  category: string;
  storage_path: string | null;
  file_url: string | null;
  file_size: number | null;
  comment: string | null;
}

export interface CustomerBookingInput {
  name: string;
  transport_type: TransportType;
  planned_loading_date: string;
  planned_loading_time: string;
  planned_delivery_date: string;
  planned_delivery_time: string;
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
  route_distance_km: number | null;
}

interface StoreShape {
  isLoading: boolean;
  dataError: string | null;
  retryLoading: () => void;
  customers: Customer[];
  contactPersons: ContactPerson[];
  projects: Project[];
  suppliers: Supplier[];
  profiles: Profile[];
  customerUsers: CustomerUser[];
  contactSubmissions: ContactSubmission[];
  currentRole: UserRole | null;
  freightCalculatorConfig: FreightCalculatorConfig;
  freightCalculatorChangeLog: FreightCalculatorChangeLogEntry[];
  updateFreightCalculatorConfig: (next: FreightCalculatorConfig) => FreightCalculatorChangeLogEntry | null;
  resetFreightCalculatorConfig: () => FreightCalculatorChangeLogEntry | null;
  updateContactSubmissionStatus: (id: string, status: ContactSubmissionStatus) => void;
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
  waitForPendingMutations: () => Promise<void>;
  submitCustomerBooking: (data: CustomerBookingInput) => Promise<Project>;
  approveCustomerBooking: (projectId: string, data: { responsible_id: string | null; status: ProjectStatus }) => void;
  rejectCustomerBooking: (projectId: string, reason: string) => void;
  addCustomerShippingDocument: (projectId: string, doc: CustomerShippingDocumentInput) => Promise<void>;
  requestBookingEdit: (projectId: string, message: string) => Promise<void>;
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void;
  updateProjectPriority: (projectId: string, priority: ProjectPriority) => void;
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  deleteProject: (projectId: string) => Promise<void>;
  updateProjectFinance: (projectId: string, patch: Partial<Pick<Project, "price" | "cost" | "invoice_status">>) => void;
  sendSupplierBooking: (projectId: string, supplierIds: string[]) => Promise<SupplierBookingSendResult>;
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
  invitePersonnel: (data: { full_name: string; email: string; role: UserRole }) => Promise<{ ok: boolean; reason?: string; profile?: Profile }>;
  inviteCustomerUser: (data: { customer_id: string; contact_person_id: string | null; full_name: string; email: string }) => Promise<{ ok: boolean; reason?: string; user?: CustomerUser }>;
  updatePersonnel: (id: string, patch: Partial<Pick<Profile, "full_name" | "email" | "role">>) => { ok: boolean; reason?: string };
  deactivatePersonnel: (id: string) => { ok: boolean; reason?: string };
  reactivatePersonnel: (id: string) => { ok: boolean; reason?: string };
}

const StoreContext = createContext<StoreShape | null>(null);
const PROJECTS_STORAGE_KEY = "jk-mock-projects";
const FREIGHT_CALCULATOR_STORAGE_KEY = "jk-freight-calculator-config";
const FREIGHT_CALCULATOR_CHANGE_LOG_STORAGE_KEY = "jk-freight-calculator-change-log";

let idCounter = 2000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function newId(prefix: string) {
  return isSupabaseConfigured ? crypto.randomUUID() : nextId(prefix);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function loadFreightCalculatorChangeLog(): FreightCalculatorChangeLogEntry[] {
  if (typeof window === "undefined") return DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG;
  const stored = window.localStorage.getItem(FREIGHT_CALCULATOR_CHANGE_LOG_STORAGE_KEY);
  if (!stored) return DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG;
    const storedIds = new Set(parsed.map((entry: FreightCalculatorChangeLogEntry) => entry.id));
    return [...parsed, ...DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG.filter((entry) => !storedIds.has(entry.id))];
  } catch {
    return DEFAULT_FREIGHT_CALCULATOR_CHANGE_LOG;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { currentProfile, currentCustomerUser } = useAuth();
  const personnel = usePersonnel();
  const currentProfileId = currentProfile?.id ?? null;
  const currentCustomerUserId = currentCustomerUser?.id ?? null;
  const orgId = currentProfile?.org_id ?? currentCustomerUser?.org_id ?? "";
  const role = currentProfile?.role ?? null;

  const [allCustomers, setAllCustomers] = useState<Customer[]>(isSupabaseConfigured ? [] : mock.customers);
  const [allContactPersons, setAllContactPersons] = useState<ContactPerson[]>(isSupabaseConfigured ? [] : mock.contactPersons);
  const [allProjects, setAllProjects] = useState<Project[]>(isSupabaseConfigured ? [] : loadProjects);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>(isSupabaseConfigured ? [] : mock.suppliers);
  const [allProfiles, setAllProfiles] = useState<Profile[]>(isSupabaseConfigured ? [] : personnel.allProfiles);
  const [allCustomerUsers, setAllCustomerUsers] = useState<CustomerUser[]>(isSupabaseConfigured ? [] : mock.customerUsers);
  const [contactSubmissions, setContactSubmissions] = useState<ContactSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const mutationError = useRef<unknown>(null);
  const [freightCalculatorConfig, setFreightCalculatorConfig] = useState<FreightCalculatorConfig>(
    isSupabaseConfigured ? DEFAULT_FREIGHT_CALCULATOR_CONFIG : loadFreightCalculatorConfig
  );
  const [freightCalculatorChangeLog, setFreightCalculatorChangeLog] =
    useState<FreightCalculatorChangeLogEntry[]>(isSupabaseConfigured ? [] : loadFreightCalculatorChangeLog);

  const retryLoading = useCallback(() => setLoadVersion((version) => version + 1), []);

  const persist = useCallback((operation: () => Promise<void>) => {
    if (!isSupabaseConfigured) return;
    mutationQueue.current = mutationQueue.current
      .then(operation)
      .catch((error) => {
        console.error(error);
        mutationError.current = error;
        setDataError(error instanceof Error ? error.message : "Ändringen kunde inte sparas i databasen.");
      });
  }, []);

  const waitForPendingMutations = useCallback(async () => {
    await mutationQueue.current;
    if (mutationError.current) {
      const error = mutationError.current;
      mutationError.current = null;
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || (!currentProfileId && !currentCustomerUserId)) return;
    let active = true;
    setIsLoading(true);
    setDataError(null);
    loadLiveStoreData()
      .then((data) => {
        if (!active) return;
        setAllCustomers(data.customers);
        setAllContactPersons(data.contactPersons);
        setAllProjects(data.projects);
        setAllSuppliers(data.suppliers);
        setAllProfiles(data.profiles);
        setAllCustomerUsers(data.customerUsers);
        setContactSubmissions(data.contactSubmissions);
        setFreightCalculatorConfig(data.freightCalculatorConfig ?? DEFAULT_FREIGHT_CALCULATOR_CONFIG);
        setFreightCalculatorChangeLog(data.freightCalculatorChangeLog);
      })
      .catch((error) => {
        if (active) setDataError(error instanceof Error ? error.message : "Kunde inte läsa data från databasen.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentCustomerUserId, currentProfileId, loadVersion]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(allProjects));
  }, [allProjects]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    window.localStorage.setItem(FREIGHT_CALCULATOR_STORAGE_KEY, JSON.stringify(freightCalculatorConfig));
  }, [freightCalculatorConfig]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    window.localStorage.setItem(FREIGHT_CALCULATOR_CHANGE_LOG_STORAGE_KEY, JSON.stringify(freightCalculatorChangeLog));
  }, [freightCalculatorChangeLog]);

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
      const changes = collectFreightCalculatorChanges(freightCalculatorConfig, next);
      setFreightCalculatorConfig(next);
      if (changes.length === 0) return null;
      const entry: FreightCalculatorChangeLogEntry = {
        id: newId("calc-log"),
        changedAt: new Date().toISOString(),
        changedBy: currentProfile?.full_name ?? "JK",
        source: "app",
        summary: `${changes.length} värde${changes.length === 1 ? "" : "n"} ändrade i räknesnurran.`,
        changes,
      };
      setFreightCalculatorChangeLog((prev) => [entry, ...prev]);
      if (currentProfile) persist(() => saveFreightCalculator(next, entry, orgId, currentProfile.id));
      return entry;
    },
    [authorize, currentProfile, freightCalculatorConfig, orgId, persist]
  );

  const resetFreightCalculatorConfig: StoreShape["resetFreightCalculatorConfig"] = useCallback(() => {
    authorize("settings", "edit");
    const changes = collectFreightCalculatorChanges(freightCalculatorConfig, DEFAULT_FREIGHT_CALCULATOR_CONFIG);
    setFreightCalculatorConfig(DEFAULT_FREIGHT_CALCULATOR_CONFIG);
    if (changes.length === 0) return null;
    const entry: FreightCalculatorChangeLogEntry = {
      id: newId("calc-log"),
      changedAt: new Date().toISOString(),
      changedBy: currentProfile?.full_name ?? "JK",
      source: "app",
      summary: `Återställde räknesnurran till standardvärden från Excel v9. ${changes.length} värde${
        changes.length === 1 ? "" : "n"
      } ändrades.`,
      changes,
    };
    setFreightCalculatorChangeLog((prev) => [entry, ...prev]);
    if (currentProfile) persist(() => saveFreightCalculator(DEFAULT_FREIGHT_CALCULATOR_CONFIG, entry, orgId, currentProfile.id));
    return entry;
  }, [authorize, currentProfile, freightCalculatorConfig, orgId, persist]);

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
  const profiles = useMemo(() => allProfiles.filter((p) => p.org_id === orgId), [allProfiles, orgId]);
  const customerUsers = useMemo(() => allCustomerUsers.filter((user) => user.org_id === orgId), [allCustomerUsers, orgId]);

  const updateContactSubmissionStatus = useCallback(
    (id: string, status: ContactSubmissionStatus) => {
      authorize("inquiries", "edit");
      setContactSubmissions((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
      persist(() => updateRow("contact_submissions", id, { status }, "förfrågan"));
    },
    [authorize, persist]
  );

  const enrich = useCallback(
    (p: Project): Project => ({
      ...p,
      customer: allCustomers.find((c) => c.id === p.customer_id),
      contact_person: allContactPersons.find((c) => c.id === p.contact_person_id) ?? null,
      responsible: allProfiles.find((profile) => profile.id === p.responsible_id) ?? null,
      supplier: allSuppliers.find((s) => s.id === p.supplier_id) ?? null,
      supplier_ids: p.supplier_ids ?? (p.supplier_id ? [p.supplier_id] : []),
      suppliers: (p.supplier_ids ?? (p.supplier_id ? [p.supplier_id] : []))
        .map((id) => allSuppliers.find((supplier) => supplier.id === id))
        .filter((supplier): supplier is Supplier => Boolean(supplier)),
      supplier_booking_dispatches: (p.supplier_booking_dispatches ?? []).map((dispatch) => ({
        ...dispatch,
        supplier: allSuppliers.find((supplier) => supplier.id === dispatch.supplier_id),
      })),
      measurement_link: isSupabaseConfigured ? p.measurement_link ?? null : mock.getMeasurementLinkByProject(p.id) ?? null,
    }),
    [allCustomers, allContactPersons, allProfiles, allSuppliers]
  );

  const addCustomer: StoreShape["addCustomer"] = useCallback(
    (c) => {
      authorize("customers", "create");
      const now = new Date().toISOString();
      const newCustomer: Customer = { ...c, id: newId("c"), org_id: orgId, created_at: now, updated_at: now };
      setAllCustomers((prev) => [newCustomer, ...prev]);
      persist(() => insertRow("customers", newCustomer, "kunden"));
      return newCustomer;
    },
    [authorize, orgId, persist]
  );

  const updateCustomer: StoreShape["updateCustomer"] = useCallback(
    (id, patch) => {
      authorize("customers", "edit");
      setAllCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c))
      );
      persist(() => updateRow("customers", id, patch, "kunden"));
    },
    [authorize, persist]
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
      persist(() => deleteRow("customers", id, "kunden"));
      return { ok: true };
    },
    [role, allProjects, persist]
  );

  const addContactPerson: StoreShape["addContactPerson"] = useCallback(
    (c) => {
      authorize("contacts", "create");
      const newContact: ContactPerson = { ...c, id: newId("p"), created_at: new Date().toISOString() };
      setAllContactPersons((prev) => [newContact, ...prev]);
      persist(() => insertRow("contact_persons", newContact, "kontaktpersonen"));
      return newContact;
    },
    [authorize, persist]
  );

  const updateContactPerson: StoreShape["updateContactPerson"] = useCallback(
    (id, patch) => {
      authorize("contacts", "edit");
      setAllContactPersons((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      persist(() => updateRow("contact_persons", id, patch, "kontaktpersonen"));
    },
    [authorize, persist]
  );

  const deleteContactPerson: StoreShape["deleteContactPerson"] = useCallback(
    (id) => {
      authorize("contacts", "delete");
      setAllContactPersons((prev) => prev.filter((c) => c.id !== id));
      setAllProjects((prev) => prev.map((p) => (p.contact_person_id === id ? { ...p, contact_person_id: null } : p)));
      persist(() => deleteRow("contact_persons", id, "kontaktpersonen"));
    },
    [authorize, persist]
  );

  const addSupplier: StoreShape["addSupplier"] = useCallback(
    (s) => {
      authorize("suppliers", "create");
      const newSupplier: Supplier = { ...s, id: newId("s"), org_id: orgId, created_at: new Date().toISOString() };
      setAllSuppliers((prev) => [newSupplier, ...prev]);
      persist(() => insertRow("suppliers", newSupplier, "leverantören"));
      return newSupplier;
    },
    [authorize, orgId, persist]
  );

  const updateSupplier: StoreShape["updateSupplier"] = useCallback(
    (id, patch) => {
      authorize("suppliers", "edit");
      setAllSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      persist(() => updateRow("suppliers", id, patch, "leverantören"));
    },
    [authorize, persist]
  );

  const deleteSupplier: StoreShape["deleteSupplier"] = useCallback(
    (id) => {
      if (!can(role, "suppliers", "delete")) return { ok: false, reason: "Du saknar behörighet att radera leverantörer." };
      const linkedProjects = allProjects.filter((p) => p.supplier_id === id || p.supplier_ids?.includes(id));
      if (linkedProjects.length > 0) {
        return { ok: false, reason: `Leverantören har ${linkedProjects.length} kopplade projekt och kan inte raderas.` };
      }
      setAllSuppliers((prev) => prev.filter((s) => s.id !== id));
      persist(() => deleteRow("suppliers", id, "leverantören"));
      return { ok: true };
    },
    [role, allProjects, persist]
  );

  const addProject: StoreShape["addProject"] = useCallback(
    (p) => {
      authorize("projects", "create");
      const now = new Date().toISOString();
      const projectId = newId("pr");
      const withProjectId = <T extends { id: string; project_id: string }>(row: T, prefix: string): T => ({
        ...row,
        id: isSupabaseConfigured && !isUuid(row.id) ? newId(prefix) : row.id,
        project_id: projectId,
      });
      const newProject: Project = {
        ...p,
        priority: p.priority ?? calculateProjectPriority(p.planned_loading_date),
        priority_is_manual: p.priority_is_manual ?? false,
        booking_source: p.booking_source ?? "internal",
        booking_approval_status: p.booking_approval_status ?? null,
        requested_by_customer_user_id: p.requested_by_customer_user_id ?? null,
        id: projectId,
        org_id: orgId,
        created_at: now,
        updated_at: now,
        locations: (p.locations ?? []).map((row) => withProjectId(row, "l")),
        cargo_items: (p.cargo_items ?? []).map((row) => withProjectId(row, "g")),
        documents: (p.documents ?? []).map((row) => withProjectId(row, "d")),
        notes: (p.notes ?? []).map((row) => withProjectId(row, "n")),
        tasks: (p.tasks ?? []).map((row) => withProjectId(row, "t")),
      };
      setAllProjects((prev) => [newProject, ...prev]);
      persist(() => insertProject(newProject));
      return newProject;
    },
    [authorize, orgId, persist]
  );

  const submitCustomerBooking: StoreShape["submitCustomerBooking"] = useCallback(
    async (data) => {
      if (!currentCustomerUser || currentCustomerUser.status !== "aktiv") {
        throw new Error("Kundkontot är inte aktivt.");
      }
      const now = new Date().toISOString();
      let id = newId("pr");
      const customer = allCustomers.find((c) => c.id === currentCustomerUser.customer_id);
      const contact = allContactPersons.find((c) => c.id === currentCustomerUser.contact_person_id);
      const projectName =
        data.name.trim() ||
        `${customer?.company_name ?? "Kund"} – Bokningsförfrågan ${data.loading_name || "lastning"} till ${data.unloading_name || "lossning"}`;
      const cargoItems = data.cargo_items.filter((item) => item.description.trim());
      const suggestedTasks = suggestedTransportTasks(cargoItems);
      const newProject: Project = {
        id,
        org_id: currentCustomerUser.org_id,
        project_number: `WEB-${new Date().getFullYear()}-${id.replace(/\D/g, "").slice(0, 8).padStart(4, "0")}`,
        name: projectName,
        customer_id: currentCustomerUser.customer_id,
        contact_person_id: currentCustomerUser.contact_person_id,
        responsible_id: null,
        status: "Ny bokning",
        priority: calculateProjectPriority(data.planned_loading_date),
        priority_is_manual: false,
        transport_type: data.transport_type,
        special_requirements: data.special_requirements.trim() || null,
        planned_loading_date: data.planned_loading_date || null,
        planned_loading_time: data.planned_loading_time || null,
        planned_delivery_date: data.planned_delivery_date || null,
        planned_delivery_time: data.planned_delivery_time || null,
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
        route_distance_km: data.route_distance_km,
        created_at: now,
        updated_at: now,
        locations: [
          {
            id: newId("l"),
            project_id: id,
            type: "lastning",
            name: data.loading_name.trim(),
            address: data.loading_address.trim() || null,
            contact_name: data.loading_contact_name.trim() || contact?.name || null,
            contact_phone: data.loading_contact_phone.trim() || contact?.mobile || contact?.phone || null,
            order_index: 0,
          },
          {
            id: newId("l"),
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
          id: newId("g"),
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
            id: newId("n"),
            project_id: id,
            date: now,
            user_name: currentCustomerUser.full_name,
            text: "Bokning skapad av kund i kundportalen.",
            category: "Kund",
            visibility: "internal",
          },
        ],
        tasks: suggestedTasks.map((task) => ({
          ...task,
          id: newId("t"),
          project_id: id,
          route_section: null,
          assignee_id: null,
          assignee: null,
          deadline: null,
          status: "Ej påbörjad",
          comment: null,
        })),
      };
      if (isSupabaseConfigured) {
        if (!supabase) throw new Error("Databasen är inte tillgänglig.");
        const { data: created, error } = await supabase.rpc("submit_customer_booking", {
          p_booking: {
            ...data,
            name: projectName,
            locations: newProject.locations,
            cargo_items: cargoItems,
            suggested_tasks: suggestedTasks,
          },
        });
        if (error) throw new Error(`Bokningen kunde inte sparas: ${error.message}`);
        const createdRow = created as Project;
        id = createdRow.id;
        Object.assign(newProject, createdRow, {
          locations: newProject.locations?.map((row) => ({ ...row, project_id: id })),
          cargo_items: newProject.cargo_items?.map((row) => ({ ...row, project_id: id })),
          notes: newProject.notes?.map((row) => ({ ...row, project_id: id })),
          tasks: newProject.tasks?.map((row) => ({ ...row, project_id: id })),
        });
      }
      setAllProjects((prev) => [newProject, ...prev]);
      return newProject;
    },
    [allContactPersons, allCustomers, currentCustomerUser]
  );

  const approveCustomerBooking: StoreShape["approveCustomerBooking"] = useCallback(
    (projectId, data) => {
      authorize("projects", "edit");
      const now = new Date().toISOString();
      const current = allProjects.find((project) => project.id === projectId);
      const updated = current ? {
        ...current,
        responsible_id: data.responsible_id,
        status: data.status,
        booking_approval_status: "Godkänd" as const,
        approved_at: now,
        approved_by: currentProfile?.full_name ?? null,
        updated_at: now,
        notes: [{ id: newId("n"), project_id: projectId, date: now, user_name: currentProfile?.full_name ?? "JK", text: "Kundbokningen är godkänd och kan planeras vidare.", category: "Kund" as const, visibility: "internal" as const }, ...(current.notes ?? [])],
      } : null;
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
                    id: newId("n"),
                    project_id: projectId,
                    date: now,
                    user_name: currentProfile?.full_name ?? "JK",
                    text: "Kundbokningen är godkänd och kan planeras vidare.",
                    category: "Kund",
                    visibility: "internal",
                  },
                  ...(p.notes ?? []),
                ],
              }
            : p
        )
      );
      if (updated) persist(() => updateProjectRecord(updated));
    },
    [allProjects, authorize, currentProfile, persist]
  );

  const rejectCustomerBooking: StoreShape["rejectCustomerBooking"] = useCallback(
    (projectId, reason) => {
      authorize("projects", "edit");
      const now = new Date().toISOString();
      const current = allProjects.find((project) => project.id === projectId);
      const note: ProjectNote = {
        id: newId("n"), project_id: projectId, date: now, user_name: currentProfile?.full_name ?? "JK",
        text: reason.trim() ? `Kundbokningen avvisades: ${reason.trim()}` : "Kundbokningen avvisades.",
        category: "Kund", visibility: "internal",
      };
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                status: "Avbokad",
                booking_approval_status: "Avvisad",
                updated_at: now,
                notes: [
                  {
                    id: note.id,
                    project_id: projectId,
                    date: now,
                    user_name: currentProfile?.full_name ?? "JK",
                    text: reason.trim() ? `Kundbokningen avvisades: ${reason.trim()}` : "Kundbokningen avvisades.",
                    category: "Kund",
                    visibility: "internal",
                  },
                  ...(p.notes ?? []),
                ],
              }
            : p
        )
      );
      if (current) persist(() => updateProjectRecord({ ...current, status: "Avbokad", booking_approval_status: "Avvisad", updated_at: now, notes: [note, ...(current.notes ?? [])] }));
    },
    [allProjects, authorize, currentProfile, persist]
  );

  const addCustomerShippingDocument: StoreShape["addCustomerShippingDocument"] = useCallback(
    async (projectId, doc) => {
      if (!currentCustomerUser || currentCustomerUser.status !== "aktiv") {
        throw new Error("Kundkontot är inte aktivt.");
      }
      const now = new Date().toISOString();
      let created: ProjectDocument = {
        ...doc,
        category: doc.category as ProjectDocument["category"],
        id: newId("d"),
        project_id: projectId,
        uploaded_at: now,
        uploaded_by: currentCustomerUser.full_name,
        visibility: "customer",
      };
      if (isSupabaseConfigured) {
        if (!supabase) throw new Error("Databasen är inte tillgänglig.");
        const { data, error } = await supabase.rpc("customer_add_shipping_document", {
          p_project_id: projectId,
          p_document: doc,
        });
        if (error) throw new Error(`Dokumentet kunde inte sparas: ${error.message}`);
        created = { ...created, ...(data as ProjectDocument) };
      }
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, documents: [created, ...(p.documents ?? [])] } : p))
      );
    },
    [currentCustomerUser]
  );

  const requestBookingEdit: StoreShape["requestBookingEdit"] = useCallback(
    async (projectId, message) => {
      if (!currentCustomerUser || currentCustomerUser.status !== "aktiv") {
        throw new Error("Kundkontot är inte aktivt.");
      }
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Beskriv vad som ska ändras.");
      const now = new Date().toISOString();
      if (isSupabaseConfigured) {
        if (!supabase) throw new Error("Databasen är inte tillgänglig.");
        const { error } = await supabase.rpc("customer_request_booking_edit", {
          p_project_id: projectId,
          p_message: trimmed,
        });
        if (error) throw new Error(`Ändringsbegäran kunde inte skickas: ${error.message}`);
      }
      const note: ProjectNote = {
        id: newId("n"),
        project_id: projectId,
        date: now,
        user_name: currentCustomerUser.full_name,
        text: `Kund begär ändring: ${trimmed}`,
        category: "Kund",
        visibility: "internal",
      };
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, edit_requested_at: now, edit_request_message: trimmed, notes: [note, ...(p.notes ?? [])] }
            : p
        )
      );
    },
    [currentCustomerUser]
  );

  const updateProjectStatus: StoreShape["updateProjectStatus"] = useCallback(
    (projectId, status) => {
      authorize("projects", "edit");
      const current = allProjects.find((project) => project.id === projectId);
      const patch: Partial<Project> = projectHasPriority(status)
        ? {
            status,
            ...(current?.priority === null
              ? {
                  priority: calculateProjectPriority(current.planned_loading_date),
                  priority_is_manual: false,
                }
              : {}),
          }
        : { status, priority: null, priority_is_manual: false };
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p))
      );
      persist(() => updateRow("projects", projectId, patch, "projektstatusen"));
    },
    [allProjects, authorize, persist]
  );

  const updateProjectPriority: StoreShape["updateProjectPriority"] = useCallback(
    (projectId, priority) => {
      authorize("projects", "edit");
      const patch = { priority, priority_is_manual: true };
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...patch, updated_at: new Date().toISOString() } : p))
      );
      persist(() => updateRow("projects", projectId, patch, "projektprioriteringen"));
    },
    [authorize, persist]
  );

  const updateProject: StoreShape["updateProject"] = useCallback(
    (projectId, patch) => {
      authorize("projects", "edit");
      const current = allProjects.find((project) => project.id === projectId);
      const normalizeChildren = <T extends { id: string; project_id: string }>(rows: T[] | undefined, prefix: string) =>
        rows?.map((row) => ({ ...row, id: isSupabaseConfigured && !isUuid(row.id) ? newId(prefix) : row.id, project_id: projectId }));
      const normalizedPatch: Partial<Project> = {
        ...patch,
        ...(patch.planned_loading_date !== undefined && !current?.priority_is_manual
          ? {
              priority: calculateProjectPriority(patch.planned_loading_date),
              priority_is_manual: false,
            }
          : {}),
        ...(patch.locations ? { locations: normalizeChildren(patch.locations, "l") } : {}),
        ...(patch.cargo_items ? { cargo_items: normalizeChildren(patch.cargo_items, "g") } : {}),
        ...(patch.documents ? { documents: normalizeChildren(patch.documents, "d") } : {}),
        ...(patch.notes ? { notes: normalizeChildren(patch.notes, "n") } : {}),
        ...(patch.tasks ? { tasks: normalizeChildren(patch.tasks, "t") } : {}),
      };
      const updated = current ? { ...current, ...normalizedPatch, updated_at: new Date().toISOString() } : null;
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, ...normalizedPatch, updated_at: new Date().toISOString() } : p))
      );
      if (updated) persist(() => updateProjectRecord(updated));
    },
    [allProjects, authorize, persist]
  );

  const deleteProject: StoreShape["deleteProject"] = useCallback(
    async (projectId) => {
      authorize("projects", "delete");
      if (isSupabaseConfigured) await deleteRow("projects", projectId, "projektet");
      setAllProjects((previous) => previous.filter((project) => project.id !== projectId));
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
      if (isSupabaseConfigured && supabase) {
        const db = supabase;
        persist(async () => {
          const current = allProjects.find((project) => project.id === projectId);
          const { error } = await db.rpc("update_project_finance", {
            p_project_id: projectId,
            p_price: patch.price ?? current?.price ?? null,
            p_cost: patch.cost ?? current?.cost ?? null,
            p_invoice_status: patch.invoice_status ?? current?.invoice_status ?? "Ej fakturerad",
          });
          if (error) throw new Error(`Kunde inte uppdatera ekonomin: ${error.message}`);
        });
      }
    },
    [allProjects, currentProfile, persist, role]
  );

  const sendSupplierBooking: StoreShape["sendSupplierBooking"] = useCallback(
    async (projectId, supplierIds) => {
      authorize("projects", "edit");
      if (supplierIds.length === 0) throw new Error("Välj minst en leverantör.");
      let result: SupplierBookingSendResult;
      if (isSupabaseConfigured) {
        result = await sendSupplierBookingRequest(projectId, supplierIds);
      } else {
        const project = allProjects.find((item) => item.id === projectId);
        const now = new Date().toISOString();
        const dispatches: SupplierBookingDispatch[] = supplierIds.map((supplierId) => {
          const supplier = allSuppliers.find((item) => item.id === supplierId);
          return {
            id: newId("sb"), org_id: orgId, project_id: projectId, supplier_id: supplierId,
            recipient_email: supplier?.email ?? "", recipient_name: supplier?.contact_person ?? supplier?.company_name ?? null,
            sent_at: now, sent_by: currentProfile?.id ?? null, sent_by_name: currentProfile?.full_name ?? "JK",
            subject: `Bokning ${project?.project_number ?? ""}`, status: "sent", external_message_id: null, error_message: null,
          };
        });
        result = { ok: true, dispatches, message: "Bokningen skickades." };
      }
      setAllProjects((previous) => previous.map((item) => item.id === projectId ? {
        ...item,
        supplier_id: supplierIds[0] ?? null,
        supplier_ids: supplierIds,
        supplier_booking_dispatches: [...result.dispatches, ...(item.supplier_booking_dispatches ?? [])],
        updated_at: new Date().toISOString(),
      } : item));
      return result;
    },
    [allProjects, allSuppliers, authorize, currentProfile, orgId]
  );

  const addNote: StoreShape["addNote"] = useCallback(
    (projectId, note) => {
      authorize("projects", "edit");
      const created = { ...note, id: newId("n"), project_id: projectId };
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, notes: [created, ...(p.notes ?? [])] }
            : p
        )
      );
      persist(() => insertRow("notes", { ...created, user_id: null }, "kommentaren"));
    },
    [authorize, persist]
  );

  const addDocument: StoreShape["addDocument"] = useCallback(
    (projectId, doc) => {
      authorize("documents", "create");
      const created = { ...doc, id: newId("d"), project_id: projectId };
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, documents: [created, ...(p.documents ?? [])] }
            : p
        )
      );
      persist(() => insertRow("documents", {
        ...created,
        uploaded_by: currentProfile?.id ?? null,
        uploaded_by_name: created.uploaded_by,
      }, "dokumentet"));
    },
    [authorize, currentProfile, persist]
  );

  const deleteDocument: StoreShape["deleteDocument"] = useCallback(
    (projectId, documentId) => {
      authorize("documents", "delete");
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, documents: (p.documents ?? []).filter((d) => d.id !== documentId) } : p
        )
      );
      persist(() => deleteRow("documents", documentId, "dokumentet"));
    },
    [authorize, persist]
  );

  const addTask: StoreShape["addTask"] = useCallback(
    (projectId, task) => {
      authorize("projects", "edit");
      const created = { ...task, id: newId("t"), project_id: projectId };
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: [...(p.tasks ?? []), created] }
            : p
        )
      );
      persist(async () => {
        await insertRow("tasks", created, "uppgiften");
        if (created.assignee_id) await notifyTaskAssignee(created.id);
      });
    },
    [authorize, persist]
  );

  const updateTask: StoreShape["updateTask"] = useCallback(
    (projectId, taskId, patch) => {
      authorize("projects", "edit");
      const currentTask = allProjects.find((project) => project.id === projectId)?.tasks?.find((task) => task.id === taskId);
      const assigneeChanged = patch.assignee_id !== undefined && patch.assignee_id !== currentTask?.assignee_id;
      setAllProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, tasks: (p.tasks ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
            : p
        )
      );
      persist(async () => {
        await updateRow("tasks", taskId, patch, "uppgiften");
        if (assigneeChanged && patch.assignee_id) await notifyTaskAssignee(taskId);
      });
    },
    [allProjects, authorize, persist]
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
      persist(() => updateRow("tasks", taskId, { status }, "uppgiften"));
    },
    [authorize, persist]
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
    async (data) => {
      if (!can(role, "users", "create")) return { ok: false, reason: "Du saknar behörighet att bjuda in användare." };
      if (isSupabaseConfigured) {
        const result = await invitePersonnelAccount(data);
        if (!result.ok) return result;
        setAllProfiles((prev) => [result.user, ...prev]);
        return { ok: true, profile: result.user };
      }
      if (allProfiles.some((profile) => profile.email.toLowerCase() === data.email.toLowerCase())) return { ok: false, reason: "Det finns redan en användare med den e-postadressen." };
      const profile = personnel.addProfile({ ...data, org_id: orgId });
      setAllProfiles((prev) => [profile, ...prev]);
      return { ok: true, profile };
    },
    [allProfiles, role, personnel, orgId]
  );

  const inviteCustomerUser: StoreShape["inviteCustomerUser"] = useCallback(
    async (data) => {
      if (!can(role, "users", "create")) return { ok: false, reason: "Du saknar behörighet att bjuda in kundanvändare." };
      if (isSupabaseConfigured) {
        const result = await inviteCustomerAccount(data);
        if (!result.ok) return result;
        setAllCustomerUsers((prev) => [result.user, ...prev]);
        return { ok: true, user: result.user };
      }
      if (allCustomerUsers.some((user) => user.email.toLowerCase() === data.email.toLowerCase())) {
        return { ok: false, reason: "Det finns redan en användare med den e-postadressen." };
      }
      const now = new Date().toISOString();
      const user: CustomerUser = {
        id: nextId("cu"),
        org_id: orgId,
        ...data,
        status: "inbjuden",
        initials: data.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""),
        invited_at: now,
      };
      setAllCustomerUsers((prev) => [user, ...prev]);
      return { ok: true, user };
    },
    [allCustomerUsers, orgId, role]
  );

  const updatePersonnel: StoreShape["updatePersonnel"] = useCallback(
    (id, patch) => {
      if (!can(role, "users", "edit")) return { ok: false, reason: "Du saknar behörighet att redigera användare." };
      if (isSupabaseConfigured) {
        setAllProfiles((prev) => prev.map((profile) => profile.id === id ? { ...profile, ...patch } : profile));
        persist(() => updateRow("profiles", id, patch, "användaren"));
      } else {
        personnel.updateProfile(id, patch);
      }
      return { ok: true };
    },
    [role, personnel, persist]
  );

  const deactivatePersonnel: StoreShape["deactivatePersonnel"] = useCallback(
    (id) => {
      if (!can(role, "users", "delete")) return { ok: false, reason: "Du saknar behörighet att inaktivera användare." };
      if (id === currentProfile?.id) return { ok: false, reason: "Du kan inte inaktivera ditt eget konto." };
      if (isSupabaseConfigured) {
        setAllProfiles((prev) => prev.map((profile) => profile.id === id ? { ...profile, status: "inaktiverad" } : profile));
        persist(() => updateRow("profiles", id, { status: "inaktiverad" }, "användaren"));
      } else {
        personnel.deactivateProfile(id);
      }
      return { ok: true };
    },
    [role, personnel, currentProfile, persist]
  );

  const reactivatePersonnel: StoreShape["reactivatePersonnel"] = useCallback(
    (id) => {
      if (!can(role, "users", "edit")) return { ok: false, reason: "Du saknar behörighet att aktivera användare." };
      if (isSupabaseConfigured) {
        setAllProfiles((prev) => prev.map((profile) => profile.id === id ? { ...profile, status: "aktiv" } : profile));
        persist(() => updateRow("profiles", id, { status: "aktiv" }, "användaren"));
      } else {
        personnel.reactivateProfile(id);
      }
      return { ok: true };
    },
    [role, personnel, persist]
  );

  const value = useMemo<StoreShape>(
    () => ({
      isLoading,
      dataError,
      retryLoading,
      customers,
      contactPersons,
      projects: projects.map(enrich),
      suppliers,
      profiles,
      customerUsers,
      contactSubmissions,
      currentRole: role,
      freightCalculatorConfig,
      freightCalculatorChangeLog,
      updateFreightCalculatorConfig,
      resetFreightCalculatorConfig,
      updateContactSubmissionStatus,
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
      waitForPendingMutations,
      submitCustomerBooking,
      approveCustomerBooking,
      rejectCustomerBooking,
      addCustomerShippingDocument,
      requestBookingEdit,
      updateProjectStatus,
      updateProjectPriority,
      updateProject,
      deleteProject,
      updateProjectFinance,
      sendSupplierBooking,
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
      inviteCustomerUser,
      updatePersonnel,
      deactivatePersonnel,
      reactivatePersonnel,
    }),
    [
      customers,
      isLoading,
      dataError,
      retryLoading,
      contactPersons,
      projects,
      suppliers,
      profiles,
      customerUsers,
      contactSubmissions,
      role,
      freightCalculatorConfig,
      freightCalculatorChangeLog,
      updateFreightCalculatorConfig,
      resetFreightCalculatorConfig,
      updateContactSubmissionStatus,
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
      waitForPendingMutations,
      submitCustomerBooking,
      approveCustomerBooking,
      rejectCustomerBooking,
      addCustomerShippingDocument,
      requestBookingEdit,
      updateProjectStatus,
      updateProjectPriority,
      updateProject,
      deleteProject,
      updateProjectFinance,
      sendSupplierBooking,
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
      inviteCustomerUser,
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
