// Google Drive-integration för dokumentlagring. Använder Google Identity Services (GIS)
// för OAuth i webbläsaren och anropar Drive REST API v3 direkt via fetch – ingen tung
// SDK krävs. Scope är drive.file: appen kan bara se/ändra filer den själv har skapat.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const isGoogleDriveConfigured = Boolean(GOOGLE_CLIENT_ID);

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const APP_FOLDER_NAME = "JK Projektlogistik - Dokument";
const FOLDER_ID_STORAGE_KEY = "jk-drive-folder-id";
const WAS_CONNECTED_KEY = "jk-drive-was-connected";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Kunde inte ladda Google Identity Services."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export function wasDriveConnected(): boolean {
  return localStorage.getItem(WAS_CONNECTED_KEY) === "1";
}

function rememberConnected() {
  localStorage.setItem(WAS_CONNECTED_KEY, "1");
}

export function forgetConnected() {
  localStorage.removeItem(WAS_CONNECTED_KEY);
  localStorage.removeItem(FOLDER_ID_STORAGE_KEY);
}

// interactive=true öppnar Googles inloggnings-/samtyckesruta. interactive=false försöker
// hämta en token tyst (fungerar bara om användaren redan gett samtycke i webbläsarsessionen).
export async function requestAccessToken(interactive: boolean): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID saknas.");
  await loadGisScript();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Ingen åtkomst beviljades."));
          return;
        }
        rememberConnected();
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Drive-fel (${res.status}): ${body}`);
  }
  return res;
}

export async function ensureAppFolder(accessToken: string): Promise<string> {
  const cached = localStorage.getItem(FOLDER_ID_STORAGE_KEY);
  if (cached) return cached;

  const query = encodeURIComponent(
    `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    accessToken
  );
  const searchData = (await searchRes.json()) as { files: { id: string }[] };
  if (searchData.files.length > 0) {
    localStorage.setItem(FOLDER_ID_STORAGE_KEY, searchData.files[0].id);
    return searchData.files[0].id;
  }

  const createRes = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const created = (await createRes.json()) as { id: string };
  localStorage.setItem(FOLDER_ID_STORAGE_KEY, created.id);
  return created.id;
}

export interface DriveUploadResult {
  id: string;
  webViewLink: string;
}

export async function uploadFileToDrive(accessToken: string, file: File, folderId: string): Promise<DriveUploadResult> {
  // Drive API:s uploadType=multipart förväntar sig multipart/related med en explicit
  // boundary – webbläsarens FormData (multipart/form-data) fungerar inte här, så
  // body:n byggs manuellt som en Blob med två delar (metadata + filinnehåll).
  const metadata = { name: file.name, parents: [folderId] };
  const boundary = `jk_${Math.random().toString(36).slice(2)}`;
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeaderPart = `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
  const closingPart = `\r\n--${boundary}--`;
  const body = new Blob([metadataPart, fileHeaderPart, file, closingPart]);

  const res = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    accessToken,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
  );
  return (await res.json()) as DriveUploadResult;
}

export async function deleteFileFromDrive(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, accessToken, { method: "DELETE" });
}
