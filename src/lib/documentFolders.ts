import type { DocumentFolder } from "./centralDrive";

// Platsen i dokumentträdet lagras i adressen (?mapp=): tom = översta nivån, "projekt" = mappen Projekt,
// "p:<projekt-id>" = ett projekts mapp och annars id:t på en egen mapp.
export type FolderLocation =
  | { kind: "root" }
  | { kind: "projects" }
  | { kind: "project"; projectId: string }
  | { kind: "folder"; folderId: string };

export function parseLocation(value: string | null): FolderLocation {
  if (!value) return { kind: "root" };
  if (value === "projekt") return { kind: "projects" };
  if (value.startsWith("p:") && value.length > 2) return { kind: "project", projectId: value.slice(2) };
  return { kind: "folder", folderId: value };
}

export function locationParam(location: FolderLocation): string | null {
  switch (location.kind) {
    case "root": return null;
    case "projects": return "projekt";
    case "project": return `p:${location.projectId}`;
    case "folder": return location.folderId;
  }
}

export function childFolders(folders: DocumentFolder[], parentId: string | null) {
  return folders
    .filter((folder) => folder.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

// Mappkedjan från översta nivån ner till given mapp (tom om mappen inte finns eller ligger i en cykel).
export function folderChain(folders: DocumentFolder[], folderId: string): DocumentFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: DocumentFolder[] = [];
  let current = byId.get(folderId);
  while (current) {
    if (chain.some((folder) => folder.id === current!.id)) return [];
    chain.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return chain.length > 0 && chain[0].parent_id === null ? chain : [];
}

export function folderNameError(name: string, siblings: DocumentFolder[], parentId: string | null, ignoreId?: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) return "Skriv ett namn på mappen.";
  if (trimmed.length > 120) return "Mappnamnet får vara högst 120 tecken.";
  if (/[\\/]/.test(trimmed)) return "Mappnamnet får inte innehålla snedstreck.";
  if (parentId === null && trimmed.toLowerCase() === "projekt") return "Namnet Projekt är reserverat för projektmapparna.";
  const taken = siblings.some((folder) => folder.parent_id === parentId && folder.id !== ignoreId && folder.name.toLowerCase() === trimmed.toLowerCase());
  return taken ? "Det finns redan en mapp med det namnet här." : null;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
