// Gemensam e-postsändning för edge-funktionerna. Två vägar:
//   graph: Microsoft Graph (appen skickar som en delad brevlåda, t.ex. bokning@jkprojekt.se; skickade mejl hamnar i brevlådans Skickat-mapp)
//   smtp:  vanlig SMTP (t.ex. Brevo eller ett Microsoft 365-relä)
// MAIL_TRANSPORT väljer väg (standard: smtp, så inget ändras förrän man själv byter). Misslyckas Graph med ett tydligt fel och SMTP
// är konfigurerat används SMTP som reserv. Filen har inga beroenden på npm-paket så att den går att testa; SMTP-sändaren injiceras (se mail.ts).

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  // Visningsnamn och adress som används vid SMTP. Med Graph är avsändaren alltid den delade brevlådan (GRAPH_SENDER).
  fromName: string;
  fromAddress: string;
}

export interface MailResult {
  transport: "graph" | "smtp";
  messageId: string | null;
}

export type MailEnv = { get(name: string): string | undefined };
export type SmtpSender = (message: MailMessage, env: MailEnv) => Promise<{ messageId: string | null }>;

export class MailError extends Error {
  readonly definite: boolean;
  constructor(message: string, definite: boolean) {
    super(message);
    this.definite = definite;
  }
}

export function configuredTransports(env: MailEnv): { graph: boolean; smtp: boolean; preferred: "graph" | "smtp" } {
  const graph = Boolean(env.get("GRAPH_TENANT_ID") && env.get("GRAPH_CLIENT_ID") && env.get("GRAPH_CLIENT_SECRET") && env.get("GRAPH_SENDER"));
  const smtp = Boolean(env.get("SMTP_HOST") && env.get("SMTP_USER") && env.get("SMTP_PASS"));
  return { graph, smtp, preferred: env.get("MAIL_TRANSPORT") === "graph" ? "graph" : "smtp" };
}

export function mailAvailable(env: MailEnv): boolean {
  const t = configuredTransports(env);
  return t.preferred === "graph" ? t.graph || t.smtp : t.smtp || t.graph;
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function graphToken(env: MailEnv, doFetch: typeof fetch): Promise<string> {
  const tenant = env.get("GRAPH_TENANT_ID")!;
  const clientId = env.get("GRAPH_CLIENT_ID")!;
  const key = `${tenant}:${clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await doFetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: env.get("GRAPH_CLIENT_SECRET")!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    // Bara felkoden loggas, aldrig hemligheter eller token.
    throw new MailError(`Microsoft-inloggningen misslyckades (${response.status}${payload.error ? `, ${String(payload.error).slice(0, 60)}` : ""}).`, true);
  }
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in ?? 3000) * 1000, key };
  return cachedToken.value;
}

export function graphPayload(message: MailMessage) {
  return {
    message: {
      subject: message.subject,
      body: { contentType: "HTML", content: message.html },
      toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
      ...(message.replyTo ? { replyTo: [{ emailAddress: { address: message.replyTo } }] } : {}),
    },
    saveToSentItems: true,
  };
}

async function sendWithGraph(message: MailMessage, env: MailEnv, doFetch: typeof fetch): Promise<MailResult> {
  const token = await graphToken(env, doFetch);
  const sender = env.get("GRAPH_SENDER")!;
  const response = await doFetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(graphPayload(message)),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 202) {
    const payload = await response.json().catch(() => ({}));
    const code = String(payload?.error?.code ?? "").slice(0, 80);
    if (response.status === 401) cachedToken = null;
    throw new MailError(`Microsoft Graph avvisade utskicket (${response.status}${code ? `, ${code}` : ""}).`, true);
  }
  return { transport: "graph", messageId: null };
}

export async function sendMail(
  message: MailMessage,
  env: MailEnv,
  smtp: SmtpSender,
  doFetch: typeof fetch = fetch,
): Promise<MailResult> {
  const t = configuredTransports(env);
  const viaSmtp = async (): Promise<MailResult> => ({ transport: "smtp", messageId: (await smtp(message, env)).messageId });
  if (t.preferred === "graph" && t.graph) {
    try {
      return await sendWithGraph(message, env, doFetch);
    } catch (error) {
      // Reserv bara när Microsoft tydligt avvisat utskicket. Vid osäkra fel (timeout) skickas inget dubbelt.
      if (t.smtp && error instanceof MailError && error.definite) {
        console.error("Graph misslyckades, använder SMTP som reserv:", error.message);
        return await viaSmtp();
      }
      throw error;
    }
  }
  if (t.smtp) return await viaSmtp();
  if (t.graph) return await sendWithGraph(message, env, doFetch);
  throw new MailError("Ingen e-posttjänst är konfigurerad.", true);
}
