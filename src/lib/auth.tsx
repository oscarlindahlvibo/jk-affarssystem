import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { usePersonnel } from "../data/personnel";
import { customerUsers } from "../data/mockData";
import type { CustomerUser, Profile } from "../types";

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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
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

    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      setUserEmail(data.session?.user.email ?? null);
      setAccountType(data.session ? "internal" : null);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setUserEmail(session?.user.email ?? null);
      setAccountType(session ? "internal" : null);
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) return "Supabase är inte konfigurerat.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
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

  const currentProfile = accountType === "internal" && userEmail ? getByEmail(userEmail) ?? null : null;
  const currentCustomerUser =
    accountType === "customer" && userEmail
      ? customerUsers.find((u) => u.email.toLowerCase() === userEmail.toLowerCase()) ?? null
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
