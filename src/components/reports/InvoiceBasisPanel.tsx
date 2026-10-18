import { useMemo, useState } from "react";
import { Lock, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { BillingRateType, Project, WorkReport } from "../../types";
import { useStore } from "../../data/store";
import { useWorkReports } from "../../data/workReports";
import { billableQuantities, buildInvoiceBasis, formatDecimal, formatMoney, kmToMil, KM_PER_MIL, resolveRates } from "../../lib/billing";
import { decimalText, parseDecimal } from "../../lib/numberInput";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Panel } from "../ui/Panel";

const RATE_FIELDS: { type: BillingRateType; label: string; unit: string }[] = [
  { type: "hours", label: "Transportarbete", unit: "kr/h" },
  { type: "distance", label: "Körsträcka", unit: "kr/mil" },
  { type: "waiting", label: "Väntetid", unit: "kr/h" },
];

function AdjustModal({ report, onClose }: { report: WorkReport; onClose: () => void }) {
  const { billings, adjustBilling } = useWorkReports();
  const billing = billings.find((b) => b.report_id === report.id);
  const q = billableQuantities(report, billing);
  const [hours, setHours] = useState(decimalText(billing?.billable_hours ?? null));
  const [mil, setMil] = useState(decimalText(billing?.billable_distance_km != null ? kmToMil(billing.billable_distance_km) : null));
  const [waiting, setWaiting] = useState(decimalText(billing?.billable_waiting_hours ?? null));
  const [hoursRate, setHoursRate] = useState(decimalText(billing?.hours_rate ?? null));
  const [distanceRate, setDistanceRate] = useState(decimalText(billing?.distance_rate ?? null));
  const [waitingRate, setWaitingRate] = useState(decimalText(billing?.waiting_rate ?? null));
  const [reason, setReason] = useState(billing?.adjust_reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(reset = false) {
    setError(null);
    const values = reset
      ? { h: null, m: null, w: null, hr: null, dr: null, wr: null }
      : { h: parseDecimal(hours), m: parseDecimal(mil), w: parseDecimal(waiting), hr: parseDecimal(hoursRate), dr: parseDecimal(distanceRate), wr: parseDecimal(waitingRate) };
    if (Object.values(values).some((value) => value !== null && Number.isNaN(value))) {
      setError("Kontrollera att siffrorna är rätt ifyllda.");
      return;
    }
    setSaving(true);
    try {
      await adjustBilling(report.id, {
        billable_hours: values.h,
        billable_distance_km: values.m === null ? null : values.m * KM_PER_MIL,
        billable_waiting_hours: values.w,
        hours_rate: values.hr,
        distance_rate: values.dr,
        waiting_rate: values.wr,
        adjust_reason: reset ? "" : reason,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Justeringen kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Justera fakturerbart" wide>
      <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="text-xs text-slate-500">
          Rapporterat: {formatDecimal(report.hours ?? 0)} h, {formatDecimal(kmToMil(report.distance_km ?? 0))} mil, väntetid {formatDecimal(report.waiting_hours ?? 0)} h.
          Justeringen ändrar bara vad som faktureras. Ursprunglig rapport lämnas orörd. Tomt fält = följ rapporten ({formatDecimal(q.hours)} h / {formatDecimal(kmToMil(q.distanceKm))} mil / {formatDecimal(q.waiting)} h).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fakturerbar tid (h)"><input inputMode="decimal" className={inputClass} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <Field label="Fakturerbar körsträcka (mil)"><input inputMode="decimal" className={inputClass} value={mil} onChange={(e) => setMil(e.target.value)} /></Field>
          <Field label="Fakturerbar väntetid (h)"><input inputMode="decimal" className={inputClass} value={waiting} onChange={(e) => setWaiting(e.target.value)} /></Field>
          <Field label="Eget pris tid (kr/h)"><input inputMode="decimal" className={inputClass} value={hoursRate} onChange={(e) => setHoursRate(e.target.value)} /></Field>
          <Field label="Eget pris körsträcka (kr/mil)"><input inputMode="decimal" className={inputClass} value={distanceRate} onChange={(e) => setDistanceRate(e.target.value)} /></Field>
          <Field label="Eget pris väntetid (kr/h)"><input inputMode="decimal" className={inputClass} value={waitingRate} onChange={(e) => setWaitingRate(e.target.value)} /></Field>
        </div>
        <Field label="Orsak till justering">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="t.ex. överenskommet med kund" />
        </Field>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => void save(true)} disabled={saving}>Återställ till rapporterat</Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>Spara justering</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function InvoiceBasisPanel({ project }: { project: Project }) {
  const { getCustomer } = useStore();
  const { canSeeFinance, isFinanceAdmin, reports, billings, rates, extraLines, setRate, saveExtraLine, deleteExtraLine, markInvoiced, clearInvoiced } = useWorkReports();
  const [adjusting, setAdjusting] = useState<WorkReport | null>(null);
  const [selected, setSelected] = useState<{ reports: Set<string>; extras: Set<string> }>({ reports: new Set(), extras: new Set() });
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [extra, setExtra] = useState({ description: "", quantity: "1", unit: "st", price: "" });
  const [rateDrafts, setRateDrafts] = useState<Partial<Record<BillingRateType, string>>>({});

  const projectRates = useMemo(() => rates.filter((r) => r.project_id === project.id), [rates, project.id]);
  const customerRates = useMemo(() => rates.filter((r) => r.customer_id === project.customer_id), [rates, project.customer_id]);
  const resolved = useMemo(() => resolveRates(projectRates, customerRates), [projectRates, customerRates]);
  const projectReports = useMemo(() => reports.filter((r) => r.project_id === project.id).sort((a, b) => (a.report_date < b.report_date ? 1 : -1)), [reports, project.id]);
  const projectExtra = useMemo(() => extraLines.filter((l) => l.project_id === project.id), [extraLines, project.id]);
  const basis = useMemo(() => buildInvoiceBasis(projectReports, billings, resolved, projectExtra), [projectReports, billings, resolved, projectExtra]);
  const customer = getCustomer(project.customer_id);

  if (!canSeeFinance) return null;

  const billingOf = (id: string) => billings.find((b) => b.report_id === id);
  const draftFor = (type: BillingRateType) => rateDrafts[type] ?? decimalText(projectRates.find((r) => r.rate_type === type)?.unit_price ?? null);
  const ratesDirty = Object.keys(rateDrafts).length > 0;

  async function run(action: () => Promise<void>, okText?: string) {
    setMessage(null);
    try {
      await action();
      if (okText) setMessage({ kind: "ok", text: okText });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Åtgärden misslyckades." });
    }
  }

  async function saveRates() {
    await run(async () => {
      for (const field of RATE_FIELDS) {
        const value = parseDecimal(draftFor(field.type));
        if (value !== null && Number.isNaN(value)) throw new Error(`Ogiltigt pris för ${field.label.toLowerCase()}.`);
        const current = projectRates.find((r) => r.rate_type === field.type)?.unit_price ?? null;
        if (value !== current) await setRate({ projectId: project.id }, field.type, value);
      }
      setRateDrafts({});
    }, "Priserna sparades.");
  }

  function toggle(kind: "reports" | "extras", id: string) {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });
  }

  const selectedCount = selected.reports.size + selected.extras.size;
  const invoicedReports = projectReports.filter((r) => billingOf(r.id)?.invoiced_at);

  return (
    <Panel title="Fakturaunderlag">
      <div className="space-y-5">
        {message && (
          <div role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            {message.text}
          </div>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Priser</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RATE_FIELDS.map((field) => {
              const inherited = customerRates.find((r) => r.rate_type === field.type)?.unit_price;
              return (
                <Field key={field.type} label={`${field.label} (${field.unit})`}>
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={draftFor(field.type)}
                    onChange={(e) => setRateDrafts((prev) => ({ ...prev, [field.type]: e.target.value }))}
                    placeholder={inherited != null ? `Kundens pris: ${formatDecimal(inherited, 0)}` : "Saknas"}
                  />
                </Field>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Projektets pris används före kundens pris{customer ? ` (${customer.company_name})` : ""}.</span>
            <Button type="button" variant="secondary" className="!px-2.5 !py-1" disabled={!ratesDirty} onClick={() => void saveRates()}>Spara priser</Button>
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sammanställning</h4>
          {basis.lines.length === 0 ? (
            <p className="text-sm text-slate-500">Inga debiterbara rapporter ännu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 font-medium">Post</th>
                    <th className="py-1.5 text-right font-medium">Antal</th>
                    <th className="py-1.5 text-right font-medium">Pris</th>
                    <th className="py-1.5 text-right font-medium">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {basis.lines.map((line) => (
                    <tr key={line.key} className={line.invoiced ? "text-slate-400" : ""}>
                      <td className="py-1.5">{line.label}{line.invoiced && <Lock size={11} className="ml-1 inline" aria-label="Fakturerad" />}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatDecimal(line.quantity)} {line.unit}</td>
                      <td className="py-1.5 text-right tabular-nums">{line.unitPrice === null ? "saknas" : formatMoney(line.unitPrice)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoney(line.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-800">
                    <td className="py-2">Totalt</td><td /><td />
                    <td className="py-2 text-right tabular-nums">{formatMoney(basis.total)}</td>
                  </tr>
                  {basis.invoicedTotal > 0 && (
                    <tr className="text-xs text-slate-500">
                      <td className="py-1" colSpan={3}>Varav redan fakturerat / kvar att fakturera</td>
                      <td className="py-1 text-right tabular-nums">{formatMoney(basis.invoicedTotal)} / {formatMoney(basis.uninvoicedTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {basis.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-700">{w}</p>)}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rapporter och justering</h4>
          <ul className="divide-y divide-border">
            {projectReports.filter((r) => r.billable).map((r) => {
              const b = billingOf(r.id);
              const q = billableQuantities(r, b);
              const invoiced = Boolean(b?.invoiced_at);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                  <input type="checkbox" disabled={invoiced} checked={selected.reports.has(r.id)} onChange={() => toggle("reports", r.id)} aria-label={`Välj rapport ${r.report_date}`} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-700">{r.report_date} · {r.performer_name}</span>
                    <span className="ml-2 text-slate-500">{formatDecimal(q.hours)} h · {formatDecimal(kmToMil(q.distanceKm))} mil · väntetid {formatDecimal(q.waiting)} h</span>
                    {b?.adjusted_at && !invoiced && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">justerad</span>}
                    {invoiced && <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-green-700">fakturerad {b?.invoice_reference}</span>}
                  </div>
                  {!invoiced && (
                    <Button type="button" variant="ghost" className="!px-2 !py-1" onClick={() => setAdjusting(r)}><SlidersHorizontal size={13} /> Justera</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Övriga debiteringsposter</h4>
          <ul className="divide-y divide-border">
            {projectExtra.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-2 text-xs">
                <input type="checkbox" disabled={Boolean(l.invoiced_at)} checked={selected.extras.has(l.id)} onChange={() => toggle("extras", l.id)} aria-label={`Välj ${l.description}`} />
                <span className="min-w-0 flex-1 text-slate-700">{l.description} · {formatDecimal(l.quantity)} {l.unit} × {formatMoney(l.unit_price)}{l.invoiced_at && <span className="ml-2 text-green-700">fakturerad {l.invoice_reference}</span>}</span>
                {!l.invoiced_at && <Button type="button" variant="ghost" className="!p-1.5 text-red-600" aria-label="Ta bort post" onClick={() => void run(() => deleteExtraLine(l.id))}><Trash2 size={13} /></Button>}
              </li>
            ))}
          </ul>
          <form
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_70px_100px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const quantity = parseDecimal(extra.quantity);
                const price = parseDecimal(extra.price);
                if (!extra.description.trim() || !quantity || Number.isNaN(quantity) || price === null || Number.isNaN(price)) throw new Error("Ange beskrivning, antal och pris.");
                await saveExtraLine({ id: crypto.randomUUID(), project_id: project.id, description: extra.description.trim(), quantity, unit: extra.unit || "st", unit_price: price });
                setExtra({ description: "", quantity: "1", unit: "st", price: "" });
              });
            }}
          >
            <input className={`${inputClass} col-span-2 sm:col-span-1`} placeholder="Beskrivning (t.ex. broavgift)" value={extra.description} onChange={(e) => setExtra({ ...extra, description: e.target.value })} aria-label="Beskrivning" />
            <input className={inputClass} inputMode="decimal" placeholder="Antal" value={extra.quantity} onChange={(e) => setExtra({ ...extra, quantity: e.target.value })} aria-label="Antal" />
            <input className={inputClass} placeholder="Enhet" value={extra.unit} onChange={(e) => setExtra({ ...extra, unit: e.target.value })} aria-label="Enhet" />
            <input className={inputClass} inputMode="decimal" placeholder="Pris (kr)" value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })} aria-label="Pris" />
            <Button type="submit" variant="secondary"><Plus size={14} /> Lägg till</Button>
          </form>
        </section>

        <section className="rounded-lg bg-slate-50 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Markera som fakturerat</h4>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={`Fakturanummer / referens (${selectedCount} valda)`}>
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="t.ex. F-1001" />
            </Field>
            <Button
              type="button"
              disabled={selectedCount === 0 || !reference.trim()}
              onClick={() => void run(async () => {
                await markInvoiced([...selected.reports], [...selected.extras], reference);
                setSelected({ reports: new Set(), extras: new Set() });
                setReference("");
              }, "Posterna är markerade som fakturerade och är nu låsta.")}
            >
              Markera valda
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Fakturerade poster låses och kan inte faktureras igen.</p>
          {isFinanceAdmin && invoicedReports.length > 0 && (
            <ClearInvoiced reportIds={invoicedReports.map((r) => r.id)} extraIds={projectExtra.filter((l) => l.invoiced_at).map((l) => l.id)} onRun={run} clear={clearInvoiced} />
          )}
        </section>
      </div>
      {adjusting && <AdjustModal report={adjusting} onClose={() => setAdjusting(null)} />}
    </Panel>
  );
}

function ClearInvoiced({
  reportIds,
  extraIds,
  onRun,
  clear,
}: {
  reportIds: string[];
  extraIds: string[];
  onRun: (action: () => Promise<void>, okText?: string) => Promise<void>;
  clear: (reportIds: string[], extraIds: string[], reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 border-t border-border pt-3">
      {!open ? (
        <button type="button" className="text-xs font-medium text-red-600 hover:text-red-700" onClick={() => setOpen(true)}>Ta bort faktureringsmarkering (kräver orsak)…</button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Orsak (sparas i ändringsloggen)">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="t.ex. kreditfaktura utfärdad" />
          </Field>
          <Button type="button" variant="secondary" disabled={!reason.trim()} onClick={() => void onRun(async () => { await clear(reportIds, extraIds, reason); setOpen(false); setReason(""); }, "Faktureringsmarkeringen togs bort och loggades.")}>
            Ta bort markering på alla fakturerade
          </Button>
        </div>
      )}
    </div>
  );
}
