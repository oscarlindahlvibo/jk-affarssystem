import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Profile, UserRole } from "../types";
import { profiles as seedProfiles, organizations } from "./mockData";

interface PersonnelShape {
  allProfiles: Profile[];
  organizations: typeof organizations;
  getByEmail: (email: string) => Profile | undefined;
  getById: (id: string) => Profile | undefined;
  addProfile: (p: { org_id: string; full_name: string; email: string; role: UserRole }) => Profile;
  updateProfile: (id: string, patch: Partial<Pick<Profile, "full_name" | "email" | "role">>) => void;
  deactivateProfile: (id: string) => void;
  reactivateProfile: (id: string) => void;
}

const PersonnelContext = createContext<PersonnelShape | null>(null);

let personnelIdCounter = 100;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

export function PersonnelProvider({ children }: { children: ReactNode }) {
  const [allProfiles, setAllProfiles] = useState<Profile[]>(seedProfiles);

  const getByEmail = useCallback(
    (email: string) => allProfiles.find((p) => p.email.toLowerCase() === email.toLowerCase()),
    [allProfiles]
  );
  const getById = useCallback((id: string) => allProfiles.find((p) => p.id === id), [allProfiles]);

  const addProfile: PersonnelShape["addProfile"] = useCallback((p) => {
    personnelIdCounter += 1;
    const newProfile: Profile = {
      id: `u${personnelIdCounter}`,
      org_id: p.org_id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      status: "inbjuden",
      initials: initials(p.full_name),
      invited_at: new Date().toISOString(),
    };
    setAllProfiles((prev) => [newProfile, ...prev]);
    return newProfile;
  }, []);

  const updateProfile: PersonnelShape["updateProfile"] = useCallback((id, patch) => {
    setAllProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, initials: patch.full_name ? initials(patch.full_name) : p.initials } : p))
    );
  }, []);

  const deactivateProfile: PersonnelShape["deactivateProfile"] = useCallback((id) => {
    setAllProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: "inaktiverad" } : p)));
  }, []);

  const reactivateProfile: PersonnelShape["reactivateProfile"] = useCallback((id) => {
    setAllProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: "aktiv" } : p)));
  }, []);

  const value = useMemo<PersonnelShape>(
    () => ({ allProfiles, organizations, getByEmail, getById, addProfile, updateProfile, deactivateProfile, reactivateProfile }),
    [allProfiles, getByEmail, getById, addProfile, updateProfile, deactivateProfile, reactivateProfile]
  );

  return <PersonnelContext.Provider value={value}>{children}</PersonnelContext.Provider>;
}

export function usePersonnel() {
  const ctx = useContext(PersonnelContext);
  if (!ctx) throw new Error("usePersonnel must be used within PersonnelProvider");
  return ctx;
}
