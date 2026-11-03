export const NOTIFIED_ROLES = ["admin", "projektledare"];
// Anteckningen som skapas tillsammans med ett nytt projekt ska inte ge en egen notis.
const INITIAL_NOTE_WINDOW_MS = 15000;

export const CHANGE_LABELS: Record<string, string> = {
  status: "Status",
  planned_loading_date: "Lastdatum",
  planned_delivery_date: "Leveransdatum",
  planned_loading_time: "Lastningstid",
  planned_delivery_time: "Leveranstid",
  responsible_id: "Ansvarig",
  booking_approval_status: "Godkännande",
  invoice_status: "Fakturering",
};

export type FieldChange = [string | null, string | null];
export type ProjectEvent =
  | { type: "note" | "project"; id: string; actor: string | null }
  | { type: "project_update"; id: string; actor: string | null; changes: Record<string, FieldChange> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseChanges(value: unknown): Record<string, FieldChange> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const changes: Record<string, FieldChange> = {};
  for (const [field, pair] of Object.entries(value)) {
    if (!(field in CHANGE_LABELS) || !Array.isArray(pair) || pair.length !== 2) continue;
    const [from, to] = pair.map((item) => (item === null || item === undefined ? null : String(item).slice(0, 200)));
    changes[field] = [from, to];
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function parseProjectEvent(body: unknown): ProjectEvent | null {
  const value = body as { type?: unknown; id?: unknown; actor?: unknown; changes?: unknown } | null;
  if (!value || typeof value.id !== "string" || !UUID.test(value.id)) return null;
  const actor = typeof value.actor === "string" && UUID.test(value.actor) ? value.actor : null;
  if (value.type === "note" || value.type === "project") return { type: value.type, id: value.id, actor };
  if (value.type === "project_update") {
    const changes = parseChanges(value.changes);
    return changes ? { type: "project_update", id: value.id, actor, changes } : null;
  }
  return null;
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

const MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

function formatChangeValue(field: string, value: string | null, names: Record<string, string>) {
  if (value === null || value === "") return "ingen";
  if (field.endsWith("_date") && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]}`;
  if (field.endsWith("_time")) return value.slice(0, 5);
  if (field === "responsible_id") return names[value] ?? "okänd";
  return value;
}

// Namn för ansvariga hämtas av anroparen (id -> namn) eftersom bara id:t ligger i databasändringen.
export function projectChangeMessage(project: ProjectInfo, changes: Record<string, FieldChange>, names: Record<string, string> = {}) {
  const cancelled = changes.status?.[1] === "Avbokad";
  const lines = Object.entries(changes).map(([field, [from, to]]) =>
    `${CHANGE_LABELS[field]}: ${formatChangeValue(field, from, names)} → ${formatChangeValue(field, to, names)}`);
  return {
    title: `${cancelled ? "Avbokat" : "Ändrat"} · ${project.project_number}`,
    body: clip(`${project.name} · ${lines.join(" · ")}`, 200),
    lines,
  };
}
