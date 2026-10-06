import { useState } from "react";
import { Eye, Lock, Plus, Pencil, Trash2 } from "lucide-react";
import type { ProjectNote, NoteCategory, NoteVisibility } from "../../types";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { formatDateTime } from "../../lib/format";
import { useStore } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { usePermissions } from "../../lib/usePermissions";

const CATEGORIES: NoteCategory[] = ["Allmänt", "Kund", "Transport", "Tillstånd", "Ekonomi"];

const VISIBILITY_LABELS: Record<NoteVisibility, string> = {
  internal: "Intern JK",
  customer: "Synlig för kund",
};

export function NotesSection({ projectId, notes }: { projectId: string; notes: ProjectNote[] }) {
  const { addNote, updateNote, deleteNote, waitForPendingMutations } = useStore();
  const { currentProfile } = useAuth();
  const canEdit = usePermissions().can("projects", "edit");
  const [open, setOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [deletingNote, setDeletingNote] = useState<ProjectNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<NoteCategory>("Allmänt");
  const [visibility, setVisibility] = useState<NoteVisibility>("internal");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editingNote) await updateNote(projectId, editingNote.id, { text, category, visibility });
      else {
        addNote(projectId, { text: text.trim(), category, visibility, date: new Date().toISOString(), user_name: currentProfile?.full_name ?? "Okänd" });
        await waitForPendingMutations();
      }
      setText("");
      setCategory("Allmänt");
      setVisibility("internal");
      setOpen(false);
      setEditingNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara anteckningen.");
    } finally { setBusy(false); }
  }

  function openForm(note: ProjectNote | null) {
    setEditingNote(note);
    setText(note?.text ?? "");
    setCategory(note?.category ?? "Allmänt");
    setVisibility(note?.visibility ?? "internal");
    setError(null);
    setOpen(true);
  }

  async function confirmDelete() {
    if (!deletingNote || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteNote(projectId, deletingNote.id);
      setDeletingNote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort anteckningen.");
    } finally { setBusy(false); }
  }

  return (
    <Panel
      title="Interna anteckningar"
      action={
        canEdit && (
          <Button variant="secondary" onClick={() => openForm(null)} className="!px-2.5 !py-1.5">
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
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-700">{n.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{n.category}</span>
              <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${n.visibility === "customer" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {n.visibility === "customer" ? <Eye size={11} /> : <Lock size={11} />}
                {VISIBILITY_LABELS[n.visibility ?? "internal"]}
              </span>
              {canEdit && <div className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" className="!p-2" title="Redigera anteckning" aria-label="Redigera anteckning" onClick={() => openForm(n)}><Pencil size={15} /></Button>
                <Button type="button" variant="ghost" className="!p-2 text-red-600" title="Ta bort anteckning" aria-label="Ta bort anteckning" onClick={() => { setError(null); setDeletingNote(n); }}><Trash2 size={15} /></Button>
              </div>}
            </div>
          </li>
        ))}
        {notes.length === 0 && <p className="text-sm text-slate-500">Inga anteckningar ännu.</p>}
      </ul>

      <Modal open={open && canEdit} onClose={() => { if (!busy) setOpen(false); }} title={editingNote ? "Redigera anteckning" : "Ny anteckning"}>
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
          <Field label="Synlighet">
            <select className={inputClass} value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}>
              <option value="internal">Intern JK</option>
              <option value="customer">Synlig för inloggad kund</option>
            </select>
          </Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="submit" disabled={busy || !text.trim()}>{busy ? "Sparar..." : "Spara"}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(deletingNote) && canEdit} onClose={() => { if (!busy) setDeletingNote(null); }} title="Ta bort anteckning">
        <p className="text-sm text-slate-700">Vill du ta bort anteckningen? Det går inte att ångra.</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500">{deletingNote?.text}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => setDeletingNote(null)}>Avbryt</Button>
          <Button disabled={busy} onClick={confirmDelete}><Trash2 size={15} />{busy ? "Tar bort..." : "Ta bort"}</Button>
        </div>
      </Modal>
    </Panel>
  );
}
