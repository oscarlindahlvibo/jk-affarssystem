import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Plus, Route, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Field, inputClass } from "../ui/Field";
import { Button } from "../ui/Button";
import { AddressAutocomplete } from "../ui/AddressAutocomplete";
import { useStore } from "../../data/store";
import { PROJECT_TEMPLATES, TEMPLATE_DESCRIPTIONS, TEMPLATE_TASKS } from "../../data/templates";
import { evaluateTransportRules, suggestedFollowVehicleTask, RULE_SOURCE_NOTE } from "../../lib/transportRules";
import { calculateRouteDistance } from "../../lib/routeDistance";
import { TransportRuleList } from "./TransportRuleList";
import { INVOICE_STATUSES, type CargoItem, type TransportType, type ProjectTemplateKey, type Project, type Location, type InvoiceStatus } from "../../types";

const TRANSPORT_TYPES: TransportType[] = [
  "Specialtransport",
  "Maskintransport",
  "Krantransport",
  "Styckegods",
  "Container",
  "Annat",
];

export function nextProjectNumber(existing: { project_number: string }[]): string {
  const year = new Date().getFullYear();
  const numbers = existing
    .map((p) => p.project_number.match(/JK-(\d{4})-(\d{4})/))
    .filter(Boolean)
    .map((m) => parseInt(m![2], 10));
  const next = (numbers.length ? Math.max(...numbers) : 100) + 1;
  return `JK-${year}-${String(next).padStart(4, "0")}`;
}

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

type CargoDraft = {
  id?: string;
  description: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  quantity: string;
  liftPoints: string;
  drawingReference: string;
  technicalInfo: string | null;
};

function blankCargoDraft(): CargoDraft {
  return {
    description: "",
    length: "",
    width: "",
    height: "",
    weight: "",
    quantity: "",
    liftPoints: "",
    drawingReference: "",
    technicalInfo: null,
  };
}

function cargoToDraft(cargo: CargoItem): CargoDraft {
  return {
    id: cargo.id,
    description: cargo.description ?? "",
    length: cargo.length_m?.toString() ?? "",
    width: cargo.width_m?.toString() ?? "",
    height: cargo.height_m?.toString() ?? "",
    weight: cargo.weight_ton?.toString() ?? "",
    quantity: cargo.quantity?.toString() ?? "",
    liftPoints: cargo.lift_points ?? "",
    drawingReference: cargo.drawing_reference ?? "",
    technicalInfo: cargo.technical_info ?? null,
  };
}

