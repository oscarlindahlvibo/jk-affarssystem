import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileSignature,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  Route,
  Send,
  Truck,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useStore, type CustomerBookingCargoInput, type CustomerBookingInput } from "../data/store";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { AddressAutocomplete } from "../components/ui/AddressAutocomplete";
import { Modal } from "../components/ui/Modal";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { CustomerFreightCalculatorPanel } from "../components/customers/CustomerFreightCalculatorPanel";
import { formatDateAndTime, formatDateTime } from "../lib/format";
import { calculateRouteDistance } from "../lib/routeDistance";
import { generateShippingDocument, shippingDocumentFileName, type ShippingDocumentKind } from "../lib/shippingDocuments";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { PROJECT_STATUSES, type BookingApprovalStatus, type Project, type TransportType } from "../types";

const TRANSPORT_TYPES: TransportType[] = ["Specialtransport", "Maskintransport", "Krantransport", "Styckegods", "Container", "Annat"];

const blankCargoItem = (): CustomerBookingCargoInput => ({
  description: "",
  length_m: null,
  width_m: null,
  height_m: null,
  weight_ton: null,
  quantity: 1,
});

const initialForm: CustomerBookingInput = {
  name: "",
  transport_type: "Specialtransport",
  planned_loading_date: "",
  planned_loading_time: "",
  planned_delivery_date: "",
  planned_delivery_time: "",
  loading_name: "",
  loading_address: "",
  loading_contact_name: "",
  loading_contact_phone: "",
  unloading_name: "",
  unloading_address: "",
  unloading_contact_name: "",
  unloading_contact_phone: "",
  cargo_items: [blankCargoItem()],
  customer_reference: "",
  special_requirements: "",
  route_distance_km: null,
};

const APPROVAL_STYLES: Record<BookingApprovalStatus, string> = {
  "Väntar på godkännande": "bg-amber-100 text-amber-700",
  Godkänd: "bg-green-100 text-green-700",
  Avvisad: "bg-slate-200 text-slate-600",
};

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: number | null) {
  return value === null ? "" : String(value);
}

function canSelfServeBooking(project: Project) {
  return project.booking_approval_status !== "Väntar på godkännande" && project.booking_approval_status !== "Avvisad" && project.status !== "Avbruten";
}

