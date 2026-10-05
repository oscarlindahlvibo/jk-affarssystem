import webpush from "npm:web-push@3.6.7";

const keys = webpush.generateVAPIDKeys();
Deno.env.set("WEB_PUSH_PUBLIC_KEY", keys.publicKey);
Deno.env.set("WEB_PUSH_PRIVATE_KEY", keys.privateKey);
Deno.env.set("SUPABASE_URL", "https://database.test");
const { validPushEndpoint, sendUserPush } = await import("./webPush.ts");

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("push endpoints reject private hosts and lookalike service domains", () => {
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://localhost/x", "https://fcm.googleapis.com.attacker.test/x", "https://user:pass@web.push.apple.com/x", "https://web.push.apple.com:444/x"]) {
    assert(!validPushEndpoint(endpoint), `Accepted unsafe endpoint: ${endpoint}`);
  }
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/example", "https://web.push.apple.com/example", "https://updates.push.services.mozilla.com/wpush/v2/example"]) {
    assert(validPushEndpoint(endpoint), `Rejected push service: ${endpoint}`);
  }
});

Deno.test("push delivery is scoped to the assignee and removes expired subscriptions", async () => {
  const originalFetch = globalThis.fetch;
  const originalSend = webpush.sendNotification;
  const requests: { url: string; method: string }[] = [];
  let payload = "";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    return init?.method
      ? new Response(null, { status: 204 })
      : Response.json([
        { id: "active", endpoint: "https://fcm.googleapis.com/active", p256dh: "key", auth: "secret" },
        { id: "expired", endpoint: "https://web.push.apple.com/expired", p256dh: "key", auth: "secret" },
      ]);
  };
  webpush.sendNotification = async (subscription: { endpoint: string }, body: string) => {
    payload = String(body);
    if (subscription.endpoint.endsWith("expired")) throw Object.assign(new Error("Expired"), { statusCode: 410 });
    return { statusCode: 201, body: "", headers: {} };
  };
  try {
    const result = await sendUserPush("recipient", "organization", { title: "Assignment", body: "Task", url: "/projekt/test", tag: "test" });
    assert(result.sent === 1 && result.failed === 1, "Wrong delivery counts");
    assert(requests[0].url.includes("user_id=eq.recipient&org_id=eq.organization"), "Assignee or organization filter missing");
    assert(requests.some((request) => request.url.endsWith("id=eq.expired") && request.method === "DELETE"), "Expired subscription was not removed");
    assert(requests.some((request) => request.url.endsWith("id=eq.active") && request.method === "PATCH"), "Successful delivery was not recorded");
    assert(JSON.parse(payload).body === "Task", "Notification payload missing");
  } finally {
    globalThis.fetch = originalFetch;
    webpush.sendNotification = originalSend;
  }
});
