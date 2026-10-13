import { useState } from "react";
import { Coffee, LogIn, LogOut, Play, Repeat, Utensils } from "lucide-react";
import { useTimeTracking } from "../../data/timeTracking";
import { formatClock, formatMinutes, formatTimeOfDay } from "../../lib/format";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";
import { defaultJobDraft, JobPicker, toJob, type JobDraft } from "./JobPicker";
import { useNow } from "./useNow";

export function ClockCard() {
  const { openEntry, myEntries, activeCategories, categories, clockIn, switchJob, startPause, resume, clockOut } = useTimeTracking();
  const now = useNow(Boolean(openEntry));
  const [job, setJob] = useState<JobDraft>(() => defaultJobDraft(activeCategories[0]?.key));
  const [note, setNote] = useState("");
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveJob = job.categoryKey || !activeCategories[0] ? job : { ...job, categoryKey: activeCategories[0].key };
  const onPause = openEntry && openEntry.entry_type !== "work";
  const categoryLabel = (key: string | null) => categories.find((c) => c.key === key)?.label ?? key ?? "";

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const workedToday = myEntries
    .filter((e) => e.entry_type === "work" && new Date(e.start_time) >= todayStart)
    .reduce((sum, e) => sum + (e.end_time ? e.total_minutes : Math.max(Math.floor((now - new Date(e.start_time).getTime()) / 60000), 0)), 0);

  async function run(action: () => Promise<void>, reset = true) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (reset) {
        setNote("");
        setSwitching(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stämplingen misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Stämpelklocka">
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!openEntry ? (
          <>
            <div className="text-sm text-slate-500">Du är inte instämplad. Välj vad du ska jobba med och starta klockan.</div>
            <JobPicker value={effectiveJob} onChange={setJob} stacked />
            <Field label="Anteckning (valfritt)">
              <textarea className={`${inputClass} min-h-16 resize-y`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vad ska du göra?" />
            </Field>
            <Button
              type="button"
              className="w-full justify-center !py-3 text-base"
              disabled={busy || !effectiveJob.categoryKey}
              onClick={() => run(() => clockIn(toJob(effectiveJob), note))}
            >
              <LogIn size={18} /> Stämpla in
            </Button>
          </>
        ) : (
          <>
            <div className={`rounded-xl p-4 text-center ${onPause ? "bg-amber-50" : "bg-green-50"}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${onPause ? "text-amber-700" : "text-green-700"}`}>
                {openEntry.entry_type === "lunch" ? "Lunch pågår" : openEntry.entry_type === "break" ? "Rast pågår" : "Instämplad"} sedan {formatTimeOfDay(openEntry.start_time)}
              </div>
              <div className="mt-1 font-mono text-4xl font-semibold tabular-nums text-slate-800" aria-live="off">
                {formatClock(now - new Date(openEntry.start_time).getTime())}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {categoryLabel(openEntry.category_key)}
                {openEntry.project_label ? ` · ${openEntry.project_label}` : " · Intern tid"}
              </div>
              <div className="mt-1 text-xs text-slate-500">Arbetad tid idag: {formatMinutes(workedToday) || "0 min"}</div>
            </div>

            <Field label={onPause ? "Anteckning vid utstämpling (valfritt)" : "Anteckning för passet (valfritt)"}>
              <textarea className={`${inputClass} min-h-16 resize-y`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vad blev gjort?" />
            </Field>

            {switching && !onPause && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="text-sm font-medium text-slate-700">Byt till ett nytt jobb</div>
                <JobPicker value={effectiveJob} onChange={setJob} stacked />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setSwitching(false)}>Avbryt</Button>
                  <Button type="button" disabled={busy || !effectiveJob.categoryKey} onClick={() => run(() => switchJob(toJob(effectiveJob), note, ""))}>
                    <Repeat size={15} /> Byt jobb
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {onPause ? (
                <Button type="button" className="justify-center !py-3" disabled={busy} onClick={() => run(() => resume(), false)}>
                  <Play size={16} /> Fortsätt arbeta
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" className="justify-center !py-3" disabled={busy} onClick={() => run(() => startPause("break", note))}>
                    <Coffee size={16} /> Rast
                  </Button>
                  <Button type="button" variant="secondary" className="justify-center !py-3" disabled={busy} onClick={() => run(() => startPause("lunch", note))}>
                    <Utensils size={16} /> Lunch
                  </Button>
                  <Button type="button" variant="secondary" className="justify-center !py-3" disabled={busy || switching} onClick={() => setSwitching(true)}>
                    <Repeat size={16} /> Byt jobb
                  </Button>
                </>
              )}
              <Button type="button" className={`justify-center !py-3 ${onPause ? "" : ""}`} disabled={busy} onClick={() => run(() => clockOut(note))}>
                <LogOut size={16} /> Stämpla ut
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