export function CustomerPortalPage() {
  const { currentCustomerUser, signOut } = useAuth();
  const {
    customers,
    projects,
    submitCustomerBooking,
    addCustomerShippingDocument,
    requestBookingEdit,
    isLoading,
    dataError,
    retryLoading,
  } = useStore();
  const [form, setForm] = useState<CustomerBookingInput>(initialForm);
  const [createdProjectNumber, setCreatedProjectNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distanceStatus, setDistanceStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [distanceMessage, setDistanceMessage] = useState<string | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [generatingKind, setGeneratingKind] = useState<ShippingDocumentKind | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === currentCustomerUser?.customer_id);
  const bookings = useMemo(
    () => [...projects].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [projects]
  );
  const openBooking = bookings.find((p) => p.id === openBookingId) ?? null;

  function openBookingDetails(projectId: string) {
    setOpenBookingId(projectId);
    setDocError(null);
    setEditMessage("");
    setEditError(null);
  }

  async function handleGenerateDocument(project: Project, kind: ShippingDocumentKind) {
    setDocError(null);
    setGeneratingKind(kind);
    try {
      const blob = await generateShippingDocument(project, kind);
      const fileName = shippingDocumentFileName(project, kind);
      const file = new File([blob], fileName, { type: "application/pdf" });
      let storagePath: string | null = null;
      let fileUrl: string | null = null;
      if (isSupabaseConfigured && supabase) {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `${project.id}/${crypto.randomUUID()}-${safeName}`;
        const uploaded = await supabase.storage.from("project-documents").upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (uploaded.error) throw new Error(`Dokumentet kunde inte laddas upp: ${uploaded.error.message}`);
        const signed = await supabase.storage.from("project-documents").createSignedUrl(storagePath, 60 * 60);
        if (signed.error) throw new Error(`Dokumentlänken kunde inte skapas: ${signed.error.message}`);
        fileUrl = signed.data.signedUrl;
      } else {
        fileUrl = URL.createObjectURL(file);
      }
      await addCustomerShippingDocument(project.id, {
        file_name: fileName,
        file_type: "pdf",
        category: "Fraktsedel",
        storage_path: storagePath,
        file_url: fileUrl,
        file_size: file.size,
        comment: kind === "cmr" ? "Genererad CMR av kund i kundportalen." : "Genererad fraktsedel av kund i kundportalen.",
      });
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = fileName;
      link.click();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Dokumentet kunde inte skapas.");
    } finally {
      setGeneratingKind(null);
    }
  }

  async function handleRequestEdit(projectId: string) {
    setEditError(null);
    if (!editMessage.trim()) {
      setEditError("Beskriv vad som ska ändras.");
      return;
    }
    setEditSubmitting(true);
    try {
      await requestBookingEdit(projectId, editMessage);
      setEditMessage("");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Ändringsbegäran kunde inte skickas.");
    } finally {
      setEditSubmitting(false);
    }
  }

  function update<K extends keyof CustomerBookingInput>(key: K, value: CustomerBookingInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateCargoItem(index: number, patch: Partial<CustomerBookingCargoInput>) {
    setForm((prev) => ({
      ...prev,
      cargo_items: prev.cargo_items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function addCargoItem() {
    setForm((prev) => ({ ...prev, cargo_items: [...prev.cargo_items, blankCargoItem()] }));
  }

  function removeCargoItem(index: number) {
    setForm((prev) => ({
      ...prev,
      cargo_items: prev.cargo_items.length > 1 ? prev.cargo_items.filter((_, i) => i !== index) : prev.cargo_items,
    }));
  }

  async function handleCalculateDistance() {
    setDistanceStatus("loading");
    setDistanceMessage(null);
    try {
      const result = await calculateRouteDistance([
        form.loading_address || form.loading_name,
        form.unloading_address || form.unloading_name,
      ]);
      update("route_distance_km", result.distanceKm);
      setDistanceStatus("success");
      setDistanceMessage(
        result.source === "osrm"
          ? `Körsträcka beräknad till ${result.distanceKm.toLocaleString("sv-SE")} km.`
          : `Sträckan uppskattades till ${result.distanceKm.toLocaleString("sv-SE")} km utifrån orter.`
      );
    } catch (err) {
      setDistanceStatus("error");
      setDistanceMessage(err instanceof Error ? err.message : "Kunde inte beräkna sträckan.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedProjectNumber(null);
    if (!form.loading_name.trim() || !form.unloading_name.trim() || !form.cargo_items.some((item) => item.description.trim())) {
      setError("Fyll i minst lastningsort, lossningsort och godsbeskrivning.");
      return;
    }
    try {
      const project = await submitCustomerBooking(form);
      setCreatedProjectNumber(project.project_number);
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bokningen kunde inte skickas.");
    }
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Läser kundportalen...</div>;
  }

  if (dataError && customers.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-md border border-red-200 bg-white p-5 text-center">
          <p className="text-sm text-red-700">{dataError}</p>
          <Button className="mt-4" variant="secondary" onClick={retryLoading}>Försök igen</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-orange-600">JK Projektlogistik</div>
            <h1 className="text-xl font-semibold text-slate-900">Kundportal</h1>
            <p className="text-sm text-slate-500">
              {customer?.company_name ?? "Kund"} · {currentCustomerUser?.full_name}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut size={15} /> Logga ut
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Skapa bokningsförfrågan">
          <form onSubmit={handleSubmit} className="space-y-5">
            {createdProjectNumber && (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                Bokningen {createdProjectNumber} är skickad och väntar på JK:s godkännande.
              </div>
            )}
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Rubrik">
                <input className={inputClass} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex. Transformator till Jönköping" />
              </Field>
              <Field label="Transporttyp">
                <select className={inputClass} value={form.transport_type} onChange={(e) => update("transport_type", e.target.value as TransportType)}>
                  {TRANSPORT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Önskat lastningsdatum">
                <input type="date" className={inputClass} value={form.planned_loading_date} onChange={(e) => update("planned_loading_date", e.target.value)} />
              </Field>
              <Field label="Önskad lastningstid">
                <input type="time" className={inputClass} value={form.planned_loading_time} onChange={(e) => update("planned_loading_time", e.target.value)} />
              </Field>
              <Field label="Önskat lossningsdatum">
                <input type="date" className={inputClass} value={form.planned_delivery_date} onChange={(e) => update("planned_delivery_date", e.target.value)} />
              </Field>
              <Field label="Önskad lossningstid">
                <input type="time" className={inputClass} value={form.planned_delivery_time} onChange={(e) => update("planned_delivery_time", e.target.value)} />
              </Field>
              <Field label="Kundens referens">
                <input className={inputClass} value={form.customer_reference} onChange={(e) => update("customer_reference", e.target.value)} placeholder="Ordernummer, projektnummer..." />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-slate-800">Lastning</h2>
                  <Field label="Lastningsadress">
                    <AddressAutocomplete
                      value={form.loading_address}
                      onChange={(value) => update("loading_address", value)}
                      onSelect={(suggestion) => {
                        update("loading_name", suggestion.place || suggestion.address);
                      }}
                      placeholder="Gata, postnr, ort"
                    />
                  </Field>
                  <Field label="Lastningsort">
                    <input required className={inputClass} value={form.loading_name} onChange={(e) => update("loading_name", e.target.value)} placeholder="Fylls i från adressen" />
                  </Field>
                  <Field label="Kontakt på plats">
                    <input className={inputClass} value={form.loading_contact_name} onChange={(e) => update("loading_contact_name", e.target.value)} />
                  </Field>
                  <Field label="Telefon">
                    <input className={inputClass} value={form.loading_contact_phone} onChange={(e) => update("loading_contact_phone", e.target.value)} />
                  </Field>
              </section>
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-slate-800">Lossning</h2>
                  <Field label="Lossningsadress">
                    <AddressAutocomplete
                      value={form.unloading_address}
                      onChange={(value) => update("unloading_address", value)}
                      onSelect={(suggestion) => {
                        update("unloading_name", suggestion.place || suggestion.address);
                      }}
                      placeholder="Gata, postnr, ort"
                    />
                  </Field>
                  <Field label="Lossningsort">
                    <input required className={inputClass} value={form.unloading_name} onChange={(e) => update("unloading_name", e.target.value)} placeholder="Fylls i från adressen" />
                  </Field>
                  <Field label="Kontakt på plats">
                    <input className={inputClass} value={form.unloading_contact_name} onChange={(e) => update("unloading_contact_name", e.target.value)} />
                  </Field>
                  <Field label="Telefon">
                    <input className={inputClass} value={form.unloading_contact_phone} onChange={(e) => update("unloading_contact_phone", e.target.value)} />
                  </Field>
              </section>
            </div>

            <section className="border-t border-border pt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="Beräknad transportsträcka">
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      className={inputClass}
                      value={numberValue(form.route_distance_km)}
                      onChange={(e) => update("route_distance_km", parseNumber(e.target.value))}
                      placeholder="km"
                    />
                    <span className="text-xs text-slate-500">km</span>
                  </div>
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCalculateDistance}
                  disabled={distanceStatus === "loading" || (!form.loading_name && !form.loading_address) || (!form.unloading_name && !form.unloading_address)}
                >
                  {distanceStatus === "loading" ? <Route size={14} /> : <MapPin size={14} />}
                  {distanceStatus === "loading" ? "Beräknar..." : "Beräkna sträcka"}
                </Button>
              </div>
              {distanceMessage && (
                <p className={`mt-2 text-xs ${distanceStatus === "error" ? "text-red-600" : "text-slate-500"}`}>{distanceMessage}</p>
              )}
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-800">Gods</h2>
                <Button type="button" variant="secondary" onClick={addCargoItem}>
                  <Plus size={14} /> Lägg till rad
                </Button>
              </div>
              <div className="space-y-3">
                {form.cargo_items.map((item, index) => (
                  <div key={index} className="rounded-lg border border-border p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-700">Godsrad {index + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeCargoItem(index)}
                        disabled={form.cargo_items.length === 1}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        title="Ta bort godsrad"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                      <div className="md:col-span-5">
                        <Field label="Godsbeskrivning">
                          <input
                            required={index === 0}
                            className={inputClass}
                            value={item.description}
                            onChange={(e) => updateCargoItem(index, { description: e.target.value })}
                            placeholder="Vad ska transporteras?"
                          />
                        </Field>
                      </div>
                      <Field label="Längd (m)">
                        <input inputMode="decimal" className={inputClass} value={numberValue(item.length_m)} onChange={(e) => updateCargoItem(index, { length_m: parseNumber(e.target.value) })} />
                      </Field>
                      <Field label="Bredd (m)">
                        <input inputMode="decimal" className={inputClass} value={numberValue(item.width_m)} onChange={(e) => updateCargoItem(index, { width_m: parseNumber(e.target.value) })} />
                      </Field>
                      <Field label="Höjd (m)">
                        <input inputMode="decimal" className={inputClass} value={numberValue(item.height_m)} onChange={(e) => updateCargoItem(index, { height_m: parseNumber(e.target.value) })} />
                      </Field>
                      <Field label="Vikt (ton)">
                        <input inputMode="decimal" className={inputClass} value={numberValue(item.weight_ton)} onChange={(e) => updateCargoItem(index, { weight_ton: parseNumber(e.target.value) })} />
                      </Field>
                      <Field label="Antal">
                        <input inputMode="numeric" className={inputClass} value={numberValue(item.quantity)} onChange={(e) => updateCargoItem(index, { quantity: parseNumber(e.target.value) })} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Field label="Övrig information">
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={form.special_requirements}
                onChange={(e) => update("special_requirements", e.target.value)}
                placeholder="Tillstånd, följebil, lyft, ritningar, tidsfönster..."
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">
                <Send size={15} /> Skicka bokning
              </Button>
            </div>
          </form>
        </Panel>

        <aside className="space-y-4">
          {customer?.freight_calculator_enabled && <CustomerFreightCalculatorPanel />}

          <Panel title="Mina bokningar">
            <div className="space-y-3">
              {bookings.map((p) => {
                const loading = p.locations?.find((l) => l.type === "lastning");
                const unloading = p.locations?.find((l) => l.type === "lossning");
                const approval = p.booking_approval_status;
                const customerNotes = (p.notes ?? []).filter((note) => note.visibility === "customer");
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openBookingDetails(p.id)}
                    className="w-full rounded-lg border border-border p-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{p.project_number}</div>
                        <div className="line-clamp-2 text-sm text-slate-600">{p.name}</div>
                      </div>
                      <Truck size={16} className="mt-0.5 shrink-0 text-slate-400" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {approval && <span className={`status-pill ${APPROVAL_STYLES[approval]}`}>{approval}</span>}
                      <StatusBadge status={PROJECT_STATUSES.includes(p.status) ? p.status : "Ny"} />
                      {p.edit_requested_at && <span className="status-pill bg-blue-100 text-blue-700">Ändring begärd</span>}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Package size={12} /> {p.cargo_items?.[0]?.description ?? "Gods saknas"}
                        {(p.cargo_items?.length ?? 0) > 1 ? ` + ${(p.cargo_items?.length ?? 1) - 1} rad(er)` : ""}
                      </div>
                      <div>{loading?.name ?? "Lastning saknas"} → {unloading?.name ?? "Lossning saknas"}</div>
                      <div className="flex items-center gap-1"><Clock size={12} /> Lastning {formatDateAndTime(p.planned_loading_date, p.planned_loading_time)}</div>
                    </div>
                    {customerNotes.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-700">
                          <MessageSquareText size={13} /> Kommentarer från JK
                        </div>
                        <div className="space-y-2">
                          {customerNotes.map((note) => (
                            <div key={note.id} className="rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                                <span>{note.user_name}</span>
                                <span>{formatDateTime(note.date)}</span>
                              </div>
                              <p>{note.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
              {bookings.length === 0 && <p className="text-sm text-slate-500">Inga bokningar ännu.</p>}
            </div>
          </Panel>
        </aside>
      </main>

      <Modal open={Boolean(openBooking)} onClose={() => setOpenBookingId(null)} title={openBooking?.project_number ?? "Bokning"} wide>
        {openBooking && (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium text-slate-800">{openBooking.name}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {openBooking.booking_approval_status && (
                  <span className={`status-pill ${APPROVAL_STYLES[openBooking.booking_approval_status]}`}>{openBooking.booking_approval_status}</span>
                )}
                <StatusBadge status={PROJECT_STATUSES.includes(openBooking.status) ? openBooking.status : "Ny"} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Lastning</div>
                <div className="text-slate-700">{openBooking.locations?.find((l) => l.type === "lastning")?.name ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Lossning</div>
                <div className="text-slate-700">{openBooking.locations?.find((l) => l.type === "lossning")?.name ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Planerad lastning</div>
                <div className="text-slate-700">{formatDateAndTime(openBooking.planned_loading_date, openBooking.planned_loading_time)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Planerad lossning</div>
                <div className="text-slate-700">{formatDateAndTime(openBooking.planned_delivery_date, openBooking.planned_delivery_time)}</div>
              </div>
            </div>

            {(openBooking.cargo_items?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Gods</div>
                <ul className="space-y-1 text-sm text-slate-600">
                  {openBooking.cargo_items?.map((item, index) => (
                    <li key={item.id ?? index}>{item.description}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dokument</div>
              {canSelfServeBooking(openBooking) ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={generatingKind !== null} onClick={() => void handleGenerateDocument(openBooking, "domestic-waybill")}>
                      {generatingKind === "domestic-waybill" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      Generera fraktsedel
                    </Button>
                    <Button type="button" variant="secondary" disabled={generatingKind !== null} onClick={() => void handleGenerateDocument(openBooking, "cmr")}>
                      {generatingKind === "cmr" ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
                      Generera CMR
                    </Button>
                  </div>
                  {docError && <p className="mt-2 text-xs text-red-600">{docError}</p>}
                  {(openBooking.documents?.length ?? 0) > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-500">
                      {openBooking.documents?.map((doc) => (
                        <li key={doc.id}>
                          {doc.file_url ? (
                            <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-orange-600 hover:text-orange-700">
                              {doc.file_name}
                            </a>
                          ) : (
                            doc.file_name
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">Dokument kan genereras när bokningen är godkänd av JK.</p>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Pencil size={13} /> Begär ändring
              </div>
              {openBooking.edit_requested_at && (
                <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Ändringsbegäran skickad {formatDateTime(openBooking.edit_requested_at)}: {openBooking.edit_request_message}. JK hanterar den så snart som möjligt.
                </div>
              )}
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                placeholder="Beskriv vad som behöver ändras i bokningen..."
              />
              {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
              <div className="mt-2 flex justify-end">
                <Button type="button" variant="secondary" disabled={editSubmitting} onClick={() => void handleRequestEdit(openBooking.id)}>
                  {editSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Skicka ändringsbegäran
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
