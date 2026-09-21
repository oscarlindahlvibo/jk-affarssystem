import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, MapPin, Ruler, Search, Download, Upload, TriangleAlert } from "lucide-react";
import { useStore } from "../data/store";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { MissingFieldsBadge } from "../components/ui/MissingFieldsBadge";
import { ProjectFormModal } from "../components/projects/NewProjectModal";
import { formatDate } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { getMissingFields, isComplete } from "../lib/validation";
import { needsFollowVehicle } from "../lib/transportRules";
import { usePermissions } from "../lib/usePermissions";
import { PROJECT_STATUSES, type Project } from "../types";

type QuickFilter =
  | "alla"
  | "nya"
  | "kundbokningar"
  | "planering"
  | "ruttkontroll"
  | "denna-vecka"
  | "vantar-kund"
  | "vantar-tillstand"
  | "klar-fakturering"
  | "saknar-uppgifter"
  | "kraver-foljebil";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "alla", label: "Alla projekt" },
  { key: "nya", label: "Nya" },
  { key: "kundbokningar", label: "Kundbokningar" },
  { key: "planering", label: "Planering" },
  { key: "ruttkontroll", label: "Ruttkontroll" },
  { key: "denna-vecka", label: "Denna vecka" },
  { key: "vantar-kund", label: "Väntar på kund" },
  { key: "vantar-tillstand", label: "Väntar på tillstånd" },
  { key: "klar-fakturering", label: "Klar för fakturering" },
  { key: "saknar-uppgifter", label: "Saknar uppgifter" },
  { key: "kraver-foljebil", label: "Kräver följebil" },
];

function projectNeedsFollowVehicle(p: Project): boolean {
  const cargo = p.cargo_items?.[0];
  return needsFollowVehicle({
    length_m: cargo?.length_m ?? null,
    width_m: cargo?.width_m ?? null,
    height_m: cargo?.height_m ?? null,
    weight_ton: cargo?.weight_ton ?? null,
  });
}

function isThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function matchesQuickFilter(p: Project, filter: QuickFilter): boolean {
  switch (filter) {
    case "alla":
      return true;
    case "nya":
      return p.status === "Ny";
    case "kundbokningar":
      return p.booking_approval_status === "Väntar på godkännande";
    case "planering":
      return ["Planering", "Ruttkontroll", "Order"].includes(p.status);
    case "ruttkontroll":
      return p.status === "Ruttkontroll";
    case "denna-vecka":
      return isThisWeek(p.planned_loading_date) || isThisWeek(p.planned_delivery_date);
    case "vantar-kund":
      return p.status === "Väntar på kund";
    case "vantar-tillstand":
      return p.status === "Tillstånd";
    case "klar-fakturering":
      return p.status === "Klar för fakturering";
    case "saknar-uppgifter":
      return !isComplete(p);
    case "kraver-foljebil":
      return projectNeedsFollowVehicle(p);
    default:
      return true;
  }
}

