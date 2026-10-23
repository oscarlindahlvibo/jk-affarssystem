import { describe, expect, it, vi } from "vitest";
import { MailError, configuredTransports, graphPayload, mailAvailable, sendMail, type MailMessage, type SmtpSender } from "../../supabase/functions/_shared/mailer";

const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });
const GRAPH = { MAIL_TRANSPORT: "graph", GRAPH_TENANT_ID: "tenant", GRAPH_CLIENT_ID: "client", GRAPH_CLIENT_SECRET: "secret", GRAPH_SENDER: "bokning@jkprojekt.se" };
const SMTP = { SMTP_HOST: "smtp.test", SMTP_USER: "u", SMTP_PASS: "p" };
const message: MailMessage = { to: ["a@example.se"], subject: "Bokning", text: "t", html: "<p>h</p>", replyTo: "bokning@jkprojekt.se", fromName: "JK", fromAddress: "system@utskick.jkprojekt.se" };

const tokenResponse = () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
const smtpOk: SmtpSender = vi.fn(async () => ({ messageId: "<smtp-id>" }));

describe("mailer", () => {
  it("väljer väg och rapporterar vad som är konfigurerat", () => {
    expect(configuredTransports(env({ ...SMTP })).preferred).toBe("smtp");
    expect(configuredTransports(env({ ...GRAPH }))).toMatchObject({ graph: true, smtp: false, preferred: "graph" });
    expect(mailAvailable(env({}))).toBe(false);
    expect(mailAvailable(env({ ...GRAPH }))).toBe(true);
    expect(configuredTransports(env({ MAIL_TRANSPORT: "graph", GRAPH_TENANT_ID: "t" })).graph).toBe(false);
  });

  it("bygger Graph-anropet med mottagare, svarsadress och kopia i Skickat", () => {
    const payload = graphPayload(message);
    expect(payload.saveToSentItems).toBe(true);
    expect(payload.message.toRecipients).toEqual([{ emailAddress: { address: "a@example.se" } }]);
    expect(payload.message.replyTo).toEqual([{ emailAddress: { address: "bokning@jkprojekt.se" } }]);
    expect(payload.message.body).toEqual({ contentType: "HTML", content: "<p>h</p>" });
  });

  it("skickar via Graph som den delade brevlådan och hämtar token en gång", async () => {
    const calls: { url: string; body?: string }[] = [];
    const doFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
      return String(url).includes("login.microsoftonline.com") ? tokenResponse() : new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    const result = await sendMail(message, env({ ...GRAPH, GRAPH_TENANT_ID: "t1" }), smtpOk, doFetch);
    await sendMail(message, env({ ...GRAPH, GRAPH_TENANT_ID: "t1" }), smtpOk, doFetch);
    expect(result).toEqual({ transport: "graph", messageId: null });
    expect(calls.filter((c) => c.url.includes("login.microsoftonline.com"))).toHaveLength(1);
    expect(calls.some((c) => c.url === "https://graph.microsoft.com/v1.0/users/bokning%40jkprojekt.se/sendMail")).toBe(true);
    expect(smtpOk).not.toHaveBeenCalled();
  });

  it("använder SMTP som reserv när Microsoft tydligt avvisar, och inte annars", async () => {
    const reject = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("login.microsoftonline.com") ? tokenResponse() : new Response(JSON.stringify({ error: { code: "ErrorAccessDenied" } }), { status: 403 })) as unknown as typeof fetch;
    const result = await sendMail(message, env({ ...GRAPH, ...SMTP, GRAPH_TENANT_ID: "t2" }), smtpOk, reject);
    expect(result).toEqual({ transport: "smtp", messageId: "<smtp-id>" });
    await expect(sendMail(message, env({ ...GRAPH, GRAPH_TENANT_ID: "t3" }), smtpOk, reject)).rejects.toThrow(/403.*ErrorAccessDenied/);
  });

  it("skickar inte dubbelt vid osäkert fel (t.ex. timeout)", async () => {
    const smtp = vi.fn(async () => ({ messageId: "x" })) as unknown as SmtpSender;
    const timeout = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("login.microsoftonline.com")) return tokenResponse();
      throw new DOMException("timeout", "TimeoutError");
    }) as unknown as typeof fetch;
    await expect(sendMail(message, env({ ...GRAPH, ...SMTP, GRAPH_TENANT_ID: "t4" }), smtp, timeout)).rejects.toThrow();
    expect(smtp).not.toHaveBeenCalled();
  });

  it("använder SMTP som standard och felar tydligt utan konfiguration", async () => {
    expect((await sendMail(message, env({ ...SMTP }), smtpOk)).transport).toBe("smtp");
    await expect(sendMail(message, env({}), smtpOk)).rejects.toBeInstanceOf(MailError);
  });

  it("läcker inga hemligheter i felmeddelanden", async () => {
    const badToken = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "AADSTS7000215: secret value" }), { status: 401 })) as unknown as typeof fetch;
    await expect(sendMail(message, env({ ...GRAPH, GRAPH_TENANT_ID: "t5" }), smtpOk, badToken)).rejects.toThrow(/401, invalid_client/);
    await expect(sendMail(message, env({ ...GRAPH, GRAPH_TENANT_ID: "t5" }), smtpOk, badToken)).rejects.not.toThrow(/AADSTS|secret/);
  });
});
