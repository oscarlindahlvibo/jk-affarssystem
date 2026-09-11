import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Inbox,
  ClipboardList,
  Truck,
  Clock,
  FileWarning,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatDate, timeAgo } from "../lib/format";
import { getMissingFields } from "../lib/validation";
import { TASK_CATEGORY_STYLES } from "../lib/status";

function isThisWeek(dateStr: string | null): boolean {
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

export function Dashboard() {
  const { projects } = useStore();

  const stats = useMemo(() => {
    const nya = projects.filter((p) => p.status === "Ny").length;
    const planering = projects.filter((p) =>
      ["Planering", "Ruttkontroll", "Order"].includes(p.status)
    ).length;
    const transporterVecka = projects.filter(
      (p) => isThisWeek(p.planned_loading_date) || isThisWeek(p.planned_delivery_date)
    ).length;
    const vantarKund = projects.filter((p) => p.status === "Väntar på kund").length;
    const vantarTillstand = projects.filter((p) => p.status === "Tillstånd").length;
    const klarFakturering = projects.filter((p) => p.status === "Klar för fakturering").length;
    return { nya, planering, transporterVecka, vantarKund, vantarTillstand, klarFakturering };
  }, [projects]);

  const recentActivity = useMemo(
    () => [...projects].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 6),
    [projects]
  );

  const openTasks = useMemo(() => {
    const all: { projectNumber: string; projectId: string; task: string; category: string; assignee: string | null; deadline: string | null }[] = [];
    for (const p of projects) {
      for (const t of p.tasks ?? []) {
        if (t.status !== "Klar") {
          all.push({ projectNumber: p.project_number, projectId: p.id, task: t.task, category: t.category, assignee: t.assignee, deadline: t.deadline });
        }
      }
    }
    return all.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")).slice(0, 8);
  }, [projects]);

  const incompleteProjects = useMemo(() => {
    return projects
      .filter((p) => !["Avslutad", "Avbruten"].includes(p.status))
      .map((p) => ({ project: p, missing: getMissingFields(p) }))
      .filter((x) => x.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length)
      .slice(0, 6);
  }, [projects]);

  const cards = [
    { label: "Nya förfrågningar", value: stats.nya, icon: Inbox, color: "bg-slate-100 text-slate-600" },
    { label: "Under planering", value: stats.planering, icon: ClipboardList, color: "bg-cyan-100 text-cyan-700" },
    { label: "Transporter denna vecka", value: stats.transporterVecka, icon: Truck, color: "bg-orange-100 text-orange-700" },
    { label: "Väntar på kund", value: stats.vantarKund, icon: Clock, color: "bg-amber-100 text-amber-700" },
    { label: "Väntar på tillstånd", value: stats.vantarTillstand, icon: FileWarning, color: "bg-rose-100 text-rose-700" },
    { label: "Klara för fakturering", value: stats.klarFakturering, icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-panel p-4 shadow-sm">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
              <Icon size={18} />
            </div>
            <div className="text-2xl font-semibold text-slate-800">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Senaste aktivitet" className="lg:col-span-2">
          <ul className="divide-y divide-border">
            {recentActivity.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link to={`/projekt/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
                    {p.project_number} · {p.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {p.customer?.company_name} · uppdaterad {timeAgo(p.updated_at)}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
          <Link
            to="/projekt"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            Se alla projekt <ArrowRight size={14} />
          </Link>
        </Panel>

        <Panel
          title="Att göra (alla projekt)"
          action={<Link to="/mina-uppgifter" className="text-xs font-medium text-orange-600 hover:text-orange-700">Mina uppgifter</Link>}
        >
          <ul className="space-y-3">
            {openTasks.map((t, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`status-pill ${TASK_CATEGORY_STYLES[t.category as keyof typeof TASK_CATEGORY_STYLES]}`}>{t.category}</span>
                  <Link to={`/projekt/${t.projectId}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
                    {t.task}
                  </Link>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{t.projectNumber} · {t.assignee ?? "Ej tilldelad"}</span>
                  <span>{formatDate(t.deadline)}</span>
                </div>
              </li>
            ))}
            {openTasks.length === 0 && <p className="text-sm text-slate-500">Inga öppna uppgifter.</p>}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Projekt som behöver kompletteras"
        action={<Link to="/projekt?filter=saknar-uppgifter" className="text-xs font-medium text-orange-600 hover:text-orange-700">Se alla</Link>}
      >
        <ul className="divide-y divide-border">
          {incompleteProjects.map(({ project, missing }) => (
            <li key={project.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <Link to={`/projekt/${project.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
                  {project.project_number} · {project.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle size={12} />
                  Saknar: {missing.map((m) => m.label).join(", ")}
                </div>
              </div>
              <StatusBadge status={project.status} />
            </li>
          ))}
          {incompleteProjects.length === 0 && (
            <p className="py-2 text-sm text-slate-500">Alla aktiva projekt har fullständig information.</p>
          )}
        </ul>
      </Panel>
    </div>
  );
}