export function ProjectList() {
  const { projects, customers } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const permissions = usePermissions();
  const canCreate = permissions.can("projects", "create");

  const [search, setSearch] = useState(searchParams.get("sok") ?? "");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [responsible, setResponsible] = useState("");
  const [measurement, setMeasurement] = useState<"" | "finns" | "saknas">("");
  const [dateFrom, setDateFrom] = useState("");
  const filterParam = searchParams.get("filter") as QuickFilter | null;
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    filterParam && QUICK_FILTERS.some((f) => f.key === filterParam) ? filterParam : "alla"
  );

  const responsibleNames = useMemo(
    () => Array.from(new Set(projects.map((p) => p.responsible?.full_name).filter(Boolean))) as string[],
    [projects]
  );

  const quickCounts = useMemo(() => {
    const counts: Record<QuickFilter, number> = {
      alla: projects.length,
      nya: 0,
      kundbokningar: 0,
      planering: 0,
      ruttkontroll: 0,
      "denna-vecka": 0,
      "vantar-kund": 0,
      "vantar-tillstand": 0,
      "klar-fakturering": 0,
      "saknar-uppgifter": 0,
      "kraver-foljebil": 0,
    };
    for (const p of projects) {
      for (const f of QUICK_FILTERS) {
        if (f.key !== "alla" && matchesQuickFilter(p, f.key)) counts[f.key]++;
      }
    }
    return counts;
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (!matchesQuickFilter(p, quickFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${p.project_number} ${p.name} ${p.customer?.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && p.status !== status) return false;
      if (customerId && p.customer_id !== customerId) return false;
      if (responsible && p.responsible?.full_name !== responsible) return false;
      if (measurement === "finns" && !p.measurement_link) return false;
      if (measurement === "saknas" && p.measurement_link) return false;
      if (dateFrom && (!p.planned_loading_date || p.planned_loading_date < dateFrom)) return false;
      return true;
    });
  }, [projects, search, status, customerId, responsible, measurement, dateFrom, quickFilter]);

  function handleExport() {
    const header = [
      "Projektnummer", "Kund", "Gods", "Från", "Till", "Lastningsdatum", "Leveransdatum",
      "Höjd", "Bredd", "Vikt", "Status", "Ansvarig", "Ruttmätning", "Kräver följebil", "Fakturering", "Saknade uppgifter",
    ];
    const rows = filtered.map((p) => {
      const cargo = p.cargo_items?.[0];
      const loading = p.locations?.find((l) => l.type === "lastning");
      const unloading = p.locations?.find((l) => l.type === "lossning");
      return [
        p.project_number,
        p.customer?.company_name,
        cargo?.description,
        loading?.name,
        unloading?.name,
        formatDate(p.planned_loading_date),
        formatDate(p.planned_delivery_date),
        cargo?.height_m,
        cargo?.width_m,
        cargo?.weight_ton,
        p.status,
        p.responsible?.full_name,
        p.measurement_link ? "Ja" : "Nej",
        projectNeedsFollowVehicle(p) ? "Ja" : "Nej",
        p.invoice_status,
        getMissingFields(p).map((m) => m.label).join(", "),
      ];
    });
    downloadCsv(`jk-projekt-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-auto">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök projektnummer, namn, kund..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 lg:w-72"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Link to="/importera">
              <Button variant="secondary">
                <Upload size={16} /> Importera Excel
              </Button>
            </Link>
          )}
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} /> Exportera CSV
          </Button>
          {canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Nytt projekt
            </Button>
          )}
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              quickFilter === f.key
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-border bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 text-[10px] ${quickFilter === f.key ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
              {quickCounts[f.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-panel p-4 shadow-sm sm:grid-cols-2 xl:flex xl:flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm xl:w-auto">
          <option value="">Alla statusar</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm xl:w-auto">
          <option value="">Alla kunder</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company_name}</option>
          ))}
        </select>
        <select value={responsible} onChange={(e) => setResponsible(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm xl:w-auto">
          <option value="">Alla ansvariga</option>
          {responsibleNames.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={measurement} onChange={(e) => setMeasurement(e.target.value as typeof measurement)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm xl:w-auto">
          <option value="">Ruttmätning – alla</option>
          <option value="finns">Ruttmätning finns</option>
          <option value="saknas">Ruttmätning saknas</option>
        </select>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm text-slate-500">Lastning från</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm xl:flex-none" />
        </div>
        {(status || customerId || responsible || measurement || dateFrom || search) && (
          <button
            onClick={() => { setStatus(""); setCustomerId(""); setResponsible(""); setMeasurement(""); setDateFrom(""); setSearch(""); }}
            className="text-sm text-orange-600 hover:text-orange-700"
          >
            Rensa filter
          </button>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((p) => {
          const cargo = p.cargo_items?.[0];
          const loading = p.locations?.find((l) => l.type === "lastning");
          const unloading = p.locations?.find((l) => l.type === "lossning");
          const missing = getMissingFields(p);
          return (
            <Link
              key={p.id}
              to={`/projekt/${p.id}`}
              className={`block rounded-xl border border-border bg-panel p-4 shadow-sm ${missing.length > 0 ? "border-amber-200 bg-amber-50/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{p.project_number}</div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{p.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{p.customer?.company_name ?? "Kund saknas"}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="min-w-0">
                  <div className="text-slate-400">Från</div>
                  <div className="truncate">{loading?.name ?? "–"}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-400">Till</div>
                  <div className="truncate">{unloading?.name ?? "–"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Lastning</div>
                  <div>{formatDate(p.planned_loading_date)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Ansvarig</div>
                  <div>{p.responsible?.full_name ?? "–"}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {cargo?.height_m && <span>H {cargo.height_m} m</span>}
                {cargo?.width_m && <span>B {cargo.width_m} m</span>}
                {cargo?.weight_ton && <span>{cargo.weight_ton} t</span>}
                <span>{p.invoice_status}</span>
              </div>
              {missing.length > 0 && <div className="mt-3"><MissingFieldsBadge missing={missing} /></div>}
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-panel px-4 py-10 text-center text-sm text-slate-500">
            Inga projekt matchar filtren.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-panel shadow-sm md:block">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Projekt</th>
              <th className="px-4 py-3 font-medium">Kund</th>
              <th className="px-4 py-3 font-medium">Projekt/gods</th>
              <th className="px-4 py-3 font-medium">Från</th>
              <th className="px-4 py-3 font-medium">Till</th>
              <th className="px-4 py-3 font-medium">Lastning</th>
              <th className="px-4 py-3 font-medium">Leverans</th>
              <th className="px-4 py-3 font-medium">Höjd</th>
              <th className="px-4 py-3 font-medium">Bredd</th>
              <th className="px-4 py-3 font-medium">Vikt</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ansvarig</th>
              <th className="px-4 py-3 font-medium text-center">Rutt</th>
              <th className="px-4 py-3 font-medium text-center">Följebil</th>
              <th className="px-4 py-3 font-medium">Fakturering</th>
              <th className="px-4 py-3 font-medium">Saknade uppgifter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((p) => {
              const cargo = p.cargo_items?.[0];
              const loading = p.locations?.find((l) => l.type === "lastning");
              const unloading = p.locations?.find((l) => l.type === "lossning");
              const missing = getMissingFields(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projekt/${p.id}`)}
                  className={`cursor-pointer ${missing.length > 0 ? "bg-amber-50/40 hover:bg-amber-100" : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/projekt/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-slate-800 hover:text-orange-600"
                    >
                      {p.project_number}
                    </Link>
                    <div className="text-xs text-slate-500">{p.name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.customer?.company_name}</td>
                  <td className="px-4 py-3 text-slate-600">{cargo?.description ?? "–"}</td>
                  <td className="px-4 py-3 text-slate-600"><span className="flex items-center gap-1 text-xs"><MapPin size={11} />{loading?.name ?? "–"}</span></td>
                  <td className="px-4 py-3 text-slate-600"><span className="flex items-center gap-1 text-xs"><MapPin size={11} />{unloading?.name ?? "–"}</span></td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.planned_loading_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.planned_delivery_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{cargo?.height_m ? `${cargo.height_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-slate-600">{cargo?.width_m ? `${cargo.width_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-slate-600">{cargo?.weight_ton ? `${cargo.weight_ton} t` : "–"}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-slate-600">{p.responsible?.full_name ?? "–"}</td>
                  <td className="px-4 py-3 text-center">
                    {p.measurement_link ? <Ruler size={16} className="inline text-emerald-600" /> : <span className="text-slate-300">–</span>}
                  </td>
                  <td className="px-4 py-3 text-center" title={projectNeedsFollowVehicle(p) ? "Kräver följebil enligt godsmåtten" : undefined}>
                    {projectNeedsFollowVehicle(p) ? <TriangleAlert size={16} className="inline text-amber-600" /> : <span className="text-slate-300">–</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{p.invoice_status}</td>
                  <td className="px-4 py-3"><MissingFieldsBadge missing={missing} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-10 text-center text-sm text-slate-500">
                  Inga projekt matchar filtren.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjectFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
