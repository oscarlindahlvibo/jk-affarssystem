const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export type InboxNotification = {
  org_id: string;
  user_id: string;
  kind: "note" | "project" | "project_update" | "task";
  title: string;
  body: string;
  url: string;
  project_id: string;
};

// Sparar notiserna i användarnas inkorg (klockan i appen). Ett fel här får aldrig stoppa push eller e-post.
export async function addInboxNotifications(rows: InboxNotification[]) {
  if (rows.length === 0) return;
  try {
    const response = await fetch(`${url}/rest/v1/user_notifications`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!response.ok) console.error("Inbox insert failed", response.status);
  } catch {
    console.error("Inbox insert failed");
  }
}
