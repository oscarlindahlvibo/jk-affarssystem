import { useMemo, useState } from "react";
import { Coffee, LogIn, LogOut, Pencil, Play, Plus, Trash2, Utensils } from "lucide-react";
import { useAttendance } from "../data/attendance";
import { useStore } from "../data/store";
import { useNow } from "../components/time/useNow";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { inputClass } from "../components/ui/Field";
import { ENTRY_TYPE_LABELS, EntryModal, hm, periodBounds, ReasonModal, SOURCE_LABELS, workedMinutes } from "../components/attendance/shared";
import { formatClock } from "../lib/format";
import { addDays, localDateKey, localTimeKey } from "../lib/stockholmTime";
import type { AttendanceEntry } from "../types";

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const dayLabel = (key: string) => `${WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()]} ${key.slice(5)}`;
const timeRange = (e: AttendanceEntry) => `${localTimeKey(e.start_time)}–${e.end_time ? localTimeKey(e.end_time) : "pågår"}`;

function EntryRow({ entry, onEdit, onDelete }: { entry: AttendanceEntry; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="w-24 shrink-0 font-medium text-slate-700">{timeRange(entry)}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${entry.entry_type === "work" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ENTRY_TYPE_LABELS[entry.entry_type]}</span>
      <span className="flex-1 truncate text-slate-500">{entry.comment}{entry.source !== "clock" && <span className="ml-1 text-xs text-slate-400">({SOURCE_LABELS[entry.source]})</span>}</span>
      <span className="shrink-0 text-slate-600">{entry.end_time ? hm(entry.total_minutes) : ""}</span>
      {entry.end_time && onEdit && <button type="button" aria-label="Ändra pass" className="text-slate-400 hover:text-slate-700" onClick={onEdit}><Pencil size={15} /></button>}
      {entry.end_time && onDelete && <button type="button" aria-label="Ta bort pass" className="text-slate-400 hover:text-red-600" onClick={onDelete}><Trash2 size={15} /></button>}
    </li>
  );
}

function ClockPanel() {
  const att = useAttendance();
  const open = att.openEntry;
  const now = useNow(Boolean(open));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  async function run(action: Parameters<typeof att.clock>[0]) {
    setBusy(true);
    setError(null);
    try {
      await att.clock(action, comment);
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stämplingen misslyckades.");
    } finally {
      setBusy(false);
    }
  }
  const big = "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold shadow-sm transition-colors disabled:opacity-50";
  const state = !open ? "Utstämplad" : open.entry_type === "work" ? "Instämplad" : open.entry_type === "break" ? "På rast" : "På lunch";

  return (
    <Panel title="Stämpelklocka">
      <div className="mb-4 text-center">
        <div className="text-sm text-slate-500">{state}{open ? ` sedan ${localTimeKey(open.start_time)}` : ""}</div>
        <div className="mt-1 font-mono text-4xl font-semibold text-slate-800">{open ? formatClock(now - new Date(open.start_time).getTime()) : "00:00:00"}</div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {!open && <button type="button" disabled={busy} onClick={() => run("clockin")} className={`${big} bg-emerald-600 text-white hover:bg-emerald-700`}><LogIn size={20} /> Stämpla in</button>}
        {open?.entry_type === "work" && (
          <>
            <button type="button" disabled={busy} onClick={() => run("break")} className={`${big} bg-amber-500 text-white hover:bg-amber-600`}><Coffee size={20} /> Rast</button>
            <button type="button" disabled={busy} onClick={() => run("lunch")} className={`${big} bg-amber-500 text-white hover:bg-amber-600`}><Utensils size={20} /> Lunch</button>
            <button type="button" disabled={busy} onClick={() => run("clockout")} className={`${big} bg-red-600 text-white hover:bg-red-700`}><LogOut size={20} /> Stämpla ut</button>
          </>
        )}
        {open && open.entry_type !== "work" && (
          <>
            <button type="button" disabled={busy} onClick={() => run("resume")} className={`${big} bg-emerald-600 text-white hover:bg-emerald-700`}><Play size={20} /> Tillbaka i arbete</button>
            <button type="button" disabled={busy} onClick={() => run("clockout")} className={`${big} bg-red-600 text-white hover:bg-red-700`}><LogOut size={20} /> Stämpla ut</button>
          </>
        )}
      </div>
      <input className={`${inputClass} mt-3`} placeholder="Kommentar till stämplingen (valfri)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-slate-400">Detta är din arbetstid för lön. Debiterbar tid mot kund registreras separat på projektet och påverkas inte av stämplingen.</p>
    </Panel>
  );
}

