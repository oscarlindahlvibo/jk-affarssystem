import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

export const isCentralDriveEnabled = import.meta.env.VITE_CENTRAL_DRIVE_ENABLED === "true";

async function driveRequest(path: string, init: RequestInit = {}) {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) throw new Error("Dokumentlagringen är inte konfigurerad.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Du behöver logga in igen.");
  const response = await fetch(`${supabaseUrl}/functions/v1/drive-file${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null);
    throw new Error(payload?.error ?? `Google Drive-fel (${response.status}).`);
  }
  return response;
}

export async function uploadCentralDriveFile(file: File, projectId: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("project_id", projectId);
  const response = await driveRequest("", { method: "POST", body: form });
  return response.json() as Promise<{ id: string; webViewLink: string }>;
}

export async function getCentralDriveFileUrl(fileId: string) {
  const response = await driveRequest(`?file_id=${encodeURIComponent(fileId)}`);
  return URL.createObjectURL(await response.blob());
}

export async function openCentralDriveFile(fileId: string) {
  window.open(`/dokument/oppna/${encodeURIComponent(fileId)}`, "_blank", "noopener,noreferrer");
}

export async function deleteCentralDriveFile(fileId: string) {
  await driveRequest(`?file_id=${encodeURIComponent(fileId)}`, { method: "DELETE" });
}
