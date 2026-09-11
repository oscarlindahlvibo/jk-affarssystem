import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ClipboardList } from "lucide-react";
import { useStore } from "../data/store";
import { useAuth } from "../lib/auth";
import { usePermissions } from "../lib/usePermissions";
import { Panel } from "../components/ui/Panel";
import { TASK_CATEGORY_STYLES, TASK_STATUS_STYLES } from "../lib/status";
import { formatDate } from "../lib/format";
import { TASK_CATEGORIES, type ProjectTask, type TaskStatus, type Project } from "../types";

interface AssignedTask extends ProjectTask {
  project: Project;
}

const STATUS_OPTIONS: TaskStatus[] = ["Ej påbörjad", "Pågående", "Klar"];

export function MyTasksPage() {
  const { projects, updateTaskStatus } = useStore();
  const { currentProfile } = useAuth();
  const canEdit = usePermissions().can("projects", "edit");
  const [showDone, setShowDone] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  const myTasks: AssignedTask[] = useMemo(() => {
    if (!currentProfile) return [];
    const all: AssignedTask[] = [];
    for (const project of projects) {
      for (const task of project.tasks ?? []) {
        if (task.assignee_id === currentProfile.id) {
          all.push({ ...task, project });
        }
      }
    }
    return all.sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));
  }, [projects, currentProfile]);

  const filtered = myTasks.filter((t) => {
    if (!showDone && t.status === "Klar") return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    return true;
  });

  const openCount = myTasks.filter((t) => t.status !== "Klar").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Alla arbetsordrar och uppgifter som är tilldelade dig, oavsett vilket projekt de tillhör.
          {openCount > 0 && <span className="ml-1 font-medium text-slate-700">{openCount} öppna.</span>}
        </p>
        <div className="flex items-center gap-2">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <option value="">Alla kategorier</option>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Visa avklarade
          </label>
        </div>
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-400">
            <ClipboardList size={22} />
            {myTasks.length === 0 ? "Du har inga tilldelade uppgifter." : "Inga uppgifter matchar filtret."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`status-pill ${TASK_CATEGORY_STYLES[t.category]}`}>{t.category}</span>
                      <span className={`text-sm font-medium ${t.status === "Klar" ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.task}</span>
                    </div>
                    <Link to={`/projekt/${t.project.id}`} className="mt-0.5 block text-xs text-orange-600 hover:text-orange-700">
                      {t.project.project_number} · {t.project.name}
                    </Link>
                    {t.route_section && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-600">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span><span className="font-medium">Sträcka:</span> {t.route_section}</span>
                      </div>
                    )}
                    {t.description && <p className="mt-1.5 text-xs text-slate-600">{t.description}</p>}
                    {t.deadline && <div className="mt-1.5 text-xs text-slate-400">Deadline: {formatDate(t.deadline)}</div>}
                  </div>
                  {canEdit ? (
                    <select
                      value={t.status}
                      onChange={(e) => updateTaskStatus(t.project.id, t.id, e.target.value as TaskStatus)}
                      className={`status-pill shrink-0 border-0 ${TASK_STATUS_STYLES[t.status]}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`status-pill shrink-0 ${TASK_STATUS_STYLES[t.status]}`}>{t.status}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
