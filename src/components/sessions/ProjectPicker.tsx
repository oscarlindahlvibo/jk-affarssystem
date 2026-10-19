import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Project } from "../../types";
import { useStore } from "../../data/store";
import { inputClass } from "../ui/Field";

const CLOSED = new Set(["Avbokad", "Fakturerad"]);

// Sökbar lista över pågående projekt: skriv projektnummer, namn eller kund och tryck på raden.
export function ProjectPicker({ value, onChange }: { value: Project | null; onChange: (project: Project | null) => void }) {
  const { projects } = useStore();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => !CLOSED.has(p.status))
      .filter((p) => !q || `${p.project_number} ${p.name} ${p.customer?.company_name ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.project_number < b.project_number ? 1 : -1))
      .slice(0, 6);
  }, [projects, query]);

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
        <input className={`${inputClass} !pl-9`} placeholder="Sök projektnummer, namn eller kund" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Sök projekt" />
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {matches.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onChange(p)} className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50">
              <span className="font-medium text-slate-800">{p.project_number}</span> <span className="text-slate-700">{p.name}</span>
              {p.customer?.company_name && <span className="block text-xs text-slate-500">{p.customer.company_name}</span>}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">Inga pågående projekt matchar.</li>}
      </ul>
    </div>
  );
}
