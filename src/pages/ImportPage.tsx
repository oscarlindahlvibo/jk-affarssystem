import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import type { Location, ProjectTask } from "../types";
import { MOCK_IMPORT_HEADERS, MOCK_IMPORT_ROWS } from "../data/importMockRows";
import { parseSpreadsheetFile } from "../lib/excelParse";
import { usePermissions } from "../lib/usePermissions";
import { nextProjectNumber } from "../components/projects/NewProjectModal";
import {
  IMPORT_FIELDS,
  IMPORT_STATUS_LABEL,
  evaluateRow,
  guessMapping,
  canonicalCustomerName,
  normalizeCustomerName,
  normalizeEntityName,
  resolveInvoiceStatus,
  resolveStatus,
  resolveTransportType,
  type ColumnMapping,
  type ImportRow,
  type ImportStatusKey,
} from "../lib/importLogic";

const STATUS_BADGE: Record<ImportStatusKey, string> = {
  klar: "bg-green-100 text-green-700",
  saknar_kund: "bg-red-100 text-red-700",
  saknar_lastning: "bg-red-100 text-red-700",
  saknar_lossning: "bg-red-100 text-red-700",
  saknar_matt: "bg-amber-100 text-amber-700",
  dubblett: "bg-purple-100 text-purple-700",
  granska: "bg-slate-200 text-slate-600",
};