function Totals({ entries }: { entries: AttendanceEntry[] }) {
  const open = entries.some((e) => !e.end_time);
  const now = useNow(open, 30000);
  const today = localDateKey(now);
  const b = periodBounds(today);
  const items = [
    ["Idag", workedMinutes(entries, today, today, now)],
    ["Denna vecka", workedMinutes(entries, b.weekStart, b.weekEnd, now)],
    ["Denna månad", workedMinutes(entries, b.monthStart, b.monthEnd, now)],
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(([label, minutes]) => (
        <div key={label} className="rounded-xl border border-border bg-panel p-4 text-center shadow-sm">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 text-xl font-semibold text-slate-800">{hm(minutes)}</div>
        </div>
      ))}
    </div>
  );
}

function EntriesByDay({ entries, canEdit, onAdd, onEdit, onDelete }: { entries: AttendanceEntry[]; canEdit: boolean; onAdd: () => void; onEdit: (e: AttendanceEntry) => void; onDelete: (e: AttendanceEntry) => void }) {
  const [days, setDays] = useState(14);
  const grouped = useMemo(() => {
    const map = new Map<string, AttendanceEntry[]>();
    const limit = addDays(localDateKey(new Date()), -days);
    for (const e of [...entries].sort((a, b) => b.start_time.localeCompare(a.start_time))) {
      const key = localDateKey(e.start_time);
      if (key < limit) continue;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries, days]);
  return (
    <Panel title="Registrerade pass" action={<Button type="button" variant="secondary" onClick={onAdd}><Plus size={15} /> Missad stämpling</Button>}>
      {grouped.length === 0 && <p className="text-sm text-slate-500">Inga pass de senaste {days} dagarna.</p>}
      <div className="space-y-4">
        {grouped.map(([day, list]) => (
          <div key={day}>
            <div className="flex justify-between border-b border-border pb-1 text-sm font-semibold text-slate-700"><span>{dayLabel(day)}</span><span>{hm(workedMinutes(list, day, day, Date.now()))}</span></div>
            <ul className="divide-y divide-border">{list.map((e) => <EntryRow key={e.id} entry={e} onEdit={canEdit ? () => onEdit(e) : undefined} onDelete={canEdit ? () => onDelete(e) : undefined} />)}</ul>
          </div>
        ))}
      </div>
      {days < 90 && <Button type="button" variant="ghost" className="mt-3" onClick={() => setDays(90)}>Visa 90 dagar</Button>}
    </Panel>
  );
}

function MyWork() {
  const att = useAttendance();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AttendanceEntry | null>(null);
  const [deleting, setDeleting] = useState<AttendanceEntry | null>(null);
  const myCorrections = att.state.corrections.filter((c) => c.user_id === att.actor?.id).slice(0, 5);
  const myAudit = att.state.audit.filter((a) => a.user_id === att.actor?.id).sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <ClockPanel />
        <Totals entries={att.myEntries} />
      </div>
      <div className="space-y-6 lg:col-span-3">
        <EntriesByDay entries={att.myEntries} canEdit onAdd={() => setAdding(true)} onEdit={setEditing} onDelete={setDeleting} />
        {myCorrections.length > 0 && (
          <Panel title="Mina rättelsebegäranden">
            <ul className="space-y-2 text-sm">
              {myCorrections.map((c) => (
                <li key={c.id} className="flex justify-between gap-3"><span className="text-slate-600">{c.reason}</span><span className={c.status === "pending" ? "text-amber-600" : c.status === "approved" ? "text-emerald-600" : "text-red-600"}>{c.status === "pending" ? "Väntar" : c.status === "approved" ? "Godkänd" : "Avslagen"}</span></li>
              ))}
            </ul>
          </Panel>
        )}
        {myAudit.length > 0 && <AuditList rows={myAudit} />}
      </div>
      {adding && (
        <EntryModal open title="Lägg in missad stämpling" initial={null} allowRequest onClose={() => setAdding(false)}
          onSave={(v) => att.addEntries([{ type: v.type, start: v.start, end: v.end, comment: v.comment }], null, v.reason)}
          onRequest={(v) => att.requestCorrection({ action: "add", entryId: null, type: v.type, start: v.start, end: v.end, reason: v.reason })} />
      )}
      {editing && (
        <EntryModal open title="Ändra pass" initial={editing} allowRequest onClose={() => setEditing(null)}
          onSave={(v) => att.changeEntry(editing.id, { type: v.type, start: v.start, end: v.end, comment: v.comment }, v.reason)}
          onRequest={(v) => att.requestCorrection({ action: "change", entryId: editing.id, type: v.type, start: v.start, end: v.end, reason: v.reason })} />
      )}
      <ReasonModal open={Boolean(deleting)} title="Ta bort pass" confirmLabel="Ta bort" onClose={() => setDeleting(null)} onConfirm={(reason) => att.deleteEntry(deleting!.id, reason)}>
        {deleting && <p className="text-sm text-slate-600">{dayLabel(localDateKey(deleting.start_time))} {timeRange(deleting)}. Borttagningen sparas i ändringsloggen.</p>}
      </ReasonModal>
    </div>
  );
}

