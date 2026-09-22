import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Building2, User, AlertTriangle, Printer, Pencil, Save, UserCheck, XCircle } from "lucide-react";
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
import { FreightCalculatorPanel } from "../components/projects/FreightCalculatorPanel";
import { getMissingFields } from "../lib/validation";
import { evaluateTransportRules, RULE_SOURCE_NOTE } from "../lib/transportRules";
import { usePermissions } from "../lib/usePermissions";
import { inputClass } from "../components/ui/Field";
import type { Project } from "../types";

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="break-words text-sm font-medium text-slate-800">{value ?? "–"}</div>
    </div>
  );
}

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function money(value: number | null) {
  return value !== null ? `${value.toLocaleString("sv-SE")} kr` : undefined;
}

function FinancePanel({
  project,
  canEdit,
  onSave,
}: {
  project: Project;
  canEdit: boolean;
  onSave: (patch: Pick<Project, "price" | "cost" | "invoice_status">) => void;
}) {
  const [price, setPrice] = useState(project.price?.toString() ?? "");
  const [cost, setCost] = useState(project.cost?.toString() ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState(project.invoice_status);

  const parsedPrice = numOrNull(price);
  const parsedCost = numOrNull(cost);
  const hasChanges =
    parsedPrice !== project.price ||
    parsedCost !== project.cost ||
    invoiceStatus !== project.invoice_status;

  if (!canEdit) {
    return (
      <Panel title="Ekonomi">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoItem label="Pris / offert" value={money(project.price)} />
          <InfoItem label="Kostnad" value={money(project.cost)} />
          {project.price !== null && project.cost !== null && <InfoItem label="Vinst" value={money(project.price - project.cost)} />}
          <InfoItem label="Faktureringsstatus" value={project.invoice_status} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Ekonomi">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Pris / offert</span>
          <input inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="kr" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Kostnad</span>
          <input inputMode="decimal" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="kr" />
        </label>
        <InfoItem label="Vinst" value={parsedPrice !== null && parsedCost !== null ? money(parsedPrice - parsedCost) : undefined} />
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Faktureringsstatus</span>
          <select className={inputClass} value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as typeof project.invoice_status)}>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={!hasChanges}
          onClick={() => onSave({ price: parsedPrice, cost: parsedCost, invoice_status: invoiceStatus })}
        >
          <Save size={14} /> Spara ekonomi
        </Button>
      </div>
    </Panel>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { getProject, updateProjectStatus, updateProjectFinance, profiles, approveCustomerBooking, rejectCustomerBooking } = useStore();
  const project = id ? getProject(id) : undefined;
  const permissions = usePermissions();
  const canEditProject = permissions.can("projects", "edit");
  const [editOpen, setEditOpen] = useState(false);
  const [approvalResponsibleId, setApprovalResponsibleId] = useState(project?.responsible_id ?? "");
  const [approvalStatus, setApprovalStatus] = useState<Project["status"]>("Planering");
  const [rejectReason, setRejectReason] = useState("");

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
  const cargoItems = project.cargo_items ?? [];
  const cargo = cargoItems[0];
  const missing = getMissingFields(project);
  const isPendingCustomerBooking = project.booking_approval_status === "Väntar på godkännande";
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

        {isPendingCustomerBooking && canEditProject && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle size={16} /> Kundbokning väntar på godkännande
                </div>
                <p className="mt-1 text-sm text-amber-700">
                  Tilldela ansvarig och godkänn bokningen för fortsatt planering, eller avvisa med en kort anledning.
                </p>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-[190px_170px_auto_auto]">
                <select
                  value={approvalResponsibleId}
                  onChange={(e) => setApprovalResponsibleId(e.target.value)}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">Ej tilldelad</option>
                  {profiles.filter((p) => p.status === "aktiv").map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
                <select
                  value={approvalStatus}
                  onChange={(e) => setApprovalStatus(e.target.value as Project["status"])}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="Planering">Planering</option>
                  <option value="Under kalkylering">Under kalkylering</option>
                  <option value="Order">Order</option>
                </select>
                <Button
                  type="button"
                  onClick={() => approveCustomerBooking(project.id, { responsible_id: approvalResponsibleId || null, status: approvalStatus })}
                >
                  <UserCheck size={14} /> Godkänn
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => rejectCustomerBooking(project.id, rejectReason)}
                >
                  <XCircle size={14} /> Avvisa
                </Button>
              </div>
            </div>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Anledning vid avvisning, visas i projektets noteringar"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Grundinformation">
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
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
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
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
              {loading?.address && <InfoItem label="Lastningsadress" value={loading.address} />}
              {unloading?.address && <InfoItem label="Lossningsadress" value={unloading.address} />}
              {project.route_distance_km && <InfoItem label="Beräknad sträcka" value={`${project.route_distance_km.toLocaleString("sv-SE")} km`} />}
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
            {cargoItems.length > 0 ? (
              <div className="space-y-4">
                {cargoItems.map((item, index) => (
                  <div key={item.id ?? index} className={index > 0 ? "border-t border-border pt-4" : ""}>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Godsrad {index + 1}</div>
                    <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-4">
                      <InfoItem label="Beskrivning" value={item.description} />
                      <InfoItem label="Längd" value={item.length_m ? `${item.length_m} m` : undefined} />
                      <InfoItem label="Bredd" value={item.width_m ? `${item.width_m} m` : undefined} />
                      <InfoItem label="Höjd" value={item.height_m ? `${item.height_m} m` : undefined} />
                      <InfoItem label="Vikt" value={item.weight_ton ? `${item.weight_ton} ton` : undefined} />
                      <InfoItem label="Antal kollin" value={item.quantity} />
                      <InfoItem label="Lyftpunkter" value={item.lift_points} />
                      <InfoItem label="Ritningsreferens" value={item.drawing_reference} />
                      {item.technical_info && (
                        <div className="col-span-full">
                          <div className="text-xs text-slate-500">Övrig teknisk information</div>
                          <div className="text-sm text-slate-700">{item.technical_info}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
          <FinancePanel
            key={`${project.id}-${project.updated_at}`}
            project={project}
            canEdit={permissions.canEditProjectFinance}
            onSave={(patch) => updateProjectFinance(project.id, patch)}
          />
          <FreightCalculatorPanel project={project} canApplyToFinance={permissions.canEditProjectFinance} />
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
