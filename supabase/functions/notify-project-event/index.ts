import { mailConfigured, sendMail } from "../_shared/mail.ts";
import { addInboxNotifications } from "../_shared/inbox.ts";
import { sendUserPush } from "../_shared/webPush.ts";
import { NOTIFIED_ROLES, isInitialNote, parseProjectEvent, projectChangeMessage, projectEventMessage } from "../_shared/projectEvents.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";
const FROM_EMAIL = Deno.env.get("TASK_NOTIFICATION_FROM_EMAIL") ?? "system@utskick.jkprojekt.se";
const APP_URL = "https://projekt.jkprojekt.se";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}
async function rows(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!response.ok) throw new Error(`Database query failed (${response.status})`);
  return await response.json() as Record<string, unknown>[];
}
function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function esc(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Anropas av databasen (pg_net) direkt efter att en anteckning eller ett projekt sparats.
Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameSecret(request.headers.get("x-webhook-secret") ?? "", WEBHOOK_SECRET)) return json({ error: "Forbidden" }, 403);
  const event = parseProjectEvent(await request.json().catch(() => null));
  if (!event) return json({ error: "Ogiltig händelse" }, 400);

  try {
    let note: Record<string, unknown> | undefined;
    let projectId = event.id;
    if (event.type === "note") {
      note = (await rows(`notes?id=eq.${event.id}&select=project_id,date,user_name,text,category,visibility`))[0];
      if (!note) return json({ ok: true, skipped: "note-missing" });
      projectId = String(note.project_id);
    }
    const project = (await rows(`projects?id=eq.${projectId}&select=id,org_id,project_number,name,customer_id,booking_source,created_at`))[0];
    if (!project) return json({ ok: true, skipped: "project-missing" });
    if (note && isInitialNote(String(note.date), String(project.created_at))) return json({ ok: true, skipped: "initial-note" });

    const customer = (await rows(`customers?id=eq.${project.customer_id}&select=company_name`))[0];
    const info = { ...project, customer: customer ? String(customer.company_name) : null } as never;
    let message: { title: string; body: string; lines?: string[] };
    if (event.type === "project_update") {
      const ids = [...new Set(Object.entries(event.changes).filter(([field]) => field === "responsible_id").flatMap(([, pair]) => pair).filter((id): id is string => Boolean(id)))];
      const names: Record<string, string> = {};
      if (ids.length > 0 && ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) {
        for (const person of await rows(`profiles?id=in.(${ids.join(",")})&select=id,full_name`)) names[String(person.id)] = String(person.full_name);
      }
      message = projectChangeMessage(info, event.changes, names);
    } else {
      message = projectEventMessage(event.type, info, note as never);
    }
    const roles = NOTIFIED_ROLES.map((role) => `"${role}"`).join(",");
    const recipients = (await rows(`profiles?org_id=eq.${project.org_id}&status=eq.aktiv&role=in.(${roles})&select=id,full_name,email`))
      .filter((profile) => profile.id !== event.actor);

    const url = `/projekt/${project.id}`;
    const tag = event.type === "note" ? `jk-note-${event.id}` : event.type === "project_update" ? `jk-update-${project.id}-${Date.now()}` : `jk-project-${project.id}`;
    const detail = message.lines ? `${project.name}\n${message.lines.join("\n")}` : message.body;
    const text = `${message.title}\n\n${detail}\n\nÖppna projektet: ${APP_URL}${url}\n`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;background:#f8fafc;margin:0"><div style="max-width:620px;margin:auto;padding:24px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden"><div style="background:#0f1b30;color:#fff;padding:20px 24px"><strong>JK Projektlogistik</strong><div style="color:#fdba74;margin-top:4px">${esc(message.title)}</div></div><div style="padding:24px"><p>${esc(message.lines ? project.name : message.body)}</p>${message.lines ? `<ul>${message.lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}<p style="margin-top:24px"><a href="${esc(APP_URL + url)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:11px 16px;border-radius:7px;font-weight:600">Öppna projektet</a></p></div></div></div></body></html>`;

    await addInboxNotifications(recipients.map((recipient) => ({
      org_id: String(project.org_id), user_id: String(recipient.id), kind: event.type, title: message.title,
      body: message.lines ? `${project.name} · ${message.lines.join(" · ")}` : message.body, url, project_id: String(project.id),
    })));

    let pushed = 0, mailed = 0;
    for (const recipient of recipients) {
      let delivered = 0;
      try {
        delivered = (await sendUserPush(String(recipient.id), String(project.org_id), { ...message, url, tag })).sent;
      } catch { console.error("Project event push failed"); }
      pushed += delivered;
      // E-post bara till den som inte nåddes med push (ingen app installerad), så ingen får dubbla notiser.
      if (delivered === 0 && recipient.email && mailConfigured()) {
        try {
          await sendMail({ fromName: "JK Projektlogistik System", fromAddress: FROM_EMAIL, to: [String(recipient.email)], subject: message.title, text, html });
          mailed++;
        } catch { console.error("Project event mail failed"); }
      }
    }
    return json({ ok: true, recipients: recipients.length, pushed, mailed });
  } catch (error) {
    console.error("Project event notification failed", error);
    return json({ error: "Notisen kunde inte skickas." }, 500);
  }
});
