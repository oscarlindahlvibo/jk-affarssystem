import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import type { Project, WorkReport } from "../../types";
import { WORK_TYPES } from "../../types";
import { useAuth } from "../../lib/auth";
import { useWorkReports } from "../../data/workReports";
import { formatDecimal, kmToMil } from "../../lib/billing";
import { isInvoiced } from "../../lib/workReportEngine";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Panel } from "../ui/Panel";
import { WorkReportModal } from "./WorkReportModal";

export function WorkReportsPanel({ project }: { project: Project }) {
  const { currentProfile } = useAuth();
  const { reports, billings, canManage, canSeeFinance, deleteReport, error } = useWorkReports();
  const [editing, setEditing] = useState<WorkReport | "new" | null>(null);
  const [deleting, setDeleting] = useState<WorkReport | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const projectReports = reports.filter((r) => r.project_id === project.id).sort((a, b) => (a.report_date < b.report_date ? 1 : -1));
  const totals = projectReports.reduce(
    (sum, r) => ({ hours: sum.hours + (r.hours ?? 0), km: sum.km + (r.distance_km ?? 0), waiting: sum.waiting + (r.waiting_hours ?? 0) }),
    { hours: 0, km: 0, waiting: 0 }
  );
  const typeLabel = (key: string) => WORK_TYPES.find((t) => t.key === key)?.label ?? key;
  const canEdit = (r: WorkReport) => !isInvoiced(billings, r.id) && (canManage || r.created_by === currentProfile?.id);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await deleteReport(deleting.id);
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Rapporten kunde inte tas bort.");
    }
  }

  return (
    <Panel
      title="Rapporterat arbete"
      action={
        <Button type="button" variant="secondary" className="!px-2.5 !py-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} /> Rapportera arbete
        </Button>
      }
    >
      {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {projectReports.length === 0 ? (
        <p className="text-sm text-slate-500">Inget arbete rapporterat ännu. Chaufförer och transportörer kan rapportera i efterhand utan att stämpla.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {projectReports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-medium text-slate-800">{r.report_date}</span>
                    <span className="text-slate-600">{r.performer_name}</span>
                    <span className="status-pill bg-slate-100 text-slate-600">{r.performer_type === "carrier" ? "Extern" : "Anställd"}</span>
                    <span className="status-pill bg-cyan-100 text-cyan-700">{typeLabel(r.work_type)}</span>
                    {!r.billable && <span className="status-pill bg-amber-100 text-amber-700">Ej debiterbar</span>}
                    {isInvoiced(billings, r.id) && <span className="status-pill bg-green-100 text-green-700"><Lock size={11} className="mr-0.5 inline" />Fakturerad</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {[
                      r.hours ? `${formatDecimal(r.hours)} h` : null,
                      r.distance_km ? `${formatDecimal(kmToMil(r.distance_km))} mil (${formatDecimal(r.distance_km, 1)} km)` : null,
                      r.waiting_hours ? `väntetid ${formatDecimal(r.waiting_hours)} h` : null,
                    ].filter(Boolean).join(" · ")}
                    {canSeeFinance && r.internal_cost != null && <span className="text-slate-400"> · intern kostnad {formatDecimal(r.internal_cost, 0)} kr</span>}
                  </div>
                  {r.comment && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{r.comment}</p>}
                </div>
                {canEdit(r) && (
                  <div className="flex shrink-0">
                    <Button type="button" variant="ghost" className="!p-2" aria-label="Ändra rapport" onClick={() => setEditing(r)}><Pencil size={14} /></Button>
                    <Button type="button" variant="ghost" className="!p-2 text-red-600" aria-label="Ta bort rapport" onClick={() => { setDeleteError(null); setDeleting(r); }}><Trash2 size={14} /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-slate-600">
            <span>Totalt rapporterat: <strong className="text-slate-800">{formatDecimal(totals.hours)} h</strong></span>
            <span><strong className="text-slate-800">{formatDecimal(kmToMil(totals.km))} mil</strong></span>
            <span>väntetid <strong className="text-slate-800">{formatDecimal(totals.waiting)} h</strong></span>
          </div>
        </>
      )}

      {editing && <WorkReportModal key={editing === "new" ? "new" : editing.id} project={project} report={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Ta bort rapport">
        <p className="text-sm text-slate-700">Vill du ta bort rapporten från {deleting?.report_date}? Borttagningen sparas i ändringsloggen.</p>
        {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Avbryt</Button>
          <Button onClick={() => void confirmDelete()}><Trash2 size={15} /> Ta bort</Button>
        </div>
      </Modal>
    </Panel>
  );
}
