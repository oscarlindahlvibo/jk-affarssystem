// AI-tolkning av orderblad som saknar textlager (skannade/utskrivna PDF:er).
//
// Webbläsaren skickar sidbilder hit. Funktionen kontrollerar att användaren är en aktiv admin/projektledare och vidarebefordrar
// sedan server-till-server till VI-HEM:s funktion vihem-ai-interpret-document med JK:s kundnyckel. VI-HEM kör OCR/AI, räknar
// tolkningen (5 kr per sida exkl. moms, bara lyckade) och bygger månadsunderlaget. Nyckeln lämnar aldrig servern och sidbilderna
// sparas inte här. Ingen annan funktion i JK-systemet anropar AI-tjänsten.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VIHEM_AI_URL = Deno.env.get("VIHEM_AI_URL") ?? "";
const VIHEM_AI_CLIENT_KEY = Deno.env.get("VIHEM_AI_CLIENT_KEY") ?? "";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const IMPORT_ROLES = new Set(["admin", "projektledare"]);
const MAX_PAGES = 10;
const MAX_BODY_BYTES = 12_000_000;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return Response.json(body, { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !VIHEM_AI_URL || !VIHEM_AI_CLIENT_KEY) {
    return json({ error: "AI-tolkning är inte konfigurerad på servern." }, 503, origin);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
  if (!userResponse.ok) return json({ error: "Invalid session" }, 401, origin);
  const user = await userResponse.json();
  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&status=eq.aktiv&select=id,full_name,email,role`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  const profile = profileResponse.ok ? (await profileResponse.json())[0] : null;
  if (!profile || !IMPORT_ROLES.has(String(profile.role))) return json({ error: "Du saknar behörighet att AI-tolka dokument." }, 403, origin);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Dokumentet är för stort." }, 413, origin);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request body" }, 400, origin);
  }

  let upstreamBody: Record<string, unknown>;
  if (body.action === "quote") {
    upstreamBody = { action: "quote" };
  } else {
    if (!Array.isArray(body.pages) || body.pages.length === 0 || body.pages.length > MAX_PAGES) {
      return json({ error: `Dokumentet måste ha 1–${MAX_PAGES} sidor.` }, 400, origin);
    }
    upstreamBody = {
      action: "interpret",
      request_id: body.request_id,
      file_name: body.file_name,
      file_sha256: body.file_sha256,
      pages: body.pages,
      // Vem som begärde tolkningen syns i underlaget som kunden får.
      user_ref: `${profile.full_name} (${profile.email})`,
      source: "jk-affarssystem",
    };
  }

  try {
    const upstream = await fetch(VIHEM_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vihem-Ai-Key": VIHEM_AI_CLIENT_KEY },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(110000),
    });
    const payload = await upstream.json().catch(() => ({ error: "Ogiltigt svar från AI-tjänsten." }));
    return json(payload, upstream.status, origin);
  } catch (error) {
    console.error("AI-tjänsten kunde inte nås", error instanceof Error ? error.message : error);
    return json({ error: "AI-tjänsten kunde inte nås just nu. Fyll i uppgifterna manuellt eller försök igen senare." }, 502, origin);
  }
});
