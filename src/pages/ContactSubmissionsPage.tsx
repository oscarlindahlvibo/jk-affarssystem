import { useMemo, useState } from "react";
import { Archive, Building2, CheckCircle2, Clock3, Mail, MessageSquareText, Phone } from "lucide-react";
import { useStore } from "../data/store";
import { usePermissions } from "../lib/usePermissions";
import { formatDateTime } from "../lib/format";
import type { ContactSubmission, ContactSubmissionStatus } from "../types";

const STATUS_LABELS: Record<ContactSubmissionStatus, string> = {
  new: "Ny",
  read: "Läst",
  responded: "Besvarad",
  archived: "Arkiverad",
};

const STATUS_STYLES: Record<ContactSubmissionStatus, string> = {
  new: "bg-orange-100 text-orange-700",
  read: "bg-sky-100 text-sky-700",
  responded: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-200 text-slate-600",
};

export function ContactSubmissionsPage() {
  const { contactSubmissions, updateContactSubmissionStatus } = useStore();
  const permissions = usePermissions();
  const canManage = permissions.can("inquiries", "edit");
  const [filter, setFilter] = useState<ContactSubmissionStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => contactSubmissions.filter((item) => filter === "all" || item.status === filter),
    [contactSubmissions, filter]
  );
  const selected = contactSubmissions.find((item) => item.id === selectedId) ?? null;

  function open(item: ContactSubmission) {
    setSelectedId(item.id);
    if (canManage && item.status === "new") updateContactSubmissionStatus(item.id, "read");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Meddelanden som skickats via kontaktformuläret på jkprojekt.se.</p>
        <select value={filter} onChange={(event) => setFilter(event.target.value as ContactSubmissionStatus | "all")} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <option value="all">Alla statusar</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="grid min-h-[520px] overflow-hidden rounded-lg border border-border bg-white lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          {filtered.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-slate-500">Inga förfrågningar i detta urval.</div>
          ) : filtered.map((item) => (
            <button key={item.id} type="button" onClick={() => open(item)} className={`block w-full border-b border-border p-4 text-left transition-colors last:border-b-0 ${selectedId === item.id ? "bg-orange-50" : "hover:bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate text-sm ${item.status === "new" ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>{item.name}</div>
                  <div className="truncate text-xs text-slate-500">{item.company || item.email}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[item.status]}`}>{STATUS_LABELS[item.status]}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{item.message}</p>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 size={11} />{formatDateTime(item.created_at)}</div>
            </button>
          ))}
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          {selected ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{selected.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{formatDateTime(selected.created_at)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <a href={`mailto:${selected.email}`} className="flex min-w-0 items-center gap-2 text-slate-700 hover:text-orange-600"><Mail size={16} className="shrink-0" /><span className="truncate">{selected.email}</span></a>
                {selected.phone && <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-orange-600"><Phone size={16} />{selected.phone}</a>}
                {selected.company && <div className="flex items-center gap-2 text-slate-700"><Building2 size={16} />{selected.company}</div>}
                {selected.service_type && <div className="flex items-center gap-2 text-slate-700"><MessageSquareText size={16} />{selected.service_type}</div>}
              </div>

              <div className="whitespace-pre-wrap rounded-md border border-border bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selected.message}</div>

              {canManage && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {selected.status !== "responded" && <button type="button" onClick={() => updateContactSubmissionStatus(selected.id, "responded")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle2 size={15} />Markera besvarad</button>}
                  {selected.status !== "archived" && <button type="button" onClick={() => updateContactSubmissionStatus(selected.id, "archived")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Archive size={15} />Arkivera</button>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-slate-400">
              <MessageSquareText size={32} />
              <p className="mt-3 text-sm">Välj en förfrågan för att läsa meddelandet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
