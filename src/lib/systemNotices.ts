// Driftmeddelanden från Vibogruppen (planerade uppdateringar, serverunderhåll). Hämtas via edge-funktionen system-notices.
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

export type NoticeSeverity = "info" | "warning" | "critical";

export interface SystemNotice {
  id: string;
  title: string;
  body: string;
  severity: NoticeSeverity;
  kind: "update" | "maintenance" | "incident" | "other";
  show_from: string;
  show_until: string;
  event_starts_at: string | null;
  event_ends_at: string | null;
  updated_at: string;
}

const SEVERITY_ORDER: Record<NoticeSeverity, number> = { critical: 0, warning: 1, info: 2 };
const DISMISS_KEY = "jk.dismissedNotices";

export async function fetchSystemNotices(): Promise<SystemNotice[]> {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) return [];
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];
  const response = await fetch(`${supabaseUrl}/functions/v1/system-notices`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.notices) ? (payload.notices as SystemNotice[]).filter(isNotice) : [];
}

function isNotice(value: unknown): value is SystemNotice {
  const notice = value as Partial<SystemNotice> | null;
  return Boolean(notice && typeof notice.id === "string" && typeof notice.title === "string" && typeof notice.show_from === "string" && typeof notice.show_until === "string"
    && (notice.severity === "info" || notice.severity === "warning" || notice.severity === "critical"));
}

// Nyckeln innehåller updated_at, så ett ändrat meddelande visas igen även om det tidigare dolts.
export const dismissKey = (notice: Pick<SystemNotice, "id" | "updated_at">) => `${notice.id}:${notice.updated_at}`;

export function readDismissed(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function writeDismissed(keys: string[]) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(keys.slice(-50)));
  } catch {
    // Lagring kan vara blockerad (privat läge); då visas meddelandet igen vid nästa laddning, vilket är ofarligt.
  }
}

// Kritiska meddelanden går inte att dölja. Övriga kan döljas per användare och webbläsare.
export function visibleNotices(notices: SystemNotice[], dismissed: string[], now = new Date()): SystemNotice[] {
  const t = now.getTime();
  return notices
    .filter((notice) => t >= new Date(notice.show_from).getTime() && t < new Date(notice.show_until).getTime())
    .filter((notice) => notice.severity === "critical" || !dismissed.includes(dismissKey(notice)))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || new Date(b.show_from).getTime() - new Date(a.show_from).getTime());
}

export function formatEventWindow(start: string | null, end: string | null): string {
  if (!start) return "";
  const startDate = new Date(start);
  const day = (date: Date) => date.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  const time = (date: Date) => date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (!end) return `${day(startDate)} kl. ${time(startDate)}`;
  const endDate = new Date(end);
  if (day(startDate) === day(endDate)) return `${day(startDate)} kl. ${time(startDate)}–${time(endDate)}`;
  return `${day(startDate)} kl. ${time(startDate)} – ${day(endDate)} kl. ${time(endDate)}`;
}
