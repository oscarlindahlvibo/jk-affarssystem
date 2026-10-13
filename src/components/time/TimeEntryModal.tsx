import { useState } from "react";
import type { TimeEntry } from "../../types";
import { useTimeTracking } from "../../data/timeTracking";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { defaultJobDraft, JobPicker, toJob, type JobDraft } from "./JobPicker";

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function TimeEntryModal({ entry, onClose }: { entry: TimeEntry | null; onClose: () => void }) {
  const { activeCategories, addEntry, updateEntry } = useTimeTracking();
  const start = entry ? new Date(entry.start_time) : null;
  const end = entry?.end_time ? new Date(entry.end_time) : null;
  const isWork = !entry || entry.entry_type === "work";

  const [job, setJob] = useState<JobDraft>(
    entry
      ? { projectId: entry.project_id ?? "", taskId: entry.task_id ?? "", categoryKey: entry.category_key ?? activeCategories[0]?.key ?? "" }
      : defaultJobDraft(activeCategories[0]?.key)
  );
  const [date, setDate] = useState(start ? dateValue(start) : dateValue(new Date()));
  const [startTime, setStartTime] = useState(start ? timeValue(start) : "08:00");
  const [endTime, setEndTime] = useState(end ? timeValue(end) : "09:00");
  const [comment, setComment] = useState(entry?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveJob = job.categoryKey || !activeCategories[0] ? job : { ...job, categoryKey: activeCategories[0].key };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startIso = new Date(`${date}T${startTime}`);
    const endIso = new Date(`${date}T${endTime}`);
    if (Number.isNaN(startIso.getTime()) || Number.isNaN(endIso.getTime())) {
      setError("Ange datum och tider.");
      return;
    }
    const input = { ...toJob(effectiveJob), startIso: startIso.toISOString(), endIso: endIso.toISOString(), comment };
    setSaving(true);
    try {
      if (entry) await updateEntry(entry.id, input);
      else await addEntry(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tiden kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={entry ? "Ändra tid" : "Lägg till tid"} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {isWork && <JobPicker value={effectiveJob} onChange={setJob} includeProjectId={entry?.project_id} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Datum">
            <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Från">
            <input type="time" required className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Till">
            <input type="time" required className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Anteckning">
          <textarea className={`${inputClass} min-h-20 resize-y`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="T.ex. rekade sträckan Tingsryd–Växjö" />
        </Field>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit" disabled={saving}>{saving ? "Sparar..." : "Spara"}</Button>
        </div>
      </form>
    </Modal>
  );
}
