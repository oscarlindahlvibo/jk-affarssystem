import { supabase } from "../lib/supabase";
import type { TimeCategory, TimeEntry, TimeTotalRow } from "../types";
import type { ClockAction, ClockJob, ManualEntryArgs } from "../lib/timeEngine";

function client() {
  if (!supabase) throw new Error("Databasen är inte tillgänglig.");
  return supabase;
}

function fail(error: { message: string } | null, what: string) {
  if (error) {
    if (error.message.includes("CLOCK_STATE_CONFLICT")) throw new Error("CLOCK_STATE_CONFLICT");
    throw new Error(error.message || `${what} misslyckades.`);
  }
}

export async function loadTimeData() {
  const db = client();
  const [categories, entries, totals] = await Promise.all([
    db.from("time_categories").select("*").order("sort_order").order("label"),
    db.from("time_entries").select("*").order("start_time", { ascending: false }).limit(5000),
    db.rpc("time_totals"),
  ]);
  fail(categories.error, "Läsning av tidskategorier");
  fail(entries.error, "Läsning av tidsposter");
  fail(totals.error, "Läsning av tidssummor");
  return {
    categories: (categories.data ?? []) as TimeCategory[],
    entries: (entries.data ?? []) as TimeEntry[],
    totals: ((totals.data ?? []) as Array<TimeTotalRow & { minutes: number | string }>).map((row) => ({ ...row, minutes: Number(row.minutes) })),
  };
}

export async function rpcClockTransition(args: {
  id: string;
  action: ClockAction;
  expected: string | null;
  eventIso: string;
  job?: ClockJob;
  closingComment?: string;
  openingComment?: string;
}) {
  const { error } = await client().rpc("time_clock_transition", {
    p_id: args.id,
    p_action: args.action,
    p_expected: args.expected,
    p_event: args.eventIso,
    p_project: args.job?.projectId ?? null,
    p_task: args.job?.taskId ?? null,
    p_category: args.job?.categoryKey ?? null,
    p_comment: args.closingComment ?? "",
    p_opening_comment: args.openingComment ?? "",
  });
  fail(error, "Stämplingen");
}

function entryParams(args: ManualEntryArgs) {
  return {
    p_id: args.id,
    p_project: args.projectId,
    p_task: args.taskId,
    p_category: args.categoryKey,
    p_start: args.startIso,
    p_end: args.endIso,
    p_comment: args.comment,
  };
}

export async function rpcAddEntry(args: ManualEntryArgs) {
  const { error } = await client().rpc("time_add_entry", entryParams(args));
  fail(error, "Registreringen");
}

export async function rpcUpdateEntry(args: ManualEntryArgs) {
  const { error } = await client().rpc("time_update_entry", entryParams(args));
  fail(error, "Ändringen");
}

export async function rpcDeleteEntry(id: string) {
  const { error } = await client().rpc("time_delete_entry", { p_id: id });
  fail(error, "Raderingen");
}

export async function insertCategory(category: Omit<TimeCategory, "id">) {
  const { error } = await client().from("time_categories").insert(category);
  fail(error, "Sparandet av kategorin");
}

export async function patchCategory(id: string, patch: Partial<Pick<TimeCategory, "label" | "active" | "sort_order">>) {
  const { error } = await client().from("time_categories").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  fail(error, "Sparandet av kategorin");
}
