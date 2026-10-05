import nodemailer from "npm:nodemailer@6.9.16";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const FROM_EMAIL = Deno.env.get("TASK_NOTIFICATION_FROM_EMAIL") ?? "system@utskick.jkprojekt.se";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const MANAGER_ROLES = new Set(["admin", "projektledare"]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return Response.json(body, { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
async function api(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
async function rows(path: string) {
  const response = await api(path);
  if (!response.ok) throw new Error(`Database query failed (${response.status})`);
  return await response.json() as Record<string, unknown>[];
}
function esc(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function date(value: unknown) {
  if (!value) return "Ingen deadline";
  const parsed = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return json({ error: "E-posttjänsten är inte konfigurerad." }, 503, origin);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
  if (!userResponse.ok) return json({ error: "Invalid session" }, 401, origin);
  const user = await userResponse.json();
  const senders = await rows(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&status=eq.aktiv&select=id,org_id,role`);
  const sender = senders[0];
  if (!sender || !MANAGER_ROLES.has(String(sender.role))) return json({ error: "Du saknar behörighet." }, 403, origin);
  const body = await request.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return json({ error: "Ogiltig arbetsorder." }, 400, origin);

  try {
    const tasks = await rows(`/rest/v1/tasks?id=eq.${encodeURIComponent(taskId)}&select=*`);
    const task = tasks[0];
    if (!task?.assignee_id) return json({ ok: true, skipped: true }, 200, origin);
    const projects = await rows(`/rest/v1/projects?id=eq.${encodeURIComponent(String(task.project_id))}&org_id=eq.${encodeURIComponent(String(sender.org_id))}&select=id,org_id,project_number,name`);
    const project = projects[0];
    if (!project) return json({ error: "Projektet hittades inte." }, 404, origin);
    const assignees = await rows(`/rest/v1/profiles?id=eq.${encodeURIComponent(String(task.assignee_id))}&org_id=eq.${encodeURIComponent(String(sender.org_id))}&status=eq.aktiv&select=id,full_name,email`);
    const assignee = assignees[0];
    if (!assignee?.email) return json({ error: "Den ansvariga saknar e-postadress." }, 422, origin);

    const subject = `Ny arbetsorder: ${task.task} (${project.project_number})`;
    const projectUrl = `${APP_URL}/projekt/${project.id}`;
    const text = `Hej ${assignee.full_name},\n\nDu har fått en arbetsorder i JK Projektsystem.\n\nProjekt: ${project.project_number} – ${project.name}\nUppgift: ${task.task}\nKategori: ${task.category}\nDeadline: ${date(task.deadline)}\nSträcka: ${task.route_section || "–"}\nInstruktion: ${task.description || "–"}\n\nÖppna projektet: ${projectUrl}\n`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;background:#f8fafc;margin:0"><div style="max-width:620px;margin:auto;padding:24px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden"><div style="background:#0f1b30;color:#fff;padding:20px 24px"><strong>JK Projektlogistik</strong><div style="color:#fdba74;margin-top:4px">Ny arbetsorder</div></div><div style="padding:24px"><p>Hej ${esc(assignee.full_name)},</p><p>Du har fått en arbetsorder i JK Projektsystem.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:7px;color:#64748b">Projekt</td><td style="padding:7px;font-weight:600">${esc(project.project_number)} – ${esc(project.name)}</td></tr><tr><td style="padding:7px;color:#64748b">Uppgift</td><td style="padding:7px;font-weight:600">${esc(task.task)}</td></tr><tr><td style="padding:7px;color:#64748b">Kategori</td><td style="padding:7px">${esc(task.category)}</td></tr><tr><td style="padding:7px;color:#64748b">Deadline</td><td style="padding:7px">${esc(date(task.deadline))}</td></tr><tr><td style="padding:7px;color:#64748b">Sträcka</td><td style="padding:7px">${esc(task.route_section || "–")}</td></tr><tr><td style="padding:7px;color:#64748b">Instruktion</td><td style="padding:7px">${esc(task.description || "–")}</td></tr></table><p style="margin-top:24px"><a href="${esc(projectUrl)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:11px 16px;border-radius:7px;font-weight:600">Öppna projektet</a></p></div></div></div></body></html>`;
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, requireTLS: SMTP_PORT !== 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    let status = "sent", messageId: string | null = null, errorMessage: string | null = null;
    try {
      const result = await transport.sendMail({ from: { name: "JK Projektlogistik System", address: FROM_EMAIL }, to: String(assignee.email), subject, text, html });
      messageId = result.messageId ?? null;
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Okänt e-postfel";
    }
    await api("/rest/v1/task_notification_dispatches", { method: "POST", body: JSON.stringify({ org_id: project.org_id, project_id: project.id, task_id: task.id, assignee_id: assignee.id, recipient_email: assignee.email, status, external_message_id: messageId, error_message: errorMessage }) });
    if (status === "failed") return json({ ok: false, error: "Arbetsordern sparades, men e-postnotisen kunde inte skickas." }, 200, origin);
    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error("Task notification failed", error);
    return json({ error: "E-postnotisen kunde inte skapas." }, 500, origin);
  }
});
