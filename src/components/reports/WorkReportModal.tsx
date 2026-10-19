import { useMemo, useRef, useState } from "react";
import type { Project, WorkReport } from "../../types";
import { WORK_TYPES } from "../../types";
import { useAuth } from "../../lib/auth";
import { useStore } from "../../data/store";
import { useWorkReports } from "../../data/workReports";
import type { WorkReportInput } from "../../lib/workReportEngine";
import { localDateKey } from "../../lib/stockholmTime";
import { KM_PER_MIL, kmToMil } from "../../lib/billing";
import { decimalText, parseDecimal } from "../../lib/numberInput";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { TimeFields, useAutoHours } from "./TimeFields";
import { normalizeTime } from "../../lib/reportTimes";

export interface WorkReportPrefill {
  hours: number;
  waitingHours: number;
  taskId?: string | null;
  start?: string | null;
  end?: string | null;
}

export function WorkReportModal({
  project, report, onClose, prefill, title, hint, lockPerformer = false, onSubmitReport,
}: {
  project: Project;
  report: WorkReport | null;
  onClose: () => void;
  // Förifyllda värden (t.ex. från ett uppdrag på klockan). Allt kan ändras innan sparning.
  prefill?: WorkReportPrefill;
  title?: string;
  hint?: string;
  lockPerformer?: boolean;
  // Ersätter vanlig sparning (t.ex. "avsluta uppdrag och spara rapport" i en och samma åtgärd).
  onSubmitReport?: (input: WorkReportInput) => Promise<void>;
}) {
  const { currentProfile } = useAuth();
  const { profiles, suppliers } = useStore();
  const { saveReport, canManage, canSeeFinance } = useWorkReports();
  const isManager = canManage && !lockPerformer;

  const initialPerformer = report
    ? report.performer_type === "carrier"
      ? `supplier:${report.performer_supplier_id ?? ""}`
      : `profile:${report.performer_profile_id ?? currentProfile?.id ?? ""}`
    : `profile:${currentProfile?.id ?? ""}`;

  const [date, setDate] = useState(report?.report_date ?? localDateKey(new Date()));
  const [performer, setPerformer] = useState(initialPerformer);
  const [hours, setHours] = useState(decimalText(report?.hours ?? (prefill && prefill.hours > 0 ? prefill.hours : null)));
  const [startTime, setStartTime] = useState(normalizeTime(report?.report_start ?? prefill?.start) ?? "");
  const [endTime, setEndTime] = useState(normalizeTime(report?.report_end ?? prefill?.end) ?? "");
  const auto = useAutoHours(setHours, Boolean(report?.hours) || Boolean(prefill && prefill.hours > 0));
  const [distance, setDistance] = useState(decimalText(report?.distance_km));
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mil">("km");
  const [waiting, setWaiting] = useState(decimalText(report?.waiting_hours ?? (prefill && prefill.waitingHours > 0 ? prefill.waitingHours : null)));
  const [workType, setWorkType] = useState(report?.work_type ?? "transport");
  const [billable, setBillable] = useState(report?.billable ?? true);
  const [cost, setCost] = useState(decimalText(report?.internal_cost));
  const [comment, setComment] = useState(report?.comment ?? "");
  const [taskId, setTaskId] = useState(report?.task_id ?? prefill?.taskId ?? "");
  const [saving, setSaving] = useState(false);
  // Samma id vid omförsök (t.ex. efter bortfallet nätverk) så att rapporten aldrig sparas två gånger.
  const reportId = useRef(report?.id ?? crypto.randomUUID()).current;
  const [error, setError] = useState<string | null>(null);

  const activeProfiles = useMemo(() => profiles.filter((p) => p.status === "aktiv"), [profiles]);
  const projectSupplierIds = useMemo(
    () => new Set([...(project.supplier_ids ?? []), ...(project.supplier_id ? [project.supplier_id] : [])]),
    [project]
  );
  const supplierOptions = useMemo(
    () => [...suppliers].sort((a, b) => Number(projectSupplierIds.has(b.id)) - Number(projectSupplierIds.has(a.id)) || a.company_name.localeCompare(b.company_name, "sv")),
    [suppliers, projectSupplierIds]
  );

  const distanceKm = (() => {
    const value = parseDecimal(distance);
    return value === null || Number.isNaN(value) ? value : distanceUnit === "mil" ? value * KM_PER_MIL : value;
  })();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    const parsed = { hours: parseDecimal(hours), waiting: parseDecimal(waiting), cost: parseDecimal(cost) };
    if ([parsed.hours, distanceKm, parsed.waiting, parsed.cost].some((value) => value !== null && Number.isNaN(value))) {
      setError("Kontrollera att siffrorna är rätt ifyllda (t.ex. 4,5).");
      return;
    }
    if ((parsed.hours ?? 0) <= 0 && (distanceKm ?? 0) <= 0 && (parsed.waiting ?? 0) <= 0) {
      setError("Ange minst tid, körsträcka eller väntetid.");
      return;
    }
    if (Boolean(startTime) !== Boolean(endTime)) {
      setError("Ange både start- och sluttid, eller lämna båda tomma.");
      return;
    }
    const [kind, id] = performer.split(":");
    setSaving(true);
    try {
      const submit_ = onSubmitReport ?? saveReport;
      await submit_({
        id: reportId,
        project_id: project.id,
        task_id: taskId || null,
        report_date: date,
        report_start: startTime || null,
        report_end: endTime || null,
        performer_type: kind === "supplier" ? "carrier" : "employee",
        performer_profile_id: kind === "profile" ? id : null,
        performer_supplier_id: kind === "supplier" ? id : null,
        hours: parsed.hours,
        distance_km: distanceKm,
        waiting_hours: parsed.waiting,
        work_type: workType,
        billable,
        comment,
        ...(canSeeFinance ? { internal_cost: parsed.cost } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rapporten kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title ?? (report ? "Ändra rapport" : "Rapportera arbete")} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="text-slate-500">Uppdrag:</span> <strong>{project.project_number}</strong> {project.name}</div>
        {hint && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">{hint}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Datum">
            <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {isManager && (
            <Field label="Utförare">
              <select className={inputClass} value={performer} onChange={(e) => setPerformer(e.target.value)} disabled={!isManager}>
                {!isManager && <option value={`profile:${currentProfile?.id ?? ""}`}>{currentProfile?.full_name ?? "Jag"}</option>}
                {isManager && (
                  <>
                    <optgroup label="Anställda">
                      {activeProfiles.map((p) => <option key={p.id} value={`profile:${p.id}`}>{p.full_name}</option>)}
                    </optgroup>
                    <optgroup label="Extern transportör">
                      {supplierOptions.map((s) => <option key={s.id} value={`supplier:${s.id}`}>{s.company_name}{projectSupplierIds.has(s.id) ? " (på projektet)" : ""}</option>)}
                    </optgroup>
                  </>
                )}
              </select>
            </Field>
          )}
        </div>
        <TimeFields
          start={startTime}
          end={endTime}
          onStart={(v) => { setStartTime(v); auto.recompute(v, endTime, waiting); }}
          onEnd={(v) => { setEndTime(v); auto.recompute(startTime, v, waiting); }}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Arbetstid (timmar)">
            <input inputMode="decimal" className={inputClass} value={hours} onChange={(e) => { setHours(e.target.value); auto.hoursChanged(e.target.value); }} placeholder="t.ex. 4,5" />
          </Field>
          <Field label="Körsträcka">
            <div className="flex gap-2">
              <input inputMode="decimal" className={inputClass} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="0" />
              <select className={`${inputClass} !w-24`} value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as "km" | "mil")} aria-label="Enhet">
                <option value="km">km</option>
                <option value="mil">mil</option>
              </select>
            </div>
            {distanceKm !== null && !Number.isNaN(distanceKm) && distanceKm > 0 && (
              <p className="mt-1 text-xs text-slate-500">{decimalText(distanceKm, 1)} km = {decimalText(kmToMil(distanceKm), 2)} mil</p>
            )}
          </Field>
          <Field label="Väntetid (timmar)">
            <input inputMode="decimal" className={inputClass} value={waiting} onChange={(e) => { setWaiting(e.target.value); auto.recompute(startTime, endTime, e.target.value); }} placeholder="0" />
          </Field>
        </div>
        <Field label="Kommentar">
          <textarea className={`${inputClass} min-h-16 resize-y`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Vad gjordes, eventuella avvikelser…" />
        </Field>
        <details className="rounded-lg border border-border px-3 py-2 text-sm" open={Boolean(report && (report.work_type !== "transport" || !report.billable || report.task_id))}>
          <summary className="cursor-pointer font-medium text-slate-600">Fler val (typ av arbete, arbetsorder, debitering)</summary>
          <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Typ av arbete">
            <select className={inputClass} value={workType} onChange={(e) => setWorkType(e.target.value)}>
              {WORK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Arbetsorder (valfritt)">
            <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Ingen specifik</option>
              {(project.tasks ?? []).map((t) => <option key={t.id} value={t.id}>{t.task}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
            Debiterbar mot kund
          </label>
          {canSeeFinance && (
            <Field label="Intern kostnad (kr)">
              <input inputMode="decimal" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Visas bara för behöriga" />
            </Field>
          )}
        </div>
          </div>
        </details>
        <p className="text-xs text-slate-500">Rapporterad tid hos kund påverkar aldrig någons lönegrundande arbetstid.</p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit" disabled={saving}>{saving ? "Sparar..." : "Spara rapport"}</Button>
        </div>
      </form>
    </Modal>
  );
}
