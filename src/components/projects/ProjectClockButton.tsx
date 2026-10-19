import { useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { Project } from "../../types";
import { useAttendance } from "../../data/attendance";
import { useSessions } from "../../data/sessions";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";

// Startar ett uppdrag på det här projektet på stämpelklockan (en enda klocka). Är man inte instämplad stämplas man också in.
export function ProjectClockButton({ project, className = "" }: { project: Project; className?: string }) {
  const sessions = useSessions();
  const attendance = useAttendance();
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks = (project.tasks ?? []).filter((t) => t.status !== "Klar");
  const runningHere = sessions.mine.some((s) => s.project_id === project.id);
  const closed = project.status === "Avbokad" || project.status === "Fakturerad";

  if (runningHere) {
    return (
      <Link to="/stampelklocka" className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-100 px-3.5 py-2 text-sm font-medium text-green-800 ${className}`}>
        Uppdrag pågår – öppna Stämpelklockan
      </Link>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await sessions.start(project.id, taskId || null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uppdraget kunde inte startas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" disabled={closed} className={className} onClick={() => { setTaskId(""); setError(null); setOpen(true); }}>
        <Play size={14} /> Starta uppdrag
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Starta uppdrag">
        <div className="space-y-3">
          <p className="text-sm text-slate-600"><strong>{project.project_number}</strong> {project.name}</p>
          {tasks.length > 0 && (
            <Field label="Arbetsorder (valfritt)">
              <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Ingen specifik</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.task}</option>)}
              </select>
            </Field>
          )}
          {!attendance.openEntry && <p className="text-xs text-slate-500">Du är inte instämplad. Du stämplas också in för dagen när uppdraget startar.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}><Play size={14} /> Starta</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
