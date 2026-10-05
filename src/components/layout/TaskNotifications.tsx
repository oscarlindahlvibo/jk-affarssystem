import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useStore } from "../../data/store";
import { supabase } from "../../lib/supabase";
import { isProjectActiveForFollowUp } from "../../lib/validation";
import { formatDate } from "../../lib/format";
import type { Project, ProjectTask } from "../../types";

type NotificationProject = Pick<Project, "id" | "project_number" | "name" | "status" | "invoice_status">;
type NotificationTask = Pick<ProjectTask, "id" | "task" | "deadline" | "status" | "assignee_id">;
type Assignment = NotificationTask & { project: NotificationProject };

export function TaskNotifications({ className = "" }: { className?: string }) {
  const { currentProfile } = useAuth();
  const { projects, isLoading } = useStore();
  const [open, setOpen] = useState(false);
  const [liveAssignments, setLiveAssignments] = useState<{ userId: string; source: Project[]; rows: Assignment[] } | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const userId = currentProfile?.id;
  const orgId = currentProfile?.org_id;
  const storedAssignments = useMemo(() => projects
    .filter(isProjectActiveForFollowUp)
    .flatMap((project) => (project.tasks ?? [])
      .filter((task) => task.assignee_id === userId && task.status !== "Klar")
      .map((task) => ({ ...task, project }))), [projects, userId]);

  useEffect(() => {
    if (!supabase || !userId || !orgId) return;
    const db = supabase;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const { data, error } = await db.from("projects")
          .select("id, project_number, name, status, invoice_status, tasks!inner(id, task, deadline, status, assignee_id)")
          .eq("org_id", orgId)
          .eq("tasks.assignee_id", userId)
          .neq("tasks.status", "Klar")
          .not("status", "in", '("Levererad","Avbokad","Fakturerad")')
          .neq("invoice_status", "Fakturerad");
        if (!active) return;
        if (error) { setRefreshError(true); return; }
        const rows = (data ?? []).flatMap(({ tasks, ...project }) =>
          tasks.map((task) => ({ ...task, project: project as NotificationProject })));
        setLiveAssignments({ userId, source: projects, rows });
        setRefreshError(false);
      } catch {
        if (active) setRefreshError(true);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, orgId, projects, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const assignments = [...(liveAssignments && liveAssignments.userId === userId && liveAssignments.source === projects ? liveAssignments.rows : storedAssignments)]
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.task.localeCompare(b.task, "sv"));

  return (
    <div ref={container} className={`relative shrink-0 ${className}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
      }}>
      <button ref={button} type="button" onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
        title="Tilldelade uppgifter"
        aria-label={`Notiser: ${assignments.length} öppna tilldelade uppgifter`}
        aria-expanded={open} aria-controls={open ? panelId : undefined}>
        <Bell size={18} />
        {assignments.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-semibold text-white">{assignments.length > 99 ? "99+" : assignments.length}</span>}
      </button>
      {open && (
        <section id={panelId} aria-label="Dina tilldelade uppgifter"
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Tilldelade uppgifter ({assignments.length})</h2>
            <button type="button" onClick={() => { setOpen(false); button.current?.focus(); }} aria-label="Stäng notiser" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
          </div>
          {refreshError && <p role="status" className="px-4 py-2 text-xs text-amber-700">Kunde inte uppdatera notiserna. Försöker igen automatiskt.</p>}
          <ul className="max-h-[55vh] overflow-y-auto divide-y divide-border">
            {assignments.map((task) => (
              <li key={task.id}>
                <Link to={`/projekt/${task.project.id}`} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none">
                  <div className="break-words text-sm font-medium text-slate-800">{task.task}</div>
                  <div className="mt-1 break-words text-xs text-slate-500">{task.project.project_number} · {task.project.name}</div>
                  <div className="mt-1 text-xs text-slate-600">{task.status}{task.deadline ? ` · Deadline: ${formatDate(task.deadline)}` : ""}</div>
                </Link>
              </li>
            ))}
          </ul>
          {assignments.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">{isLoading ? "Läser uppgifter..." : "Du har inga öppna tilldelade uppgifter."}</p>}
          <Link to="/mina-uppgifter" onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-sm font-medium text-orange-700 hover:bg-orange-50">Visa alla mina uppgifter</Link>
        </section>
      )}
    </div>
  );
}
