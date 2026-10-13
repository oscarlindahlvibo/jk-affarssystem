import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TimeCategory, TimeEntry, TimeTotalRow } from "../types";
import { useAuth } from "../lib/auth";
import { useStore } from "./store";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  addManualEntry,
  applyClockTransition,
  CLOCK_CONFLICT,
  deleteEntry as engineDeleteEntry,
  updateEntry as engineUpdateEntry,
  type ClockAction,
  type ClockJob,
  type ManualEntryArgs,
} from "../lib/timeEngine";
import {
  insertCategory,
  loadTimeData,
  patchCategory,
  rpcAddEntry,
  rpcClockTransition,
  rpcDeleteEntry,
  rpcUpdateEntry,
} from "./timeRepository";

const MOCK_ENTRIES_KEY = "jk-mock-time-entries";
const MOCK_CATEGORIES_KEY = "jk-mock-time-categories";

const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ["rekning", "Rekning"],
  ["planering", "Planering"],
  ["transportbokning", "Transportbokning"],
  ["dokumentation", "Dokumentation"],
  ["administration", "Administration"],
  ["resa", "Resa"],
  ["ovrigt", "Övrigt"],
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Mockläget fungerar ändå för den öppna sessionen.
  }
}

function seedCategories(orgId: string): TimeCategory[] {
  return DEFAULT_CATEGORIES.map(([key, label], index) => ({
    id: `tc-${orgId}-${key}`,
    org_id: orgId,
    key,
    label,
    active: true,
    sort_order: index + 1,
    is_builtin: true,
  }));
}

export interface TimeJobInput {
  projectId: string | null;
  taskId: string | null;
  categoryKey: string;
}

export interface TimeEntryInput {
  projectId: string | null;
  taskId: string | null;
  categoryKey: string;
  startIso: string;
  endIso: string;
  comment: string;
}

