import { useState } from "react";
import { Clock, LogIn, Repeat } from "lucide-react";
import type { Project } from "../../types";
import { timeCategoryForTask, useTimeTracking } from "../../data/timeTracking";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";

export function ProjectClockButton({ project, className = "" }: { project: Project; className?: string }) {
  const { openEntry, activeCategories, clockIn, switchJob } = useTimeTracking();
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [closing, setClosing] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks = (project.tasks ?? []).filter((t) => t.status !== "Klar");
  const onPause = openEntry && openEntry.entry_type !== "work";
  const runningHere = openEntry?.entry_type === "work" && openEntry.project_id === project.id;
  const effectiveCategory = categoryKey || activeCategories[0]?.key || "";

  function openDialog() {
    setTaskId("");
    setCategoryKey("");
    setClosing("");
    setOpening("");
    setError(null);
    setOpen(true);
  }

  function changeTask(id: string) {
    setTaskId(id);
    const task = tasks.find((t) => t.id === id);
    const suggested = task ? timeCategoryForTask(task.category) : null;
    if (suggested && activeCategories.some((c) => c.key === suggested)) setCategoryKey(suggested);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const job = { projectId: project.id, taskId: taskId || null, categoryKey: effectiveCategory };
      if (openEntry) await switchJob(job, closing, opening);
      else await clockIn(job, opening);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stämplingen misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  const label = runningHere ? "Stämplad här – byt uppgift" : openEntry ? "Byt stämpling hit" : "Stämpla in";
  const Icon = openEntry ? Repeat : LogIn;

  return (
    <>
      <Button
        type="button"
        variant={runningHere ? "secondary" : "primary"}
        className={className}
        disabled={Boolean(onPause)}
        title={onPause ? "Du är på rast. Fortsätt arbeta under Tid först." : undefined}
        onClick={openDialog}
      >
        {runningHere ? <Clock size={14} className="text-green-600" /> : <Icon size={14} />} {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={openEntry ? "Byt stämpling till projektet" : "Stämpla in på projektet"}>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{project.project_number} · {project.name}</div>
          {openEntry && (
            <p className="text-xs text-slate-500">
              Din pågående stämpling ({openEntry.project_label ?? "intern tid"}) avslutas nu och en ny startar på det här projektet.
            </p>
          )}
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Field label="Arbetsorder (valfritt)">
            <select className={inputClass} value={taskId} onChange={(e) => changeTask(e.target.value)}>
              <option value="">Ingen specifik arbetsorder</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.task}</option>)}
            </select>
          </Field>
          <Field label="Kategori">
            <select className={inputClass} value={effectiveCategory} onChange={(e) => setCategoryKey(e.target.value)}>
              {activeCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          {openEntry && (
            <Field label="Anteckning för passet du lämnar (valfritt)">
              <textarea className={`${inputClass} min-h-16 resize-y`} value={closing} onChange={(e) => setClosing(e.target.value)} />
            </Field>
          )}
          <Field label="Anteckning för nya passet (valfritt)">
            <textarea className={`${inputClass} min-h-16 resize-y`} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Vad ska du göra?" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="button" disabled={busy || !effectiveCategory} onClick={() => void submit()}>
              {openEntry ? <Repeat size={15} /> : <LogIn size={15} />} {openEntry ? "Byt hit" : "Stämpla in"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
