import { useState } from "react";
import { Plus, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import type { ProjectTask, TaskStatus, TaskCategory } from "../../types";
import { TASK_CATEGORIES } from "../../types";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { TASK_STATUS_STYLES, TASK_CATEGORY_STYLES } from "../../lib/status";
import { formatDate } from "../../lib/format";
import { useStore } from "../../data/store";
import { usePermissions } from "../../lib/usePermissions";

const STATUS_OPTIONS: TaskStatus[] = ["Ej påbörjad", "Pågående", "Klar"];
const UNASSIGNED = "";
const OTHER_ASSIGNEE = "__other__";

interface TaskFormState {
  task: string;
  category: TaskCategory;
  description: string;
  routeSection: string;
  assigneeId: string;
  otherAssignee: string;
  deadline: string;
}

function emptyForm(defaultRoute: string): TaskFormState {
  return { task: "", category: "Övrigt", description: "", routeSection: defaultRoute, assigneeId: UNASSIGNED, otherAssignee: "", deadline: "" };
}

function formFromTask(task: ProjectTask, isKnownProfile: boolean): TaskFormState {
  return {
    task: task.task,
    category: task.category,
    description: task.description ?? "",
    routeSection: task.route_section ?? "",
    assigneeId: task.assignee_id && isKnownProfile ? task.assignee_id : task.assignee ? OTHER_ASSIGNEE : UNASSIGNED,
    otherAssignee: !task.assignee_id && task.assignee ? task.assignee : "",
    deadline: task.deadline ?? "",
  };
}

export function TasksSection({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const { addTask, updateTask, updateTaskStatus, profiles, getProject } = useStore();
  const canEdit = usePermissions().can("projects", "edit");
  const [open, setOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const project = getProject(projectId);
  const loading = project?.locations?.find((l) => l.type === "lastning")?.name;
  const unloading = project?.locations?.find((l) => l.type === "lossning")?.name;
  const defaultRoute = loading && unloading ? `${loading} → ${unloading}` : "";
  const activeProfiles = profiles.filter((p) => p.status === "aktiv");

  function submitForm(form: TaskFormState, onSave: (data: Omit<ProjectTask, "id" | "project_id" | "status" | "comment">) => void) {
    if (!form.task.trim()) return;
    const assigneeProfile = form.assigneeId && form.assigneeId !== OTHER_ASSIGNEE ? activeProfiles.find((p) => p.id === form.assigneeId) : undefined;
    onSave({
      task: form.task.trim(),
      category: form.category,
      description: form.description.trim() || null,
      route_section: form.routeSection.trim() || null,
      assignee_id: assigneeProfile?.id ?? null,
      assignee: assigneeProfile?.full_name ?? (form.assigneeId === OTHER_ASSIGNEE ? form.otherAssignee.trim() || null : null),
      deadline: form.deadline || null,
    });
  }

  function handleCreate(form: TaskFormState) {
    submitForm(form, (data) => {
      addTask(projectId, { ...data, status: "Ej påbörjad", comment: null });
      setOpen(false);
    });
  }

  function handleUpdate(form: TaskFormState) {
    if (!editingTask) return;
    submitForm(form, (data) => {
      updateTask(projectId, editingTask.id, data);
      setEditingTask(null);
    });
  }

  return (
    <Panel
      title="Arbetsordrar / uppgifter"
      action={
        canEdit && (
          <Button variant="secondary" onClick={() => setOpen(true)} className="!px-2.5 !py-1.5">
            <Plus size={14} /> Ny arbetsorder
          </Button>
        )
      }
    >
      <ul className="divide-y divide-border">
        {tasks.map((t) => {
          const expanded = expandedId === t.id;
          const hasDetails = Boolean(t.description || t.route_section);
          return (
            <li key={t.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => hasDetails && setExpandedId(expanded ? null : t.id)}
                  className={`min-w-0 flex-1 text-left ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`status-pill ${TASK_CATEGORY_STYLES[t.category]}`}>{t.category}</span>
                    <span className={`text-sm ${t.status === "Klar" ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.task}</span>
                    {hasDetails && (expanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {t.assignee ?? "Ej tilldelad"} {t.deadline && `· deadline ${formatDate(t.deadline)}`}
                  </div>
                </button>
                {canEdit ? (
                  <select
                    value={t.status}
                    onChange={(e) => updateTaskStatus(projectId, t.id, e.target.value as TaskStatus)}
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
              {expanded && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {t.route_section && (
                    <div className="flex items-start gap-1.5">
                      <MapPin size={12} className="mt-0.5 shrink-0" />
                      <span><span className="font-medium">Sträcka:</span> {t.route_section}</span>
                    </div>
                  )}
                  {t.description && <p>{t.description}</p>}
                  {canEdit && (
                    <button type="button" onClick={() => setEditingTask(t)} className="font-medium text-orange-600 hover:text-orange-700">
                      Redigera arbetsorder
                    </button>
                  )}
                </div>
              )}
              {!hasDetails && canEdit && (
                <button type="button" onClick={() => setEditingTask(t)} className="mt-1 text-xs font-medium text-orange-600 hover:text-orange-700">
                  Redigera
                </button>
              )}
            </li>
          );
        })}
        {tasks.length === 0 && <p className="py-2 text-sm text-slate-500">Inga uppgifter tillagda.</p>}
      </ul>

      {open && (
        <TaskFormModal
          open
          title="Ny arbetsorder"
          initial={emptyForm(defaultRoute)}
          activeProfiles={activeProfiles}
          onClose={() => setOpen(false)}
          onSave={handleCreate}
        />
      )}

      {editingTask && (
        <TaskFormModal
          key={editingTask.id}
          open
          title="Redigera arbetsorder"
          initial={formFromTask(editingTask, activeProfiles.some((p) => p.id === editingTask.assignee_id))}
          activeProfiles={activeProfiles}
          onClose={() => setEditingTask(null)}
          onSave={handleUpdate}
        />
      )}
    </Panel>
  );
}

function TaskFormModal({
  open,
  title,
  initial,
  activeProfiles,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: TaskFormState;
  activeProfiles: ReturnType<typeof useStore>["profiles"];
  onClose: () => void;
  onSave: (form: TaskFormState) => void;
}) {
  const [form, setForm] = useState<TaskFormState>(initial);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
        className="space-y-4"
      >
        <Field label="Titel *">
          <input required className={inputClass} value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="t.ex. Reka sträckan Tingsryd–Växjö" />
        </Field>
        <Field label="Kategori">
          <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Beskrivning / instruktion till ansvarig">
          <textarea
            rows={3}
            className={inputClass}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Vad ska göras? Vad behöver den ansvariga veta?"
          />
        </Field>
        <Field label="Sträcka / delsträcka (särskilt viktigt vid rekning)">
          <input
            className={inputClass}
            value={form.routeSection}
            onChange={(e) => setForm({ ...form, routeSection: e.target.value })}
            placeholder="t.ex. Rv23 mellan Tingsryd och Växjö, bron vid km 12"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ansvarig">
            <select
              className={inputClass}
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            >
              <option value={UNASSIGNED}>Ej tilldelad</option>
              {activeProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
              <option value={OTHER_ASSIGNEE}>Annan (ej registrerad person)...</option>
            </select>
            {form.assigneeId === OTHER_ASSIGNEE && (
              <input
                className={`mt-2 ${inputClass}`}
                value={form.otherAssignee}
                onChange={(e) => setForm({ ...form, otherAssignee: e.target.value })}
                placeholder="Namn"
              />
            )}
          </Field>
          <Field label="Deadline">
            <input type="date" className={inputClass} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit">Spara</Button>
        </div>
      </form>
    </Modal>
  );
}
