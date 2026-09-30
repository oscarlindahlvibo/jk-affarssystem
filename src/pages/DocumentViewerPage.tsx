import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { getCentralDriveFileUrl } from "../lib/centralDrive";

export function DocumentViewerPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;

    let active = true;
    let objectUrl: string | null = null;
    getCentralDriveFileUrl(fileId)
      .then((url) => {
        objectUrl = url;
        if (active) setFileUrl(url);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Dokumentet kunde inte öppnas.");
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  const displayError = !fileId ? "Dokumentet saknar filreferens." : error;

  if (displayError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <FileText size={28} className="mx-auto text-red-400" />
          <h1 className="mt-3 text-lg font-semibold text-slate-800">Dokumentet kunde inte visas</h1>
          <p className="mt-2 text-sm text-red-600">{displayError}</p>
        </div>
      </main>
    );
  }

  if (!fileUrl) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <div className="flex items-center gap-2 text-sm"><Loader2 size={18} className="animate-spin" /> Hämtar dokument...</div>
      </main>
    );
  }

  return <iframe src={fileUrl} title="Dokumentvisning" className="block h-screen w-full border-0 bg-white" />;
}
