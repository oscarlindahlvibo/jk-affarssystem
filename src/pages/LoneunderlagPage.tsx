import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, FileCheck2, Plus } from "lucide-react";
import { useAttendance } from "../data/attendance";
import { useStore } from "../data/store";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { Panel } from "../components/ui/Panel";
import { hm, ReasonModal } from "../components/attendance/shared";
import { ABSENCE_KINDS, type PayrollPeriod, type PayrollStatement, type PayrollStatementStatus } from "../types";
import type { PayrollDay, PayrollTotals } from "../lib/payrollRules";
import { EXPORT_ADAPTERS } from "../lib/payrollExport/adapters";
import { internalTimeTypes } from "../lib/payrollCompute";

const STATUS_LABEL: Record<PayrollStatementStatus | "none", string> = {
  none: "Preliminär", preliminary: "Preliminär", submitted: "Inskickad av medarbetare", attested: "Attesterad", reviewed: "Granskad av lön", exported: "Exporterad",
};
const STATUS_STYLE: Record<PayrollStatementStatus | "none", string> = {
  none: "bg-slate-100 text-slate-600", preliminary: "bg-slate-100 text-slate-600", submitted: "bg-sky-50 text-sky-700", attested: "bg-emerald-50 text-emerald-700", reviewed: "bg-violet-50 text-violet-700", exported: "bg-navy-900 text-white",
};

