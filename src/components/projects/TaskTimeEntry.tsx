import { useState } from "react";
import { Clock } from "lucide-react";
import type { ProjectTask } from "../../types";
import { useStore } from "../../data/store";
import { useTimeTracking } from "../../data/timeTracking";
import { formatMinutes } from "../../lib/format";
import { inputClass } from "../ui/Field";

function toHoursText(minutes: number | null | undefined) {
  return minutes ? String(Math.round((minutes / 60) * 100) / 100).replace(".", ",") : "";
}

export function TaskTimeEntry({ projectId, task, canEdit }: { projectId: string; task: ProjectTask; canEdit: boolean }) {
  const { updateTask } = useStore();
  const { taskMinutes } = useTimeTracking();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </div>
  );
}
