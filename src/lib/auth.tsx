import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { usePersonnel } from "../data/personnel";
import type { Profile } from "../types";

interface AuthShape {
  isAuthenticated: boolean;
  isLoading: boolean;
  userEmail: string | null;
  currentProfile: Profile | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  continueInMockMode: (email: string) => string | null;
}

const AuthContext = createContext<AuthShape | null>(null);

const MOCK_SESSION_KEY = "jk-mock-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { getByEmail } = usePersonnel();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      const mockSession = sessionStorage.getItem(MOCK_SESSION_KEY);
      if (mockSession) {
        const profile = getByEmail(mockSession);
        if (profile && profile.status !== "inaktiverad") {
          setIsAuthenticated(true);
          setUserEmail(mockSession);
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
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setUserEmail(session?.user.email ?? null);
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
    sessionStorage.setItem(MOCK_SESSION_KEY, profile.email);
    setIsAuthenticated(true);
    setUserEmail(profile.email);
    return null;
  }

  const currentProfile = userEmail ? getByEmail(userEmail) ?? null : null;

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, userEmail, currentProfile, signIn, signOut, continueInMockMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
