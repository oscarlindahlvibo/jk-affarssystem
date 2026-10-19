import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssignmentSession } from "../types";
import { useAuth } from "../lib/auth";
import { useStore } from "./store";
import { useAttendance } from "./attendance";
import { useWorkReports } from "./workReports";
import { isSupabaseConfigured } from "../lib/supabase";
import { canViewPayroll } from "../lib/attendanceEngine";
import { cancelSession, finishSession, setWaiting, startSession } from "../lib/sessionEngine";
import type { WorkReportInput } from "../lib/workReportEngine";
import * as repo from "./sessionRepository";

const MOCK_KEY = "jk-mock-assignment-sessions";

function readSessions(): AssignmentSession[] {
  try {
    const raw = window.localStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as AssignmentSession[]) : [];
  } catch {
    return [];
  }
}

interface SessionsShape {
  isLoading: boolean;
  error: string | null;
  // Mina pågående uppdrag och (för behöriga) övrigas pågående uppdrag.
  mine: AssignmentSession[];
  others: AssignmentSession[];
  start: (projectId: string, taskId?: string | null) => Promise<{ clockedIn: boolean }>;
  setWaiting: (id: string, on: boolean) => Promise<void>;
  finish: (id: string, report: WorkReportInput) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionsShape | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = useAuth();
  const { projects } = useStore();
  const attendance = useAttendance();
  const workReports = useWorkReports();
  const active = currentProfile?.status === "aktiv";
  const actor = useMemo(() => (currentProfile && active ? { id: currentProfile.id, orgId: currentProfile.org_id } : null), [currentProfile, active]);

  const [sessions, setSessions] = useState<AssignmentSession[]>(() => (isSupabaseConfigured ? [] : readSessions()));
  const ref = useRef(sessions);
  const commit = useCallback((next: AssignmentSession[]) => {
    ref.current = next;
    setSessions(next);
  }, []);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !active) return;
    commit(await repo.loadOpenSessions());
  }, [active, commit]);

  useEffect(() => {
    if (!isSupabaseConfigured || !active) return;
    let live = true;
    setIsLoading(true);
    reload()
      .then(() => live && setError(null))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Kunde inte läsa pågående uppdrag."))
      .finally(() => live && setIsLoading(false));
    return () => {
      live = false;
    };
  }, [active, reload]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      window.localStorage.setItem(MOCK_KEY, JSON.stringify(sessions));
    } catch {
      // Mockläget fungerar ändå under den öppna sessionen.
    }
  }, [sessions]);

  const requireActor = useCallback(() => {
    if (!actor) throw new Error("Kontot är inte aktivt.");
    return actor;
  }, [actor]);

  const start: SessionsShape["start"] = useCallback(
    async (projectId, taskId = null) => {
      const who = requireActor();
      // En enda klocka: startas ett uppdrag utan att man är instämplad stämplas man också in för dagen.
      let clockedIn = false;
      if (!attendance.openEntry) {
        await attendance.clock("clockin");
        clockedIn = true;
      }
      const args = { id: crypto.randomUUID(), projectId, taskId };
      if (isSupabaseConfigured) {
        await repo.rpcSessionStart(args);
        await reload();
      } else {
        const nowIso = new Date().toISOString();
        commit(startSession(ref.current, who, { ...args, startedIso: nowIso }, projects.find((p) => p.id === projectId), nowIso));
      }
      return { clockedIn };
    },
    [attendance, commit, projects, reload, requireActor]
  );

  const setWaitingAction: SessionsShape["setWaiting"] = useCallback(
    async (id, on) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await repo.rpcSessionWait(id, on);
        await reload();
        return;
      }
      commit(setWaiting(ref.current, who, id, on, new Date().toISOString()));
    },
    [commit, reload, requireActor]
  );

  const finish: SessionsShape["finish"] = useCallback(
    async (id, report) => {
      const who = requireActor();
      const endedIso = new Date().toISOString();
      if (isSupabaseConfigured) {
        // Uppdraget avslutas och rapporten sparas i samma databastransaktion.
        await repo.rpcSessionFinish(id, endedIso, report);
        await Promise.all([reload(), workReports.refresh()]);
        return;
      }
      await workReports.saveReport(report);
      commit(finishSession(ref.current, who, id, endedIso, report.id, endedIso));
    },
    [commit, reload, requireActor, workReports]
  );

  const cancel: SessionsShape["cancel"] = useCallback(
    async (id) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await repo.rpcSessionCancel(id);
        await reload();
        return;
      }
      commit(cancelSession(ref.current, who, id));
    },
    [commit, reload, requireActor]
  );

  const canSeeOthers = Boolean(currentProfile && canViewPayroll(currentProfile.role));
  const mine = useMemo(() => sessions.filter((s) => !s.ended_at && s.user_id === actor?.id), [sessions, actor]);
  const others = useMemo(() => (canSeeOthers ? sessions.filter((s) => !s.ended_at && s.user_id !== actor?.id && s.org_id === actor?.orgId) : []), [sessions, actor, canSeeOthers]);

  const value: SessionsShape = { isLoading, error, mine, others, start, setWaiting: setWaitingAction, finish, cancel, refresh: reload };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessions() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessions måste användas inom SessionsProvider");
  return ctx;
}
