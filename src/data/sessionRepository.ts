import { supabase } from "../lib/supabase";
import type { AssignmentSession } from "../types";
import type { WorkReportInput } from "../lib/workReportEngine";
import { friendlyError, pageAll } from "./pageAll";

function client() {
  if (!supabase) throw new Error("Databasen är inte tillgänglig.");
  return supabase;
}

function check(error: { message: string } | null) {
  if (error) throw new Error(friendlyError(error.message));
}

// Pågående uppdrag (egna, och för behöriga hela personalens). Avslutade uppdrag behövs inte i gränssnittet.
export async function loadOpenSessions(): Promise<AssignmentSession[]> {
  const db = client();
  return pageAll<AssignmentSession>((from, to) => db.from("assignment_sessions").select("*").is("ended_at", null).order("started_at", { ascending: false }).order("id").range(from, to), 5000);
}

export async function rpcSessionStart(args: { id: string; projectId: string; taskId: string | null }) {
  const { error } = await client().rpc("session_start", { p_id: args.id, p_project_id: args.projectId, p_task_id: args.taskId });
  check(error);
}

export async function rpcSessionWait(id: string, on: boolean) {
  const { error } = await client().rpc("session_wait", { p_id: id, p_on: on });
  check(error);
}

export async function rpcSessionFinish(id: string, endedIso: string, report: WorkReportInput) {
  const { error } = await client().rpc("session_finish", { p_id: id, p_ended: endedIso, p_report: report });
  check(error);
}

export async function rpcSessionCancel(id: string) {
  const { error } = await client().rpc("session_cancel", { p_id: id });
  check(error);
}
