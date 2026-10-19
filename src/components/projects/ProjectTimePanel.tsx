import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import type { Project } from "../../types";
import { useTimeTracking } from "../../data/timeTracking";
import { formatMinutes } from "../../lib/format";
import { Panel } from "../ui/Panel";
import { ProjectClockButton } from "./ProjectClockButton";

export function ProjectTimePanel({ project }: { project: Project }) {
  const projectId = project.id;
  const { totals, categories, projectMinutes } = useTimeTracking();
  const total = projectMinutes(projectId);
  const perCategory = new Map<string, number>();
  for (const row of totals) {
    if (row.project_id === projectId) perCategory.set(row.category_key ?? "", (perCategory.get(row.category_key ?? "") ?? 0) + row.minutes);
  }
  return (
    <Panel
      title="Registrerad tid"
      action={<Link to="/tid" className="text-xs font-medium text-orange-600 hover:text-orange-700">Stämpelklocka</Link>}
    >
      {total === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-slate-500"><Clock size={14} /> Ingen projekttid registrerad ännu.</p>
      ) : (
        <>
          <div className="text-2xl font-semibold text-slate-800">{formatMinutes(total)}</div>
          <ul className="mt-2 space-y-1 text-sm">
            {[...perCategory.entries()].sort((a, b) => b[1] - a[1]).map(([key, minutes]) => (
              <li key={key} className="flex justify-between">
                <span className="text-slate-600">{categories.find((c) => c.key === key)?.label ?? key}</span>
                <span className="font-medium text-slate-800">{formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4"><ProjectClockButton project={project} className="w-full justify-center" /></div>
    </Panel>
  );
}
