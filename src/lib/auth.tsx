import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { allowMockAuth, requireSupabase } from "./runtimeMode";
import { usePersonnel } from "../data/personnel";
import { customerUsers } from "../data/mockData";
import type { CustomerUser, Profile, UserRole, UserStatus } from "../types";

type AccountType = "internal" | "customer";

type MockSession = {
  type: AccountType;
  email: string;
};

interface AuthShape {
  isAuthenticated: boolean;
  isLoading: boolean;
  userEmail: string | null;
  accountType: AccountType | null;
  currentProfile: Profile | null;
  currentCustomerUser: CustomerUser | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  continueInMockMode: (email: string) => string | null;
  continueAsCustomer: (email: string) => string | null;
}

const AuthContext = createContext<AuthShape | null>(null);

const MOCK_SESSION_KEY = "jk-mock-session";
const USER_ROLES: UserRole[] = ["admin", "projektledare", "ekonomi", "lasare"];
const USER_STATUSES: UserStatus[] = ["aktiv", "inbjuden", "inaktiverad"];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && USER_STATUSES.includes(value as UserStatus);
}

function toProfile(row: Record<string, unknown>): Profile | null {
  if (!isUserRole(row.role) || !isUserStatus(row.status)) return null;
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    full_name: String(row.full_name),
    email: String(row.email),
    role: row.role,
    status: row.status,
    initials: typeof row.initials === "string" && row.initials ? row.initials : initials(String(row.full_name)),
    invited_at: typeof row.invited_at === "string" ? row.invited_at : undefined,
  };
}

function toCustomerUser(row: Record<string, unknown>): CustomerUser | null {
  const status = row.status;
  if (!(status === "aktiv" || status === "inbjuden" || status === "inaktiverad")) return null;
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    customer_id: String(row.customer_id),
    contact_person_id: typeof row.contact_person_id === "string" ? row.contact_person_id : null,
    full_name: String(row.full_name),
    email: String(row.email),
    status,
    initials: typeof row.initials === "string" && row.initials ? row.initials : initials(String(row.full_name)),
    invited_at: typeof row.invited_at === "string" ? row.invited_at : undefined,
  };
}

function readMockSession(raw: string | null): MockSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MockSession>;
    if ((parsed.type === "internal" || parsed.type === "customer") && parsed.email) {
      return { type: parsed.type, email: parsed.email };
    }
  } catch {
    return { type: "internal", email: raw };
  }
  return { type: "internal", email: raw };
}

