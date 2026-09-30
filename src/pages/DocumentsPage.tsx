import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, Lock, Eye, Loader2, Search } from "lucide-react";
import { useStore } from "../data/store";
import { formatDateTime } from "../lib/format";
import { isCentralDriveEnabled, openCentralDriveFile } from "../lib/centralDrive";
import type { DocumentCategory, ProjectDocument } from "../types";

export function DocumentsPage() {
  const { projects } = useStore();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const allDocuments = useMemo(() => {
    return projects.flatMap((p) => (p.documents ?? []).map((d) => ({ ...d, project: p })));
  }, [projects]);

  const categories = Array.from(new Set(allDocuments.map((d) => d.category)));

  const filtered = allDocuments.filter((d) => {
    if (category && d.category !== category) return false;
    if (search && !d.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function canOpen(document: ProjectDocument) {
    return Boolean((document.drive_file_id && isCentralDriveEnabled) || document.file_url);
  }

  async function handleOpen(document: ProjectDocument) {
    if (!canOpen(document)) return;
    setOpeningId(document.id);
    setOpenError(null);
    try {
      if (document.drive_file_id && isCentralDriveEnabled) {
        await openCentralDriveFile(document.drive_file_id);
      } else if (document.file_url) {
        window.open(document.file_url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "Dokumentet kunde inte öppnas.");
    } finally {
      setOpeningId(null);
    }
  }

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

      {openError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{openError}</p>}

      <div className="space-y-3 md:hidden">
        {filtered.map((d) => (
          <article key={d.id} className="rounded-xl border border-border bg-panel p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                {canOpen(d) ? (
                  <button type="button" onClick={() => void handleOpen(d)} disabled={openingId === d.id} className="flex max-w-full items-start gap-1.5 break-words text-left text-sm font-semibold text-slate-800 hover:text-orange-600 disabled:opacity-60">
                    <span>{d.file_name}</span>
                    {openingId === d.id ? <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" /> : <ExternalLink size={13} className="mt-0.5 shrink-0" />}
                  </button>
                ) : (
                  <div className="break-words text-sm font-semibold text-slate-800">{d.file_name}</div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  <Link to={`/projekt/${d.project.id}`} className="hover:text-orange-600">{d.project.project_number}</Link> · {d.category}
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatDateTime(d.uploaded_at)} · {d.uploaded_by}</div>
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  {d.visibility === "internal" ? <Lock size={12} /> : <Eye size={12} />}
                  {d.visibility === "internal" ? "Internt" : "Kundsynligt"}
                </div>
              </div>
            </div>
          </article>
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
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText size={15} className="shrink-0 text-slate-400" />
                    {canOpen(d) ? (
                      <button type="button" onClick={() => void handleOpen(d)} disabled={openingId === d.id} className="flex min-w-0 items-center gap-1.5 text-left hover:text-orange-600 disabled:opacity-60">
                        <span className="truncate">{d.file_name}</span>
                        {openingId === d.id ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <ExternalLink size={12} className="shrink-0" />}
                      </button>
                    ) : d.file_name}
                  </div>
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
