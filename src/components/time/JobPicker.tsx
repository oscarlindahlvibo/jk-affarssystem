import { useMemo } from "react";
import { useStore } from "../../data/store";
import { timeCategoryForTask, useTimeTracking, type TimeJobInput } from "../../data/timeTracking";
import { isProjectActiveForFollowUp } from "../../lib/validation";
import { Field, inputClass } from "../ui/Field";

export interface JobDraft {
  projectId: string;
  taskId: string;
  categoryKey: string;
}

export function toJob(draft: JobDraft): TimeJobInput {
  return { projectId: draft.projectId || null, taskId: draft.taskId || null, categoryKey: draft.categoryKey };
}

export function JobPicker({
  value,
  onChange,
  includeProjectId,
  stacked = false,
}: {
  value: JobDraft;
  onChange: (next: JobDraft) => void;
  includeProjectId?: string | null;
  stacked?: boolean;
}) {
  const { projects } = useStore();
  const { activeCategories } = useTimeTracking();

  const projectOptions = useMemo(
    () =>
      projects
        .filter((p) => isProjectActiveForFollowUp(p) || p.id === includeProjectId || p.id === value.projectId)
        .sort((a, b) => b.project_number.localeCompare(a.project_number, "sv", { numeric: true })),
    [projects, includeProjectId, value.projectId]
  );
  const selectedProject = projects.find((p) => p.id === value.projectId);
  const tasks = selectedProject?.tasks ?? [];

  function changeProject(projectId: string) {
    onChange({ ...value, projectId, taskId: "" });
  }

  function changeTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const suggested = task ? timeCategoryForTask(task.category) : null;
    const categoryKey = suggested && activeCategories.some((c) => c.key === suggested) ? suggested : value.categoryKey;
    onChange({ ...value, taskId, categoryKey });
  }

  return (
    <div className={`grid grid-cols-1 gap-3 ${stacked ? "" : "sm:grid-cols-3"}`}>
      <Field label="Projekt">
        <select className={inputClass} value={value.projectId} onChange={(e) => changeProject(e.target.value)}>
          <option value="">Inget projekt (intern tid)</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.project_number} · {p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Arbetsorder (valfritt)">
        <select className={inputClass} value={value.taskId} onChange={(e) => changeTask(e.target.value)} disabled={!value.projectId || tasks.length === 0}>
          <option value="">{value.projectId && tasks.length === 0 ? "Projektet har inga arbetsordrar" : "Ingen specifik arbetsorder"}</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.task}</option>
          ))}
        </select>
      </Field>
      <Field label="Kategori">
        <select className={inputClass} value={value.categoryKey} onChange={(e) => onChange({ ...value, categoryKey: e.target.value })}>
          {activeCategories.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function defaultJobDraft(firstCategoryKey: string | undefined): JobDraft {
  return { projectId: "", taskId: "", categoryKey: firstCategoryKey ?? "" };
}
