import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useStore } from "../data/store";
import { useAuth } from "../lib/auth";
import { useTimeTracking } from "../data/timeTracking";
import { ClockCard } from "../components/time/ClockCard";
import { TimeEntryList } from "../components/time/TimeEntryList";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { downloadCsv } from "../lib/csv";
import { formatMinutes, formatTimeOfDay } from "../lib/format";
import type { TimeEntry } from "../types";

function weekStart(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function WeekNav({ offset, onChange }: { offset: number; onChange: (next: number) => void }) {
  const start = weekStart(offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" className="!p-2" aria-label="Föregående vecka" onClick={() => onChange(offset - 1)}><ChevronLeft size={16} /></Button>
      <div className="min-w-40 text-center text-sm font-medium text-slate-700">
        Vecka {isoWeek(start)} · {fmt(start)}–{fmt(end)}
      </div>
      <Button type="button" variant="secondary" className="!p-2" aria-label="Nästa vecka" onClick={() => onChange(offset + 1)}><ChevronRight size={16} /></Button>
      {offset !== 0 && <Button type="button" variant="ghost" onClick={() => onChange(0)}>Denna vecka</Button>}
    </div>
  );
}

function inWeek(entry: TimeEntry, offset: number) {
  const start = weekStart(offset).getTime();
  const t = new Date(entry.start_time).getTime();
  return t >= start && t < start + 7 * 86400000;
}

function MyTime() {
  const { myEntries, categories, openEntry } = useTimeTracking();
  const [offset, setOffset] = useState(0);
  const weekEntries = useMemo(() => myEntries.filter((e) => inWeek(e, offset)), [myEntries, offset]);
  const work = weekEntries.filter((e) => e.entry_type === "work" && e.end_time);
  const total = work.reduce((sum, e) => sum + e.total_minutes, 0);
  const byCategory = new Map<string, number>();
  for (const e of work) byCategory.set(e.category_key ?? "", (byCategory.get(e.category_key ?? "") ?? 0) + e.total_minutes);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        {/* Den gamla projektklockan startas inte längre här; en pågående äldre stämpling kan fortfarande avslutas. */}
        {openEntry && <ClockCard />}
        <Panel title="Veckosammanfattning">
          <div className="text-3xl font-semibold text-slate-800">{formatMinutes(total) || "0 min"}</div>
          <div className="text-xs text-slate-500">tid på projekt veckan du tittar på (exklusive raster)</div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([key, minutes]) => (
              <li key={key} className="flex justify-between">
                <span className="text-slate-600">{categories.find((c) => c.key === key)?.label ?? key}</span>
                <span className="font-medium text-slate-800">{formatMinutes(minutes) || "0 min"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel
        title="Min projekttid"
        className="lg:col-span-2"
      >
        <div className="mb-4"><WeekNav offset={offset} onChange={setOffset} /></div>
        <TimeEntryList entries={weekEntries} canEdit={() => true} />
      </Panel>
    </div>
  );
}

function AllTime() {
  const { entries, categories } = useTimeTracking();
  const { profiles } = useStore();
  const { currentProfile } = useAuth();
  const [offset, setOffset] = useState(0);
  const [person, setPerson] = useState("");
  const [category, setCategory] = useState("");
  const names = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  const filtered = useMemo(
    () => entries.filter((e) => inWeek(e, offset) && (!person || e.user_id === person) && (!category || e.category_key === category || e.entry_type !== "work")),
    [entries, offset, person, category]
  );
  const work = filtered.filter((e) => e.entry_type === "work" && e.end_time);
  const perPerson = new Map<string, number>();
  const perCategory = new Map<string, number>();
  for (const e of work) {
    perPerson.set(e.user_id, (perPerson.get(e.user_id) ?? 0) + e.total_minutes);
    perCategory.set(e.category_key ?? "", (perCategory.get(e.category_key ?? "") ?? 0) + e.total_minutes);
  }
  const total = work.reduce((sum, e) => sum + e.total_minutes, 0);

  function exportCsv() {
    downloadCsv(`tid-vecka-${isoWeek(weekStart(offset))}.csv`, [
      ["Person", "Datum", "Från", "Till", "Minuter", "Typ", "Kategori", "Projekt", "Anteckning"],
      ...[...filtered].sort((a, b) => (a.start_time < b.start_time ? -1 : 1)).map((e) => [
        names.get(e.user_id) ?? e.user_id,
        e.start_time.slice(0, 10),
        formatTimeOfDay(e.start_time),
        formatTimeOfDay(e.end_time),
        e.total_minutes,
        e.entry_type === "work" ? "Arbete" : e.entry_type === "lunch" ? "Lunch" : "Rast",
        categories.find((c) => c.key === e.category_key)?.label ?? "",
        e.project_label ?? "",
        e.comment,
      ]),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav offset={offset} onChange={setOffset} />
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputClass} !w-auto`} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="">Alla personer</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select className={`${inputClass} !w-auto`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
            <option value="">Alla kategorier</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <Button type="button" variant="secondary" onClick={exportCsv}><Download size={14} /> Exportera CSV</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Panel title="Summering">
            <div className="text-3xl font-semibold text-slate-800">{formatMinutes(total) || "0 min"}</div>
            <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Per person</h4>
            <ul className="space-y-1 text-sm">
              {[...perPerson.entries()].sort((a, b) => b[1] - a[1]).map(([id, minutes]) => (
                <li key={id} className="flex justify-between"><span className="text-slate-600">{names.get(id) ?? "Okänd"}</span><span className="font-medium">{formatMinutes(minutes) || "0 min"}</span></li>
              ))}
            </ul>
            <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Per kategori</h4>
            <ul className="space-y-1 text-sm">
              {[...perCategory.entries()].sort((a, b) => b[1] - a[1]).map(([key, minutes]) => (
                <li key={key} className="flex justify-between"><span className="text-slate-600">{categories.find((c) => c.key === key)?.label ?? key}</span><span className="font-medium">{formatMinutes(minutes) || "0 min"}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="Alla pass" className="lg:col-span-2">
          <TimeEntryList entries={filtered} userNames={names} canEdit={() => currentProfile?.role === "admin"} />
        </Panel>
      </div>
    </div>
  );
}

export function TimePage() {
  const { canViewAll, error } = useTimeTracking();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Äldre projekttid (historik). Nya uppdrag startas på <Link to="/stampelklocka" className="font-medium underline">Stämpelklockan</Link>, och kundfakturering sker via Rapporterat arbete på projektet. Det här är intern uppföljning som varken påverkar lön eller fakturering.
      </p>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {canViewAll && (
        <div className="inline-flex rounded-lg border border-border bg-white p-1 text-sm">
          {([["mine", "Min projekttid"], ["all", "Allas projekttid"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 font-medium ${tab === key ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "mine" || !canViewAll ? <MyTime /> : <AllTime />}
    </div>
  );
}
