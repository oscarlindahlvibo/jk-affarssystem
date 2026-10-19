import { useState } from "react";
import { Clock, Play, Repeat } from "lucide-react";
import type { ProjectTask } from "../../types";
import { useStore } from "../../data/store";
import { timeCategoryForTask, useTimeTracking } from "../../data/timeTracking";
import { formatMinutes } from "../../lib/format";
import { inputClass } from "../ui/Field";

function toHoursText(minutes: number | null | undefined) {
  return minutes ? String(Math.round((minutes / 60) * 100) / 100).replace(".", ",") : "";
}

export function TaskTimeEntry({ projectId, task, canEdit }: { projectId: string; task: ProjectTask; canEdit: boolean }) {
  const { updateTask } = useStore();
  const { openEntry, taskMinutes, activeCategories, clockIn, switchJob } = useTimeTracking();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);

  const stamped = taskMinutes(task.id);
  const manual = task.time_spent_minutes ?? 0;
  const total = stamped + manual;

  function save() {
    const text = value.trim().replace(",", ".");
    const hours = text === "" ? null : Number(text);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      setError("Ange tiden i timmar, t.ex. 2,5");
      return;
    }
    try {
      updateTask(projectId, task.id, { time_spent_minutes: hours === null || hours === 0 ? null : Math.round(hours * 60) });
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tiden kunde inte sparas.");
    }
  }

  async function stamp() {
    const wanted = timeCategoryForTask(task.category);
    const categoryKey = activeCategories.some((c) => c.key === wanted) ? wanted : activeCategories[0]?.key;
    if (!categoryKey) {
      setError("Det finns ingen aktiv tidskategori.");
      return;
    }
    setStamping(true);
    setError(null);
    try {
      const job = { projectId, taskId: task.id, categoryKey };
      if (openEntry) await switchJob(job, "", "");
      else await clockIn(job, "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stämplingen misslyckades.");
    } finally {
      setStamping(false);
    }
  }

  const runningHere = openEntry?.entry_type === "work" && openEntry.task_id === task.id;
  const onPause = openEntry && openEntry.entry_type !== "work";

  if (editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <Clock size={12} className="text-slate-400" />
        <input
          autoFocus
          inputMode="decimal"
          aria-label="Manuellt registrerad tid i timmar"
          className={`${inputClass} !w-24 !py-1`}
          value={value}
          placeholder="timmar"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }}
        />
        <button type="button" onClick={save} className="font-medium text-orange-600 hover:text-orange-700">Spara tid</button>
        <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-slate-500 hover:text-slate-700">Avbryt</button>
        {error && <span role="alert" className="text-red-600">{error}</span>}
      </div>
    );
  }

  const logged = formatMinutes(total);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <Clock size={12} className="text-slate-400" />
        {logged ? (
          <span>
            Nedlagd tid: <span className="font-medium text-slate-700">{logged}</span>
            {stamped > 0 && manual > 0 && <span className="text-slate-400"> (stämplat {formatMinutes(stamped)} + manuellt {formatMinutes(manual)})</span>}
          </span>
        ) : canEdit ? null : (
          <span>Ingen tid registrerad</span>
        )}
      </span>
      {canEdit && (
        <button type="button" onClick={() => { setValue(toHoursText(task.time_spent_minutes)); setEditing(true); }} className="font-medium text-orange-600 hover:text-orange-700">
          {manual ? "Ändra manuell tid" : "Registrera tid"}
        </button>
      )}
      {task.status !== "Klar" && (
        runningHere ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Projekttid pågår här</span>
        ) : onPause ? null : (
          <button type="button" disabled={stamping} onClick={() => void stamp()} className="inline-flex items-center gap-1 font-medium text-green-700 hover:text-green-800 disabled:opacity-50">
            {openEntry ? <Repeat size={12} /> : <Play size={12} />}
            {openEntry ? "Flytta projekttid hit" : "Starta projekttid"}
          </button>
        )
      )}
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </div>
  );
}
