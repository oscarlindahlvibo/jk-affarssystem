import type { UserRole } from "../types";

export type Resource = "customers" | "contacts" | "suppliers" | "projects" | "documents" | "users" | "settings";
export type Action = "view" | "create" | "edit" | "delete";

const ALL: Action[] = ["view", "create", "edit", "delete"];
const VIEW_ONLY: Action[] = ["view"];
const MANAGE: Action[] = ["view", "create", "edit", "delete"];

// Behörighetsmatris enligt spec: Admin (allt) / Projektledare (hantera drift, inte
// användare/inställningar) / Ekonomi (läsa + hantera fakturering) / Läsare (bara läsa).
const MATRIX: Record<UserRole, Partial<Record<Resource, Action[]>>> = {
  admin: {
    customers: ALL,
    contacts: ALL,
    suppliers: ALL,
    projects: ALL,
    documents: ALL,
    users: ALL,
    settings: ALL,
  },
  projektledare: {
    customers: MANAGE,
    contacts: MANAGE,
    suppliers: MANAGE,
    projects: MANAGE,
    documents: MANAGE,
  },
  ekonomi: {
    customers: VIEW_ONLY,
    contacts: VIEW_ONLY,
    suppliers: VIEW_ONLY,
    projects: VIEW_ONLY,
    documents: VIEW_ONLY,
  },
  lasare: {
    customers: VIEW_ONLY,
    contacts: VIEW_ONLY,
    suppliers: VIEW_ONLY,
    projects: VIEW_ONLY,
    documents: VIEW_ONLY,
  },
};

export function can(role: UserRole | undefined | null, resource: Resource, action: Action): boolean {
  if (!role) return false;
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

// Ekonomi får utöver läsrättigheter redigera de faktura-/kostnadsrelaterade fälten
// på projekt (pris, kostnad, faktureringsstatus) trots att projects annars är read-only för rollen.
export function canEditProjectFinance(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "projektledare" || role === "ekonomi";
}

export function isAdmin(role: UserRole | undefined | null): boolean {
  return role === "admin";
}
