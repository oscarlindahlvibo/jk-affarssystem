import { supabase } from "./supabase";

export interface InboxNotification {
  id: string;
  kind: "note" | "project" | "project_update" | "task";
  title: string;
  body: string;
  url: string | null;
  project_id: string | null;
  created_at: string;
  read_at: string | null;
  cleared_at: string | null;
}

const COLUMNS = "id, kind, title, body, url, project_id, created_at, read_at, cleared_at";

export function unreadCount(rows: InboxNotification[]) {
  return rows.filter((row) => !row.read_at && !row.cleared_at).length;
}

// Rensade notiser döljs som standard men finns kvar som historik ("Visa rensade").
export function visibleNotifications(rows: InboxNotification[], showCleared: boolean) {
  return rows
    .filter((row) => showCleared || !row.cleared_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function loadInbox(): Promise<InboxNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("user_notifications").select(COLUMNS).order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error("Notiserna kunde inte läsas in.");
  return data as InboxNotification[];
}

async function patch(ids: string[], changes: { read_at?: string | null; cleared_at?: string | null }) {
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase.from("user_notifications").update(changes).in("id", ids);
  if (error) throw new Error("Notisen kunde inte uppdateras.");
}

export const markNotificationsRead = (ids: string[]) => patch(ids, { read_at: new Date().toISOString() });
export const markNotificationsUnread = (ids: string[]) => patch(ids, { read_at: null });
export const clearNotifications = (ids: string[]) => patch(ids, { read_at: new Date().toISOString(), cleared_at: new Date().toISOString() });
export const restoreNotifications = (ids: string[]) => patch(ids, { cleared_at: null });
