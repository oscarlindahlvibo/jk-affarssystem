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

export interface DocumentFolder {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export interface FolderFile {
  id: string;
  folder_id: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  drive_file_id: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

async function folderAction(body: Record<string, unknown>) {
  const response = await driveRequest("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.json();
}

export async function createDocumentFolder(name: string, parentId: string | null) {
  return await folderAction({ action: "create_folder", name, parent_id: parentId }) as DocumentFolder;
}

export async function renameDocumentFolder(id: string, name: string) {
  await folderAction({ action: "rename_folder", id, name });
}

export async function deleteDocumentFolder(id: string) {
  await folderAction({ action: "delete_folder", id });
}

export async function uploadFolderFile(file: File, folderId: string, uploadedByName: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("folder_id", folderId);
  form.append("uploaded_by_name", uploadedByName);
  const response = await driveRequest("", { method: "POST", body: form });
  return response.json() as Promise<FolderFile>;
}

export async function loadDocumentLibrary() {
  if (!supabase) return { folders: [] as DocumentFolder[], files: [] as FolderFile[] };
  const [folders, files] = await Promise.all([
    supabase.from("document_folders").select("id, parent_id, name, created_at").order("name"),
    supabase.from("folder_files").select("id, folder_id, file_name, file_type, file_size, drive_file_id, uploaded_by_name, uploaded_at").order("file_name"),
  ]);
  if (folders.error || files.error) throw new Error("Dokumentmapparna kunde inte läsas in.");
  return { folders: folders.data as DocumentFolder[], files: files.data as FolderFile[] };
}
