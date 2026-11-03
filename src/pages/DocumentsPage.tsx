import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, ExternalLink, FileText, Folder, FolderPlus, Eye, Loader2, Lock, Pencil, Search, Trash2, Upload } from "lucide-react";
import { useStore } from "../data/store";
import { useAuth } from "../lib/auth";
import { usePermissions } from "../lib/usePermissions";
import { formatDateTime } from "../lib/format";
import {
  createDocumentFolder, deleteCentralDriveFile, deleteDocumentFolder, isCentralDriveEnabled, loadDocumentLibrary,
  openCentralDriveFile, renameDocumentFolder, uploadFolderFile, type DocumentFolder, type FolderFile,
} from "../lib/centralDrive";
import { childFolders, folderChain, folderNameError, formatFileSize, locationParam, parseLocation, type FolderLocation } from "../lib/documentFolders";
import type { ProjectDocument } from "../types";

const ROW = "flex items-center gap-3 px-4 py-3";

export function DocumentsPage() {
  const { projects } = useStore();
  const { currentProfile } = useAuth();
  const { isAdmin } = usePermissions();
  const [params, setParams] = useSearchParams();
  const location = parseLocation(params.get("mapp"));
  const [library, setLibrary] = useState<{ folders: DocumentFolder[]; files: FolderFile[] }>({ folders: [], files: [] });
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setLibrary(await loadDocumentLibrary());
      setLibraryError(null);
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : "Dokumentmapparna kunde inte läsas in.");
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const go = (next: FolderLocation) => {
    setParams(locationParam(next) ? { mapp: locationParam(next)! } : {}, { replace: false });
    setNewFolderName(null);
    setRenaming(null);
    setError(null);
  };

  const projectsWithDocs = useMemo(() => projects
    .filter((project) => (project.documents ?? []).length > 0)
    .sort((a, b) => b.project_number.localeCompare(a.project_number, "sv", { numeric: true })), [projects]);

  const currentFolder = location.kind === "folder" ? library.folders.find((folder) => folder.id === location.folderId) ?? null : null;
  const chain = location.kind === "folder" ? folderChain(library.folders, location.folderId) : [];
  const currentProject = location.kind === "project" ? projects.find((project) => project.id === location.projectId) ?? null : null;
  const inLibrary = location.kind === "root" || location.kind === "folder";
  const parentId = location.kind === "folder" ? location.folderId : null;
  const subfolders = inLibrary ? childFolders(library.folders, parentId) : [];
  const files = location.kind === "folder" ? library.files.filter((file) => file.folder_id === location.folderId) : [];

  const query = search.trim().toLowerCase();
  const projectHits = query
    ? projects.flatMap((project) => (project.documents ?? []).filter((doc) => doc.file_name.toLowerCase().includes(query)).map((doc) => ({ doc, project })))
    : [];
  const fileHits = query ? library.files.filter((file) => file.file_name.toLowerCase().includes(query)) : [];
  const folderPath = (folderId: string) => folderChain(library.folders, folderId).map((folder) => folder.name).join(" / ");

  async function open(fileId: string) {
    setError(null);
    try { await openCentralDriveFile(fileId); } catch (reason) { setError(reason instanceof Error ? reason.message : "Filen kunde inte öppnas."); }
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try { await task(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Åtgärden misslyckades."); } finally { setBusy(null); }
  }

  async function handleCreateFolder() {
    const name = (newFolderName ?? "").replace(/\s+/g, " ").trim();
    const problem = folderNameError(name, library.folders, parentId);
    if (problem) { setError(problem); return; }
    await run("folder", async () => {
      await createDocumentFolder(name, parentId);
      setNewFolderName(null);
      await reload();
    });
  }

  async function handleRename(folder: DocumentFolder, value: string) {
    const name = value.replace(/\s+/g, " ").trim();
    if (name === folder.name) { setRenaming(null); return; }
    const problem = folderNameError(name, library.folders, folder.parent_id, folder.id);
    if (problem) { setError(problem); return; }
    await run("rename", async () => {
      await renameDocumentFolder(folder.id, name);
      setRenaming(null);
      await reload();
    });
  }

  async function handleDeleteFolder(folder: DocumentFolder) {
    if (!window.confirm(`Ta bort mappen "${folder.name}" med alla undermappar och filer? De flyttas till Google Drives papperskorg.`)) return;
    await run("delete", async () => {
      await deleteDocumentFolder(folder.id);
      if (location.kind === "folder" && location.folderId === folder.id) go(folder.parent_id ? { kind: "folder", folderId: folder.parent_id } : { kind: "root" });
      await reload();
    });
  }

  async function handleDeleteFile(file: FolderFile) {
    if (!window.confirm(`Ta bort "${file.file_name}"? Filen flyttas till Google Drives papperskorg.`)) return;
    await run(`file-${file.id}`, async () => {
      await deleteCentralDriveFile(file.drive_file_id);
      await reload();
    });
  }

  async function handleUpload(list: FileList | null) {
    if (!list || list.length === 0 || location.kind !== "folder") return;
    const folderId = location.folderId;
    await run("upload", async () => {
      try {
        for (const file of Array.from(list)) await uploadFolderFile(file, folderId, currentProfile?.full_name ?? "");
      } finally {
        if (fileInput.current) fileInput.current.value = "";
        await reload();
      }
    });
  }

  const crumb = "text-slate-500 hover:text-orange-600";
  const projectDocRow = (doc: ProjectDocument, projectLabel?: { id: string; number: string }) => (
    <li key={doc.id} className={ROW}>
      <FileText size={16} className="shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        {doc.drive_file_id && isCentralDriveEnabled ? (
          <button type="button" onClick={() => void open(doc.drive_file_id!)} className="flex max-w-full items-center gap-1.5 break-words text-left text-sm font-medium text-slate-800 hover:text-orange-600">
            <span className="truncate">{doc.file_name}</span><ExternalLink size={12} className="shrink-0" />
          </button>
        ) : <span className="break-words text-sm font-medium text-slate-800">{doc.file_name}</span>}
        <div className="mt-0.5 text-xs text-slate-500">
          {projectLabel && <><Link to={`/projekt/${projectLabel.id}`} className="hover:text-orange-600">{projectLabel.number}</Link> · </>}
          {doc.category} · {formatDateTime(doc.uploaded_at)} · {doc.uploaded_by}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500" title={doc.visibility === "internal" ? "Internt" : "Synligt för kunden"}>
        {doc.visibility === "internal" ? <Lock size={12} /> : <Eye size={12} />}
        <span className="hidden sm:inline">{doc.visibility === "internal" ? "Internt" : "Kundsynligt"}</span>
      </span>
    </li>
  );

  const libraryFileRow = (file: FolderFile, where?: string) => (
    <li key={file.id} className={ROW}>
      <FileText size={16} className="shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => void open(file.drive_file_id)} className="flex max-w-full items-center gap-1.5 break-words text-left text-sm font-medium text-slate-800 hover:text-orange-600">
          <span className="truncate">{file.file_name}</span><ExternalLink size={12} className="shrink-0" />
        </button>
        <div className="mt-0.5 text-xs text-slate-500">
          {where && <>{where} · </>}{[formatFileSize(file.file_size), formatDateTime(file.uploaded_at), file.uploaded_by_name].filter(Boolean).join(" · ")}
        </div>
      </div>
      {isAdmin && (
        <button type="button" onClick={() => void handleDeleteFile(file)} disabled={busy !== null} aria-label={`Ta bort ${file.file_name}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
          {busy === `file-${file.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      )}
    </li>
  );

  const folderRow = (folder: DocumentFolder) => (
    <li key={folder.id} className={ROW}>
      <Folder size={18} className="shrink-0 text-orange-500" />
      {renaming === folder.id ? (
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); void handleRename(folder, String(new FormData(event.currentTarget).get("name") ?? "")); }}>
          <input name="name" defaultValue={folder.name} autoFocus maxLength={120} aria-label="Mappnamn" className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-orange-400" />
          <button type="submit" disabled={busy !== null} className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Spara</button>
          <button type="button" onClick={() => setRenaming(null)} className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Avbryt</button>
        </form>
      ) : (
        <button type="button" onClick={() => go({ kind: "folder", folderId: folder.id })} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800 hover:text-orange-600">{folder.name}</button>
      )}
      {isAdmin && renaming !== folder.id && (
        <>
          <button type="button" onClick={() => setRenaming(folder.id)} aria-label={`Döp om ${folder.name}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button>
          <button type="button" onClick={() => void handleDeleteFolder(folder)} disabled={busy !== null} aria-label={`Ta bort ${folder.name}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 size={15} /></button>
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-0 sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök i alla dokument..." aria-label="Sök dokument"
            className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
        </div>
        {isAdmin && inLibrary && !query && isCentralDriveEnabled && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setNewFolderName("")} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FolderPlus size={15} /> Ny mapp</button>
            {location.kind === "folder" && (
              <>
                <button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                  {busy === "upload" ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Ladda upp filer
                </button>
                <input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => void handleUpload(event.target.files)} />
              </>
            )}
          </div>
        )}
      </div>

      {!query && (
        <nav aria-label="Mappsökväg" className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => go({ kind: "root" })} className={location.kind === "root" ? "font-semibold text-slate-800" : crumb}>Dokument</button>
          {(location.kind === "projects" || location.kind === "project") && (<><ChevronRight size={14} className="text-slate-400" /><button type="button" onClick={() => go({ kind: "projects" })} className={location.kind === "projects" ? "font-semibold text-slate-800" : crumb}>Projekt</button></>)}
          {currentProject && (<><ChevronRight size={14} className="text-slate-400" /><span className="font-semibold text-slate-800">{currentProject.project_number}</span></>)}
          {chain.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-slate-400" />
              <button type="button" onClick={() => go({ kind: "folder", folderId: folder.id })} className={index === chain.length - 1 ? "font-semibold text-slate-800" : crumb}>{folder.name}</button>
            </span>
          ))}
        </nav>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {libraryError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{libraryError}</p>}

      {newFolderName !== null && !query && (
        <form className="flex flex-wrap gap-2 rounded-xl border border-border bg-panel p-3" onSubmit={(event) => { event.preventDefault(); void handleCreateFolder(); }}>
          <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} autoFocus maxLength={120} placeholder="Mappnamn, t.ex. Lyftinstruktioner" aria-label="Namn på ny mapp"
            className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-orange-400" />
          <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy === "folder" && <Loader2 size={14} className="animate-spin" />} Skapa mapp</button>
          <button type="button" onClick={() => setNewFolderName(null)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Avbryt</button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
        <ul className="divide-y divide-border">
          {query ? (
            <>
              {projectHits.map(({ doc, project }) => projectDocRow(doc, { id: project.id, number: project.project_number }))}
              {fileHits.map((file) => libraryFileRow(file, folderPath(file.folder_id)))}
              {projectHits.length + fileHits.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">Inga dokument matchar.</li>}
            </>
          ) : (
            <>
              {location.kind === "root" && (
                <li className={ROW}>
                  <Folder size={18} className="shrink-0 text-slate-500" />
                  <button type="button" onClick={() => go({ kind: "projects" })} className="min-w-0 flex-1 text-left text-sm font-medium text-slate-800 hover:text-orange-600">
                    Projekt <span className="ml-1 text-xs font-normal text-slate-500">{projectsWithDocs.length} projekt med dokument</span>
                  </button>
                </li>
              )}
              {location.kind === "projects" && projectsWithDocs.map((project) => (
                <li key={project.id} className={ROW}>
                  <Folder size={18} className="shrink-0 text-orange-500" />
                  <button type="button" onClick={() => go({ kind: "project", projectId: project.id })} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800 hover:text-orange-600">
                    {project.project_number} <span className="font-normal text-slate-500">· {project.name}</span>
                  </button>
                  <span className="shrink-0 text-xs text-slate-500">{(project.documents ?? []).length} filer</span>
                </li>
              ))}
              {location.kind === "projects" && projectsWithDocs.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">Inga projekt har dokument ännu.</li>}
              {location.kind === "project" && currentProject && (
                <>
                  <li className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
                    <span>Allt som laddas upp eller skapas i projektet hamnar här.</span>
                    <Link to={`/projekt/${currentProject.id}`} className="font-medium text-orange-700 hover:underline">Öppna projektet</Link>
                  </li>
                  {[...(currentProject.documents ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).map((doc) => projectDocRow(doc))}
                  {(currentProject.documents ?? []).length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">Projektet har inga dokument.</li>}
                </>
              )}
              {location.kind === "project" && !currentProject && <li className="px-4 py-10 text-center text-sm text-slate-500">Projektet hittades inte.</li>}
              {inLibrary && subfolders.map(folderRow)}
              {inLibrary && files.map((file) => libraryFileRow(file))}
              {inLibrary && location.kind === "folder" && !currentFolder && <li className="px-4 py-10 text-center text-sm text-slate-500">Mappen hittades inte.</li>}
              {inLibrary && (location.kind === "root" ? subfolders.length === 0 : currentFolder && subfolders.length + files.length === 0) && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">
                  {location.kind === "root" ? (isAdmin ? "Skapa mappar med Ny mapp, till exempel Lyftinstruktioner." : "") : isAdmin ? "Mappen är tom. Ladda upp filer eller skapa en undermapp." : "Mappen är tom."}
                </li>
              )}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
