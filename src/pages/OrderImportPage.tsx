import { useState } from "react";
import { Link } from "react-router-dom";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Loader2, Plus, X } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { extractPdfText, parseLtcOrder, type ParsedLtcOrder, type ParsedLtcItem } from "../lib/ltcParse";
import { MOCK_LTC_ORDER } from "../data/ltcMockOrder";
import { nextProjectNumber } from "../components/projects/NewProjectModal";
import { usePermissions } from "../lib/usePermissions";
import type { TransportType } from "../types";

const TRANSPORT_TYPES: TransportType[] = ["Specialtransport", "Maskintransport", "Krantransport", "Styckegods", "Container", "Annat"];

type Step = 1 | 2 | 3;

interface EditableItem extends ParsedLtcItem {
  include: boolean;
}

export function OrderImportPage() {
  const store = useStore();
  const canImport = usePermissions().can("projects", "create");
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [order, setOrder] = useState<ParsedLtcOrder | null>(null);

  // Granskningsbara fält
  const [customerId, setCustomerId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [contactId, setContactId] = useState("");
  const [loadingPlace, setLoadingPlace] = useState("");
  const [unloadingPlace, setUnloadingPlace] = useState("");
  const [unloadingContactName, setUnloadingContactName] = useState("");
  const [unloadingContactPhone, setUnloadingContactPhone] = useState("");
  const [loadingDate, setLoadingDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [transportType, setTransportType] = useState<TransportType>("Specialtransport");
  const [supplierId, setSupplierId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [result, setResult] = useState<{ created: number } | null>(null);

  const activeProfiles = store.profiles.filter((p) => p.status === "aktiv");
  const contactsForCustomer = store.contactPersons.filter((c) => c.customer_id === customerId);

  function loadOrderIntoForm(parsed: ParsedLtcOrder) {
    setOrder(parsed);
    const matchedCustomer = store.customers.find((c) => c.company_name.toLowerCase() === (parsed.senderCompany ?? "").toLowerCase());
    setCustomerId(matchedCustomer?.id ?? "");
    setShowNewCustomer(!matchedCustomer && Boolean(parsed.senderCompany));
    setNewCustomerName(parsed.senderCompany ?? "");
    setLoadingPlace([parsed.senderCity, parsed.senderAddress].filter(Boolean).join(", ") || parsed.senderCity || "");
    const coords = parsed.deliveryCoordinateN && parsed.deliveryCoordinateE ? ` (N: ${parsed.deliveryCoordinateN}, E: ${parsed.deliveryCoordinateE})` : "";
    setUnloadingPlace([parsed.deliveryPostnr, parsed.deliveryCity].filter(Boolean).join(" ") + coords);
    setUnloadingContactName(parsed.recipientCompany ? `${parsed.recipientContact ?? ""} (${parsed.recipientCompany})`.trim() : parsed.recipientContact ?? "");
    setUnloadingContactPhone(parsed.recipientPhone ?? parsed.recipientMobile ?? "");
    setLoadingDate(parsed.loadingDate ?? "");
    setDeliveryDate(parsed.deliveryDate ?? "");
    setDeliveryTerms(parsed.deliveryTerms ?? "");
    setItems(parsed.items.map((i) => ({ ...i, include: true })));
    setStep(2);
  }

  async function handleFile(file: File) {
    setParseError(null);
    setParsing(true);
    try {
      const text = await extractPdfText(file);
      const parsed = parseLtcOrder(text);
      setFileName(file.name);
      if (parsed.items.length === 0 && !parsed.documentNumber) {
        setParseError("Kunde inte tolka dokumentet automatiskt. Kontrollera att det är en LTC-liknande fraktbeställning, eller fortsätt och fyll i manuellt.");
      }
      loadOrderIntoForm(parsed);
    } catch {
      setParseError("Kunde inte läsa PDF-filen.");
    } finally {
      setParsing(false);
    }
  }

  function useExample() {
    setParseError(null);
    setFileName("Exempeldata (LTC-blad Holtab)");
    loadOrderIntoForm(MOCK_LTC_ORDER);
  }

  function updateItem(index: number, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const includedCount = items.filter((i) => i.include).length;

  function handleCreate() {
    let finalCustomerId = customerId;
    if (!finalCustomerId && newCustomerName.trim()) {
      const created = store.addCustomer({
        company_name: newCustomerName.trim(),
        org_number: null,
        invoice_address: null,
        visiting_address: null,
        phone: null,
        email: null,
        website: null,
        notes: "Skapad via LTC-orderimport.",
        status: "aktiv",
      });
      finalCustomerId = created.id;
    }
    if (!finalCustomerId) return;

    let created = 0;
    let workingProjects = store.projects;

    for (const item of items) {
      if (!item.include) continue;
      const description = [item.typeName, item.goodsMark ? `– Godsmärke ${item.goodsMark}` : null].filter(Boolean).join(" ");
      const combinedTerms = [deliveryTerms || null, item.deliveryTermsAddition].filter(Boolean).join(" + ") || null;

      const newProject = store.addProject({
        project_number: nextProjectNumber(workingProjects),
        name: `${newCustomerName || "Kund"} – ${description || "Transport"}`,
        customer_id: finalCustomerId,
        contact_person_id: contactId || null,
        responsible_id: responsibleId || null,
        status: "Ny",
        transport_type: transportType,
        special_requirements: null,
        delivery_terms: combinedTerms,
        planned_loading_date: loadingDate || null,
        planned_delivery_date: deliveryDate || null,
        supplier_id: supplierId || null,
        price: null,
        cost: null,
        invoice_status: "Ej fakturerad",
        customer_reference: item.orderRef,
        source_document_ref: order?.documentNumber ?? null,
        vehicle: null,
        driver_name: null,
        carrier_order_number: null,
        locations: [
          ...(loadingPlace ? [{ id: "loc-lastning", project_id: "", type: "lastning" as const, name: loadingPlace, address: null, order_index: 0 }] : []),
          ...(unloadingPlace
            ? [{
                id: "loc-lossning",
                project_id: "",
                type: "lossning" as const,
                name: unloadingPlace,
                address: null,
                contact_name: unloadingContactName || null,
                contact_phone: unloadingContactPhone || null,
                order_index: 1,
              }]
            : []),
        ],
        cargo_items: [
          {
            id: "cargo-1",
            project_id: "",
            description: description || "Gods",
            length_m: item.length_m,
            width_m: item.width_m,
            height_m: item.height_m,
            weight_ton: item.weight_ton,
            quantity: item.quantity,
            lift_points: null,
            drawing_reference: item.orderRef,
            technical_info: null,
          },
        ],
      });
      workingProjects = [...workingProjects, newProject];
      created++;
    }

    setResult({ created });
  }

  function startOver() {
    setStep(1);
    setFileName(null);
    setOrder(null);
    setResult(null);
    setParseError(null);
  }

  if (!canImport) {
    return <div className="py-20 text-center text-slate-500">Du har inte behörighet att importera order.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step === s ? "bg-orange-500 text-white" : step > s ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
              {step > s ? <CheckCircle2 size={14} /> : s}
            </div>
            <span className={`text-sm ${step === s ? "font-medium text-slate-800" : "text-slate-500"}`}>
              {s === 1 ? "Ladda upp order" : s === 2 ? "Granska och komplettera" : "Klart"}
            </span>
            {s < 3 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Panel title="Steg 1: Ladda upp fraktorder (LTC/PDF)">
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-slate-50 py-12 text-center hover:border-orange-300 hover:bg-orange-50/40">
              {parsing ? <Loader2 size={28} className="animate-spin text-slate-400" /> : <Upload size={28} className="text-slate-400" />}
              <div className="text-sm font-medium text-slate-700">{parsing ? "Läser dokumentet..." : "Klicka för att välja PDF"}</div>
              <div className="text-xs text-slate-500">Digital fraktorder (LTC-blad eller liknande), en fil per order</div>
              <input type="file" accept=".pdf" className="hidden" disabled={parsing} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-border" /> eller <div className="h-px flex-1 bg-border" />
            </div>
            <button onClick={useExample} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileText size={16} className="text-orange-500" />
              Använd exempeldata (LTC-blad Holtab)
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Tolkningen sker lokalt i webbläsaren och är en bästa möjliga läsning av dokumentet – kontrollera och
            komplettera alltid uppgifterna i nästa steg innan projekt skapas. Skannade/fotograferade dokument stöds
            inte ännu, bara text-PDF:er skickade direkt från avsändarens system.
          </div>
        </Panel>
      )}

      {step === 2 && order && (
        <Panel title="Steg 2: Granska och komplettera" action={<span className="text-xs text-slate-500">{fileName}</span>}>
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Kund (avsändare)</h3>
              {!showNewCustomer ? (
                <div className="flex gap-2">
                  <select className={inputClass} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setContactId(""); }}>
                    <option value="">Välj kund</option>
                    {store.customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowNewCustomer(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50">
                    <Plus size={14} /> Ny
                  </button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Ny kund (från dokumentet)</span>
                    {store.customers.length > 0 && (
                      <button type="button" onClick={() => setShowNewCustomer(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <input className={inputClass} value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Företagsnamn" />
                </div>
              )}
              {!showNewCustomer && (
                <div className="mt-3">
                  <Field label="Kontaktperson hos kunden">
                    <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!customerId}>
                      <option value="">Välj kontaktperson</option>
                      {contactsForCustomer.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Transport</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Lastningsplats"><input className={inputClass} value={loadingPlace} onChange={(e) => setLoadingPlace(e.target.value)} /></Field>
                <Field label="Lossningsplats"><input className={inputClass} value={unloadingPlace} onChange={(e) => setUnloadingPlace(e.target.value)} /></Field>
                <Field label="Kontakt vid lossning"><input className={inputClass} value={unloadingContactName} onChange={(e) => setUnloadingContactName(e.target.value)} /></Field>
                <Field label="Telefon"><input className={inputClass} value={unloadingContactPhone} onChange={(e) => setUnloadingContactPhone(e.target.value)} /></Field>
                <Field label="Planerat lastningsdatum"><input type="date" className={inputClass} value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} /></Field>
                <Field label="Planerat leveransdatum"><input type="date" className={inputClass} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
                <Field label="Leveransvillkor"><input className={inputClass} value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} /></Field>
                <Field label="Transporttyp">
                  <select className={inputClass} value={transportType} onChange={(e) => setTransportType(e.target.value as TransportType)}>
                    {TRANSPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Transportör (saknas i dokumentet)">
                  <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Välj transportör</option>
                    {store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                  </select>
                </Field>
                <Field label="Ansvarig hos JK (saknas i dokumentet)">
                  <select className={inputClass} value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                    <option value="">Välj ansvarig</option>
                    {activeProfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Gods / bilar ({includedCount} av {items.length} inkluderade – skapar {includedCount} projekt)
              </h3>
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${item.include ? "border-border" : "border-border bg-slate-50 opacity-60"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={item.include} onChange={(e) => updateItem(i, { include: e.target.checked })} />
                        Order {item.orderRef ?? `#${i + 1}`}
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      <Field label="Typ"><input className={inputClass} value={item.typeName ?? ""} onChange={(e) => updateItem(i, { typeName: e.target.value })} /></Field>
                      <Field label="Godsmärke"><input className={inputClass} value={item.goodsMark ?? ""} onChange={(e) => updateItem(i, { goodsMark: e.target.value })} /></Field>
                      <Field label="Längd (m)"><input className={inputClass} value={item.length_m ?? ""} onChange={(e) => updateItem(i, { length_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Bredd (m)"><input className={inputClass} value={item.width_m ?? ""} onChange={(e) => updateItem(i, { width_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Höjd (m)"><input className={inputClass} value={item.height_m ?? ""} onChange={(e) => updateItem(i, { height_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Vikt (ton)"><input className={inputClass} value={item.weight_ton ?? ""} onChange={(e) => updateItem(i, { weight_ton: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                    </div>
                    {item.deliveryTermsAddition && (
                      <p className="mt-2 text-xs text-slate-500">Tillägg leveransvillkor: {item.deliveryTermsAddition}</p>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-slate-500">Inga godsrader hittades automatiskt. Lägg till projekt manuellt via "Nytt projekt" istället, eller kontrollera dokumentet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft size={14} /> Tillbaka</Button>
            <Button onClick={handleCreate} disabled={includedCount === 0 || (!customerId && !newCustomerName.trim())}>
              Skapa {includedCount} projekt <ArrowRight size={14} />
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
              <div className="mt-1 text-green-700/90">{result.created} projekt skapade utifrån ordern.</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link to="/projekt"><Button>Till projektlistan</Button></Link>
            <Button variant="secondary" onClick={startOver}>Importera ny order</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
