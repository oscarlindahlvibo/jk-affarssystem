import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, Check, RotateCcw, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useStore } from "../../data/store";
import { supabase } from "../../lib/supabase";
import { isProjectActiveForFollowUp } from "../../lib/validation";
import { formatDate, formatDateTime } from "../../lib/format";
import {
  clearNotifications, loadInbox, markNotificationsRead, markNotificationsUnread, restoreNotifications, unreadCount, visibleNotifications,
  type InboxNotification,
} from "../../lib/notificationInbox";
import type { Project, ProjectTask } from "../../types";
import { PushNotificationSettings } from "./PushNotificationSettings";

type NotificationProject = Pick<Project, "id" | "project_number" | "name" | "status" | "invoice_status">;
type NotificationTask = Pick<ProjectTask, "id" | "task" | "deadline" | "status" | "assignee_id">;
type Assignment = NotificationTask & { project: NotificationProject };

export function NotificationBell({ className = "" }: { className?: string }) {
  const { currentProfile } = useAuth();
  const { projects, isLoading } = useStore();
  const [open, setOpen] = useState(false);
  const [liveAssignments, setLiveAssignments] = useState<{ userId: string; source: Project[]; rows: Assignment[] } | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [tab, setTab] = useState<"notiser" | "uppgifter">("notiser");
  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [showCleared, setShowCleared] = useState(false);
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

  const refreshInbox = useCallback(async () => {
    try {
      setInbox(await loadInbox());
      setInboxError(null);
    } catch (reason) {
      setInboxError(reason instanceof Error ? reason.message : "Notiserna kunde inte läsas in.");
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { if (document.visibilityState !== "hidden") void refreshInbox(); };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, refreshInbox]);

  async function change(action: (ids: string[]) => Promise<void>, ids: string[]) {
    try {
      await action(ids);
      await refreshInbox();
    } catch (reason) {
      setInboxError(reason instanceof Error ? reason.message : "Notisen kunde inte uppdateras.");
    }
  }

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

  const unread = unreadCount(inbox);
  const notifications = visibleNotifications(inbox, showCleared);
  const clearedCount = inbox.filter((row) => row.cleared_at).length;
  const unreadIds = inbox.filter((row) => !row.read_at && !row.cleared_at).map((row) => row.id);
  const activeIds = inbox.filter((row) => !row.cleared_at).map((row) => row.id);

  return (
    <div ref={container} className={`relative shrink-0 ${className}`}
      onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
      }}>
      <button ref={button} type="button" onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
        title="Notiser"
        aria-label={`Notiser: ${unread} olästa`}
        aria-expanded={open} aria-controls={open ? panelId : undefined}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section id={panelId} aria-label="Notiser"
          className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-10rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div role="tablist" aria-label="Notisvyer" className="flex gap-1 text-sm">
              <button type="button" role="tab" aria-selected={tab === "notiser"} onClick={() => setTab("notiser")}
                className={`rounded-md px-2.5 py-1 font-semibold ${tab === "notiser" ? "bg-orange-50 text-orange-700" : "text-slate-500 hover:bg-slate-100"}`}>
                Notiser{unread > 0 ? ` (${unread})` : ""}
              </button>
              <button type="button" role="tab" aria-selected={tab === "uppgifter"} onClick={() => setTab("uppgifter")}
                className={`rounded-md px-2.5 py-1 font-semibold ${tab === "uppgifter" ? "bg-orange-50 text-orange-700" : "text-slate-500 hover:bg-slate-100"}`}>
                Uppgifter ({assignments.length})
              </button>
            </div>
            <button type="button" onClick={() => { setOpen(false); button.current?.focus(); }} aria-label="Stäng notiser" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
          </div>

          {tab === "notiser" ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs">
                <button type="button" disabled={unreadIds.length === 0} onClick={() => void change(markNotificationsRead, unreadIds)} className="font-medium text-orange-700 hover:underline disabled:text-slate-400 disabled:no-underline">Markera alla som lästa</button>
                <button type="button" disabled={activeIds.length === 0} onClick={() => void change(clearNotifications, activeIds)} className="font-medium text-orange-700 hover:underline disabled:text-slate-400 disabled:no-underline">Rensa alla</button>
                <label className="ml-auto flex items-center gap-1.5 text-slate-600">
                  <input type="checkbox" checked={showCleared} onChange={(event) => setShowCleared(event.target.checked)} /> Visa rensade{clearedCount > 0 ? ` (${clearedCount})` : ""}
                </label>
              </div>
              {inboxError && <p role="status" className="px-4 py-2 text-xs text-amber-700">{inboxError}</p>}
              <ul className="max-h-[55vh] overflow-y-auto divide-y divide-border">
                {notifications.map((item) => {
                  const unreadItem = !item.read_at && !item.cleared_at;
                  return (
                    <li key={item.id} className={`flex items-start gap-1 ${item.cleared_at ? "bg-slate-50 text-slate-400" : unreadItem ? "bg-orange-50/50" : ""}`}>
                      <Link to={item.url ?? "/"} onClick={() => { setOpen(false); if (unreadItem) void change(markNotificationsRead, [item.id]); }}
                        className="min-w-0 flex-1 px-4 py-3 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none">
                        <div className={`break-words text-sm ${unreadItem ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                          {unreadItem && <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-600" />}{item.title}
                        </div>
                        {item.body && <div className="mt-1 break-words text-xs text-slate-600">{item.body}</div>}
                        <div className="mt-1 text-[11px] text-slate-500">{formatDateTime(item.created_at)}{item.cleared_at ? " · Rensad" : ""}</div>
                      </Link>
                      <div className="flex shrink-0 flex-col gap-0.5 py-2 pr-2">
                        {item.cleared_at ? (
                          <button type="button" onClick={() => void change(restoreNotifications, [item.id])} aria-label="Återställ notisen" title="Återställ" className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><RotateCcw size={14} /></button>
                        ) : (
                          <>
                            <button type="button" onClick={() => void change(unreadItem ? markNotificationsRead : markNotificationsUnread, [item.id])}
                              aria-label={unreadItem ? "Markera som läst" : "Markera som oläst"} title={unreadItem ? "Markera som läst" : "Markera som oläst"} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Check size={14} /></button>
                            <button type="button" onClick={() => void change(clearNotifications, [item.id])} aria-label="Rensa notisen" title="Rensa" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {notifications.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">{showCleared ? "Inga notiser." : clearedCount > 0 ? "Inga nya notiser. Välj Visa rensade för att se äldre." : "Inga notiser ännu."}</p>}
            </>
          ) : (
            <>
              {refreshError && <p role="status" className="px-4 py-2 text-xs text-amber-700">Kunde inte uppdatera uppgifterna. Försöker igen automatiskt.</p>}
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
            </>
          )}
          <PushNotificationSettings />
        </section>
      )}
    </div>
  );
}