function DryRunMetric({ label, value, warning = false, error = false }: { label: string; value: number; warning?: boolean; error?: boolean }) {
  const color = error ? "border-red-200 bg-red-50 text-red-700" : warning ? "border-amber-200 bg-amber-50 text-amber-700" : "border-border bg-white text-slate-700";
  return (
    <div className={`rounded-lg border px-3 py-2 ${color}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

type Step = 1 | 2 | 3;

export function ImportPage() {
  const store = useStore();
  const canImport = usePermissions().can("projects", "create");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowActions, setRowActions] = useState<Record<number, ImportRow["action"]>>({});
  const [importApproved, setImportApproved] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; newCustomers: number; newSuppliers: number } | null>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setRowActions({});
    setImportApproved(false);
    setResult(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.headers.length === 0) {
        setParseError("Filen kunde inte läsas eller innehöll inga rader.");
        return;
      }
      setFileName(file.name);
      setSheetName(parsed.sheetName);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(guessMapping(parsed.headers));
      setStep(2);
    } catch {
      setParseError("Kunde inte läsa filen. Kontrollera att det är en giltig Excel- eller CSV-fil.");
    }
  }

  function useMockData() {
    setParseError(null);
    setRowActions({});
    setImportApproved(false);
    setResult(null);
    setFileName("Exempeldata (JK Excel-struktur)");
    setSheetName("Exempeldata");
    setHeaders(MOCK_IMPORT_HEADERS);
    setRawRows(MOCK_IMPORT_ROWS);
    setMapping(guessMapping(MOCK_IMPORT_HEADERS));
    setStep(2);
  }

  const evaluatedRows = useMemo(
    () => rawRows.map((row, i) => evaluateRow(i, row, mapping, store.projects)),
    [rawRows, mapping, store.projects]
  );

  const rowsWithAction = useMemo(
    () => evaluatedRows.map((r) => ({
      ...r,
      action: r.issues.some((issue) => issue.severity === "error") ? "skip" : rowActions[r.index] ?? r.action,
    })),
    [evaluatedRows, rowActions]
  );

  const summary = useMemo(() => {
    const counts: Record<ImportStatusKey, number> = {
      klar: 0, saknar_kund: 0, saknar_lastning: 0, saknar_lossning: 0, saknar_matt: 0, dubblett: 0, granska: 0,
    };
    for (const r of evaluatedRows) counts[r.status]++;
    return counts;
  }, [evaluatedRows]);

  const dryRun = useMemo(() => {
    const existingCustomerKeys = new Set(store.customers.map((customer) => normalizeCustomerName(customer.company_name)));
    const existingSupplierKeys = new Set(store.suppliers.map((supplier) => normalizeEntityName(supplier.company_name)));
    const customerNames = new Map<string, Set<string>>();
    const supplierNames = new Map<string, Set<string>>();

    for (const row of rowsWithAction) {
      if (row.action === "skip") continue;
      if (row.data.customer) {
        const key = normalizeCustomerName(row.data.customer);
        const variants = customerNames.get(key) ?? new Set<string>();
        variants.add(row.data.customer.trim());
        customerNames.set(key, variants);
      }
      for (const supplier of row.data.supplierNames) {
        const key = normalizeEntityName(supplier);
        const variants = supplierNames.get(key) ?? new Set<string>();
        variants.add(supplier.trim());
        supplierNames.set(key, variants);
      }
    }

    return {
      newCustomers: [...customerNames.entries()].filter(([key]) => !existingCustomerKeys.has(key)).map(([, names]) => [...names][0]),
      newSuppliers: [...supplierNames.entries()].filter(([key]) => !existingSupplierKeys.has(key)).map(([, names]) => [...names][0]),
      normalizedCustomers: [...customerNames.values()].filter((variants) => variants.size > 1).map((variants) => [...variants]),
      normalizedSuppliers: [...supplierNames.values()].filter((variants) => variants.size > 1).map((variants) => [...variants]),
      problemRows: evaluatedRows.filter((row) => row.issues.some((issue) => issue.severity !== "info")).length,
      blockedRows: evaluatedRows.filter((row) => row.issues.some((issue) => issue.severity === "error")).length,
      multipleSupplierRows: evaluatedRows.filter((row) => row.data.supplierNames.length > 1).length,
    };
  }, [evaluatedRows, rowsWithAction, store.customers, store.suppliers]);

  function setAction(index: number, action: ImportRow["action"]) {
    setRowActions((prev) => ({ ...prev, [index]: action }));
  }

  function runImport() {
    let created = 0, updated = 0, skipped = 0, newCustomers = 0, newSuppliers = 0;
    let workingProjects = store.projects;
    const customerByName = new Map(store.customers.map((customer) => [normalizeCustomerName(customer.company_name), customer]));
    const supplierByName = new Map(store.suppliers.map((supplier) => [normalizeEntityName(supplier.company_name), supplier]));
    const contactByCustomerAndName = new Map(
      store.contactPersons.map((contact) => [`${contact.customer_id}:${normalizeEntityName(contact.name)}`, contact])
    );

    for (const row of rowsWithAction) {
      if (row.action === "skip") { skipped++; continue; }
      const d = row.data;

      let customerId = "";
      const existingCustomer = customerByName.get(normalizeCustomerName(d.customer));
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else if (d.customer) {
        const newCustomer = store.addCustomer({
          company_name: canonicalCustomerName(d.customer),
          org_number: null,
          invoice_address: null,
          visiting_address: null,
          phone: null,
          email: null,
          website: null,
          notes: "Skapad via Excel-import.",
          status: "aktiv",
        });
        customerId = newCustomer.id;
        customerByName.set(normalizeCustomerName(d.customer), newCustomer);
        newCustomers++;
      } else {
        skipped++;
        continue;
      }

      let contactId: string | null = null;
      if (d.contactPerson) {
        const contactKey = `${customerId}:${normalizeEntityName(d.contactPerson)}`;
        const existingContact = contactByCustomerAndName.get(contactKey);
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const newContact = store.addContactPerson({
            customer_id: customerId,
            name: d.contactPerson,
            role: null,
            phone: d.phone || null,
            mobile: null,
            email: d.email || null,
            note: null,
            is_primary: false,
          });
          contactId = newContact.id;
          contactByCustomerAndName.set(contactKey, newContact);
        }
      }

      const responsible = store.profiles.find((p) => p.full_name.toLowerCase() === d.responsible.toLowerCase());
      const supplierIds = d.supplierNames.map((name) => {
        const key = normalizeEntityName(name);
        const existing = supplierByName.get(key);
        if (existing) return existing.id;
        const createdSupplier = store.addSupplier({
          company_name: name,
          type: "Åkeri",
          service_types: ["Åkeri"],
          contact_person: null,
          phone: null,
          email: null,
          area: null,
          notes: "Skapad via Excel-import.",
        });
        supplierByName.set(key, createdSupplier);
        newSuppliers++;
        return createdSupplier.id;
      });
      const invoiceStatus = resolveInvoiceStatus(d.status, d.invoiceStatus);

      const locations: Location[] = [];
      if (d.loadingPlace) locations.push({ id: "tmp", project_id: "", type: "lastning", name: d.loadingPlace, address: null, order_index: 0 });
      if (d.waypoint) locations.push({ id: "tmp", project_id: "", type: "mellanpunkt", name: d.waypoint, address: null, order_index: 1 });
      if (d.unloadingPlace) locations.push({ id: "tmp", project_id: "", type: "lossning", name: d.unloadingPlace, address: null, order_index: 2 });

      const cargoItems = (d.cargo || d.length || d.width || d.height || d.weight || d.quantity)
        ? [{
            id: "tmp", project_id: "",
            description: d.cargo || "Gods (importerat)",
            length_m: d.length, width_m: d.width, height_m: d.height, weight_ton: d.weight, quantity: d.quantity,
            lift_points: null, drawing_reference: null, technical_info: null,
          }]
        : [];

      const operationalDetails = [
        d.carrierContactStatus ? `Transportör kontaktad: ${d.carrierContactStatus}` : "",
        d.customerContactStatus ? `Kund kontaktad: ${d.customerContactStatus}` : "",
        d.routeChecked ? `Rekat: ${d.routeChecked}` : "",
        d.escortVtl ? `Följebil/VTL: ${d.escortVtl}` : "",
        d.mobileCrane ? `Mobilkran: ${d.mobileCrane}` : "",
      ].filter(Boolean);
      const notes = [
        ...(d.comment ? [{ id: "tmp-comment", project_id: "", date: new Date().toISOString(), user_name: "Excel-import", text: d.comment, category: "Allmänt" as const, visibility: "internal" as const }] : []),
        ...(operationalDetails.length > 0 ? [{ id: "tmp-operations", project_id: "", date: new Date().toISOString(), user_name: "Excel-import", text: operationalDetails.join("\n"), category: "Transport" as const, visibility: "internal" as const }] : []),
      ];
      const isComplete = (value: string) => normalizeEntityName(value) === "klar";
      const isNotNeeded = (value: string) => ["behövs ej", "behovs ej", "nej"].includes(normalizeEntityName(value));
      const tasks: ProjectTask[] = [
        ...(d.carrierContactStatus ? [{ id: "tmp-carrier-contact", project_id: "", task: "Kontakta transportör", category: "Bokning" as const, description: null, route_section: null, assignee_id: null, assignee: null, deadline: null, status: isComplete(d.carrierContactStatus) ? "Klar" as const : "Ej påbörjad" as const, comment: d.carrierContactStatus }] : []),
        ...(d.customerContactStatus ? [{ id: "tmp-customer-contact", project_id: "", task: "Kontakta kund", category: "Bokning" as const, description: null, route_section: null, assignee_id: null, assignee: null, deadline: null, status: isComplete(d.customerContactStatus) ? "Klar" as const : "Ej påbörjad" as const, comment: d.customerContactStatus }] : []),
        ...(d.routeChecked ? [{ id: "tmp-route-check", project_id: "", task: "Ruttkontroll", category: "Rekning" as const, description: null, route_section: null, assignee_id: null, assignee: null, deadline: null, status: isComplete(d.routeChecked) ? "Klar" as const : "Ej påbörjad" as const, comment: d.routeChecked }] : []),
        ...(d.escortVtl && !isNotNeeded(d.escortVtl) ? [{ id: "tmp-escort", project_id: "", task: d.escortVtl === "?" ? "Bedöm behov av följebil / VTL" : "Planera följebil / VTL", category: "Följebil" as const, description: null, route_section: null, assignee_id: null, assignee: null, deadline: null, status: "Ej påbörjad" as const, comment: d.escortVtl }] : []),
        ...(d.mobileCrane && !isNotNeeded(d.mobileCrane) ? [{ id: "tmp-crane", project_id: "", task: "Boka mobilkran", category: "Bokning" as const, description: null, route_section: null, assignee_id: null, assignee: null, deadline: null, status: "Ej påbörjad" as const, comment: d.mobileCrane }] : []),
      ];

      const documents = d.documentRef
        ? [{ id: "tmp", project_id: "", file_name: d.documentRef, file_type: d.documentRef.split(".").pop() ?? "fil", category: "Övrigt" as const, storage_path: null, uploaded_at: new Date().toISOString(), uploaded_by: "Excel-import", visibility: "internal" as const, comment: "Importerad filreferens, ej uppladdad fil." }]
        : [];

      if (row.action === "update" && row.duplicate) {
        store.updateProject(row.duplicate.project.id, {
          status: d.status ? resolveStatus(d.status) : row.duplicate.project.status,
          planned_loading_date: d.loadingDate || row.duplicate.project.planned_loading_date,
          planned_loading_time: d.loadingTime || row.duplicate.project.planned_loading_time,
          planned_delivery_date: d.deliveryDate || row.duplicate.project.planned_delivery_date,
          planned_delivery_time: d.deliveryTime || row.duplicate.project.planned_delivery_time,
          locations: locations.length ? locations : row.duplicate.project.locations,
          cargo_items: cargoItems.length ? cargoItems : row.duplicate.project.cargo_items,
          notes: [...notes, ...(row.duplicate.project.notes ?? [])],
          documents: [...documents, ...(row.duplicate.project.documents ?? [])],
          price: d.price ?? row.duplicate.project.price,
          cost: d.cost ?? row.duplicate.project.cost,
          invoice_status: invoiceStatus,
          customer_reference: d.customerReference || row.duplicate.project.customer_reference,
          vehicle: d.vehicle || row.duplicate.project.vehicle,
          driver_name: d.driver || row.duplicate.project.driver_name,
          carrier_order_number: d.carrierOrderNumber || row.duplicate.project.carrier_order_number,
          supplier_id: supplierIds[0] ?? row.duplicate.project.supplier_id,
          supplier_ids: supplierIds.length > 0 ? supplierIds : row.duplicate.project.supplier_ids,
          tasks: [...tasks, ...(row.duplicate.project.tasks ?? [])],
        });
        updated++;
        continue;
      }

      const newProject = store.addProject({
        project_number: d.projectNumber || nextProjectNumber(workingProjects),
        name: d.cargo ? `${d.customer} – ${d.cargo}` : `${d.customer} – ${d.loadingPlace || "?"} till ${d.unloadingPlace || "?"}`,
        customer_id: customerId,
        contact_person_id: contactId,
        responsible_id: responsible?.id ?? null,
        status: d.status ? resolveStatus(d.status) : "Ny",
        transport_type: d.transportType ? resolveTransportType(d.transportType) : "Annat",
        special_requirements: null,
        planned_loading_date: d.loadingDate || null,
        planned_loading_time: d.loadingTime || null,
        planned_delivery_date: d.deliveryDate || null,
        planned_delivery_time: d.deliveryTime || null,
        supplier_id: supplierIds[0] ?? null,
        supplier_ids: supplierIds,
        price: d.price,
        cost: d.cost,
        invoice_status: invoiceStatus,
        customer_reference: d.customerReference || null,
        source_document_ref: null,
        delivery_terms: null,
        vehicle: d.vehicle || null,
        driver_name: d.driver || null,
        carrier_order_number: d.carrierOrderNumber || null,
        locations,
        cargo_items: cargoItems,
        notes,
        documents,
        tasks,
      });
      workingProjects = [...workingProjects, newProject];
      created++;
    }

    setResult({ created, updated, skipped, newCustomers, newSuppliers });
  }

  function startOver() {
    setStep(1);
    setFileName(null);
    setSheetName(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setRowActions({});
    setResult(null);
    setImportApproved(false);
    setParseError(null);
  }

  if (!canImport) {
    return <div className="py-20 text-center text-slate-500">Du har inte behörighet att importera projekt.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                step === s ? "bg-orange-500 text-white" : step > s ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {step > s ? <CheckCircle2 size={14} /> : s}
            </div>
            <span className={`text-sm ${step === s ? "font-medium text-slate-800" : "text-slate-500"}`}>
              {s === 1 ? "Välj fil" : s === 2 ? "Mappa kolumner" : "Torrimport och granskning"}
            </span>
            {s < 3 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Panel title="Steg 1: Välj eller ladda upp fil">
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-slate-50 py-12 text-center hover:border-orange-300 hover:bg-orange-50/40"
            >
              <Upload size={28} className="text-slate-400" />
              <div className="text-sm font-medium text-slate-700">Klicka för att välja fil</div>
              <div className="text-xs text-slate-500">Excel (.xlsx, .xls) eller CSV, en rad per projekt/transport</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-border" /> eller <div className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={useMockData}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet size={16} className="text-orange-500" />
              Använd exempeldata (visar hur JK:s Excel kan importeras)
            </button>
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel
          title="Steg 2: Mappa kolumner"
          action={<span className="text-xs text-slate-500">{fileName} · blad: {sheetName} · {rawRows.length} rader</span>}
        >
          <p className="mb-4 text-sm text-slate-500">
            Systemet har försökt gissa vilken Excel-kolumn som hör till varje fält. Kontrollera och justera vid behov. Alla fält behöver inte mappas.
          </p>
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 font-medium">Fält i systemet</th>
                  <th className="py-2 font-medium">Excel-kolumn</th>
                  <th className="py-2 font-medium">Exempel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {IMPORT_FIELDS.map((field) => {
                  const mappedIndex = mapping[field.key];
                  const sample = mappedIndex !== undefined ? rawRows[0]?.[mappedIndex] : "";
                  return (
                    <tr key={field.key}>
                      <td className="py-2 pr-4 font-medium text-slate-700">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={mappedIndex ?? ""}
                          onChange={(e) => {
                            setImportApproved(false);
                            setRowActions({});
                            setMapping((prev) => ({
                              ...prev,
                              [field.key]: e.target.value === "" ? undefined : Number(e.target.value),
                            }));
                          }}
                          className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm"
                        >
                          <option value="">Ingen mappning</option>
                          {headers.map((h, i) => (
                            <option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-xs text-slate-400">{sample || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft size={14} /> Tillbaka</Button>
            <Button onClick={() => setStep(3)}>
              Kör torrimport <ArrowRight size={14} />
            </Button>
          </div>
        </Panel>
      )}

      {step === 3 && !result && (
        <Panel title="Steg 3: Torrimport och granskning">
          <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Torrimporten är skrivskyddad. Ingen kund, transportör eller projektpost har skapats ännu.
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <DryRunMetric label="Rader" value={evaluatedRows.length} />
            <DryRunMetric label="Problemrader" value={dryRun.problemRows} warning={dryRun.problemRows > 0} />
            <DryRunMetric label="Blockerade" value={dryRun.blockedRows} error={dryRun.blockedRows > 0} />
            <DryRunMetric label="Nya kunder" value={dryRun.newCustomers.length} />
            <DryRunMetric label="Nya transportörer" value={dryRun.newSuppliers.length} />
            <DryRunMetric label="Flera transportörer" value={dryRun.multipleSupplierRows} />
          </div>
          {(dryRun.normalizedCustomers.length > 0 || dryRun.normalizedSuppliers.length > 0) && (
            <div className="mb-4 rounded-lg border border-border bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div className="font-medium text-slate-700">Namnvarianter som slås ihop</div>
              {dryRun.normalizedCustomers.map((variants) => <div key={`customer-${variants.join("-")}`}>Kund: {variants.join(" / ")}</div>)}
              {dryRun.normalizedSuppliers.map((variants) => <div key={`supplier-${variants.join("-")}`}>Transportör: {variants.join(" / ")}</div>)}
            </div>
          )}
          {(dryRun.newCustomers.length > 0 || dryRun.newSuppliers.length > 0) && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-white px-4 py-3 text-xs text-slate-600">
                <div className="mb-1 font-medium text-slate-700">Kunder som kommer att skapas</div>
                {dryRun.newCustomers.length > 0 ? dryRun.newCustomers.join(", ") : "Inga nya kunder"}
              </div>
              <div className="rounded-lg border border-border bg-white px-4 py-3 text-xs text-slate-600">
                <div className="mb-1 font-medium text-slate-700">Transportörer som kommer att skapas</div>
                {dryRun.newSuppliers.length > 0 ? dryRun.newSuppliers.join(", ") : "Inga nya transportörer"}
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(summary) as ImportStatusKey[]).filter((k) => summary[k] > 0).map((k) => (
              <span key={k} className={`status-pill ${STATUS_BADGE[k]}`}>{IMPORT_STATUS_LABEL[k]}: {summary[k]}</span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Projekt</th>
                  <th className="px-3 py-2 font-medium">Kund</th>
                  <th className="px-3 py-2 font-medium">Lastning</th>
                  <th className="px-3 py-2 font-medium">Lossning</th>
                  <th className="px-3 py-2 font-medium">Gods</th>
                  <th className="px-3 py-2 font-medium">Höjd</th>
                  <th className="px-3 py-2 font-medium">Vikt</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Transportörer</th>
                  <th className="px-3 py-2 font-medium">Importstatus</th>
                  <th className="px-3 py-2 font-medium">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rowsWithAction.map((row) => (
                  <tr
                    key={row.index}
                    className={row.issues.some((issue) => issue.severity === "error")
                      ? "bg-red-50/60"
                      : row.issues.some((issue) => issue.severity === "warning")
                        ? "bg-amber-50/50"
                        : row.action === "skip" ? "opacity-50" : ""}
                  >
                    <td className="px-3 py-2 text-slate-400">{row.index + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.data.projectNumber || <span className="italic text-slate-400">auto</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.customer || <span className="italic text-red-500">saknas</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.loadingPlace || "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.unloadingPlace || "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.cargo || "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.height ? `${row.data.height} m` : "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.weight ? `${row.data.weight} t` : "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.status || "–"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.data.supplierNames.join(", ") || "–"}</td>
                    <td className="px-3 py-2">
                      <span className={`status-pill ${STATUS_BADGE[row.status]}`}>{IMPORT_STATUS_LABEL[row.status]}</span>
                      {row.issues.map((issue) => (
                        <div
                          key={issue.code}
                          className={`mt-1 text-[11px] ${issue.severity === "error" ? "text-red-700" : issue.severity === "warning" ? "text-amber-700" : "text-slate-500"}`}
                        >
                          {issue.message}
                        </div>
                      ))}
                      {row.duplicate && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-500">
                          <Copy size={11} className="mt-0.5 shrink-0" />
                          Liknar <Link to={`/projekt/${row.duplicate.project.id}`} target="_blank" className="text-orange-600 hover:underline">{row.duplicate.project.project_number}</Link> ({row.duplicate.reasons.join(", ")})
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.action}
                        onChange={(e) => setAction(row.index, e.target.value as ImportRow["action"])}
                        disabled={row.issues.some((issue) => issue.severity === "error")}
                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="import">Importera ändå</option>
                        <option value="skip">Hoppa över</option>
                        {row.duplicate && <option value="update">Uppdatera befintligt</option>}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={importApproved} onChange={(event) => setImportApproved(event.target.checked)} className="mt-0.5" />
            Jag har granskat torrimportens problemrader och vill skriva de valda raderna till systemet.
          </label>
          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setStep(2)}><ArrowLeft size={14} /> Tillbaka</Button>
            <Button onClick={runImport} disabled={!importApproved}>
              Importera {rowsWithAction.filter((r) => r.action !== "skip").length} rader
            </Button>
          </div>
        </Panel>
      )}

      {result && (
        <Panel title="Import klar">
          <div className="flex items-start gap-3 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Importen är klar.</div>
              <div className="mt-1 text-green-700/90">
                {result.created} nya projekt skapade, {result.updated} befintliga projekt uppdaterade, {result.newCustomers} nya kunder och {result.newSuppliers} nya transportörer skapade, {result.skipped} rader överhoppade.
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link to="/projekt"><Button>Till projektlistan</Button></Link>
            <Button variant="secondary" onClick={startOver}>Importera fler rader</Button>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Importen körs lokalt i webbläsaren. Inga filer skickas till någon extern server.
        </div>
      )}
    </div>
  );
}
