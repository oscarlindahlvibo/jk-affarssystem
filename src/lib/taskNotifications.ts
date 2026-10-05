import { supabase } from "./supabase";

export async function notifyTaskAssignee(taskId: string) {
  if (!supabase) return;
  const { data, error } = await supabase.functions.invoke("notify-task-assignee", {
    body: { task_id: taskId },
  });
  if (error || !data?.ok) {
    throw new Error(data?.error ?? "Arbetsordern sparades, men e-postnotisen kunde inte skickas.");
  }
}
