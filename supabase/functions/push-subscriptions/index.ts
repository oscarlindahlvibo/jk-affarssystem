import { publicKey, pushConfigured, pushApi, sendUserPush, validPushEndpoint } from "../_shared/webPush.ts";

const APP_URL = "https://projekt.jkprojekt.se";
const origins = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin",
  };
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (origin && !origins.has(origin)) return json({ error: "Origin not allowed" }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Logga in för att aktivera notiser." }, 401);
  try {
    const userResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: authorization },
    });
    if (!userResponse.ok) return json({ error: "Logga in igen." }, 401);
    const user = await userResponse.json();
    const profiles = await (await pushApi(`profiles?id=eq.${encodeURIComponent(user.id)}&status=eq.aktiv&select=id,org_id`)).json();
    const profile = profiles[0];
    if (!profile) return json({ error: "Notiser är tillgängliga för aktiv personal." }, 403);
    const body = await request.json();
    if (body.action === "public-key") return json({ publicKey, configured: pushConfigured });
    const endpoint = body.subscription?.endpoint ?? body.endpoint;
    if (!validPushEndpoint(endpoint)) return json({ error: "Ogiltig pushadress." }, 400);
    const ownFilter = `user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encodeURIComponent(endpoint)}`;
    if (body.action === "unsubscribe") {
      await pushApi(`push_subscriptions?${ownFilter}`, { method: "DELETE" });
      return json({ ok: true });
    }
    if (body.action === "status") {
      const rows = await (await pushApi(`push_subscriptions?${ownFilter}&select=id`)).json();
      return json({ enabled: rows.length > 0 });
    }
    if (!pushConfigured) return json({ error: "Pushnotiser är inte konfigurerade på servern." }, 503);
    if (body.action === "subscribe") {
      const keys = body.subscription.keys;
      if (!keys || !/^[A-Za-z0-9_-]{87}={0,1}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)) return json({ error: "Ogiltiga pushnycklar." }, 400);
      await pushApi("push_subscriptions?on_conflict=endpoint", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: user.id, org_id: profile.org_id, endpoint, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true });
    }
    if (body.action === "test") {
      const result = await sendUserPush(user.id, profile.org_id, { title: "JK Projektlogistik", body: "Pushnotiser fungerar på den här enheten.", url: "/mina-uppgifter", tag: "jk-push-test" }, endpoint);
      return json({ ok: result.sent > 0, ...result });
    }
    return json({ error: "Ogiltig åtgärd." }, 400);
  } catch {
    return json({ error: "Pushinställningen kunde inte sparas. Försök igen." }, 500);
  }
});
