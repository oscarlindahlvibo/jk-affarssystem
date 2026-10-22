// Driftmeddelanden (planerade uppdateringar och serverunderhåll) från Vibogruppen/VI-HEM.
//
// Webbläsaren frågar här efter aktiva meddelanden för att visa en banner. Funktionen kräver en giltig inloggning och hämtar
// sedan server-till-server från VI-HEM (action "notices") med JK:s kundnyckel, så nyckeln lämnar aldrig servern.
// Banners är bara information: går VI-HEM inte att nå svarar funktionen med en tom lista (eller senast kända) så att
// systemet aldrig påverkas av att meddelandetjänsten ligger nere.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VIHEM_AI_URL = Deno.env.get("VIHEM_AI_URL") ?? "";
const VIHEM_AI_CLIENT_KEY = Deno.env.get("VIHEM_AI_CLIENT_KEY") ?? "";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const CACHE_MS = 60_000;
const STALE_MS = 30 * 60_000;

let cache: { at: number; notices: unknown[] } | null = null;

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

async function loadNotices(): Promise<unknown[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.notices;
  try {
    const upstream = await fetch(VIHEM_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vihem-Ai-Key": VIHEM_AI_CLIENT_KEY },
      body: JSON.stringify({ action: "notices" }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !Array.isArray(payload?.notices)) throw new Error(`VI-HEM svarade ${upstream.status}`);
    cache = { at: Date.now(), notices: payload.notices.slice(0, 20) };
    return cache.notices;
  } catch (error) {
    console.error("Driftmeddelanden kunde inte hämtas", error instanceof Error ? error.message : error);
    // Hellre senast kända än inget alls; ett pågående underhållsmeddelande ska inte försvinna för att tjänsten hickar.
    return cache && Date.now() - cache.at < STALE_MS ? cache.notices : [];
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401, origin);
  if (!SUPABASE_URL || !ANON_KEY) return json({ notices: [] }, 200, origin);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
  if (!userResponse.ok) return json({ error: "Invalid session" }, 401, origin);

  if (!VIHEM_AI_URL || !VIHEM_AI_CLIENT_KEY) return json({ notices: [], server_time: new Date().toISOString() }, 200, origin);
  return json({ notices: await loadNotices(), server_time: new Date().toISOString() }, 200, origin);
});