function download(name: string, mime: string, content: string | Uint8Array) {
  const blob = new Blob([content as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const sum = (rec: Record<string, number> | undefined) => Object.values(rec ?? {}).reduce((a, b) => a + b, 0);

function DayDetail({ userId, period, onClose }: { userId: string; period: PayrollPeriod; onClose: () => void }) {
  const att = useAttendance();
  const { profiles } = useStore();
  const statement = att.statementFor(period.id, userId);
  const locked = statement && ["attested", "reviewed", "exported"].includes(statement.status);
  const live = att.compute(userId, period);
  const days = (locked && statement?.days ? (statement.days as PayrollDay[]) : live.days);
  const labels = new Map(internalTimeTypes(att.ruleSets).map((t) => [t.key, t.label]));
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absence, setAbsence] = useState({ date: period.start_date, kind: ABSENCE_KINDS[0].key, minutes: 480, comment: "", reason: "" });
  const [error, setError] = useState<string | null>(null);

  async function saveAbsence() {
    setError(null);
    try {
      await att.saveAbsence({ userId, date: absence.date, kind: absence.kind, minutes: absence.minutes, comment: absence.comment }, absence.reason);
      setAbsenceOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara frånvaron.");
    }
  }

  return (
    <Modal open onClose={onClose} title={`${profiles.find((p) => p.id === userId)?.full_name ?? ""} · ${period.name}`} wide>
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {locked ? "Visar den attesterade, låsta beräkningen." : "Preliminär beräkning från aktuella stämplingar. Den kan ändras tills perioden attesteras."} Fakturerbar kundtid ingår inte här.
      </p>
      {!live.hasTerms && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Schema och regler saknas för personen. Ställ in dem under Inställningar → Lön.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border text-left text-slate-500"><th className="py-1.5">Datum</th><th>Dagtyp</th><th className="text-right">Schema</th><th className="text-right">Arbetat</th><th className="text-right">Rast</th><th className="text-right">Ordinarie</th><th className="text-right">Övertid</th><th className="text-right">Frånvaro</th><th>Anm.</th></tr></thead>
          <tbody>
            {days.filter((d) => d.workedMinutes || d.scheduledMinutes || sum(d.absence) || d.notes.length).map((d) => (
              <tr key={d.date} className="border-b border-border align-top">
                <td className="py-1.5 whitespace-nowrap">{d.date}</td>
                <td>{{ weekday: "Vardag", saturday: "Lördag", sunday: "Söndag", holiday: d.holidayName ?? "Helgdag", holiday_eve: d.holidayName ? `${d.holidayName} (afton)` : "Helgdagsafton" }[d.dayType]}</td>
                <td className="text-right">{hm(d.scheduledMinutes)}</td>
                <td className="text-right">{hm(d.workedMinutes)}</td>
                <td className="text-right">{hm(d.breakMinutes)}</td>
                <td className="text-right">{hm(d.ordinaryMinutes)}</td>
                <td className="text-right">{Object.entries(d.overtime).filter(([, m]) => m).map(([k, m]) => `${labels.get(k) ?? k} ${hm(m)}`).join(", ") || "–"}</td>
                <td className="text-right">{Object.entries(d.absence).filter(([, m]) => m).map(([k, m]) => `${labels.get(k) ?? k} ${hm(m)}`).join(", ") || "–"}</td>
                <td className="text-slate-500">{d.notes.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (att.canAttest || userId === att.actor?.id) && (
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={() => setAbsenceOpen((v) => !v)}><Plus size={15} /> Registrera frånvaro</Button>
          {absenceOpen && (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <Field label="Datum"><input type="date" className={inputClass} min={period.start_date} max={period.end_date} value={absence.date} onChange={(e) => setAbsence({ ...absence, date: e.target.value })} /></Field>
              <Field label="Typ"><select className={inputClass} value={absence.kind} onChange={(e) => setAbsence({ ...absence, kind: e.target.value })}>{ABSENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
              <Field label="Minuter"><input type="number" min={1} className={inputClass} value={absence.minutes} onChange={(e) => setAbsence({ ...absence, minutes: Number(e.target.value) })} /></Field>
              <Field label="Kommentar"><input className={inputClass} value={absence.comment} onChange={(e) => setAbsence({ ...absence, comment: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Orsak (krävs)"><input className={inputClass} value={absence.reason} onChange={(e) => setAbsence({ ...absence, reason: e.target.value })} /></Field></div>
              {error && <p className="col-span-2 text-sm text-red-700">{error}</p>}
              <div className="col-span-2 flex justify-end"><Button type="button" onClick={saveAbsence}>Spara frånvaro</Button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function LoneunderlagPage() {
  const att = useAttendance();
  const { profiles } = useStore();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("alla");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: "", start: "", end: "" });
  const [unattesting, setUnattesting] = useState<PayrollStatement | null>(null);
  const [adjusting, setAdjusting] = useState<PayrollStatement | null>(null);
  const [formatId, setFormatId] = useState(EXPORT_ADAPTERS[0].id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmForce, setConfirmForce] = useState(false);
  const [forceReason, setForceReason] = useState("");

  const periods = [...att.state.periods].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const period = periods.find((p) => p.id === periodId) ?? periods[0] ?? null;
  const people = useMemo(() => {
    const all = profiles.filter((p) => p.org_id === att.actor?.orgId && p.status === "aktiv");
    return att.canViewPayroll ? all : all.filter((p) => p.id === att.actor?.id);
  }, [profiles, att.actor, att.canViewPayroll]);

  async function act(fn: () => Promise<void>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: okText });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Åtgärden misslyckades." });
    } finally {
      setBusy(false);
    }
  }

  const rows = period
    ? people.map((person) => {
        const statement = att.statementFor(period.id, person.id);
        const locked = statement && ["attested", "reviewed", "exported"].includes(statement.status);
        const live = att.compute(person.id, period);
        const totals = (locked && statement?.totals ? statement.totals : live.totals) as unknown as PayrollTotals;
        const pendingAdjust = att.state.adjustments.some((a) => a.statement_id === statement?.id && a.export_id === null);
        const changedSince = Boolean(locked && statement?.totals && JSON.stringify([(statement.totals as unknown as PayrollTotals).workedMinutes, (statement.totals as unknown as PayrollTotals).ordinaryMinutes]) !== JSON.stringify([live.totals.workedMinutes, live.totals.ordinaryMinutes]));
        return { person, statement, status: (statement?.status ?? "none") as PayrollStatementStatus | "none", totals, live, locked: Boolean(locked), pendingAdjust, changedSince };
      })
    : [];
  const shown = rows.filter((r) => (statusFilter === "alla" || r.status === statusFilter || (statusFilter === "preliminary" && r.status === "none")) && r.person.full_name.toLowerCase().includes(query.toLowerCase()));

  const exportable = shown.filter((r) => r.statement && (r.status === "reviewed" || r.status === "exported"));
  const chosen = exportable.filter((r) => picked.has(r.statement!.id));
  const alreadyExported = chosen.filter((r) => r.status === "exported" && !r.pendingAdjust);
  const adapter = EXPORT_ADAPTERS.find((a) => a.id === formatId)!;

  async function doExport(force: boolean) {
    if (!period) return;
    setBusy(true);
    setMessage(null);
    try {
      const built = await att.exportPeriod({ periodId: period.id, statementIds: chosen.map((r) => r.statement!.id), formatId, force, reason: forceReason });
      download(built.fileName, built.mimeType, built.content);
      setPicked(new Set());
      setConfirmForce(false);
      setForceReason("");
      setMessage({ kind: "ok", text: `Exporterade ${built.rowCount} rader till ${built.fileName}.${built.warnings.length ? ` Obs: ${built.warnings.join(" ")}` : ""}` });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Exporten misslyckades." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Löneunderlaget bygger på stämplad arbetstid och JK:s egna regler. Det är ett underlag, inte en lönekörning. Skatt, semesterlön och utbetalning hanteras i lönesystemet.{att.isPayrollAdmin && <> <Link to="/installningar/lon" className="font-medium underline">Löneinställningar</Link></>}
      </div>
      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} role={message.kind === "err" ? "alert" : "status"}>{message.text}</p>}
      {att.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{att.error}</p>}

      <Panel title="Löneperiod">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period">
            <select className={inputClass} value={period?.id ?? ""} onChange={(e) => { setPeriodId(e.target.value); setPicked(new Set()); }}>
              {periods.length === 0 && <option value="">Inga perioder</option>}
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.start_date} – {p.end_date})</option>)}
            </select>
          </Field>
          {att.isPayrollAdmin && (
            <>
              <Field label="Ny period"><input className={inputClass} placeholder="Namn, t.ex. Oktober 2026" value={newPeriod.name} onChange={(e) => setNewPeriod({ ...newPeriod, name: e.target.value })} /></Field>
              <Field label="Från"><input type="date" className={inputClass} value={newPeriod.start} onChange={(e) => setNewPeriod({ ...newPeriod, start: e.target.value })} /></Field>
              <Field label="Till"><input type="date" className={inputClass} value={newPeriod.end} onChange={(e) => setNewPeriod({ ...newPeriod, end: e.target.value })} /></Field>
              <Button type="button" disabled={busy || !newPeriod.name || !newPeriod.start || !newPeriod.end} onClick={() => act(async () => { await att.createPeriod(newPeriod.name, newPeriod.start, newPeriod.end); setNewPeriod({ name: "", start: "", end: "" }); }, "Löneperioden skapades.")}>Skapa period</Button>
            </>
          )}
        </div>
      </Panel>

      {period && (
        <Panel title={att.canViewPayroll ? "Personal" : "Min sammanställning"}>
          {att.canViewPayroll && (
            <div className="mb-3 flex flex-wrap gap-3">
              <input className={`${inputClass} max-w-56`} placeholder="Sök person" value={query} onChange={(e) => setQuery(e.target.value)} />
              <select className={`${inputClass} max-w-56`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="alla">Alla statusar</option>
                {(["preliminary", "submitted", "attested", "reviewed", "exported"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-slate-500">
                {att.isPayrollAdmin && <th className="w-8" />}
                <th className="py-2">Namn</th><th className="text-right">Arbetat</th><th className="text-right">Ordinarie</th><th className="text-right">Övertid</th><th className="text-right">Frånvaro</th><th className="pl-4">Status</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.person.id} className="border-b border-border align-top">
                    {att.isPayrollAdmin && <td className="py-2">{r.statement && (r.status === "reviewed" || r.status === "exported") && <input type="checkbox" aria-label={`Välj ${r.person.full_name}`} checked={picked.has(r.statement.id)} onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(r.statement!.id); else next.delete(r.statement!.id); return next; })} />}</td>}
                    <td className="py-2 font-medium text-slate-800"><button type="button" className="text-left hover:underline" onClick={() => setDetail(r.person.id)}>{r.person.full_name}</button>{!r.live.hasTerms && <span className="ml-2 text-xs text-amber-600">saknar schema/regler</span>}{r.totals.openEntryIds?.length > 0 && <span className="ml-2 text-xs text-amber-600">pågående stämpling</span>}</td>
                    <td className="text-right">{hm(r.totals.workedMinutes)}</td>
                    <td className="text-right">{hm(r.totals.ordinaryMinutes)}</td>
                    <td className="text-right">{hm(sum(r.totals.overtime))}</td>
                    <td className="text-right">{hm(sum(r.totals.absence))}</td>
                    <td className="pl-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      {!r.locked && <div className="text-[11px] text-slate-400">beräknas löpande</div>}
                      {r.changedSince && <div className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle size={11} /> Stämplingar ändrade efter attest</div>}
                      {r.pendingAdjust && <div className="text-[11px] text-amber-700">Rättelse väntar på export</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="flex flex-wrap justify-end gap-1.5 py-1">
                        {r.person.id === att.actor?.id && r.status !== "attested" && r.status !== "reviewed" && r.status !== "exported" && <Button type="button" variant="secondary" disabled={busy} onClick={() => act(() => att.submitStatement(period.id), "Din tid är inskickad för attest.")}>Skicka in</Button>}
                        {att.canAttest && !r.locked && <Button type="button" disabled={busy} onClick={() => act(() => att.attest(period.id, r.person.id), `${r.person.full_name} är attesterad.`)}>Attestera</Button>}
                        {att.canAttest && r.statement && (r.status === "attested" || r.status === "reviewed") && <Button type="button" variant="secondary" onClick={() => setUnattesting(r.statement)}>Öppna igen</Button>}
                        {att.isPayrollAdmin && r.status === "attested" && r.statement && <Button type="button" disabled={busy} onClick={() => act(() => att.review(r.statement!.id), "Markerad som granskad.")}><FileCheck2 size={14} /> Granska</Button>}
                        {att.isPayrollAdmin && r.status === "exported" && r.statement && r.changedSince && <Button type="button" variant="secondary" onClick={() => setAdjusting(r.statement)}>Registrera rättelse</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-slate-500">Inga personer matchar.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Flöde: medarbetare skickar in → ansvarig (admin/projektledare) attesterar → Ulrika/ekonomi granskar → export. Attesterad tid låses; exporterad tid ändras bara via spårbar rättelse.</p>
        </Panel>
      )}

      {att.isPayrollAdmin && period && (
        <Panel title="Export">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Format">
                <select className={inputClass} value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  {EXPORT_ADAPTERS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
              <p className="text-xs text-slate-500">{adapter.description}</p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Direkt Spiris-format är inte aktiverat: ingen officiellt dokumenterad filimport eller API har kunnat verifieras. Använd CSV/Excel för manuell inmatning eller import enligt Spiris egna instruktioner. Se docs/lon-och-spiris.md.</p>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{chosen.length} person(er) valda. Endast granskade (eller exporterade med väntande rättelse) kan exporteras.</p>
              <Button type="button" disabled={busy || chosen.length === 0} onClick={() => (alreadyExported.length > 0 ? setConfirmForce(true) : doExport(false))}><Download size={15} /> Exportera valda</Button>
            </div>
          </div>
          {att.state.exports.filter((x) => x.period_id === period.id).length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Tidigare exporter</h4>
              <ul className="space-y-1 text-xs text-slate-600">
                {att.state.exports.filter((x) => x.period_id === period.id).map((x) => (
                  <li key={x.id}>{new Date(x.created_at).toLocaleString("sv-SE")} · {x.format.toUpperCase()} · {{ regular: "Ordinarie", correction: "Rättelse", reexport: "Omexport" }[x.kind]} · {x.row_count} rader · {x.statement_ids.length} personer{x.reason ? ` · ${x.reason}` : ""}{x.checksum ? ` · sha256 ${x.checksum.slice(0, 12)}…` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {detail && period && <DayDetail userId={detail} period={period} onClose={() => setDetail(null)} />}
      <ReasonModal open={Boolean(unattesting)} title="Öppna attesterad period igen" confirmLabel="Öppna igen" onClose={() => setUnattesting(null)} onConfirm={(reason) => att.unattest(unattesting!.id, reason)} />
      <ReasonModal open={Boolean(adjusting)} title="Registrera rättelse efter export" confirmLabel="Registrera" onClose={() => setAdjusting(null)} onConfirm={(reason) => att.recordAdjustment(adjusting!.id, reason)}>
        <p className="text-sm text-slate-600">Skillnaden mellan exporterat underlag och aktuell tid sparas som en rättelserad och följer med nästa rättelseexport.</p>
      </ReasonModal>
      <Modal open={confirmForce} onClose={() => setConfirmForce(false)} title="Redan exporterat">
        <div className="space-y-3">
          <p className="text-sm text-amber-800"><AlertTriangle className="mr-1 inline" size={15} />Minst en vald person är redan exporterad för perioden. En ny export kan ge dubbla belopp i lönesystemet.</p>
          <Field label="Orsak till omexport (krävs)"><textarea className={inputClass} rows={2} value={forceReason} onChange={(e) => setForceReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setConfirmForce(false)}>Avbryt</Button><Button type="button" disabled={!forceReason.trim() || busy} onClick={() => doExport(true)}>Exportera ändå</Button></div>
        </div>
      </Modal>
    </div>
  );
}
