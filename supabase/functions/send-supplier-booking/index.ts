import nodemailer from "npm:nodemailer@6.9.16";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const FROM_EMAIL = Deno.env.get("SUPPLIER_BOOKING_FROM_EMAIL") ?? "system@utskick.jkprojekt.se";
const FROM_NAME = Deno.env.get("SUPPLIER_BOOKING_FROM_NAME") ?? "JK Projektlogistik Bokning";
const REPLY_TO_EMAIL = Deno.env.get("SUPPLIER_BOOKING_REPLY_TO_EMAIL") ?? "bokning@jkprojekt.se";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const SENDER_ROLES = new Set(["admin", "projektledare"]);

type DbRow = Record<string, unknown>;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return Response.json(body, { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function rows(path: string) {
  const response = await api(path);
  if (!response.ok) throw new Error(`Database query failed (${response.status})`);
  return await response.json() as DbRow[];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value: unknown, suffix = "") {
  return value === null || value === undefined || value === "" ? "–" : `${value}${suffix}`;
}

function formatDate(date: unknown, time?: unknown) {
  if (!date) return "–";
  const clock = time ? String(time).slice(0, 5) : "12:00";
  const parsed = new Date(`${String(date)}T${clock}:00`);
  const formatted = Number.isNaN(parsed.getTime())
    ? String(date)
    : new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
  return time ? `${formatted} kl. ${String(time).slice(0, 5)}` : formatted;
}

function addressList(raw: unknown) {
  return String(raw ?? "")
    .split(/[;,]/)
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

function validEmail(address: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function emailContent(project: DbRow, locations: DbRow[], cargo: DbRow[], supplier: DbRow) {
  const loading = locations.find((location) => location.type === "lastning");
  const unloading = locations.find((location) => location.type === "lossning");
  const waypoints = locations.filter((location) => location.type === "mellanpunkt");
  const subject = `Bokning ${project.project_number} – ${display(loading?.name)} till ${display(unloading?.name)}`;
  const cargoHtml = cargo.map((item, index) => {
    const fields: Array<[string, unknown]> = [
      ["Beskrivning", item.description], ["Längd", display(item.length_m, " m")],
      ["Bredd", display(item.width_m, " m")], ["Höjd", display(item.height_m, " m")],
      ["Vikt", display(item.weight_ton, " ton")], ["Antal kollin", item.quantity],
      ["Lyftpunkter", item.lift_points], ["Ritningsreferens", item.drawing_reference],
      ["Övrig teknisk information", item.technical_info],
    ];
    return `<div style="margin-top:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
      <div style="padding:10px 12px;background:#f1f5f9;font-weight:700">Godsrad ${index + 1}</div>
      <table style="width:100%;border-collapse:collapse">${fields.map(([label, value]) => `<tr><td style="width:38%;padding:7px 12px;color:#64748b;border-top:1px solid #e2e8f0">${escapeHtml(label)}</td><td style="padding:7px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(display(value))}</td></tr>`).join("")}</table>
    </div>`;
  }).join("");
  const transportRows: Array<[string, unknown]> = [
    ["Lastningsort", loading?.name],
    ["Företag vid lastning", loading?.company_name],
    ["Lastningsadress", loading?.address],
    ["Planerad lastning", formatDate(project.planned_loading_date, project.planned_loading_time)],
    ["Kontakt vid lastning", [loading?.contact_name, loading?.contact_phone].filter(Boolean).join(" · ")],
    ["Mellanadress / via", waypoints.map((point) => point.address || point.name).join(", ")],
    ["Lossningsort", unloading?.name],
    ["Företag vid lossning", unloading?.company_name],
    ["Lossningsadress", unloading?.address],
    ["Planerad lossning", formatDate(project.planned_delivery_date, project.planned_delivery_time)],
    ["Kontakt vid lossning", [unloading?.contact_name, unloading?.contact_phone].filter(Boolean).join(" · ")],
    ["Beräknad sträcka", project.route_distance_km ? `${project.route_distance_km} km` : null],
    ["Transporttyp", project.transport_type],
    ["Tilldelad leverantör", supplier.company_name],
    ["Fordon", project.vehicle],
    ["Chaufför", project.driver_name],
    ["Kundens ordernummer", project.customer_reference],
    ["Källdokument", project.source_document_ref],
    ["Transportörens ordernummer", project.carrier_order_number],
    ["Leveransvillkor", project.delivery_terms],
    ["Särskilda krav", project.special_requirements],
  ];
  const visibleRows = transportRows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  const greeting = supplier.contact_person ? `Hej ${supplier.contact_person},` : "Hej,";
  const transportHtml = visibleRows.map(([label, value]) => `
    <tr><td style="padding:7px 12px 7px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;font-weight:600;vertical-align:top">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:760px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <div style="background:#0f1b30;padding:22px 26px;color:#ffffff"><div style="font-size:20px;font-weight:700">JK Projektlogistik</div><div style="margin-top:4px;color:#fdba74">Transportbokning ${escapeHtml(project.project_number)}</div></div>
        <div style="padding:26px">
          <p>${escapeHtml(greeting)}</p><p>Här kommer en transportbokning från JK Projektlogistik. Bekräfta bokningen eller återkom med frågor genom att svara på detta mejl.</p>
          <h2 style="font-size:17px;margin:26px 0 8px">Transportinformation</h2><table style="width:100%;border-collapse:collapse">${transportHtml}</table>
          <h2 style="font-size:17px;margin:26px 0 8px">Gods</h2>
          ${cargoHtml || "<p>Ingen godsinformation registrerad.</p>"}
          <p style="margin-top:26px">Med vänlig hälsning<br><strong>JK Projektlogistik AB</strong><br><a href="mailto:${escapeHtml(REPLY_TO_EMAIL)}">${escapeHtml(REPLY_TO_EMAIL)}</a></p>
        </div>
      </div>
    </div></body></html>`;
  const text = [
    greeting,
    "", "Här kommer en transportbokning från JK Projektlogistik. Bekräfta bokningen eller återkom med frågor genom att svara på detta mejl.",
    "", "TRANSPORTINFORMATION", ...visibleRows.map(([label, value]) => `${label}: ${value}`),
    "", "GODS", ...cargo.map((item, index) => [
      `${index + 1}. ${display(item.description)}`,
      `Längd: ${display(item.length_m, " m")} | Bredd: ${display(item.width_m, " m")} | Höjd: ${display(item.height_m, " m")}`,
      `Vikt: ${display(item.weight_ton, " ton")} | Antal kollin: ${display(item.quantity)}`,
      `Lyftpunkter: ${display(item.lift_points)} | Ritningsreferens: ${display(item.drawing_reference)}`,
      `Övrig teknisk information: ${display(item.technical_info)}`,
    ].join("\n")),
    "", "Med vänlig hälsning", "JK Projektlogistik AB", REPLY_TO_EMAIL,
  ].join("\n");
  return { subject, html, text };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return json({ error: "Bokningsutskick är inte konfigurerat på servern." }, 503, origin);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
  if (!userResponse.ok) return json({ error: "Invalid session" }, 401, origin);
  const requester = await userResponse.json();
  const profiles = await rows(`/rest/v1/profiles?id=eq.${encodeURIComponent(requester.id)}&status=eq.aktiv&select=id,org_id,full_name,role`);
  const profile = profiles[0];
  if (!profile || !SENDER_ROLES.has(String(profile.role))) return json({ error: "Du saknar behörighet att skicka bokningar." }, 403, origin);

  let body: { project_id?: string; supplier_ids?: string[] };
  try { body = await request.json(); } catch { return json({ error: "Invalid request body" }, 400, origin); }
  const projectId = body.project_id ?? "";
  const supplierIds = [...new Set(body.supplier_ids ?? [])].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || supplierIds.length === 0 || supplierIds.length > 20) {
    return json({ error: "Välj minst en giltig leverantör." }, 400, origin);
  }

  try {
    const projects = await rows(`/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&org_id=eq.${encodeURIComponent(String(profile.org_id))}&select=*`);
    const project = projects[0];
    if (!project) return json({ error: "Projektet hittades inte." }, 404, origin);
    const locations = await rows(`/rest/v1/locations?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=order_index.asc`);
    const cargo = await rows(`/rest/v1/cargo_items?project_id=eq.${encodeURIComponent(projectId)}&select=*`);
    const suppliers = await rows(`/rest/v1/suppliers?id=in.(${supplierIds.map(encodeURIComponent).join(",")})&org_id=eq.${encodeURIComponent(String(profile.org_id))}&select=*`);
    if (suppliers.length !== supplierIds.length) return json({ error: "En eller flera leverantörer hittades inte." }, 404, origin);

    const deleteLinks = await api(`/rest/v1/project_suppliers?project_id=eq.${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!deleteLinks.ok) throw new Error("Could not clear supplier assignments");
    const supplierLinks = supplierIds.map((supplierId, index) => ({ project_id: projectId, supplier_id: supplierId, is_primary: index === 0 }));
    const linkResponse = await api("/rest/v1/project_suppliers", { method: "POST", body: JSON.stringify(supplierLinks) });
    if (!linkResponse.ok) throw new Error("Could not update supplier assignments");
    const projectUpdate = await api(`/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}`, {
      method: "PATCH", body: JSON.stringify({ supplier_id: supplierIds[0], updated_at: new Date().toISOString() }),
    });
    if (!projectUpdate.ok) throw new Error("Could not update primary supplier");

    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      requireTLS: SMTP_PORT !== 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const dispatches: DbRow[] = [];
    for (const supplierId of supplierIds) {
      const supplier = suppliers.find((item) => item.id === supplierId)!;
      const addresses = addressList(supplier.email);
      const content = emailContent(project, locations, cargo, supplier);
      let status = "sent";
      let externalMessageId: string | null = null;
      let errorMessage: string | null = null;
      try {
        if (addresses.length === 0 || addresses.some((address) => !validEmail(address))) throw new Error("Leverantören saknar en giltig e-postadress.");
        const result = await transport.sendMail({
          from: { name: FROM_NAME, address: FROM_EMAIL },
          replyTo: REPLY_TO_EMAIL,
          to: addresses,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        externalMessageId = result.messageId ?? null;
      } catch (error) {
        status = "failed";
        errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Okänt e-postfel";
        console.error("Supplier booking email failed", supplierId, errorMessage);
      }
      const dispatchResponse = await api("/rest/v1/supplier_booking_dispatches", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          org_id: profile.org_id, project_id: projectId, supplier_id: supplierId,
          recipient_email: addresses.join(", ") || String(supplier.email ?? ""),
          recipient_name: supplier.contact_person || supplier.company_name,
          sent_by: profile.id, sent_by_name: profile.full_name, subject: content.subject,
          status, external_message_id: externalMessageId, error_message: errorMessage,
        }),
      });
      if (!dispatchResponse.ok) throw new Error("Could not save booking history");
      dispatches.push(...await dispatchResponse.json());
    }
    const successful = dispatches.filter((dispatch) => dispatch.status === "sent").length;
    return json({
      ok: successful === dispatches.length,
      dispatches,
      message: successful === dispatches.length
        ? `Bokningen skickades till ${successful} leverantör${successful === 1 ? "" : "er"}.`
        : `Bokningen skickades till ${successful} av ${dispatches.length} leverantörer. Kontrollera felen nedan.`,
    }, 200, origin);
  } catch (error) {
    console.error("Supplier booking dispatch failed", error);
    return json({ error: "Bokningen kunde inte skickas eller loggas." }, 500, origin);
  }
});
