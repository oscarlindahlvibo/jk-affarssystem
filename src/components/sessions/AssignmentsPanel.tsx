import { useMemo, useState } from "react";
import { Hourglass, Play, Square, X } from "lucide-react";
import type { AssignmentSession, Project } from "../../types";
import { useAttendance } from "../../data/attendance";
import { useSessions } from "../../data/sessions";
import { useStore } from "../../data/store";
import { useNow } from "../time/useNow";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";
import { WorkReportModal } from "../reports/WorkReportModal";
import { ProjectPicker } from "./ProjectPicker";
import { elapsedMinutes, suggestedReport, waitingMinutes } from "../../lib/sessionEngine";
import { formatClock } from "../../lib/format";
import { hm } from "../attendance/shared";
import type { AttendanceEntry } from "../../types";

// Minuter av rast/lunch som ligger inom uppdragets tid. Dras bort från förslaget till rapporterad arbetstid.
function breakOverlapMinutes(entries: AttendanceEntry[], userId: string, startMs: number, endMs: number) {
  let total = 0;
  for (const e of entries) {
    if (e.user_id !== userId || e.entry_type === "work") continue;
    const from = Math.max(new Date(e.start_time).getTime(), startMs);
    const to = Math.min(e.end_time ? new Date(e.end_time).getTime() : endMs, endMs);
    if (to > from) total += Math.floor((to - from) / 60000);
  }
  return total;
}

function SessionCard({ session, project }: { session: AssignmentSession; project: Project | undefined }) {
  const sessions = useSessions();
  const attendance = useAttendance();
  const now = useNow(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const waiting = Boolean(session.waiting_started_at);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Åtgärden misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  const suggestion = useMemo(() => {
    const base = suggestedReport(session, now);
    const breaks = breakOverlapMinutes(attendance.myEntries, session.user_id, new Date(session.started_at).getTime(), now);
    return { hours: Math.max(Math.round(((base.hours * 60 - breaks) / 60) * 100) / 100, 0), waitingHours: base.waitingHours };
    // Förslaget räknas när dialogen öppnas (finishing växlar), inte varje sekund.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing]);

  return (
    <li className={`rounded-xl border p-3 ${waiting ? "border-amber-300 bg-amber-50" : "border-border bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800">{project ? `${project.project_number} ${project.name}` : "Projekt"}</div>
          <div className="text-xs text-slate-500">
            Uppdrag {hm(elapsedMinutes(session, now))} · väntetid {hm(waitingMinutes(session, now))}
          </div>
        </div>
        <div className="font-mono text-lg font-semibold tabular-nums text-slate-800">{formatClock(now - new Date(session.started_at).getTime())}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => sessions.setWaiting(session.id, !waiting))}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${waiting ? "bg-amber-500 text-white" : "border border-border bg-white text-slate-700"}`}
        >
          <Hourglass size={16} /> {waiting ? "Sluta vänta" : "Väntar"}
        </button>
        <button type="button" disabled={busy} onClick={() => setFinishing(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          <Square size={16} /> Klar med uppdraget
        </button>
      </div>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm("Avbryta uppdraget utan att rapportera?")) void run(() => sessions.cancel(session.id)); }} className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600">
        <X size={12} /> Avbryt utan rapport
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {finishing && project && (
        <WorkReportModal
          project={project}
          report={null}
          title="Klar med uppdraget"
          prefill={{ hours: suggestion.hours, waitingHours: suggestion.waitingHours, taskId: session.task_id }}
          hint="Timmar och väntetid kommer från klockan (rast är avdragen). Lägg till körsträcka. Du kan ändra allt innan du sparar."
          lockPerformer
          onSubmitReport={(input) => sessions.finish(session.id, input)}
          onClose={() => setFinishing(false)}
        />
      )}
    </li>
  );
}

export function AssignmentsPanel() {
  const sessions = useSessions();
  const attendance = useAttendance();
  const { projects } = useStore();
  const [picked, setPicked] = useState<Project | null>(null);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function start() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sessions.start(picked.id, taskId || null);
      setNotice(result.clockedIn ? "Uppdraget har startat och du har också stämplats in för dagen." : "Uppdraget har startat.");
      setPicked(null);
      setTaskId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uppdraget kunde inte startas.");
    } finally {
      setBusy(false);
    }
  }

  const tasks = (picked?.tasks ?? []).filter((t) => t.status !== "Klar");
  return (
    <Panel title="Uppdrag">
      {sessions.mine.length > 0 && (
        <ul className="mb-4 space-y-3">
          {sessions.mine.map((s) => <SessionCard key={s.id} session={s} project={projects.find((p) => p.id === s.project_id)} />)}
        </ul>
      )}
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-700">{sessions.mine.length > 0 ? "Starta ett till uppdrag (de kan pågå samtidigt)" : "Starta uppdrag"}</div>
        <ProjectPicker value={picked} onChange={(p) => { setPicked(p); setTaskId(""); }} />
        {picked && tasks.length > 0 && (
          <Field label="Arbetsorder (valfritt)">
            <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Ingen specifik</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.task}</option>)}
            </select>
          </Field>
        )}
        <Button type="button" className="w-full justify-center !py-3 text-base" disabled={!picked || busy} onClick={() => void start()}>
          <Play size={18} /> Starta uppdrag
        </Button>
        {picked && !attendance.openEntry && <p className="text-xs text-slate-500">Du är inte instämplad. Du stämplas också in för dagen när uppdraget startar.</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-slate-400">Väntetid räknas som arbetad tid för lön. Rapporterad (debiterbar) tid kan vara högre än arbetad tid, till exempel när du kör åt två projekt samtidigt.</p>
      </div>
    </Panel>
  );
}
