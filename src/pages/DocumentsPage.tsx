import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Lock, Eye, Search } from "lucide-react";
import { useStore } from "../data/store";
import { formatDateTime } from "../lib/format";
import type { DocumentCategory } from "../types";

export function DocumentsPage() {
  const { projects } = useStore();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");

  const allDocuments = useMemo(() => {
    return projects.flatMap((p) => (p.documents ?? []).map((d) => ({ ...d, project: p })));
  }, [projects]);

  const categories = Array.from(new Set(allDocuments.map((d) => d.category)));

  const filtered = allDocuments.filter((d) => {
    if (category && d.category !== category) return false;
    if (search && !d.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative min-w-0">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök dokument..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | "")} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm sm:w-auto">
          <option value="">Alla kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((d) => (
          <Link key={d.id} to={`/projekt/${d.project.id}`} className="block rounded-xl border border-border bg-panel p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-semibold text-slate-800">{d.file_name}</div>
                <div className="mt-1 text-xs text-slate-500">{d.project.project_number} · {d.category}</div>
                <div className="mt-1 text-xs text-slate-500">{formatDateTime(d.uploaded_at)} · {d.uploaded_by}</div>
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  {d.visibility === "internal" ? <Lock size={12} /> : <Eye size={12} />}
                  {d.visibility === "internal" ? "Internt" : "Kundsynligt"}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-panel px-4 py-10 text-center text-sm text-slate-500">Inga dokument matchar.</div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-panel shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Fil</th>
              <th className="px-4 py-3 font-medium">Projekt</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Uppladdad</th>
              <th className="px-4 py-3 font-medium">Av</th>
              <th className="px-4 py-3 font-medium">Synlighet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText size={15} className="text-slate-400" /> {d.file_name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/projekt/${d.project.id}`} className="text-slate-600 hover:text-orange-600">
                    {d.project.project_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{d.category}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(d.uploaded_at)}</td>
                <td className="px-4 py-3 text-slate-600">{d.uploaded_by}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    {d.visibility === "internal" ? <Lock size={12} /> : <Eye size={12} />}
                    {d.visibility === "internal" ? "Internt" : "Kundsynligt"}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Inga dokument matchar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
