import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAttendance } from "../data/attendance";
import { useStore } from "../data/store";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { internalTimeTypes, normalizeRules, validateRules } from "../lib/payrollCompute";
import { DEFAULT_OVERTIME_RULES, WEEKDAY_KEYS, type OvertimeRuleConfig, type WeekdayKey } from "../lib/payrollRules";
import type { EmployeeTermsRow } from "../types";

const WEEKDAY_LABEL: Record<WeekdayKey, string> = { mon: "Mån", tue: "Tis", wed: "Ons", thu: "Tors", fri: "Fre", sat: "Lör", sun: "Sön" };
const DAYTYPES = [["saturday", "Lördag"], ["sunday", "Söndag"], ["holiday", "Helgdag"], ["holiday_eve", "Helgdagsafton"]] as const;

function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<void>, okText: string) {
    try {
      await fn();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Kunde inte spara." });
    }
  }
  return { msg, run };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) => msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>;

function EmployeeTermsPanel() {
  const att = useAttendance();
  const { profiles } = useStore();
  const { msg, run } = useAction();
  const people = profiles.filter((p) => p.org_id === att.actor?.orgId && p.status === "aktiv");
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const versions = att.terms.filter((t) => t.user_id === userId).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const blank = (): Omit<EmployeeTermsRow, "id" | "org_id"> => ({
    user_id: userId, valid_from: new Date().toISOString().slice(0, 10), employment_number: "", employment_type: "tillsvidare", weekly_hours: 40, employment_rate: 100,
    schedule: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }, rule_set_id: att.ruleSets[0]?.id ?? null, external_employee_ref: "", note: "",
  });
  const [form, setForm] = useState(blank);
  useEffect(() => { setForm({ ...blank(), user_id: userId }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const weekly = WEEKDAY_KEYS.reduce((s, k) => s + (form.schedule[k] ?? 0), 0);
  return (
    <Panel title="Anställningsvillkor och schema">
      <p className="mb-3 text-xs text-slate-500">Personnummer och andra känsliga identitetsuppgifter lagras inte här. Använd anställningsnummer eller lönesystemets egen referens. Ändringar gäller från valt datum och tidigare perioder påverkas inte.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Person"><select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
      </div>
      {versions.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>Från {v.valid_from} · {v.employment_type ?? "–"} · {v.weekly_hours ?? "–"} h/v · {att.ruleSets.find((r) => r.id === v.rule_set_id)?.name ?? "ingen regelmall"}</span>
              <Button type="button" variant="ghost" onClick={() => setForm({ ...v, employment_number: v.employment_number ?? "", external_employee_ref: v.external_employee_ref ?? "", note: v.note ?? "" })}>Redigera</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Gäller från"><input type="date" className={inputClass} value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
        <Field label="Anställningsnummer"><input className={inputClass} value={form.employment_number ?? ""} onChange={(e) => setForm({ ...form, employment_number: e.target.value })} /></Field>
        <Field label="Anställningsform"><select className={inputClass} value={form.employment_type ?? ""} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>{["tillsvidare", "visstid", "timanställd", "deltid", "annan"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Veckoarbetstid (h)"><input type="number" step="0.5" className={inputClass} value={form.weekly_hours ?? ""} onChange={(e) => setForm({ ...form, weekly_hours: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        <Field label="Sysselsättningsgrad (%)"><input type="number" className={inputClass} value={form.employment_rate ?? ""} onChange={(e) => setForm({ ...form, employment_rate: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
        <Field label="Regelmall (övertid m.m.)"><select className={inputClass} value={form.rule_set_id ?? ""} onChange={(e) => setForm({ ...form, rule_set_id: e.target.value || null })}><option value="">Välj…</option>{att.ruleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label="Spiris-/lönesystemsreferens"><input className={inputClass} value={form.external_employee_ref ?? ""} onChange={(e) => setForm({ ...form, external_employee_ref: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Anteckning"><input className={inputClass} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field></div>
      </div>
      <div className="mt-4">
        <div className="mb-1 text-sm font-medium text-slate-600">Schema, timmar per veckodag (summa {Math.round((weekly / 60) * 100) / 100} h)</div>
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_KEYS.map((k) => (
            <label key={k} className="text-center text-xs text-slate-500">{WEEKDAY_LABEL[k]}
              <input type="number" step="0.25" min={0} max={24} className={`${inputClass} mt-1 text-center`} value={(form.schedule[k] ?? 0) / 60} onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, [k]: Math.round(Number(e.target.value) * 60) } })} />
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <Msg msg={msg} />
        <Button type="button" disabled={!userId} onClick={() => run(() => att.saveTerms({ ...form, employment_number: form.employment_number?.trim() || null, external_employee_ref: form.external_employee_ref?.trim() || null, note: form.note?.trim() || null }), "Villkoren sparades.")}>Spara villkor</Button>
      </div>
    </Panel>
  );
}

function RuleSetsPanel() {
  const att = useAttendance();
  const { msg, run } = useAction();
  const [id, setId] = useState<string | null>(att.ruleSets[0]?.id ?? null);
  const current = att.ruleSets.find((r) => r.id === id) ?? null;
  const [name, setName] = useState(current?.name ?? "Ny regelmall");
  const [activeFlag, setActive] = useState(current?.active ?? true);
  const [rules, setRules] = useState<OvertimeRuleConfig>(() => normalizeRules(current?.config));
  const [approvalNote, setApprovalNote] = useState("");
  useEffect(() => {
    const r = att.ruleSets.find((x) => x.id === id);
    setName(r?.name ?? "Ny regelmall");
    setActive(r?.active ?? true);
    setRules(normalizeRules(r?.config ?? DEFAULT_OVERTIME_RULES as unknown as Record<string, unknown>));
  }, [id, att.ruleSets]);
  const errors = useMemo(() => validateRules(rules), [rules]);
  const tierOptions = rules.tiers.map((t) => t.key);

  return (
    <Panel title="Övertidsregler (regelmallar)">
      <p className="mb-3 text-xs text-slate-500">Inga arbetstidsregler är hårdkodade. Fyll i vad JK:s kollektivavtal eller anställningsavtal anger. Mallen nedan är ett neutralt exempel och ska bekräftas av JK innan skarp användning.</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Mall"><select className={inputClass} value={id ?? ""} onChange={(e) => setId(e.target.value || null)}>{att.ruleSets.map((r) => <option key={r.id} value={r.id}>{r.name}{r.active ? "" : " (inaktiv)"}</option>)}<option value="">+ Ny mall</option></select></Field>
        <Field label="Namn"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={activeFlag} onChange={(e) => setActive(e.target.checked)} /> Aktiv</label>
      </div>
      {current && (
        <div className={`mb-4 rounded-lg border px-3 py-3 text-sm ${current.approved_at ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          {current.approved_at ? (
            <>Godkänd {new Date(current.approved_at).toLocaleDateString("sv-SE")}: {current.approval_note}. Ändras reglerna måste mallen godkännas på nytt.</>
          ) : (
            <>
              <strong>Ej godkänd.</strong> Ingen person som använder denna mall kan attesteras. Godkänn först när reglerna bekräftats mot JK:s avtal.
              {att.actor?.role === "admin" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className={`${inputClass} max-w-sm`} placeholder="Grund, t.ex. kollektivavtal X, datum" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
                  <Button type="button" disabled={!approvalNote.trim()} onClick={() => run(async () => { await att.approveRuleSet(current.id, approvalNote); setApprovalNote(""); }, "Regelmallen är godkänd.")}>Godkänn regelmall</Button>
                </div>
              ) : (
                <div className="mt-1 text-xs">Endast admin kan godkänna en regelmall.</div>
              )}
            </>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pass över midnatt"><select className={inputClass} value={rules.dayBucketing} onChange={(e) => setRules({ ...rules, dayBucketing: e.target.value as OvertimeRuleConfig["dayBucketing"] })}><option value="start_day">Hela passet på startdagen</option><option value="split_midnight">Dela vid midnatt</option></select></Field>
        <Field label="Övertidsnivåer räknas"><select className={inputClass} value={rules.tierScope} onChange={(e) => setRules({ ...rules, tierScope: e.target.value as OvertimeRuleConfig["tierScope"] })}><option value="day">Per dag</option><option value="week">Ackumulerat per vecka</option></select></Field>
        <Field label="Veckogräns ordinarie tid (h, tomt = av)"><input type="number" step="0.5" className={inputClass} value={rules.weeklyOrdinaryLimitMinutes === null ? "" : rules.weeklyOrdinaryLimitMinutes / 60} onChange={(e) => setRules({ ...rules, weeklyOrdinaryLimitMinutes: e.target.value === "" ? null : Math.round(Number(e.target.value) * 60) })} /></Field>
      </div>
      <div className="mt-4">
        <div className="mb-1 text-sm font-medium text-slate-600">Övertidsnivåer (gräns i minuter, tomt = resten)</div>
        {rules.tiers.map((tier, index) => (
          <div key={index} className="mb-2 flex gap-2">
            <input aria-label="Nyckel" className={`${inputClass} w-36`} value={tier.key} onChange={(e) => setRules({ ...rules, tiers: rules.tiers.map((t, i) => (i === index ? { ...t, key: e.target.value.trim() } : t)) })} />
            <input aria-label="Namn" className={inputClass} value={tier.label} onChange={(e) => setRules({ ...rules, tiers: rules.tiers.map((t, i) => (i === index ? { ...t, label: e.target.value } : t)) })} />
            <input aria-label="Gräns minuter" type="number" className={`${inputClass} w-32`} value={tier.upToMinutes ?? ""} onChange={(e) => setRules({ ...rules, tiers: rules.tiers.map((t, i) => (i === index ? { ...t, upToMinutes: e.target.value === "" ? null : Number(e.target.value) } : t)) })} />
            <button type="button" aria-label="Ta bort nivå" className="text-slate-400 hover:text-red-600" onClick={() => setRules({ ...rules, tiers: rules.tiers.filter((_, i) => i !== index) })}><Trash2 size={16} /></button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setRules({ ...rules, tiers: [...rules.tiers, { key: `overtime_${rules.tiers.length + 1}`, label: `Övertid ${rules.tiers.length + 1}`, upToMinutes: null }] })}><Plus size={14} /> Lägg till nivå</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {DAYTYPES.map(([key, label]) => (
          <Field key={key} label={`Övertid på ${label.toLowerCase()} → nivå`}>
            <select className={inputClass} value={rules.dayTypeTierKey[key] ?? ""} onChange={(e) => setRules({ ...rules, dayTypeTierKey: { ...rules.dayTypeTierKey, [key]: e.target.value || null } })}>
              <option value="">Ordinarie nivåer</option>{tierOptions.map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
        ))}
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={rules.treatHolidayEveAsHoliday} onChange={(e) => setRules({ ...rules, treatHolidayEveAsHoliday: e.target.checked })} /> Behandla helgdagsafton som helgdag</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rules.holidayScheduledZero} onChange={(e) => setRules({ ...rules, holidayScheduledZero: e.target.checked })} /> Schemalagd tid på helgdag räknas som 0</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rules.autoBreak.enabled} onChange={(e) => setRules({ ...rules, autoBreak: { ...rules.autoBreak, enabled: e.target.checked } })} /> Automatiskt rastavdrag</label>
        {rules.autoBreak.enabled && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Efter (minuter arbetat)"><input type="number" className={inputClass} value={rules.autoBreak.afterMinutes} onChange={(e) => setRules({ ...rules, autoBreak: { ...rules.autoBreak, afterMinutes: Number(e.target.value) } })} /></Field>
            <Field label="Avdrag (minuter)"><input type="number" className={inputClass} value={rules.autoBreak.deductMinutes} onChange={(e) => setRules({ ...rules, autoBreak: { ...rules.autoBreak, deductMinutes: Number(e.target.value) } })} /></Field>
            <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={rules.autoBreak.onlyIfNoBreakRegistered} onChange={(e) => setRules({ ...rules, autoBreak: { ...rules.autoBreak, onlyIfNoBreakRegistered: e.target.checked } })} /> Bara om ingen rast stämplats</label>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {errors.length > 0 && <ul className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <Msg msg={msg} />
        <Button type="button" disabled={errors.length > 0 || !name.trim()} onClick={() => run(async () => { const target = id ?? crypto.randomUUID(); await att.saveRuleSet(target, name, rules as unknown as Record<string, unknown>, activeFlag); setId(target); }, "Regelmallen sparades.")}>Spara regelmall</Button>
      </div>
    </Panel>
  );
}

function MappingPanel() {
  const att = useAttendance();
  const { msg, run } = useAction();
  const types = internalTimeTypes(att.ruleSets);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const codeOf = (key: string) => codes[key] ?? att.mappings.find((m) => m.time_type === key)?.external_code ?? "";
  return (
    <Panel title="Lönekoder (koppling till lönesystem)">
      <p className="mb-3 text-xs text-slate-500">Ange JK:s lönearts-/tidkoder per tidstyp. Koderna hämtas från JK:s lönesystem; inga koder är förvalda. Rader utan kod exporteras med varning.</p>
      <div className="space-y-2">
        {types.map((t) => (
          <div key={t.key} className="flex items-center gap-3">
            <span className="w-48 text-sm text-slate-700">{t.label}</span>
            <code className="w-40 text-xs text-slate-400">{t.key}</code>
            <input aria-label={`Kod för ${t.label}`} className={`${inputClass} max-w-40`} value={codeOf(t.key)} onChange={(e) => setCodes({ ...codes, [t.key]: e.target.value })} />
            <Button type="button" variant="secondary" disabled={!codeOf(t.key).trim()} onClick={() => run(() => att.saveMapping(t.key, codeOf(t.key), t.label), `Kod för ${t.label} sparades.`)}>Spara</Button>
          </div>
        ))}
      </div>
      <div className="mt-3"><Msg msg={msg} /></div>
    </Panel>
  );
}

export function PayrollSettingsPage() {
  const att = useAttendance();
  if (!att.actor) return <p className="text-sm text-slate-500">Laddar…</p>;
  if (!att.isPayrollAdmin) return <p className="text-sm text-slate-600">Endast admin och ekonomi kan ändra löneinställningar.</p>;
  return (
    <div className="space-y-6">
      <EmployeeTermsPanel />
      <RuleSetsPanel />
      <MappingPanel />
    </div>
  );
}
