import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Building2, User, AlertTriangle, Printer, Pencil } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { STATUS_STYLES } from "../lib/status";
import { formatDate, formatDateTime } from "../lib/format";
import { INVOICE_STATUSES, PROJECT_STATUSES } from "../types";
import { DocumentsSection } from "../components/projects/DocumentsSection";
import { NotesSection } from "../components/projects/NotesSection";
import { TasksSection } from "../components/projects/TasksSection";
import { MeasurementPanel } from "../components/projects/MeasurementPanel";
import { ProjectFormModal } from "../components/projects/NewProjectModal";
import { TransportRuleList } from "../components/projects/TransportRuleList";
import { getMissingFields } from "../lib/validation";
import { evaluateTransportRules, RULE_SOURCE_NOTE } from "../lib/transportRules";
import { usePermissions } from "../lib/usePermissions";

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="break-words text-sm font-medium text-slate-800">{value ?? "–"}</div>
    </div>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { getProject, updateProjectStatus, updateProjectFinance } = useStore();
  const project = id ? getProject(id) : undefined;
  const permissions = usePermissions();
  const canEditProject = permissions.can("projects", "edit");
  const [editOpen, setEditOpen] = useState(false);

  if (!project) {
    return (
      <div className="py-20 text-center text-slate-500">
        Projektet hittades inte.
        <div className="mt-3">
          <Link to="/projekt" className="text-orange-600 hover:text-orange-700">Tillbaka till projektlistan</Link>
        </div>
      </div>
    );
  }

  const loading = project.locations?.find((l) => l.type === "lastning");
  const unloading = project.locations?.find((l) => l.type === "lossning");
  const waypoints = project.locations?.filter((l) => l.type === "mellanpunkt") ?? [];
  const cargo = project.cargo_items?.[0];
  const missing = getMissingFields(project);
  const transportRules = evaluateTransportRules({
    length_m: cargo?.length_m ?? null,
    width_m: cargo?.width_m ?? null,
    height_m: cargo?.height_m ?? null,
    weight_ton: cargo?.weight_ton ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projekt" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600">
          <ArrowLeft size={14} /> Tillbaka till projekt
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{project.project_number}</div>
            <h2 className="text-xl font-semibold text-slate-800">{project.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Building2 size={14} /> {project.customer?.company_name}</span>
              {project.contact_person && <span className="flex items-center gap-1"><User size={14} /> {project.contact_person.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projekt/${project.id}/skriv-ut`}>
              <Button variant="secondary">
                <Printer size={14} /> Skriv ut / PDF
              </Button>
            </Link>
            {canEditProject && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Redigera
              </Button>
            )}
            {canEditProject ? (
              <select
                value={project.status}
                onChange={(e) => updateProjectStatus(project.id, e.target.value as typeof project.status)}
                className={`status-pill cursor-pointer border-0 py-2 pl-3 pr-8 text-sm ${STATUS_STYLES[project.status]}`}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <StatusBadge status={project.status} />
            )}
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Projektet saknar {missing.length} uppgift{missing.length > 1 ? "er" : ""}: </span>
              {missing.map((m) => m.label).join(", ")}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Grundinformation">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InfoItem label="Projektnummer" value={project.project_number} />
              <InfoItem label="Kund" value={project.customer?.company_name} />
              <InfoItem label="Kontaktperson" value={project.contact_person?.name} />
              <InfoItem label="Ansvarig hos JK" value={project.responsible?.full_name} />
              <InfoItem label="Status" value={<StatusBadge status={project.status} />} />
              <InfoItem label="Skapad" value={formatDate(project.created_at)} />
              <InfoItem label="Senast uppdaterad" value={formatDateTime(project.updated_at)} />
            </div>
          </Panel>

          <Panel title="Transportinformation">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InfoItem
                label="Lastningsplats"
                value={
                  loading ? (
                    <span className="flex items-center gap-1"><MapPin size={13} />{loading.name}</span>
                  ) : undefined
                }
              />
              <InfoItem
                label="Lossningsplats"
                value={
                  unloading ? (
                    <span className="flex items-center gap-1"><MapPin size={13} />{unloading.name}</span>
                  ) : undefined
                }
              />
              {(loading?.contact_name || loading?.contact_phone) && (
                <InfoItem label="Kontakt vid lastning" value={[loading?.contact_name, loading?.contact_phone].filter(Boolean).join(" · ")} />
              )}
              {(unloading?.contact_name || unloading?.contact_phone) && (
                <InfoItem label="Kontakt vid lossning" value={[unloading?.contact_name, unloading?.contact_phone].filter(Boolean).join(" · ")} />
              )}
              <InfoItem label="Planerat lastningsdatum" value={formatDate(project.planned_loading_date)} />
              <InfoItem label="Planerat leveransdatum" value={formatDate(project.planned_delivery_date)} />
              <InfoItem label="Transporttyp" value={project.transport_type} />
              {waypoints.length > 0 && (
                <InfoItem label="Mellanpunkter" value={waypoints.map((w) => w.name).join(", ")} />
              )}
              <InfoItem label="Transportör" value={project.supplier?.company_name} />
              <InfoItem label="Fordon" value={project.vehicle} />
              <InfoItem label="Chaufför" value={project.driver_name} />
              <InfoItem label="Kundens ordernummer" value={project.customer_reference} />
              <InfoItem label="Källdokument (LTC-/bokningsnr)" value={project.source_document_ref} />
              <InfoItem label="Transportörens ordernummer" value={project.carrier_order_number} />
              <InfoItem label="Leveransvillkor" value={project.delivery_terms} />
            </div>
            {project.special_requirements && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Särskilda krav: </span>
                {project.special_requirements}
              </p>
            )}
          </Panel>

          <Panel title="Gods">
            {cargo ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <InfoItem label="Beskrivning" value={cargo.description} />
                <InfoItem label="Längd" value={cargo.length_m ? `${cargo.length_m} m` : undefined} />
                <InfoItem label="Bredd" value={cargo.width_m ? `${cargo.width_m} m` : undefined} />
                <InfoItem label="Höjd" value={cargo.height_m ? `${cargo.height_m} m` : undefined} />
                <InfoItem label="Vikt" value={cargo.weight_ton ? `${cargo.weight_ton} ton` : undefined} />
                <InfoItem label="Antal kollin" value={cargo.quantity} />
                <InfoItem label="Lyftpunkter" value={cargo.lift_points} />
                <InfoItem label="Ritningsreferens" value={cargo.drawing_reference} />
                {cargo.technical_info && (
                  <div className="col-span-full">
                    <div className="text-xs text-slate-500">Övrig teknisk information</div>
                    <div className="text-sm text-slate-700">{cargo.technical_info}</div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Ingen godsinformation registrerad ännu.</p>
            )}

            {transportRules.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Automatiskt bedömda krav utifrån måtten
                </h4>
                <TransportRuleList rules={transportRules} />
                <p className="mt-2 text-[11px] text-slate-400">{RULE_SOURCE_NOTE}</p>
              </div>
            )}
          </Panel>

          <DocumentsSection projectId={project.id} documents={project.documents ?? []} />
          <NotesSection projectId={project.id} notes={project.notes ?? []} />
        </div>

        <div className="space-y-6">
          <Panel title="Ekonomi">
            <div className="grid grid-cols-2 gap-4">
              <InfoItem label="Pris / offert" value={project.price !== null ? `${project.price.toLocaleString("sv-SE")} kr` : undefined} />
              <InfoItem label="Kostnad" value={project.cost !== null ? `${project.cost.toLocaleString("sv-SE")} kr` : undefined} />
              {project.price !== null && project.cost !== null && (
                <InfoItem label="Vinst" value={`${(project.price - project.cost).toLocaleString("sv-SE")} kr`} />
              )}
              <div>
                <div className="text-xs text-slate-500">Faktureringsstatus</div>
                {permissions.canEditProjectFinance ? (
                  <select
                    value={project.invoice_status}
                    onChange={(e) => updateProjectFinance(project.id, { invoice_status: e.target.value as typeof project.invoice_status })}
                    className="mt-0.5 rounded-lg border border-border bg-white px-2 py-1 text-sm"
                  >
                    {INVOICE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm font-medium text-slate-800">{project.invoice_status}</div>
                )}
              </div>
            </div>
          </Panel>
          <TasksSection projectId={project.id} tasks={project.tasks ?? []} />
          <MeasurementPanel link={project.measurement_link} />
        </div>
      </div>

      {canEditProject && (
        <ProjectFormModal key={project.id} open={editOpen} onClose={() => setEditOpen(false)} project={project} />
      )}
    </div>
  );
}