export function ProjectFormModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const { customers, contactPersons, suppliers, addProject, updateProject, addTask, addCustomer, addContactPerson, projects, profiles } = useStore();
  const navigate = useNavigate();
  const activeProfiles = profiles.filter((p) => p.status === "aktiv");
  const isEdit = Boolean(project);

  const existingLoading = project?.locations?.find((l) => l.type === "lastning");
  const existingUnloading = project?.locations?.find((l) => l.type === "lossning");
  const existingWaypoint = project?.locations?.find((l) => l.type === "mellanpunkt");

  const [name, setName] = useState(project?.name ?? "");
  const [customerId, setCustomerId] = useState(project?.customer_id ?? "");
  const [contactId, setContactId] = useState(project?.contact_person_id ?? "");
  const [responsibleId, setResponsibleId] = useState(project?.responsible_id ?? "");
  const [supplierId, setSupplierId] = useState(project?.supplier_id ?? "");
  const [transportType, setTransportType] = useState<TransportType>(project?.transport_type ?? "Specialtransport");
  const [template, setTemplate] = useState<ProjectTemplateKey | "">("");
  const [loadingDate, setLoadingDate] = useState(project?.planned_loading_date ?? "");
  const [deliveryDate, setDeliveryDate] = useState(project?.planned_delivery_date ?? "");
  const [loadingPlace, setLoadingPlace] = useState(existingLoading?.name ?? "");
  const [loadingAddress, setLoadingAddress] = useState(existingLoading?.address ?? "");
  const [loadingContactName, setLoadingContactName] = useState(existingLoading?.contact_name ?? "");
  const [loadingContactPhone, setLoadingContactPhone] = useState(existingLoading?.contact_phone ?? "");
  const [unloadingPlace, setUnloadingPlace] = useState(existingUnloading?.name ?? "");
  const [unloadingAddress, setUnloadingAddress] = useState(existingUnloading?.address ?? "");
  const [unloadingContactName, setUnloadingContactName] = useState(existingUnloading?.contact_name ?? "");
  const [unloadingContactPhone, setUnloadingContactPhone] = useState(existingUnloading?.contact_phone ?? "");
  const [waypoint, setWaypoint] = useState(existingWaypoint?.name ?? "");
  const [routeDistanceKm, setRouteDistanceKm] = useState(project?.route_distance_km?.toString() ?? "");
  const [distanceStatus, setDistanceStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [distanceMessage, setDistanceMessage] = useState<string | null>(null);
  const [specialRequirements, setSpecialRequirements] = useState(project?.special_requirements ?? "");
  const [deliveryTerms, setDeliveryTerms] = useState(project?.delivery_terms ?? "");
  const [vehicle, setVehicle] = useState(project?.vehicle ?? "");
  const [driverName, setDriverName] = useState(project?.driver_name ?? "");
  const [customerReference, setCustomerReference] = useState(project?.customer_reference ?? "");
  const [sourceDocumentRef, setSourceDocumentRef] = useState(project?.source_document_ref ?? "");
  const [carrierOrderNumber, setCarrierOrderNumber] = useState(project?.carrier_order_number ?? "");
  const [price, setPrice] = useState(project?.price?.toString() ?? "");
  const [cost, setCost] = useState(project?.cost?.toString() ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(project?.invoice_status ?? "Ej fakturerad");

  const [cargoRows, setCargoRows] = useState<CargoDraft[]>(
    project?.cargo_items?.length ? project.cargo_items.map(cargoToDraft) : [blankCargoDraft()]
  );

  const liveCargoDimensions = cargoRows.map((row) => ({
    length_m: numOrNull(row.length),
    width_m: numOrNull(row.width),
    height_m: numOrNull(row.height),
    weight_ton: numOrNull(row.weight),
  }));
  const liveRules = liveCargoDimensions.flatMap((dimensions) => evaluateTransportRules(dimensions));
  const liveTaskSuggestion = liveCargoDimensions.map(suggestedFollowVehicleTask).find(Boolean);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactMobile, setNewContactMobile] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");

  const contactsForCustomer = contactPersons.filter((c) => c.customer_id === customerId);

  function handleCreateCustomer() {
    if (!newCustomerName.trim()) return;
    const created = addCustomer({
      company_name: newCustomerName.trim(),
      org_number: null,
      invoice_address: null,
      visiting_address: null,
      phone: newCustomerPhone || null,
      email: newCustomerEmail || null,
      website: null,
      notes: null,
      status: "aktiv",
    });
    setCustomerId(created.id);
    setContactId("");
    setShowNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
  }

  function handleCreateContact() {
    if (!newContactName.trim() || !customerId) return;
    const created = addContactPerson({
      customer_id: customerId,
      name: newContactName.trim(),
      role: newContactRole || null,
      phone: newContactPhone || null,
      mobile: newContactMobile || null,
      email: newContactEmail || null,
      note: null,
      is_primary: contactsForCustomer.length === 0,
    });
    setContactId(created.id);
    setShowNewContact(false);
    setNewContactName("");
    setNewContactRole("");
    setNewContactPhone("");
    setNewContactMobile("");
    setNewContactEmail("");
  }

  function buildLocations(): Location[] {
    const locations: Location[] = [];
    if (loadingPlace)
      locations.push({
        id: existingLoading?.id ?? "loc-lastning",
        project_id: "",
        type: "lastning",
        name: loadingPlace,
        address: loadingAddress || null,
        contact_name: loadingContactName || null,
        contact_phone: loadingContactPhone || null,
        order_index: 0,
      });
    if (waypoint) locations.push({ id: existingWaypoint?.id ?? "loc-mellan", project_id: "", type: "mellanpunkt", name: waypoint, address: null, order_index: 1 });
    if (unloadingPlace)
      locations.push({
        id: existingUnloading?.id ?? "loc-lossning",
        project_id: "",
        type: "lossning",
        name: unloadingPlace,
        address: unloadingAddress || null,
        contact_name: unloadingContactName || null,
        contact_phone: unloadingContactPhone || null,
        order_index: 2,
      });
    return locations;
  }

  async function handleCalculateDistance() {
    setDistanceStatus("loading");
    setDistanceMessage(null);
    try {
      const result = await calculateRouteDistance([loadingAddress || loadingPlace, waypoint, unloadingAddress || unloadingPlace]);
      setRouteDistanceKm(result.distanceKm.toString());
      setDistanceStatus("success");
      setDistanceMessage(
        result.source === "osrm"
          ? `Körsträcka beräknad till ${result.distanceKm.toLocaleString("sv-SE")} km.`
          : `Sträckan uppskattades till ${result.distanceKm.toLocaleString("sv-SE")} km utifrån orter. Kontrollera vid behov.`
      );
    } catch (error) {
      setDistanceStatus("error");
      setDistanceMessage(error instanceof Error ? error.message : "Kunde inte beräkna sträckan.");
    }
  }

  function buildCargoItems() {
    return cargoRows
      .filter((row) => row.description || row.length || row.width || row.height || row.weight || row.quantity)
      .map((row, index) => ({
        id: row.id ?? `cargo-${index + 1}`,
        project_id: "",
        description: row.description || "Gods",
        length_m: numOrNull(row.length),
        width_m: numOrNull(row.width),
        height_m: numOrNull(row.height),
        weight_ton: numOrNull(row.weight),
        quantity: numOrNull(row.quantity),
        lift_points: row.liftPoints || null,
        drawing_reference: row.drawingReference || null,
        technical_info: row.technicalInfo,
      }));
  }

  function updateCargoRow(index: number, patch: Partial<CargoDraft>) {
    setCargoRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addCargoRow() {
    setCargoRows((prev) => [...prev, blankCargoDraft()]);
  }

  function removeCargoRow(index: number) {
    setCargoRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // Föreslår automatiskt en uppgift ("Boka följebil"/"Boka vägtransportledare") utifrån
  // lastens mått – oavsett vald transporttyp eller mall – om en sådan uppgift inte redan
  // finns med i checklistan.
  function ensureFollowVehicleTask(projectId: string, existingTaskTexts: string[]) {
    const suggestion = liveCargoDimensions.map(suggestedFollowVehicleTask).find(Boolean);
    if (!suggestion) return;
    const alreadyPlanned = existingTaskTexts.some((t) => /följebil|vägtransportledare/i.test(t));
    if (alreadyPlanned) return;
    addTask(projectId, {
      task: suggestion,
      category: "Följebil",
      description: "Föreslagen automatiskt utifrån godsets mått, oavsett transporttyp.",
      route_section: null,
      assignee_id: null,
      assignee: null,
      deadline: null,
      status: "Ej påbörjad",
      comment: null,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !customerId) return;

    const sharedFields = {
      name,
      customer_id: customerId,
      contact_person_id: contactId || null,
      responsible_id: responsibleId || null,
      transport_type: transportType,
      special_requirements: specialRequirements || null,
      delivery_terms: deliveryTerms || null,
      planned_loading_date: loadingDate || null,
      planned_delivery_date: deliveryDate || null,
      supplier_id: supplierId || null,
      price: numOrNull(price),
      cost: numOrNull(cost),
      invoice_status: invoiceStatus,
      customer_reference: customerReference || null,
      source_document_ref: sourceDocumentRef || null,
      vehicle: vehicle || null,
      driver_name: driverName || null,
      carrier_order_number: carrierOrderNumber || null,
      route_distance_km: numOrNull(routeDistanceKm),
      locations: buildLocations(),
      cargo_items: buildCargoItems(),
    };

    if (isEdit && project) {
      updateProject(project.id, sharedFields);
      ensureFollowVehicleTask(project.id, (project.tasks ?? []).map((t) => t.task));
      onClose();
      return;
    }

    const created = addProject({
      project_number: nextProjectNumber(projects),
      status: "Ny",
      ...sharedFields,
    });

    const templateTaskDefs = template ? TEMPLATE_TASKS[template] : [];
    for (const def of templateTaskDefs) {
      addTask(created.id, {
        task: def.task,
        category: def.category,
        description: null,
        route_section: null,
        assignee_id: null,
        assignee: null,
        deadline: null,
        status: "Ej påbörjad",
        comment: null,
      });
    }
    ensureFollowVehicleTask(created.id, templateTaskDefs.map((d) => d.task));

    onClose();
    navigate(`/projekt/${created.id}`);
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Redigera projekt" : "Nytt projekt"} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Projektnamn *">
          <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Transformator Tingsryd till Växjö" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kund *">
            {!showNewCustomer ? (
              <div className="flex gap-2">
                <select required className={inputClass} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setContactId(""); }}>
                  <option value="">Välj kund</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(true)}
                  title="Skapa ny kund"
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <Plus size={14} /> Ny
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Ny kund</span>
                  <button type="button" onClick={() => setShowNewCustomer(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                <input className={inputClass} placeholder="Företagsnamn *" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className={inputClass} placeholder="Telefon" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                  <input className={inputClass} placeholder="E-post" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" onClick={handleCreateCustomer} disabled={!newCustomerName.trim()} className="w-full justify-center">
                  Skapa och välj kund
                </Button>
              </div>
            )}
          </Field>

          <Field label="Kontaktperson">
            {!showNewContact ? (
              <div className="flex gap-2">
                <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!customerId}>
                  <option value="">Välj kontaktperson</option>
                  {contactsForCustomer.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewContact(true)}
                  disabled={!customerId}
                  title="Skapa ny kontaktperson"
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Plus size={14} /> Ny
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Ny kontaktperson</span>
                  <button type="button" onClick={() => setShowNewContact(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                <input className={inputClass} placeholder="Namn *" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
                <input className={inputClass} placeholder="Titel/roll" value={newContactRole} onChange={(e) => setNewContactRole(e.target.value)} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className={inputClass} placeholder="Telefon" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
                  <input className={inputClass} placeholder="Mobil" value={newContactMobile} onChange={(e) => setNewContactMobile(e.target.value)} />
                </div>
                <input className={inputClass} placeholder="E-post" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
                <Button type="button" variant="secondary" onClick={handleCreateContact} disabled={!newContactName.trim()} className="w-full justify-center">
                  Skapa och välj kontaktperson
                </Button>
              </div>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ansvarig hos JK">
            <select className={inputClass} value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">Välj ansvarig</option>
              {activeProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Transporttyp">
            <select className={inputClass} value={transportType} onChange={(e) => setTransportType(e.target.value as TransportType)}>
              {TRANSPORT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        {!isEdit && (
          <Field label="Projektmall (skapar standarduppgifter)">
            <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value as ProjectTemplateKey | "")}>
              <option value="">Ingen mall</option>
              {PROJECT_TEMPLATES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {template && <p className="mt-1.5 text-xs text-slate-500">{TEMPLATE_DESCRIPTIONS[template]} · {TEMPLATE_TASKS[template].length} standarduppgifter läggs till.</p>}
          </Field>
        )}

        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Transport</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lastningsplats">
              <input className={inputClass} value={loadingPlace} onChange={(e) => setLoadingPlace(e.target.value)} placeholder="Ort / adress" />
            </Field>
            <Field label="Lossningsplats">
              <input className={inputClass} value={unloadingPlace} onChange={(e) => setUnloadingPlace(e.target.value)} placeholder="Ort / adress" />
            </Field>
            <Field label="Lastningsadress">
              <AddressAutocomplete
                value={loadingAddress}
                onChange={setLoadingAddress}
                onSelect={(suggestion) => {
                  if (!loadingPlace.trim()) setLoadingPlace(suggestion.place || suggestion.address);
                }}
                placeholder="Gata, postnr, ort"
              />
            </Field>
            <Field label="Lossningsadress">
              <AddressAutocomplete
                value={unloadingAddress}
                onChange={setUnloadingAddress}
                onSelect={(suggestion) => {
                  if (!unloadingPlace.trim()) setUnloadingPlace(suggestion.place || suggestion.address);
                }}
                placeholder="Gata, postnr, ort"
              />
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Kontakt vid lastning">
                <input className={inputClass} value={loadingContactName ?? ""} onChange={(e) => setLoadingContactName(e.target.value)} placeholder="Namn" />
              </Field>
              <Field label="Telefon">
                <input className={inputClass} value={loadingContactPhone ?? ""} onChange={(e) => setLoadingContactPhone(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Kontakt vid lossning">
                <input className={inputClass} value={unloadingContactName ?? ""} onChange={(e) => setUnloadingContactName(e.target.value)} placeholder="Namn" />
              </Field>
              <Field label="Telefon">
                <input className={inputClass} value={unloadingContactPhone ?? ""} onChange={(e) => setUnloadingContactPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="Mellanpunkt / via">
              <input className={inputClass} value={waypoint} onChange={(e) => setWaypoint(e.target.value)} placeholder="Valfritt" />
            </Field>
            <Field label="Beräknad sträcka">
              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  className={inputClass}
                  value={routeDistanceKm}
                  onChange={(e) => setRouteDistanceKm(e.target.value)}
                  placeholder="km"
                />
                <span className="text-xs text-slate-500">km</span>
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCalculateDistance}
                disabled={distanceStatus === "loading" || (!loadingPlace && !loadingAddress) || (!unloadingPlace && !unloadingAddress)}
              >
                {distanceStatus === "loading" ? <Route size={14} /> : <MapPin size={14} />}
                {distanceStatus === "loading" ? "Beräknar sträcka..." : "Beräkna sträcka mellan adresser"}
              </Button>
              {distanceMessage && (
                <p className={`mt-2 text-xs ${distanceStatus === "error" ? "text-red-600" : "text-slate-500"}`}>{distanceMessage}</p>
              )}
            </div>
            <Field label="Transportör">
              <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Välj transportör</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.company_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Planerat lastningsdatum">
              <input type="date" className={inputClass} value={loadingDate ?? ""} onChange={(e) => setLoadingDate(e.target.value)} />
            </Field>
            <Field label="Planerat leveransdatum">
              <input type="date" className={inputClass} value={deliveryDate ?? ""} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
            <Field label="Fordon">
              <input className={inputClass} value={vehicle ?? ""} onChange={(e) => setVehicle(e.target.value)} placeholder="t.ex. 2 axl låglastare" />
            </Field>
            <Field label="Chaufför">
              <input className={inputClass} value={driverName ?? ""} onChange={(e) => setDriverName(e.target.value)} />
            </Field>
            <Field label="Kundens ordernummer">
              <input className={inputClass} value={customerReference ?? ""} onChange={(e) => setCustomerReference(e.target.value)} />
            </Field>
            <Field label="Källdokument (LTC-/bokningsnr)">
              <input className={inputClass} value={sourceDocumentRef ?? ""} onChange={(e) => setSourceDocumentRef(e.target.value)} />
            </Field>
            <Field label="Transportörens ordernummer">
              <input className={inputClass} value={carrierOrderNumber ?? ""} onChange={(e) => setCarrierOrderNumber(e.target.value)} />
            </Field>
            <Field label="Leveransvillkor (Incoterms)">
              <input className={inputClass} value={deliveryTerms ?? ""} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder="t.ex. DPU Incoterms 2020" />
            </Field>
          </div>
          <Field label="Särskilda krav">
            <textarea rows={2} className={`mt-4 ${inputClass}`} value={specialRequirements ?? ""} onChange={(e) => setSpecialRequirements(e.target.value)} placeholder="t.ex. kräver dispens och följebil" />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Ekonomi</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Pris / offert (kr)">
              <input inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Kostnad (kr)">
              <input inputMode="decimal" className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label="Faktureringsstatus">
              <select className={inputClass} value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus)}>
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Gods</h3>
            <Button type="button" variant="secondary" onClick={addCargoRow}>
              <Plus size={14} /> Lägg till godsrad
            </Button>
          </div>
          <div className="space-y-3">
            {cargoRows.map((row, index) => (
              <div key={index} className="rounded-lg border border-border p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">Godsrad {index + 1}</div>
                  <button
                    type="button"
                    onClick={() => removeCargoRow(index)}
                    disabled={cargoRows.length === 1}
                    title="Ta bort godsrad"
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    <X size={15} />
                  </button>
                </div>
                <Field label="Godsbeskrivning">
                  <input
                    className={inputClass}
                    value={row.description}
                    onChange={(e) => updateCargoRow(index, { description: e.target.value })}
                    placeholder="t.ex. Transformatorstation, komplett"
                  />
                </Field>
                <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5">
                  <Field label="Längd (m)">
                    <input inputMode="decimal" className={inputClass} value={row.length} onChange={(e) => updateCargoRow(index, { length: e.target.value })} />
                  </Field>
                  <Field label="Bredd (m)">
                    <input inputMode="decimal" className={inputClass} value={row.width} onChange={(e) => updateCargoRow(index, { width: e.target.value })} />
                  </Field>
                  <Field label="Höjd (m)">
                    <input inputMode="decimal" className={inputClass} value={row.height} onChange={(e) => updateCargoRow(index, { height: e.target.value })} />
                  </Field>
                  <Field label="Vikt (ton)">
                    <input inputMode="decimal" className={inputClass} value={row.weight} onChange={(e) => updateCargoRow(index, { weight: e.target.value })} />
                  </Field>
                  <Field label="Antal kollin">
                    <input inputMode="numeric" className={inputClass} value={row.quantity} onChange={(e) => updateCargoRow(index, { quantity: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Lyftpunkter">
                    <input className={inputClass} value={row.liftPoints} onChange={(e) => updateCargoRow(index, { liftPoints: e.target.value })} />
                  </Field>
                  <Field label="Ritningsreferens">
                    <input className={inputClass} value={row.drawingReference} onChange={(e) => updateCargoRow(index, { drawingReference: e.target.value })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {liveRules.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Automatiskt bedömda krav utifrån måtten
              </h4>
              <TransportRuleList rules={liveRules} compact />
              {liveTaskSuggestion && (
                <p className="mt-2 text-xs text-slate-600">
                  Uppgiften <span className="font-medium">"{liveTaskSuggestion}"</span> läggs automatiskt till i checklistan
                  när projektet sparas (om den inte redan finns), oavsett transporttyp.
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-400">{RULE_SOURCE_NOTE}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit">{isEdit ? "Spara ändringar" : "Skapa projekt"}</Button>
        </div>
      </form>
    </Modal>
  );
}
