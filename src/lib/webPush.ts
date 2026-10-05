import { supabase } from "./supabase";

export function supportsWebPush() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function needsHomeScreenInstall() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches
    && !(navigator as Navigator & { standalone?: boolean }).standalone;
}

async function callPush(body: object) {
  if (!supabase) throw new Error("Pushnotiser kräver inloggning i det skarpa systemet.");
  const { data, error } = await supabase.functions.invoke("push-subscriptions", { body });
  if (error || data?.error) throw new Error(data?.error ?? "Kunde inte ansluta till notistjänsten. Försök igen.");
  return data;
}

export async function currentPushSubscription() {
  if (!supportsWebPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

export async function pushEnabled() {
  const subscription = await currentPushSubscription();
  if (!subscription || Notification.permission !== "granted") return false;
  return Boolean((await callPush({ action: "status", endpoint: subscription.endpoint })).enabled);
}

export async function enableWebPush() {
  if (!supportsWebPush()) throw new Error("Den här webbläsaren stöder inte pushnotiser.");
  // Safari requires this call to happen directly in the user's click handler.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notiser tilläts inte. Ändra behörigheten i enhetens inställningar för att aktivera dem.");
  const { publicKey, configured } = await callPush({ action: "public-key" });
  if (!configured) throw new Error("Pushnotiser är inte konfigurerade på servern.");
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const rawKey = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(rawKey, (character) => character.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && subscription.options.applicationServerKey &&
      Array.from(new Uint8Array(subscription.options.applicationServerKey)).join() !== Array.from(key).join()) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await callPush({ action: "subscribe", subscription: subscription.toJSON() });
}

export async function disableWebPush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try { await callPush({ action: "unsubscribe", endpoint: subscription.endpoint }); }
  finally { await subscription.unsubscribe(); }
}

export async function testWebPush() {
  const subscription = await currentPushSubscription();
  if (!subscription) throw new Error("Aktivera notiser först.");
  const result = await callPush({ action: "test", endpoint: subscription.endpoint });
  if (!result.ok) throw new Error("Testnotisen kunde inte skickas. Aktivera notiser på nytt och försök igen.");
}
