import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, FileText, Loader2, LogOut, MapPin, Package, Pencil, Plus, Trash2, Truck } from "lucide-react";
import type { CarrierAssignment } from "../types";
import { WORK_TYPES } from "../types";
import { useAuth } from "../lib/auth";
import { loadCarrierData, deleteCarrierReport, saveCarrierReport } from "../data/carrierPortal";
import type { CarrierReportRow } from "../data/workReportRepository";
import { formatDecimal, kmToMil, KM_PER_MIL } from "../lib/billing";
import { decimalText, parseDecimal } from "../lib/numberInput";
import { localDateKey } from "../lib/stockholmTime";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { Panel } from "../components/ui/Panel";

function ReportModal({
  assignment,
  report,
  onClose,
  onSaved,
}: {
  assignment: CarrierAssignment;
  report: CarrierReportRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentCarrierUser } = useAuth();
  const [date, setDate] = useState(report?.report_date ?? localDateKey(new Date()));
  const [hours, setHours] = useState(decimalText(report?.hours));
  const [distance, setDistance] = useState(decimalText(report?.distance_km));
  const [unit, setUnit] = useState<"km" | "mil">("km");
  const [waiting, setWaiting] = useState(decimalText(report?.waiting_hours));
  const [workType, setWorkType] = useState(report?.work_type ?? "transport");
  const [comment, setComment] = useState(report?.comment ?? "");
  const [saving, setSaving] = useState(false);
  // Samma id vid omförsök så att rapporten aldrig sparas två gånger (t.ex. efter bortfallet nätverk eller dubbelklick).
  const reportId = useRef(report?.id ?? crypto.randomUUID()).current;
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentCarrierUser || saving) return;
    setError(null);
    const h = parseDecimal(hours);
    const d = parseDecimal(distance);
    const w = parseDecimal(waiting);
    if ([h, d, w].some((v) => v !== null && Number.isNaN(v))) return setError("Kontrollera att siffrorna är rätt ifyllda (t.ex. 4,5).");
    const km = d === null ? null : unit === "mil" ? d * KM_PER_MIL : d;
    if ((h ?? 0) <= 0 && (km ?? 0) <= 0 && (w ?? 0) <= 0) return setError("Ange minst tid, körsträcka eller väntetid.");
    setSaving(true);
    try {
      await saveCarrierReport(currentCarrierUser, {
        id: reportId,
        project_id: assignment.id,
        task_id: null,
        report_date: date,
        hours: h,
        distance_km: km,
        waiting_hours: w,
        work_type: workType,
        comment,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rapporten kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={report ? "Ändra rapport" : "Rapportera arbete"} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">{assignment.project_number} · {assignment.name}</p>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <Field label="Datum"><input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Arbetstid (timmar)"><input inputMode="decimal" className={`${inputClass} !py-3`} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="t.ex. 4,5" /></Field>
          <Field label="Körsträcka">
            <div className="flex gap-2">
              <input inputMode="decimal" className={`${inputClass} !py-3`} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="0" />
              <select className={`${inputClass} !w-24`} value={unit} onChange={(e) => setUnit(e.target.value as "km" | "mil")} aria-label="Enhet"><option value="km">km</option><option value="mil">mil</option></select>
            </div>
          </Field>
          <Field label="Väntetid (timmar)"><input inputMode="decimal" className={`${inputClass} !py-3`} value={waiting} onChange={(e) => setWaiting(e.target.value)} placeholder="0" /></Field>
        </div>
        <Field label="Kommentar"><textarea className={`${inputClass} min-h-16 resize-y`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Vad gjordes, avvikelser…" /></Field>
        <details className="rounded-lg border border-border px-3 py-2 text-sm" open={workType !== "transport"}>
          <summary className="cursor-pointer font-medium text-slate-600">Fler val</summary>
          <div className="mt-3">
            <Field label="Typ av arbete">
              <select className={inputClass} value={workType} onChange={(e) => setWorkType(e.target.value)}>{WORK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            </Field>
          </div>
        </details>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit" disabled={saving} className="!px-5 !py-3">{saving ? "Sparar..." : "Skicka rapport"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function CarrierPortalPage() {
  const { currentCarrierUser, signOut } = useAuth();
  const [assignments, setAssignments] = useState<CarrierAssignment[]>([]);
  const [reports, setReports] = useState<CarrierReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ assignment: CarrierAssignment; report: CarrierReportRow | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentCarrierUser) return;
    try {
      const data = await loadCarrierData(currentCarrierUser);
      setAssignments(data.assignments);
      setReports(data.reports);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa uppdragen.");
    } finally {
      setLoading(false);
    }
  }, [currentCarrierUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const reportsByProject = useMemo(() => {
    const map = new Map<string, CarrierReportRow[]>();
    for (const r of reports) map.set(r.project_id, [...(map.get(r.project_id) ?? []), r]);
    return map;
  }, [reports]);

  async function remove(report: CarrierReportRow) {
    if (!currentCarrierUser) return;
    setError(null);
    try {
      await deleteCarrierReport(currentCarrierUser, report.id);
      await load();
      setNotice("Rapporten togs bort.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rapporten kunde inte tas bort.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-orange-600">JK Projektlogistik</div>
            <h1 className="text-xl font-semibold text-slate-900">Transportörsportal</h1>
            <p className="text-sm text-slate-500">{currentCarrierUser?.full_name}</p>
          </div>
          <Button variant="secondary" onClick={() => void signOut()}><LogOut size={15} /> Logga ut</Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <p className="text-sm text-slate-600">Här ser du uppdrag du blivit tilldelad av JK och kan rapportera utfört arbete i efterhand. Du ser bara dina egna uppdrag och rapporter.</p>
        {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Läser dina uppdrag...</div>
        ) : assignments.length === 0 ? (
          <Panel><p className="text-sm text-slate-500">Du har inga tilldelade uppdrag just nu.</p></Panel>
        ) : (
          assignments.map((a) => {
            const loadingLoc = a.locations.find((l) => l.type === "lastning");
            const unloadingLoc = a.locations.find((l) => l.type === "lossning");
            const own = reportsByProject.get(a.id) ?? [];
            return (
              <Panel key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Truck size={15} className="text-slate-400" />{a.project_number}</div>
                    <div className="text-sm text-slate-600">{a.name}</div>
                  </div>
                  <Button type="button" onClick={() => setReporting({ assignment: a, report: null })} className="!px-3 !py-2.5"><Plus size={15} /> Rapportera</Button>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex items-start gap-1.5"><MapPin size={12} className="mt-0.5 shrink-0" />{[loadingLoc?.company_name, loadingLoc?.name].filter(Boolean).join(", ") || "Lastning saknas"} → {[unloadingLoc?.company_name, unloadingLoc?.name].filter(Boolean).join(", ") || "Lossning saknas"}</div>
                  <div className="flex items-center gap-1.5"><Clock size={12} />Lastning {a.planned_loading_date ?? "-"} {a.planned_loading_time?.slice(0, 5) ?? ""} · Lossning {a.planned_delivery_date ?? "-"} {a.planned_delivery_time?.slice(0, 5) ?? ""}</div>
                  {a.cargo.length > 0 && <div className="flex items-start gap-1.5"><Package size={12} className="mt-0.5 shrink-0" />{a.cargo.map((c) => c.description).join(", ")}</div>}
                  {a.special_requirements && <div className="flex items-start gap-1.5"><FileText size={12} className="mt-0.5 shrink-0" />{a.special_requirements}</div>}
                </div>
                {own.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Mina rapporter</div>
                    <ul className="divide-y divide-border">
                      {own.map((r) => (
                        <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-700">{r.report_date}</div>
                            <div className="text-slate-600">
                              {[r.hours ? `${formatDecimal(r.hours)} h` : null, r.distance_km ? `${formatDecimal(kmToMil(r.distance_km))} mil` : null, r.waiting_hours ? `väntetid ${formatDecimal(r.waiting_hours)} h` : null].filter(Boolean).join(" · ")}
                            </div>
                            {r.comment && <div className="text-slate-500">{r.comment}</div>}
                            {r.locked && <div className="mt-0.5 text-amber-700">Behandlad av JK – kontakta JK för ändring.</div>}
                          </div>
                          {!r.locked && (
                            <div className="flex shrink-0">
                              <Button type="button" variant="ghost" className="!p-2" aria-label="Ändra rapport" onClick={() => setReporting({ assignment: a, report: r })}><Pencil size={14} /></Button>
                              <Button type="button" variant="ghost" className="!p-2 text-red-600" aria-label="Ta bort rapport" onClick={() => void remove(r)}><Trash2 size={14} /></Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            );
          })
        )}
      </main>
      {reporting && (
        <ReportModal
          assignment={reporting.assignment}
          report={reporting.report}
          onClose={() => setReporting(null)}
          onSaved={() => { setNotice("Rapporten sparades."); void load(); }}
        />
      )}
    </div>
  );
}