interface TimeShape {
  isLoading: boolean;
  error: string | null;
  categories: TimeCategory[];
  activeCategories: TimeCategory[];
  entries: TimeEntry[];
  myEntries: TimeEntry[];
  openEntry: TimeEntry | null;
  canViewAll: boolean;
  totals: TimeTotalRow[];
  taskMinutes: (taskId: string) => number;
  projectMinutes: (projectId: string) => number;
  clockIn: (job: TimeJobInput, openingComment: string) => Promise<void>;
  switchJob: (job: TimeJobInput, closingComment: string, openingComment: string) => Promise<void>;
  startPause: (kind: "break" | "lunch", closingComment: string) => Promise<void>;
  resume: () => Promise<void>;
  clockOut: (closingComment: string) => Promise<void>;
  addEntry: (input: TimeEntryInput) => Promise<void>;
  updateEntry: (id: string, input: TimeEntryInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  addCategory: (label: string) => Promise<void>;
  updateCategory: (id: string, patch: Partial<Pick<TimeCategory, "label" | "active">>) => Promise<void>;
  refresh: () => Promise<void>;
}

const TimeContext = createContext<TimeShape | null>(null);

function slugify(label: string) {
  return label
    .toLocaleLowerCase("sv")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function TimeTrackingProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = useAuth();
  const { projects } = useStore();
  const actor = useMemo(
    () => (currentProfile && currentProfile.status === "aktiv" ? { id: currentProfile.id, orgId: currentProfile.org_id } : null),
    [currentProfile]
  );
  const canViewAll = currentProfile ? ["admin", "projektledare", "ekonomi"].includes(currentProfile.role) : false;
  const isAdmin = currentProfile?.role === "admin";

  const [entries, setEntries] = useState<TimeEntry[]>(() => (isSupabaseConfigured ? [] : readJson<TimeEntry[]>(MOCK_ENTRIES_KEY, [])));
  const [categories, setCategories] = useState<TimeCategory[]>(() => (isSupabaseConfigured ? [] : readJson<TimeCategory[]>(MOCK_CATEGORIES_KEY, [])));
  const [liveTotals, setLiveTotals] = useState<TimeTotalRow[]>([]);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !actor) return;
    const data = await loadTimeData();
    setCategories(data.categories);
    setEntries(data.entries);
    setLiveTotals(data.totals);
  }, [actor]);

  useEffect(() => {
    if (!isSupabaseConfigured || !actor) return;
    let active = true;
    setIsLoading(true);
    reload()
      .then(() => active && setError(null))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Kunde inte läsa tidsdata."))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [actor, reload]);

  useEffect(() => {
    if (isSupabaseConfigured || !actor) return;
    setCategories((prev) => (prev.some((c) => c.org_id === actor.orgId) ? prev : [...prev, ...seedCategories(actor.orgId)]));
  }, [actor]);

  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_ENTRIES_KEY, entries);
  }, [entries]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_CATEGORIES_KEY, categories);
  }, [categories]);

  const orgCategories = useMemo(
    () => categories.filter((c) => !actor || c.org_id === actor.orgId).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "sv")),
    [categories, actor]
  );
  const activeCategories = useMemo(() => orgCategories.filter((c) => c.active), [orgCategories]);

  const visibleEntries = useMemo(
    () => (actor ? entries.filter((e) => e.org_id === actor.orgId && (canViewAll || e.user_id === actor.id)) : []),
    [entries, actor, canViewAll]
  );
  const myEntries = useMemo(() => visibleEntries.filter((e) => e.user_id === actor?.id), [visibleEntries, actor]);
  const openEntry = useMemo(() => myEntries.find((e) => !e.end_time) ?? null, [myEntries]);

  const totals = useMemo<TimeTotalRow[]>(() => {
    if (isSupabaseConfigured) return liveTotals;
    const map = new Map<string, TimeTotalRow>();
    for (const e of entries) {
      if (e.entry_type !== "work" || !e.end_time || !e.project_id) continue;
      const key = `${e.project_id}|${e.task_id}|${e.category_key}`;
      const row = map.get(key) ?? { project_id: e.project_id, task_id: e.task_id, category_key: e.category_key, minutes: 0 };
      row.minutes += e.total_minutes;
      map.set(key, row);
    }
    return [...map.values()];
  }, [entries, liveTotals]);

  const taskMinutes = useCallback((taskId: string) => totals.filter((r) => r.task_id === taskId).reduce((sum, r) => sum + r.minutes, 0), [totals]);
  const projectMinutes = useCallback((projectId: string) => totals.filter((r) => r.project_id === projectId).reduce((sum, r) => sum + r.minutes, 0), [totals]);

  const requireActor = useCallback(() => {
    if (!actor) throw new Error("Kontot är inte aktivt.");
    return actor;
  }, [actor]);

  const runClock = useCallback(
    async (action: ClockAction, job: TimeJobInput | undefined, closingComment = "", openingComment = "") => {
      const who = requireActor();
      const args = {
        id: crypto.randomUUID(),
        action,
        expected: openEntry?.id ?? null,
        eventIso: new Date().toISOString(),
        job: job ? { projectId: job.projectId, taskId: job.taskId, categoryKey: job.categoryKey } satisfies ClockJob : undefined,
        closingComment,
        openingComment,
      };
      try {
        if (isSupabaseConfigured) {
          await rpcClockTransition(args);
          await reload();
        } else {
          const result = applyClockTransition(entries, who, args, categories, projects);
          setEntries(result.entries);
        }
      } catch (e) {
        if (e instanceof Error && e.message === CLOCK_CONFLICT) {
          if (isSupabaseConfigured) await reload().catch(() => undefined);
          throw new Error("Din stämpling har ändrats från en annan enhet. Vyn är uppdaterad, försök igen.");
        }
        throw e;
      }
    },
    [categories, entries, openEntry, projects, reload, requireActor]
  );

  const clockIn: TimeShape["clockIn"] = useCallback((job, comment) => runClock("clockin", job, "", comment), [runClock]);
  const switchJob: TimeShape["switchJob"] = useCallback((job, closing, opening) => runClock("switch", job, closing, opening), [runClock]);
  const startPause: TimeShape["startPause"] = useCallback((kind, closing) => runClock(kind, undefined, closing), [runClock]);
  const resume: TimeShape["resume"] = useCallback(() => runClock("resume", undefined), [runClock]);
  const clockOut: TimeShape["clockOut"] = useCallback((closing) => runClock("clockout", undefined, closing), [runClock]);

  const addEntry: TimeShape["addEntry"] = useCallback(
    async (input) => {
      const who = requireActor();
      const args: ManualEntryArgs = { id: crypto.randomUUID(), ...input };
      if (isSupabaseConfigured) {
        await rpcAddEntry(args);
        await reload();
      } else {
        setEntries(addManualEntry(entries, who, args, categories, projects).entries);
      }
    },
    [categories, entries, projects, reload, requireActor]
  );

  const updateEntry: TimeShape["updateEntry"] = useCallback(
    async (id, input) => {
      const who = requireActor();
      const args: ManualEntryArgs = { id, ...input };
      if (isSupabaseConfigured) {
        await rpcUpdateEntry(args);
        await reload();
      } else {
        setEntries(engineUpdateEntry(entries, { ...who, isAdmin }, args, categories, projects));
      }
    },
    [categories, entries, isAdmin, projects, reload, requireActor]
  );

  const deleteEntry: TimeShape["deleteEntry"] = useCallback(
    async (id) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await rpcDeleteEntry(id);
        await reload();
      } else {
        setEntries(engineDeleteEntry(entries, { ...who, isAdmin }, id));
      }
    },
    [entries, isAdmin, reload, requireActor]
  );

  const addCategory: TimeShape["addCategory"] = useCallback(
    async (label) => {
      const who = requireActor();
      if (!isAdmin) throw new Error("Endast admin kan hantera tidskategorier.");
      const trimmed = label.trim();
      const key = slugify(trimmed);
      if (!trimmed || !key) throw new Error("Ange ett namn på kategorin.");
      if (orgCategories.some((c) => c.key === key || c.label.toLocaleLowerCase("sv") === trimmed.toLocaleLowerCase("sv"))) {
        throw new Error("Kategorin finns redan.");
      }
      const category: Omit<TimeCategory, "id"> = {
        org_id: who.orgId,
        key,
        label: trimmed,
        active: true,
        sort_order: Math.max(0, ...orgCategories.map((c) => c.sort_order)) + 1,
        is_builtin: false,
      };
      if (isSupabaseConfigured) {
        await insertCategory(category);
        await reload();
      } else {
        setCategories((prev) => [...prev, { ...category, id: crypto.randomUUID() }]);
      }
    },
    [isAdmin, orgCategories, reload, requireActor]
  );

  const updateCategory: TimeShape["updateCategory"] = useCallback(
    async (id, patch) => {
      requireActor();
      if (!isAdmin) throw new Error("Endast admin kan hantera tidskategorier.");
      if (patch.label !== undefined && !patch.label.trim()) throw new Error("Ange ett namn på kategorin.");
      if (isSupabaseConfigured) {
        await patchCategory(id, patch.label !== undefined ? { ...patch, label: patch.label.trim() } : patch);
        await reload();
      } else {
        setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, label: patch.label?.trim() ?? c.label } : c)));
      }
    },
    [isAdmin, reload, requireActor]
  );

  const refresh = useCallback(async () => {
    if (isSupabaseConfigured) await reload();
  }, [reload]);

  const value = useMemo<TimeShape>(
    () => ({
      isLoading,
      error,
      categories: orgCategories,
      activeCategories,
      entries: visibleEntries,
      myEntries,
      openEntry,
      canViewAll,
      totals,
      taskMinutes,
      projectMinutes,
      clockIn,
      switchJob,
      startPause,
      resume,
      clockOut,
      addEntry,
      updateEntry,
      deleteEntry,
      addCategory,
      updateCategory,
      refresh,
    }),
    [isLoading, error, orgCategories, activeCategories, visibleEntries, myEntries, openEntry, canViewAll, totals, taskMinutes, projectMinutes, clockIn, switchJob, startPause, resume, clockOut, addEntry, updateEntry, deleteEntry, addCategory, updateCategory, refresh]
  );

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTimeTracking() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTimeTracking måste användas inom TimeTrackingProvider");
  return ctx;
}

// Kategori-nyckel för en arbetsorderkategori, så att "Starta tid" på en uppgift väljer rätt tidskategori.
export function timeCategoryForTask(taskCategory: string): string {
  switch (taskCategory) {
    case "Rekning":
      return "rekning";
    case "Bokning av transport":
    case "Bokning av mobilkran":
    case "Följebil":
    case "VTL":
      return "transportbokning";
    case "Dokumentation":
      return "dokumentation";
    case "Dispensansökan":
    case "Tillstånd":
      return "administration";
    default:
      return "ovrigt";
  }
}
