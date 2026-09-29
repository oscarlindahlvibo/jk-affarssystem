import { Link } from "react-router-dom";
import { Calculator, Users } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { useStore } from "../data/store";
import { PROJECT_STATUSES, ROLE_LABELS, USER_STATUS_LABELS } from "../types";

export function SettingsPage() {
  const { profiles } = useStore();
  const sortedProfiles = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name, "sv"));

  return (
    <div className="space-y-6">
      <Panel title="Systeminställningar">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/installningar/raknesnurra"
            className="flex items-start gap-3 rounded-lg border border-border p-4 transition hover:border-orange-200 hover:bg-orange-50/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
              <Calculator size={18} />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">Räknesnurra</div>
              <p className="mt-1 text-xs text-slate-500">
                Administrera fordonskategorier, tilläggskostnader och ändringslogg för kalkylen.
              </p>
            </div>
          </Link>
          <Link
            to="/personal"
            className="flex items-start gap-3 rounded-lg border border-border p-4 transition hover:border-orange-200 hover:bg-orange-50/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Users size={18} />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">Personal och behörigheter</div>
              <p className="mt-1 text-xs text-slate-500">
                Bjud in användare och administrera roller för JK:s personal.
              </p>
            </div>
          </Link>
        </div>
      </Panel>

      <Panel title="Användare / roller">
        <div className="space-y-3 md:hidden">
          {sortedProfiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="font-medium text-slate-800">{p.full_name}</div>
              <div className="mt-0.5 break-all text-xs text-slate-500">{p.email}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="status-pill bg-navy-900/5 text-navy-900">{ROLE_LABELS[p.role]}</span>
                <span className={`status-pill ${p.status === "aktiv" ? "bg-green-100 text-green-700" : p.status === "inbjuden" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
                  {USER_STATUS_LABELS[p.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
        <table className="hidden w-full text-left text-sm md:table">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Namn</th>
              <th className="py-2 font-medium">E-post</th>
              <th className="py-2 font-medium">Roll</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedProfiles.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5 font-medium text-slate-800">{p.full_name}</td>
                <td className="py-2.5 text-slate-600">{p.email}</td>
                <td className="py-2.5">
                  <span className="status-pill bg-navy-900/5 text-navy-900">{ROLE_LABELS[p.role]}</span>
                </td>
                <td className="py-2.5">
                  <span className={`status-pill ${p.status === "aktiv" ? "bg-green-100 text-green-700" : p.status === "inbjuden" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
                    {USER_STATUS_LABELS[p.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedProfiles.length === 0 && <p className="text-sm text-slate-500">Inga användare registrerade.</p>}
      </Panel>

      <Panel title="Statusflöde för projekt">
        <div className="flex flex-wrap gap-2">
          {PROJECT_STATUSES.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="status-pill bg-slate-100 text-slate-600">{i + 1}. {s}</span>
              {i < PROJECT_STATUSES.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
