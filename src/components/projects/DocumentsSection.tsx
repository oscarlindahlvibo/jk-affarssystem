import { useRef, useState } from "react";
import { Upload, FileText, Lock, Eye, Trash2, ExternalLink, HardDrive, Loader2, FileSignature } from "lucide-react";
import type { Project, ProjectDocument, DocumentCategory } from "../../types";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { formatDateTime } from "../../lib/format";
import { useStore } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { usePermissions } from "../../lib/usePermissions";
import { useGoogleDrive } from "../../lib/googleDriveContext";
import { uploadFileToDrive, deleteFileFromDrive } from "../../lib/googleDrive";
import { generateShippingDocument, shippingDocumentFileName, type ShippingDocumentKind } from "../../lib/shippingDocuments";

const CATEGORIES: DocumentCategory[] = ["Ritning", "Tillstånd", "Offert", "Order", "Fraktsedel", "Foto", "Övrigt"];

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsSection({ project, documents }: { project: Project; documents: ProjectDocument[] }) {
  const projectId = project.id;
  const { addDocument, deleteDocument } = useStore();
  const { currentProfile } = useAuth();
  const permissions = usePermissions();
  const canUpload = permissions.can("documents", "create");
  const canDelete = permissions.can("documents", "delete");
  const drive = useGoogleDrive();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentCategory>("Övrigt");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState<ShippingDocumentKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function addFileDocument(file: File, documentCategory: DocumentCategory, comment: string | null = null) {
    if (drive.isConnected) {
      const token = await drive.getAccessToken();
      const folderId = await drive.getFolderId(token);
      const uploaded = await uploadFileToDrive(token, file, folderId);
      addDocument(projectId, {
        file_name: file.name,
        file_type: file.name.split(".").pop() ?? "fil",
        category: documentCategory,
        storage_path: `drive:${uploaded.id}`,
        file_url: uploaded.webViewLink,
        file_size: file.size,
        drive_file_id: uploaded.id,
        uploaded_at: new Date().toISOString(),
        uploaded_by: currentProfile?.full_name ?? "Okänd",
        visibility: "internal",
        comment,
      });
      return;
    }

    addDocument(projectId, {
      file_name: file.name,
      file_type: file.name.split(".").pop() ?? "fil",
      category: documentCategory,
      storage_path: `${projectId}/${file.name}`,
      file_url: URL.createObjectURL(file),
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
      uploaded_by: currentProfile?.full_name ?? "Okänd",
      visibility: "internal",
      comment,
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await addFileDocument(file, category);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Uppladdningen misslyckades.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleGenerate(kind: ShippingDocumentKind) {
    setUploadError(null);
    setGenerating(kind);
    try {
      const blob = await generateShippingDocument(project, kind);
      const file = new File([blob], shippingDocumentFileName(project, kind), { type: "application/pdf" });
      await addFileDocument(file, "Fraktsedel", kind === "cmr" ? "Genererad CMR för utrikestransport." : "Genererad fraktsedel för inrikestransport.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Dokumentet kunde inte skapas.");
    } finally {
      setGenerating(null);
    }
  }

  async function handleDelete(doc: ProjectDocument) {
    if (doc.drive_file_id && drive.isConnected) {
      try {
        const token = await drive.getAccessToken();
        await deleteFileFromDrive(token, doc.drive_file_id);
      } catch {
        // Filen kan redan vara borttagen i Drive – ta bort referensen ändå.
      }
    }
    deleteDocument(projectId, doc.id);
  }

  return (
    <Panel
      title="Dokument"
      action={
        canUpload && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => handleGenerate("cmr")}
              disabled={Boolean(generating) || uploading}
              className="!px-2.5 !py-1.5"
            >
              {generating === "cmr" ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
              CMR
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleGenerate("domestic-waybill")}
              disabled={Boolean(generating) || uploading}
              className="!px-2.5 !py-1.5"
            >
              {generating === "domestic-waybill" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Fraktsedel
            </Button>
            <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="!px-2.5 !py-1.5">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Ladda upp
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </div>
        )
      }
    >
      {drive.isConnected ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          <HardDrive size={13} /> Uppladdade dokument sparas i Google Drive.
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Google Drive är inte anslutet – dokument sparas endast i webbläsarens minne under sessionen. Anslut i
          Inställningar för permanent lagring.
        </p>
      )}
      {uploadError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</p>}
      <ul className="divide-y divide-border">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileText size={16} className="shrink-0 text-slate-400" />
              <div className="min-w-0">
                {d.file_url ? (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-sm font-medium text-slate-800 hover:text-orange-600"
                  >
                    {d.file_name} <ExternalLink size={11} className="shrink-0" />
                  </a>
                ) : (
                  <div className="truncate text-sm font-medium text-slate-800">{d.file_name}</div>
                )}
                <div className="text-xs text-slate-500">
                  {d.category} · {d.uploaded_by} · {formatDateTime(d.uploaded_at)}
                  {d.file_size ? ` · ${formatSize(d.file_size)}` : ""}
                  {d.drive_file_id ? " · Google Drive" : ""}
                  {d.comment && ` · ${d.comment}`}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                {d.visibility === "internal" ? <Lock size={12} /> : <Eye size={12} />}
                {d.visibility === "internal" ? "Internt" : "Kundsynligt"}
              </span>
              {canDelete && (
                <button onClick={() => handleDelete(d)} title="Radera dokument" className="text-slate-300 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
        {documents.length === 0 && <p className="py-2 text-sm text-slate-500">Inga dokument uppladdade ännu.</p>}
      </ul>
    </Panel>
  );
}
