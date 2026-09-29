import { importPKCS8, SignJWT } from "jsr:@panva/jose@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CREDENTIALS_BASE64 = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64") ?? "";
const SHARED_DRIVE_ID = Deno.env.get("GOOGLE_SHARED_DRIVE_ID") ?? "";
const APP_URL = "https://projekt.jkprojekt.se";
const ALLOWED_ORIGINS = new Set([APP_URL, "http://127.0.0.1:5173", "http://localhost:5173"]);
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

type Credentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type Identity = {
  id: string;
  type: "internal" | "customer";
  org_id: string;
  customer_id?: string;
  role?: string;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return Response.json(body, { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

async function supabaseApi(path: string, init: RequestInit = {}) {
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

async function authenticatedIdentity(request: Request): Promise<Identity | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authorization },
  });
  if (!authResponse.ok) return null;
  const user = await authResponse.json();

  const profileResponse = await supabaseApi(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&status=eq.aktiv&select=id,org_id,role`
  );
  const profiles = profileResponse.ok ? await profileResponse.json() : [];
  if (Array.isArray(profiles) && profiles[0]) {
    return { id: user.id, type: "internal", org_id: profiles[0].org_id, role: profiles[0].role };
  }

  const customerResponse = await supabaseApi(
    `/rest/v1/customer_users?id=eq.${encodeURIComponent(user.id)}&status=eq.aktiv&select=id,org_id,customer_id`
  );
  const customers = customerResponse.ok ? await customerResponse.json() : [];
  if (Array.isArray(customers) && customers[0]) {
    return {
      id: user.id,
      type: "customer",
      org_id: customers[0].org_id,
      customer_id: customers[0].customer_id,
    };
  }
  return null;
}

function credentials(): Credentials {
  if (!GOOGLE_CREDENTIALS_BASE64 || !SHARED_DRIVE_ID) throw new Error("Google Drive is not configured");
  const parsed = JSON.parse(atob(GOOGLE_CREDENTIALS_BASE64)) as Credentials;
  if (!parsed.client_email || !parsed.private_key) throw new Error("Invalid Google service account credentials");
  return parsed;
}

async function googleAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const account = credentials();
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("Could not authenticate with Google Drive");
  tokenCache = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const token = await googleAccessToken();
  return fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

async function projectFor(identity: Identity, projectId: string, write: boolean) {
  if (write && (identity.type !== "internal" || !["admin", "projektledare"].includes(identity.role ?? ""))) return null;
  const response = await supabaseApi(
    `/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&org_id=eq.${encodeURIComponent(identity.org_id)}&select=id,project_number,name,customer_id`
  );
  const rows = response.ok ? await response.json() : [];
  const project = Array.isArray(rows) ? rows[0] : null;
  if (!project) return null;
  if (identity.type === "customer" && project.customer_id !== identity.customer_id) return null;
  return project;
}

async function documentFor(identity: Identity, fileId: string, write: boolean) {
  if (write && (identity.type !== "internal" || !["admin", "projektledare"].includes(identity.role ?? ""))) return null;
  const response = await supabaseApi(
    `/rest/v1/documents?drive_file_id=eq.${encodeURIComponent(fileId)}&select=id,project_id,file_name,visibility`
  );
  const rows = response.ok ? await response.json() : [];
  const document = Array.isArray(rows) ? rows[0] : null;
  if (!document) return null;
  const project = await projectFor(identity, document.project_id, write);
  if (!project) return null;
  if (identity.type === "customer" && document.visibility !== "customer") return null;
  return document;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureProjectFolder(project: { id: string; project_number: string; name: string }) {
  const query = encodeURIComponent(
    `'${SHARED_DRIVE_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='jkProjectId' and value='${escapeDriveQuery(project.id)}' }`
  );
  const list = await driveFetch(
    `/drive/v3/files?q=${query}&corpora=drive&driveId=${encodeURIComponent(SHARED_DRIVE_ID)}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)&pageSize=1`
  );
  if (!list.ok) throw new Error(`Could not search Google Drive (${list.status})`);
  const listed = await list.json();
  if (listed.files?.[0]?.id) return listed.files[0].id as string;

  const name = `${project.project_number} - ${project.name}`.slice(0, 180);
  const created = await driveFetch("/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [SHARED_DRIVE_ID],
      appProperties: { jkProjectId: project.id },
    }),
  });
  if (!created.ok) throw new Error(`Could not create project folder (${created.status})`);
  return (await created.json()).id as string;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (!GOOGLE_CREDENTIALS_BASE64 || !SHARED_DRIVE_ID) return json({ error: "Google Drive är inte konfigurerat." }, 503, origin);

  const identity = await authenticatedIdentity(request);
  if (!identity) return json({ error: "Authentication required" }, 401, origin);

  try {
    const url = new URL(request.url);
    const fileId = url.searchParams.get("file_id");

    if (request.method === "GET" && fileId) {
      const document = await documentFor(identity, fileId, false);
      if (!document) return json({ error: "Document not found" }, 404, origin);
      const response = await driveFetch(
        `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
      );
      if (!response.ok || !response.body) return json({ error: "Filen kunde inte hämtas från Google Drive." }, 502, origin);
      const headers = new Headers(corsHeaders(origin));
      headers.set("Content-Type", response.headers.get("Content-Type") ?? "application/octet-stream");
      headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.file_name)}`);
      headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: 200, headers });
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const file = form.get("file");
      const projectId = String(form.get("project_id") ?? "");
      if (!(file instanceof File) || !projectId) return json({ error: "File and project are required" }, 400, origin);
      const project = await projectFor(identity, projectId, true);
      if (!project) return json({ error: "Project not found or access denied" }, 404, origin);
      const folderId = await ensureProjectFolder(project);
      const metadata = { name: file.name, parents: [folderId], appProperties: { jkProjectId: projectId } };
      const boundary = `jk_${crypto.randomUUID()}`;
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
        file,
        `\r\n--${boundary}--`,
      ]);
      const uploaded = await driveFetch(
        "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
      );
      const payload = await uploaded.json().catch(() => null);
      if (!uploaded.ok || !payload?.id) return json({ error: "Filen kunde inte sparas i Google Drive." }, 502, origin);
      return json({ id: payload.id, webViewLink: payload.webViewLink }, 201, origin);
    }

    if (request.method === "DELETE" && fileId) {
      const document = await documentFor(identity, fileId, true);
      if (!document) return json({ error: "Document not found or access denied" }, 404, origin);
      const deleted = await driveFetch(
        `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,trashed`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }),
        }
      );
      if (!deleted.ok && deleted.status !== 404) return json({ error: "Filen kunde inte flyttas till Google Drives papperskorg." }, 502, origin);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    return json({ error: "Method not allowed" }, 405, origin);
  } catch (error) {
    console.error("Google Drive function failed", error);
    return json({ error: "Google Drive-anropet misslyckades." }, 500, origin);
  }
});
