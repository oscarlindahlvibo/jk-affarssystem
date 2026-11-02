export const NOTIFIED_ROLES = ["admin", "projektledare"];
// Anteckningen som skapas tillsammans med ett nytt projekt ska inte ge en egen notis.
const INITIAL_NOTE_WINDOW_MS = 15000;

export type ProjectEvent = { type: "note" | "project"; id: string; actor: string | null };

export function parseProjectEvent(body: unknown): ProjectEvent | null {
  const value = body as { type?: unknown; id?: unknown; actor?: unknown } | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!value || (value.type !== "note" && value.type !== "project")) return null;
  if (typeof value.id !== "string" || !uuid.test(value.id)) return null;
  const actor = typeof value.actor === "string" && uuid.test(value.actor) ? value.actor : null;
  return { type: value.type, id: value.id, actor };
}

export function isInitialNote(noteDate: string, projectCreatedAt: string) {
  const delta = new Date(noteDate).getTime() - new Date(projectCreatedAt).getTime();
  return Number.isFinite(delta) && delta < INITIAL_NOTE_WINDOW_MS;
}

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type ProjectInfo = { project_number: string; name: string; customer?: string | null; booking_source?: string | null };
type NoteInfo = { user_name?: string | null; text: string; category?: string | null; visibility?: string | null };

export function projectEventMessage(type: "note" | "project", project: ProjectInfo, note?: NoteInfo) {
  if (type === "project") {
    const via = project.booking_source === "customer_portal" ? " (bokning via kundportalen)" : "";
    return {
      title: `Nytt projekt · ${project.project_number}`,
      body: clip([project.name, project.customer].filter(Boolean).join(" · "), 200) + via,
    };
  }
  const author = note?.user_name?.trim() || "Någon";
  return {
    title: `Ny anteckning · ${project.project_number}`,
    body: clip(`${author}: ${note?.text ?? ""}`, 200),
  };
}