function AuditList({ rows }: { rows: ReturnType<typeof useAttendance>["state"]["audit"] }) {
  const { profiles } = useStore();
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "okänd";
  const text = (v: Record<string, unknown> | null) => (v && v.start_time ? `${localDateKey(String(v.start_time))} ${localTimeKey(String(v.start_time))}–${v.end_time ? localTimeKey(String(v.end_time)) : "pågår"} (${ENTRY_TYPE_LABELS[v.entry_type as AttendanceEntry["entry_type"]] ?? ""})` : "–");
  const action = { create: "Skapad", update: "Ändrad", delete: "Borttagen" } as const;
  return (
    <Panel title="Ändringslogg">
      <ul className="space-y-2 text-sm">
        {rows.map((a) => (
          <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex justify-between text-xs text-slate-500"><span>{action[a.action]} av {name(a.changed_by)}</span><span>{new Date(a.changed_at).toLocaleString("sv-SE")}</span></div>
            {a.action !== "create" && <div className="text-slate-600">Före: {text(a.before)}</div>}
            {a.action !== "delete" && <div className="text-slate-600">Efter: {text(a.after)}</div>}
            {a.reason && <div className="text-slate-500">Orsak: {a.reason}</div>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Staff() {
  const att = useAttendance();
  const { profiles } = useStore();
  const now = useNow(true, 30000);
  const today = localDateKey(now);
  const b = periodBounds(today);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AttendanceEntry | null>(null);
  const [deleting, setDeleting] = useState<AttendanceEntry | null>(null);
  const [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null);

  const people = useMemo(() => profiles.filter((p) => p.org_id === att.actor?.orgId && p.status === "aktiv"), [profiles, att.actor]);
  const pending = att.state.corrections.filter((c) => c.status === "pending");
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? id;
  const entriesOf = (id: string) => att.state.entries.filter((e) => e.user_id === id);
  const selEntries = selected ? entriesOf(selected) : [];

  return (
    <div className="space-y-6">
      {att.canAttest && pending.length > 0 && (
        <Panel title={`Rättelsebegäranden att behandla (${pending.length})`}>
          <ul className="divide-y divide-border text-sm">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{nameOf(c.user_id)}</span>
                <span className="text-slate-500">{{ add: "Lägg till pass", change: "Ändra pass", delete: "Ta bort pass" }[c.action]}{c.proposed_start ? `: ${localDateKey(c.proposed_start)} ${localTimeKey(c.proposed_start)}–${c.proposed_end ? localTimeKey(c.proposed_end) : ""}` : ""}</span>
                <span className="flex-1 text-slate-500">"{c.reason}"</span>
                <Button type="button" onClick={() => setDecision({ id: c.id, approve: true })}>Godkänn</Button>
                <Button type="button" variant="secondary" onClick={() => setDecision({ id: c.id, approve: false })}>Avslå</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Personalens arbetstid">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-slate-500"><th className="py-2">Namn</th><th>Status</th><th className="text-right">Idag</th><th className="text-right">Vecka</th><th className="text-right">Månad</th></tr></thead>
            <tbody>
              {people.map((p) => {
                const list = entriesOf(p.id);
                const open = list.find((e) => !e.end_time);
                return (
                  <tr key={p.id} className={`cursor-pointer border-b border-border hover:bg-slate-50 ${selected === p.id ? "bg-orange-50" : ""}`} onClick={() => setSelected(p.id)}>
                    <td className="py-2 font-medium text-slate-800">{p.full_name}</td>
                    <td>{open ? <span className="text-emerald-600">{open.entry_type === "work" ? `Instämplad ${localTimeKey(open.start_time)}` : `På ${ENTRY_TYPE_LABELS[open.entry_type].toLowerCase()}`}</span> : <span className="text-slate-400">Ej instämplad</span>}</td>
                    <td className="text-right">{hm(workedMinutes(list, today, today, now))}</td>
                    <td className="text-right">{hm(workedMinutes(list, b.weekStart, b.weekEnd, now))}</td>
                    <td className="text-right">{hm(workedMinutes(list, b.monthStart, b.monthEnd, now))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {selected && (
        <>
          <EntriesByDay entries={selEntries} canEdit={att.canAttest} onAdd={() => setAdding(true)} onEdit={setEditing} onDelete={setDeleting} />
          <AuditList rows={att.state.audit.filter((a) => a.user_id === selected).sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, 15)} />
        </>
      )}
      {adding && selected && att.canAttest && (
        <EntryModal open title={`Lägg in pass för ${nameOf(selected)}`} initial={null} allowRequest={false} onClose={() => setAdding(false)}
          onSave={(v) => att.addEntries([{ type: v.type, start: v.start, end: v.end, comment: v.comment }], selected, v.reason)} />
      )}
      {editing && att.canAttest && (
        <EntryModal open title="Ändra pass" initial={editing} allowRequest={false} onClose={() => setEditing(null)}
          onSave={(v) => att.changeEntry(editing.id, { type: v.type, start: v.start, end: v.end, comment: v.comment }, v.reason)} />
      )}
      <ReasonModal open={Boolean(deleting)} title="Ta bort pass" confirmLabel="Ta bort" onClose={() => setDeleting(null)} onConfirm={(reason) => att.deleteEntry(deleting!.id, reason)} />
      <ReasonModal open={Boolean(decision)} title={decision?.approve ? "Godkänn rättelse" : "Avslå rättelse"} confirmLabel={decision?.approve ? "Godkänn" : "Avslå"} onClose={() => setDecision(null)} onConfirm={(note) => att.decideCorrection(decision!.id, decision!.approve, note)} />
    </div>
  );
}

export function StampelklockaPage() {
  const att = useAttendance();
  const [tab, setTab] = useState<"mine" | "staff">("mine");
  if (!att.actor) return <p className="text-sm text-slate-500">Laddar…</p>;
  const tabs = [{ key: "mine" as const, label: "Min arbetstid" }, ...(att.canViewPayroll ? [{ key: "staff" as const, label: "Personalens arbetstid" }] : [])];
  return (
    <div className="space-y-5">
      {att.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{att.error}</p>}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "mine" || !att.canViewPayroll ? <MyWork /> : <Staff />}
    </div>
  );
}
