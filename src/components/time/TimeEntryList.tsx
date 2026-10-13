import { useState } from "react";
import { Coffee, Pencil, Trash2, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import type { TimeEntry } from "../../types";
import { useTimeTracking } from "../../data/timeTracking";
import { formatMinutes, formatTimeOfDay } from "../../lib/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TimeEntryModal } from "./TimeEntryModal";

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function TimeEntryList({
  entries,
  canEdit,
  userNames,
}: {
  entries: TimeEntry[];
  canEdit: (entry: TimeEntry) => boolean;
  userNames?: Map<string, string>;
}) {
  const { categories, deleteEntry } = useTimeTracking();
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = new Map<string, TimeEntry[]>();
  for (const entry of [...entries].sort((a, b) => (a.start_time < b.start_time ? 1 : -1))) {
    const key = dayKey(entry.start_time);
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  const categoryLabel = (key: string | null) => categories.find((c) => c.key === key)?.label ?? key ?? "";

  async function confirmDelete() {
    if (!deleting) return;
    setError(null);
    try {
      await deleteEntry(deleting.id);
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tiden kunde inte tas bort.");
    }
  }

  if (days.size === 0) return <p className="py-6 text-center text-sm text-slate-500">Ingen registrerad tid för perioden.</p>;

  return (
    <div className="space-y-5">
      {[...days.entries()].map(([key, dayEntries]) => {
        const worked = dayEntries.filter((e) => e.entry_type === "work").reduce((sum, e) => sum + e.total_minutes, 0);
        return (
          <section key={key}>
            <div className="mb-1.5 flex items-baseline justify-between border-b border-border pb-1">
              <h4 className="text-sm font-semibold capitalize text-slate-700">{dayLabel(key)}</h4>
              <span className="text-xs font-medium text-slate-500">{formatMinutes(worked) || "0 min"} arbetat</span>
            </div>
            <ul className="divide-y divide-border">
              {dayEntries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      {e.entry_type === "break" && <Coffee size={13} className="text-amber-600" />}
                      {e.entry_type === "lunch" && <Utensils size={13} className="text-amber-600" />}
                      <span className="font-medium text-slate-800">
                        {formatTimeOfDay(e.start_time)}–{e.end_time ? formatTimeOfDay(e.end_time) : "pågår"}
                      </span>
                      <span className="text-slate-500">{e.end_time ? formatMinutes(e.total_minutes) || "0 min" : ""}</span>
                      {e.entry_type === "work" ? (
                        <span className="status-pill bg-cyan-100 text-cyan-700">{categoryLabel(e.category_key)}</span>
                      ) : (
                        <span className="status-pill bg-amber-100 text-amber-700">{e.entry_type === "lunch" ? "Lunch" : "Rast"}</span>
                      )}
                      {e.source === "manual" && <span className="text-[11px] text-slate-400">manuell</span>}
                      {e.edited_at && <span className="text-[11px] text-slate-400">ändrad</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {userNames && <span className="font-medium text-slate-700">{userNames.get(e.user_id) ?? "Okänd"} · </span>}
                      {e.project_id ? (
                        <Link to={`/projekt/${e.project_id}`} className="text-orange-600 hover:text-orange-700">{e.project_label}</Link>
                      ) : e.entry_type === "work" ? (
                        "Intern tid"
                      ) : null}
                    </div>
                    {e.comment && e.entry_type === "work" && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{e.comment}</p>}
                  </div>
                  {canEdit(e) && e.end_time && (
                    <div className="flex shrink-0 items-center">
                      <Button type="button" variant="ghost" className="!p-2" title="Ändra" aria-label="Ändra tid" onClick={() => setEditing(e)}>
                        <Pencil size={14} />
                      </Button>
                      <Button type="button" variant="ghost" className="!p-2 text-red-600" title="Ta bort" aria-label="Ta bort tid" onClick={() => { setError(null); setDeleting(e); }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {editing && <TimeEntryModal key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Ta bort tid">
        <p className="text-sm text-slate-700">Vill du ta bort passet? Borttagningen sparas i ändringsloggen för admin.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Avbryt</Button>
          <Button onClick={confirmDelete}><Trash2 size={15} /> Ta bort</Button>
        </div>
      </Modal>
    </div>
  );
}
