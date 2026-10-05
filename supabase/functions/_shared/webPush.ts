import webpush from "npm:web-push@3.6.7";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY") ?? "";
const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY") ?? "";
export const pushConfigured = Boolean(publicKey && privateKey);

export async function pushApi(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) throw new Error(`Push database request failed: ${response.status}`);
  return response;
}

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.port
      && (endpoint.hostname === "fcm.googleapis.com"
        || endpoint.hostname === "updates.push.services.mozilla.com"
        || endpoint.hostname.endsWith(".push.apple.com"));
  } catch { return false; }
}

export async function sendUserPush(
  userId: string, orgId: string,
  payload: { title: string; body: string; url: string; tag: string },
  endpoint?: string,
) {
  if (!pushConfigured) return { sent: 0, failed: 0, configured: false };
  const response = await pushApi(`push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&org_id=eq.${encodeURIComponent(orgId)}${endpoint ? `&endpoint=eq.${encodeURIComponent(endpoint)}` : ""}&select=id,endpoint,p256dh,auth`);
  const subscriptions = await response.json() as { id: string; endpoint: string; p256dh: string; auth: string }[];
  let sent = 0, failed = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      if (!validPushEndpoint(subscription.endpoint)) throw new Error("Invalid push endpoint");
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: "mailto:info@jkprojekt.se", publicKey, privateKey },
        TTL: 3600, urgency: "high", timeout: 10000,
      });
      sent++;
      await pushApi(`push_subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify({ last_sent_at: new Date().toISOString(), last_error: null }) });
    } catch (error) {
      failed++;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await pushApi(`push_subscriptions?id=eq.${subscription.id}`, { method: "DELETE" });
      } else {
        await pushApi(`push_subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify({ last_error: status ? `Push service HTTP ${status}` : "Push delivery failed" }) });
      }
    }
  }));
  return { sent, failed, configured: true };
}