function writeMockSession(session: MockSession) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { getByEmail } = usePersonnel();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [supabaseProfile, setSupabaseProfile] = useState<Profile | null>(null);
  const [supabaseCustomerUser, setSupabaseCustomerUser] = useState<CustomerUser | null>(null);

  async function loadSupabaseIdentity(email: string) {
    if (!supabase) return null;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, org_id, full_name, email, role, status, initials, invited_at")
      .eq("email", email)
      .maybeSingle();

    if (profileData) {
      const profile = toProfile(profileData as Record<string, unknown>);
      if (profile?.status === "aktiv") {
        setSupabaseProfile(profile);
        setSupabaseCustomerUser(null);
        setAccountType("internal");
        return { type: "internal" as const, email: profile.email };
      }
    }

    const { data: customerData } = await supabase
      .from("customer_users")
      .select("id, org_id, customer_id, contact_person_id, full_name, email, status, initials, invited_at")
      .eq("email", email)
      .maybeSingle();

    if (customerData) {
      const customerUser = toCustomerUser(customerData as Record<string, unknown>);
      if (customerUser?.status === "aktiv") {
        setSupabaseProfile(null);
        setSupabaseCustomerUser(customerUser);
        setAccountType("customer");
        return { type: "customer" as const, email: customerUser.email };
      }
    }

    setSupabaseProfile(null);
    setSupabaseCustomerUser(null);
    setAccountType(null);
    return null;
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      if (requireSupabase() || !allowMockAuth()) {
        sessionStorage.removeItem(MOCK_SESSION_KEY);
        setIsAuthenticated(false);
        setUserEmail(null);
        setAccountType(null);
        setIsLoading(false);
        return;
      }
      const mockSession = readMockSession(sessionStorage.getItem(MOCK_SESSION_KEY));
      if (mockSession?.type === "internal") {
        const profile = getByEmail(mockSession.email);
        if (profile && profile.status === "aktiv") {
          setIsAuthenticated(true);
          setUserEmail(profile.email);
          setAccountType("internal");
        } else {
          sessionStorage.removeItem(MOCK_SESSION_KEY);
        }
      } else if (mockSession?.type === "customer") {
        const customerUser = customerUsers.find((u) => u.email.toLowerCase() === mockSession.email.toLowerCase());
        if (customerUser && customerUser.status === "aktiv") {
          setIsAuthenticated(true);
          setUserEmail(customerUser.email);
          setAccountType("customer");
        } else {
          sessionStorage.removeItem(MOCK_SESSION_KEY);
        }
      }
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user.email ?? null;
      if (email) {
        const identity = await loadSupabaseIdentity(email);
        setIsAuthenticated(Boolean(identity));
        setUserEmail(identity?.email ?? null);
      } else {
        setIsAuthenticated(false);
        setUserEmail(null);
        setAccountType(null);
        setSupabaseProfile(null);
        setSupabaseCustomerUser(null);
      }
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const email = session?.user.email ?? null;
      if (email) {
        const identity = await loadSupabaseIdentity(email);
        setIsAuthenticated(Boolean(identity));
        setUserEmail(identity?.email ?? null);
      } else {
        setIsAuthenticated(false);
        setUserEmail(null);
        setAccountType(null);
        setSupabaseProfile(null);
        setSupabaseCustomerUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return "Supabase är inte konfigurerat.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    const identity = await loadSupabaseIdentity(email);
    if (!identity) {
      await supabase.auth.signOut();
      return "Kontot saknar aktiv personal- eller kundprofil. Kontakta administratör.";
    }
    setIsAuthenticated(true);
    setUserEmail(identity.email);
    return null;
  }

  async function signOut() {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      sessionStorage.removeItem(MOCK_SESSION_KEY);
      setIsAuthenticated(false);
      setUserEmail(null);
      setAccountType(null);
    }
  }

  // Mockläge: "loggar in" som en av testpersonerna i personnel-registret. Blockeras
  // direkt på inloggningsnivå om kontot är inaktiverat eller saknas – motsvarar den
  // spärr en riktig backend/RLS-policy skulle göra.
  function continueInMockMode(email: string): string | null {
    if (!allowMockAuth()) return "Testinloggning är avstängd i denna miljö.";
    const profile = getByEmail(email);
    if (!profile) return "Ingen användare med den e-postadressen hittades.";
    if (profile.status === "inaktiverad") return "Kontot är inaktiverat. Kontakta din administratör.";
    if (profile.status === "inbjuden") return "Kontot är inbjudet men har inte accepterat inbjudan ännu.";
    writeMockSession({ type: "internal", email: profile.email });
    setIsAuthenticated(true);
    setUserEmail(profile.email);
    setAccountType("internal");
    return null;
  }

  function continueAsCustomer(email: string): string | null {
    if (!allowMockAuth()) return "Testinloggning är avstängd i denna miljö.";
    const customerUser = customerUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!customerUser) return "Ingen kundanvändare med den e-postadressen hittades.";
    if (customerUser.status === "inaktiverad") return "Kundkontot är inaktiverat. Kontakta JK Projektlogistik.";
    if (customerUser.status === "inbjuden") return "Kundkontot är inbjudet men har inte accepterats ännu.";
    writeMockSession({ type: "customer", email: customerUser.email });
    setIsAuthenticated(true);
    setUserEmail(customerUser.email);
    setAccountType("customer");
    return null;
  }

  const currentProfile =
    accountType === "internal" && userEmail
      ? isSupabaseConfigured
        ? supabaseProfile
        : getByEmail(userEmail) ?? null
      : null;
  const currentCustomerUser =
    accountType === "customer" && userEmail
      ? isSupabaseConfigured
        ? supabaseCustomerUser
        : customerUsers.find((u) => u.email.toLowerCase() === userEmail.toLowerCase()) ?? null
      : null;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userEmail,
        accountType,
        currentProfile,
        currentCustomerUser,
        signIn,
        signOut,
        continueInMockMode,
        continueAsCustomer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
