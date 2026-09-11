import { useState } from "react";
import { Plus } from "lucide-react";
import type { ProjectNote, NoteCategory } from "../../types";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { formatDateTime } from "../../lib/format";
import { useStore } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { usePermissions } from "../../lib/usePermissions";

const CATEGORIES: NoteCategory[] = ["Allmänt", "Kund", "Transport", "Tillstånd", "Ekonomi"];

export function NotesSection({ projectId, notes }: { projectId: string; notes: ProjectNote[] }) {
  const { addNote } = useStore();
  const { currentProfile } = useAuth();
  const canEdit = usePermissions().can("projects", "edit");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<NoteCategory>("Allmänt");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text) return;
    addNote(projectId, { text, category, date: new Date().toISOString(), user_name: currentProfile?.full_name ?? "Okänd" });
    setText("");
    setCategory("Allmänt");
    setOpen(false);
  }

  return (
    <Panel
      title="Interna anteckningar"
      action={
        canEdit && (
          <Button variant="secondary" onClick={() => setOpen(true)} className="!px-2.5 !py-1.5">
            <Plus size={14} /> Ny anteckning
          </Button>
        )
      }
    >
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">{n.user_name}</span>
              <span>{formatDateTime(n.date)}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-700">{n.text}</p>
            <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{n.category}</span>
          </li>
        ))}
        {notes.length === 0 && <p className="text-sm text-slate-500">Inga anteckningar ännu.</p>}
      </ul>

      <Modal open={open && canEdit} onClose={() => setOpen(false)} title="Ny anteckning">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Text *">
            <textarea required rows={4} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv anteckning..." />
          </Field>
          <Field label="Kategori">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="submit">Spara</Button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
}
