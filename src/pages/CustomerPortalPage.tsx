import { useMemo, useState } from "react";
import { CheckCircle2, Clock, LogOut, MapPin, Package, Plus, Route, Send, Truck, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useStore, type CustomerBookingCargoInput, type CustomerBookingInput } from "../data/store";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatDate } from "../lib/format";
import { calculateRouteDistance } from "../lib/routeDistance";
import { PROJECT_STATUSES, type BookingApprovalStatus, type TransportType } from "../types";

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
  planned_delivery_date: "",
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

export function CustomerPortalPage() {
  const { currentCustomerUser, signOut } = useAuth();
  const { customers, projects, submitCustomerBooking } = useStore();
  const [form, setForm] = useState<CustomerBookingInput>(initialForm);
  const [createdProjectNumber, setCreatedProjectNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distanceStatus, setDistanceStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [distanceMessage, setDistanceMessage] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === currentCustomerUser?.customer_id);
  const bookings = useMemo(
    () => [...projects].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [projects]
  );

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedProjectNumber(null);
    if (!form.loading_name.trim() || !form.unloading_name.trim() || !form.cargo_items.some((item) => item.description.trim())) {
      setError("Fyll i minst lastningsplats, lossningsplats och godsbeskrivning.");
      return;
    }
    try {
      const project = submitCustomerBooking(form);
      setCreatedProjectNumber(project.project_number);
      setForm(initialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bokningen kunde inte skickas.");
    }
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
              <Field label="Önskat leveransdatum">
                <input type="date" className={inputClass} value={form.planned_delivery_date} onChange={(e) => update("planned_delivery_date", e.target.value)} />
              </Field>
              <Field label="Kundens referens">
                <input className={inputClass} value={form.customer_reference} onChange={(e) => update("customer_reference", e.target.value)} placeholder="Ordernummer, projektnummer..." />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="space-y-3 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-slate-800">Lastning</h2>
                  <Field label="Plats">
                    <input required className={inputClass} value={form.loading_name} onChange={(e) => update("loading_name", e.target.value)} />
                  </Field>
                  <Field label="Adress">
                    <input className={inputClass} value={form.loading_address} onChange={(e) => update("loading_address", e.target.value)} />
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
                  <Field label="Plats">
                    <input required className={inputClass} value={form.unloading_name} onChange={(e) => update("unloading_name", e.target.value)} />
                  </Field>
                  <Field label="Adress">
                    <input className={inputClass} value={form.unloading_address} onChange={(e) => update("unloading_address", e.target.value)} />
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
          <Panel title="Mina bokningar">
            <div className="space-y-3">
              {bookings.map((p) => {
                const loading = p.locations?.find((l) => l.type === "lastning");
                const unloading = p.locations?.find((l) => l.type === "lossning");
                const approval = p.booking_approval_status;
                return (
                  <div key={p.id} className="rounded-lg border border-border p-3">
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
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Package size={12} /> {p.cargo_items?.[0]?.description ?? "Gods saknas"}
                        {(p.cargo_items?.length ?? 0) > 1 ? ` + ${(p.cargo_items?.length ?? 1) - 1} rad(er)` : ""}
                      </div>
                      <div>{loading?.name ?? "Lastning saknas"} → {unloading?.name ?? "Lossning saknas"}</div>
                      <div className="flex items-center gap-1"><Clock size={12} /> Lastning {formatDate(p.planned_loading_date)}</div>
                    </div>
                  </div>
                );
              })}
              {bookings.length === 0 && <p className="text-sm text-slate-500">Inga bokningar ännu.</p>}
            </div>
          </Panel>
        </aside>
      </main>
    </div>
  );
}
