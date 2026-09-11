import { Database, CheckCircle2, XCircle, HardDrive, Loader2 } from "lucide-react";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { isSupabaseConfigured } from "../lib/supabase";
import { useGoogleDrive } from "../lib/googleDriveContext";
import { profiles } from "../data/mockData";
import { PROJECT_STATUSES } from "../types";

export function SettingsPage() {
  const drive = useGoogleDrive();

  return (
    <div className="space-y-6">
      <Panel title="Anslutningar">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isSupabaseConfigured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            <Database size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800">Supabase (kunder, projekt, statusar)</div>
            <div className="text-xs text-slate-500">
              {isSupabaseConfigured
                ? "Ansluten – appen läser och skriver mot Supabase."
                : "Ej ansluten – appen körs mot mockdata. Lägg till VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i .env för att aktivera."}
            </div>
          </div>
          {isSupabaseConfigured ? (
            <CheckCircle2 size={18} className="text-green-600" />
          ) : (
            <XCircle size={18} className="text-amber-600" />
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          SQL-schema för databasen finns i <code className="rounded bg-slate-100 px-1.5 py-0.5">supabase/migrations/</code>,
          redo att köras direkt i ett Supabase-projekt.
        </p>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${drive.isConnected ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            <HardDrive size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800">Google Drive (dokumentfiler)</div>
            <div className="text-xs text-slate-500">
              {!drive.isConfigured
                ? "Ej konfigurerad – lägg till VITE_GOOGLE_CLIENT_ID i .env. Se README för steg-för-steg-guide."
                : drive.isConnected
                ? "Ansluten – uppladdade dokument sparas i mappen \"JK Projektlogistik - Dokument\" i din Google Drive."
                : "Konfigurerad men inte ansluten. Klicka Anslut för att logga in med Google."}
            </div>
            {drive.error && <div className="mt-1 text-xs text-red-600">{drive.error}</div>}
          </div>
          {drive.isConfigured && (
            drive.isConnected ? (
              <Button variant="secondary" onClick={drive.disconnect}>Koppla bort</Button>
            ) : (
              <Button onClick={drive.connect} disabled={drive.isConnecting}>
                {drive.isConnecting ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                Anslut till Google Drive
              </Button>
            )
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Appen begär endast åtkomst till filer den själv skapar (scope <code className="rounded bg-slate-100 px-1 py-0.5">drive.file</code>) –
          den kan inte se övriga filer i din Google Drive.
        </p>
      </Panel>

      <Panel title="Användare / roller">
        <div className="space-y-3 md:hidden">
          {profiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="font-medium text-slate-800">{p.full_name}</div>
              <div className="mt-0.5 break-all text-xs text-slate-500">{p.email}</div>
              <span className="status-pill mt-2 bg-navy-900/5 text-navy-900">{p.role}</span>
            </div>
          ))}
        </div>
        <table className="hidden w-full text-left text-sm md:table">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Namn</th>
              <th className="py-2 font-medium">E-post</th>
              <th className="py-2 font-medium">Roll</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5 font-medium text-slate-800">{p.full_name}</td>
                <td className="py-2.5 text-slate-600">{p.email}</td>
                <td className="py-2.5">
                  <span className="status-pill bg-navy-900/5 text-navy-900">{p.role}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Statusflöde för projekt">
        <div className="flex flex-wrap gap-2">
          {PROJECT_STATUSES.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="status-pill bg-slate-100 text-slate-600">{i + 1}. {s}</span>
              {i < PROJECT_STATUSES.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
