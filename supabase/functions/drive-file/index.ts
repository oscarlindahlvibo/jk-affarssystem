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

const isManager = (identity: Identity) => identity.type === "internal" && ["admin", "projektledare"].includes(identity.role ?? "");
const isAdminIdentity = (identity: Identity) => identity.type === "internal" && identity.role === "admin";

async function projectFor(identity: Identity, projectId: string, write: boolean, customerMayWrite = false) {
  if (write && !isManager(identity) && !(customerMayWrite && identity.type === "customer")) return null;
  const response = await supabaseApi(
    `/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&org_id=eq.${encodeURIComponent(identity.org_id)}&select=id,project_number,name,customer_id,booking_approval_status`
  );
  const rows = response.ok ? await response.json() : [];
  const project = Array.isArray(rows) ? rows[0] : null;
  if (!project) return null;
  if (identity.type === "customer") {
    if (project.customer_id !== identity.customer_id) return null;
    if (write && ["Väntar på godkännande", "Avvisad"].includes(project.booking_approval_status)) return null;
  }
  return project;
}

// Bibliotekets filer kan läsas av all personal i bolaget, aldrig av kunder.
async function libraryFileFor(identity: Identity, fileId: string) {
  if (identity.type !== "internal") return null;
  const response = await supabaseApi(
    `/rest/v1/folder_files?drive_file_id=eq.${encodeURIComponent(fileId)}&org_id=eq.${encodeURIComponent(identity.org_id)}&select=id,file_name,folder_id`
  );
  const rows = response.ok ? await response.json() : [];
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function documentFor(identity: Identity, fileId: string, write: boolean) {
  if (write && !isManager(identity)) return null;
  const response = await supabaseApi(
    `/rest/v1/documents?drive_file_id=eq.${encodeURIComponent(fileId)}&select=id,project_id,file_name,visibility`
  );
  const rows = response.ok ? await response.json() : [];
  const document = Array.isArray(rows) ? rows[0] : null;
  if (!document) return write ? null : await libraryFileFor(identity, fileId);
  const project = await projectFor(identity, document.project_id, write);
  if (!project) return null;
  if (identity.type === "customer" && document.visibility !== "customer") return null;
  return document;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const PROJECTS_FOLDER_NAME = "Projekt";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function findFolder(appProperty: string, value: string) {
  const query = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='${appProperty}' and value='${escapeDriveQuery(value)}' }`
  );
  const list = await driveFetch(
    `/drive/v3/files?q=${query}&corpora=drive&driveId=${encodeURIComponent(SHARED_DRIVE_ID)}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id,name,parents)&pageSize=1`
  );
  if (!list.ok) throw new Error(`Could not search Google Drive (${list.status})`);
  return ((await list.json()).files?.[0] ?? null) as { id: string; name: string; parents?: string[] } | null;
}

async function createFolder(name: string, parentId: string, appProperties: Record<string, string>) {
  const created = await driveFetch("/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.slice(0, 180), mimeType: FOLDER_MIME, parents: [parentId], appProperties }),
  });
  if (!created.ok) throw new Error(`Could not create folder (${created.status})`);
  return (await created.json()).id as string;
}

let projectsRootCache: string | null = null;

async function projectsRootFolder() {
  if (projectsRootCache) return projectsRootCache;
  const found = await findFolder("jkRoot", "projects");
  projectsRootCache = found?.id ?? await createFolder(PROJECTS_FOLDER_NAME, SHARED_DRIVE_ID, { jkRoot: "projects" });
  return projectsRootCache;
}

// Projektets mapp heter projektnumret och ligger i mappen "Projekt". Äldre mappar (projektnummer + namn i rotmappen)
// flyttas och döps om första gången de används.
async function ensureProjectFolder(project: { id: string; project_number: string; name: string }, createIfMissing = true) {
  const root = await projectsRootFolder();
  const existing = await findFolder("jkProjectId", project.id);
  if (existing) {
    if (!existing.parents?.includes(root) || existing.name !== project.project_number) {
      const moved = await driveFetch(
        `/drive/v3/files/${existing.id}?supportsAllDrives=true&fields=id&addParents=${root}&removeParents=${encodeURIComponent((existing.parents ?? []).join(","))}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: project.project_number }) }
      );
      if (!moved.ok) throw new Error(`Could not move project folder (${moved.status})`);
    }
    return existing.id;
  }
  if (!createIfMissing) return null;
  return await createFolder(project.project_number, root, { jkProjectId: project.id });
}

