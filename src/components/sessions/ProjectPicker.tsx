import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Project } from "../../types";
import { useStore } from "../../data/store";
import { isProjectOpen, projectMatches, projectRoute } from "../../lib/projectSearch";
import { inputClass } from "../ui/Field";

// Sökbar lista. Utan sökning visas alla öppna projekt (inte fakturerade eller avbokade). Vid sökning letar den bland
// ALLA projekt (nummer, namn, kund, referenser, orter, adresser, last), även avslutade när `includeClosedOnSearch` är satt,
// t.ex. för att rapportera i efterhand.
export function ProjectPicker({
  value, onChange, includeClosedOnSearch = false,
}: {
  value: Project | null;
  onChange: (project: Project | null) => void;
  includeClosedOnSearch?: boolean;
}) {
  const { projects } = useStore();
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const matches = useMemo(() => {
    const pool = searching && includeClosedOnSearch ? projects : projects.filter(isProjectOpen);
    return pool
      .filter((p) => projectMatches(p, query))
      .sort((a, b) => Number(isProjectOpen(b)) - Number(isProjectOpen(a)) || (a.project_number < b.project_number ? 1 : -1))
      .slice(0, 100);
  }, [projects, query, searching, includeClosedOnSearch]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm">
        <span className="min-w-0 truncate"><strong>{value.project_number}</strong> {value.name}</span>
        <button type="button" className="shrink-0 font-medium text-orange-700 hover:underline" onClick={() => onChange(null)}>Byt</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className={`${inputClass} !pl-9`} placeholder="Sök nummer, namn, kund, lossningsort, adress, gods…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Sök projekt" />
      </div>
      <div className="text-xs text-slate-500">
        {searching
          ? `${matches.length} träff${matches.length === 1 ? "" : "ar"}${includeClosedOnSearch ? " (bland alla projekt)" : " (öppna projekt)"}`
          : `${matches.length} öppna projekt. Skriv för att söka${includeClosedOnSearch ? " bland alla projekt, även fakturerade" : ""}.`}
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {matches.map((p) => {
          const route = projectRoute(p);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-800">{p.project_number}</span> <span className="text-slate-700">{p.name}</span>
                {!isProjectOpen(p) && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{p.status}</span>}
                <span className="block truncate text-xs text-slate-500">{[p.customer?.company_name, route].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          );
        })}
        {matches.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">Inga projekt matchar.</li>}
      </ul>
    </div>
  );
}
