self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Show a notification even if the payload is invalid. */ }
  event.waitUntil(self.registration.showNotification(message.title || "JK Projektlogistik", {
    body: message.body || "Du har en ny tilldelad uppgift.",
    icon: "/app-icons/icon-192.png",
    tag: message.tag || "jk-assignment",
    data: { url: message.url || "/mina-uppgifter" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let destination = new URL("/mina-uppgifter", self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url || "/mina-uppgifter", self.location.origin);
    if (requested.origin === self.location.origin && /^\/(projekt\/[0-9a-f-]+|mina-uppgifter)\/?$/i.test(requested.pathname)) destination = requested;
  } catch { /* Keep the safe default destination. */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === destination.origin && "focus" in client) {
        await client.navigate(destination.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination.href);
  })());
});