async function uploadToDrive(file: File, folderId: string, appProperties: Record<string, string>) {
  const metadata = { name: file.name, parents: [folderId], appProperties };
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
  if (!uploaded.ok || !payload?.id) return null;
  return payload as { id: string; webViewLink: string };
}

async function trashDriveItem(id: string) {
  const response = await driveFetch(`/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,trashed`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  return response.ok || response.status === 404;
}

async function dbRows(path: string) {
  const response = await supabaseApi(`/rest/v1/${path}`);
  return response.ok ? await response.json() as Record<string, unknown>[] : [];
}

async function folderFor(identity: Identity, folderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(folderId)) return null;
  return (await dbRows(`document_folders?id=eq.${folderId}&org_id=eq.${encodeURIComponent(identity.org_id)}&select=id,name,parent_id,drive_folder_id`))[0] ?? null;
}

// Mappåtgärder i dokumentbiblioteket (bara admin): skapa, döp om, ta bort och samla projektmappar.
async function libraryAction(identity: Identity, body: Record<string, unknown>, origin: string | null) {
  if (!isAdminIdentity(identity)) return json({ error: "Bara administratörer kan hantera mappar." }, 403, origin);
  const action = String(body.action ?? "");
  const name = typeof body.name === "string" ? body.name.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim() : "";

  if (action === "create_folder") {
    if (!name || name.length > 120) return json({ error: "Mappen behöver ett namn (högst 120 tecken)." }, 400, origin);
    let parent = null as Record<string, unknown> | null;
    if (body.parent_id) {
      parent = await folderFor(identity, String(body.parent_id));
      if (!parent) return json({ error: "Överliggande mapp hittades inte." }, 404, origin);
    }
    if (!parent && name.toLowerCase() === PROJECTS_FOLDER_NAME.toLowerCase()) return json({ error: "Namnet Projekt är reserverat för projektmapparna." }, 409, origin);
    const driveId = await createFolder(name, parent ? String(parent.drive_folder_id) : SHARED_DRIVE_ID, { jkLibrary: "1" });
    const insert = await supabaseApi("/rest/v1/document_folders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ org_id: identity.org_id, parent_id: parent?.id ?? null, name, drive_folder_id: driveId, created_by: identity.id }),
    });
    if (!insert.ok) {
      await trashDriveItem(driveId);
      return json({ error: insert.status === 409 ? "Det finns redan en mapp med det namnet." : "Mappen kunde inte sparas." }, insert.status === 409 ? 409 : 500, origin);
    }
    return json((await insert.json())[0], 201, origin);
  }

  const folder = await folderFor(identity, String(body.id ?? ""));
  if (action === "rename_folder") {
    if (!folder || !name || name.length > 120) return json({ error: "Ogiltigt mappnamn." }, 400, origin);
    const patched = await supabaseApi(`/rest/v1/document_folders?id=eq.${folder.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!patched.ok) return json({ error: patched.status === 409 ? "Det finns redan en mapp med det namnet." : "Mappen kunde inte döpas om." }, patched.status === 409 ? 409 : 500, origin);
    await driveFetch(`/drive/v3/files/${encodeURIComponent(String(folder.drive_folder_id))}?supportsAllDrives=true&fields=id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    return json({ ok: true }, 200, origin);
  }
  if (action === "delete_folder") {
    if (!folder) return json({ error: "Mappen hittades inte." }, 404, origin);
    if (!await trashDriveItem(String(folder.drive_folder_id))) return json({ error: "Mappen kunde inte flyttas till Google Drives papperskorg." }, 502, origin);
    await supabaseApi(`/rest/v1/document_folders?id=eq.${folder.id}`, { method: "DELETE" });
    return json({ ok: true }, 200, origin);
  }
  if (action === "organize_projects") {
    const ids = [...new Set((await dbRows(`documents?select=project_id&drive_file_id=not.is.null&limit=2000`)).map((row) => String(row.project_id)))];
    let moved = 0;
    await projectsRootFolder();
    for (let i = 0; i < ids.length; i += 6) {
      const results = await Promise.all(ids.slice(i, i + 6).map(async (id) => {
        const project = await projectFor(identity, id, true);
        return Boolean(project && await ensureProjectFolder(project, false));
      }));
      moved += results.filter(Boolean).length;
    }
    return json({ ok: true, projects: moved }, 200, origin);
  }
  return json({ error: "Okänd åtgärd." }, 400, origin);
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

    if (request.method === "POST" && (request.headers.get("content-type") ?? "").includes("application/json")) {
      return await libraryAction(identity, await request.json().catch(() => ({})), origin);
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const file = form.get("file");
      const projectId = String(form.get("project_id") ?? "");
      const libraryFolderId = String(form.get("folder_id") ?? "");
      if (!(file instanceof File) || (!projectId && !libraryFolderId)) return json({ error: "File and project are required" }, 400, origin);

      if (libraryFolderId) {
        if (!isAdminIdentity(identity)) return json({ error: "Bara administratörer kan ladda upp till mappar." }, 403, origin);
        const folder = await folderFor(identity, libraryFolderId);
        if (!folder) return json({ error: "Mappen hittades inte." }, 404, origin);
        const uploaded = await uploadToDrive(file, String(folder.drive_folder_id), { jkLibraryFolderId: String(folder.id) });
        if (!uploaded) return json({ error: "Filen kunde inte sparas i Google Drive." }, 502, origin);
        const insert = await supabaseApi("/rest/v1/folder_files", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            org_id: identity.org_id, folder_id: folder.id, file_name: file.name, file_type: file.name.split(".").pop() ?? "fil",
            file_size: file.size, drive_file_id: uploaded.id, uploaded_by: identity.id,
            uploaded_by_name: String(form.get("uploaded_by_name") ?? "").slice(0, 120) || null,
          }),
        });
        if (!insert.ok) {
          await trashDriveItem(uploaded.id);
          return json({ error: "Filen kunde inte registreras." }, 500, origin);
        }
        return json((await insert.json())[0], 201, origin);
      }

      const project = await projectFor(identity, projectId, true, true);
      if (!project) return json({ error: "Project not found or access denied" }, 404, origin);
      const folderId = await ensureProjectFolder(project) as string;
      const uploaded = await uploadToDrive(file, folderId, { jkProjectId: projectId });
      if (!uploaded) return json({ error: "Filen kunde inte sparas i Google Drive." }, 502, origin);
      return json({ id: uploaded.id, webViewLink: uploaded.webViewLink }, 201, origin);
    }

    if (request.method === "DELETE" && fileId) {
      const libraryFile = await libraryFileFor(identity, fileId);
      if (libraryFile) {
        if (!isAdminIdentity(identity)) return json({ error: "Bara administratörer kan ta bort filer." }, 403, origin);
        if (!await trashDriveItem(fileId)) return json({ error: "Filen kunde inte flyttas till Google Drives papperskorg." }, 502, origin);
        await supabaseApi(`/rest/v1/folder_files?id=eq.${libraryFile.id}`, { method: "DELETE" });
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      const document = await documentFor(identity, fileId, true);
      if (!document) return json({ error: "Document not found or access denied" }, 404, origin);
      if (!await trashDriveItem(fileId)) return json({ error: "Filen kunde inte flyttas till Google Drives papperskorg." }, 502, origin);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    return json({ error: "Method not allowed" }, 405, origin);
  } catch (error) {
    console.error("Google Drive function failed", error);
    return json({ error: "Google Drive-anropet misslyckades." }, 500, origin);
  }
});
