import { History, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { useStore } from "../data/store";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { Panel } from "../components/ui/Panel";
import { DEFAULT_FREIGHT_CALCULATOR_CONFIG, type FreightCalculatorConfig } from "../lib/freightCalculator";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberInput(value: number | null, onChange: (value: number) => void, suffix?: string) {
  return (
    <div className="flex items-center gap-2">
      <input inputMode="decimal" className={inputClass} value={value ?? ""} onChange={(e) => onChange(toNumber(e.target.value))} />
      {suffix && <span className="w-10 shrink-0 text-xs text-slate-500">{suffix}</span>}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatValue(value: string | number | boolean | null) {
  if (value === null) return "Tomt";
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  if (typeof value === "number") return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(value);
  return value;
}

function valueCountText(count: number) {
  return `${count} värde${count === 1 ? "" : "n"}`;
}

export function FreightCalculatorSettingsPage() {
  const { freightCalculatorConfig, freightCalculatorChangeLog, updateFreightCalculatorConfig, resetFreightCalculatorConfig } = useStore();
  const [draft, setDraft] = useState<FreightCalculatorConfig>(freightCalculatorConfig);
  const [saved, setSaved] = useState<string | null>(null);

  function save() {
    const entry = updateFreightCalculatorConfig(draft);
    setSaved(entry ? `Sparat. ${valueCountText(entry.changes.length)} loggades.` : "Inga ändringar att spara.");
    window.setTimeout(() => setSaved(null), 2500);
  }

  function updateCategory(id: number, patch: Partial<FreightCalculatorConfig["categories"][number]>) {
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.map((category) => (category.id === id ? { ...category, ...patch } : category)),
    }));
  }

  function updateCrane(index: number, patch: Partial<FreightCalculatorConfig["cranes"][number]>) {
    setDraft((prev) => ({
      ...prev,
      cranes: prev.cranes.map((crane, i) => (i === index ? { ...crane, ...patch } : crane)),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Räknesnurra</h2>
          <p className="text-sm text-slate-500">Administrera priser och gränsvärden från JK:s Excel-räknesnurra.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const entry = resetFreightCalculatorConfig();
              setDraft(DEFAULT_FREIGHT_CALCULATOR_CONFIG);
              setSaved(entry ? `Återställt. ${valueCountText(entry.changes.length)} loggades.` : "Räknesnurran var redan återställd.");
              window.setTimeout(() => setSaved(null), 2500);
            }}
          >
            <RotateCcw size={14} /> Återställ
          </Button>
          <Button onClick={save}>
            <Save size={14} /> Spara
          </Button>
        </div>
      </div>
      {saved && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{saved}</div>}

      <Panel title="Globala påslag och gränser">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="DMT">
            {numberInput(draft.dmt * 100, (value) => setDraft((prev) => ({ ...prev, dmt: value / 100 })), "%")}
          </Field>
          <Field label="Påslag marginal">
            {numberInput(draft.margin * 100, (value) => setDraft((prev) => ({ ...prev, margin: value / 100 })), "%")}
          </Field>
          <Field label="Bred last från">
            {numberInput(draft.wideLoadThresholdMm, (value) => setDraft((prev) => ({ ...prev, wideLoadThresholdMm: value })), "mm")}
          </Field>
          <Field label="Höjning grundtransport">
            {numberInput(draft.wideLoadTransportIncrease * 100, (value) => setDraft((prev) => ({ ...prev, wideLoadTransportIncrease: value / 100 })), "%")}
          </Field>
          <Field label="Höjning vägrekning">
            {numberInput(draft.wideLoadRouteCheckIncrease * 100, (value) => setDraft((prev) => ({ ...prev, wideLoadRouteCheckIncrease: value / 100 })), "%")}
          </Field>
          <Field label="Följebil bredd från">
            {numberInput(draft.followVehicleWidthMm, (value) => setDraft((prev) => ({ ...prev, followVehicleWidthMm: value })), "mm")}
          </Field>
        </div>
      </Panel>

      <Panel title="Övriga kostnader">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Object.entries(draft.extraCosts).map(([key, value]) => (
            <Field key={key} label={EXTRA_LABELS[key] ?? key}>
              {numberInput(value, (next) => setDraft((prev) => ({ ...prev, extraCosts: { ...prev.extraCosts, [key]: next } })), "kr")}
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="Fordonskategorier och tjänster">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2">Max vikt</th>
                <th className="px-3 py-2">Max L/B/H</th>
                <th className="px-3 py-2">SEK/mil</th>
                <th className="px-3 py-2">Fast under 20 mil</th>
                <th className="px-3 py-2">Fast tillägg</th>
                <th className="px-3 py-2">Vägrekning/mil</th>
                <th className="px-3 py-2">Vägrek under 20 mil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draft.categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">Kategori {category.id}</div>
                    <input className={`${inputClass} mt-1`} value={category.name} onChange={(e) => updateCategory(category.id, { name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">{category.maxWeightKg === null ? "–" : numberInput(category.maxWeightKg, (value) => updateCategory(category.id, { maxWeightKg: value }))}</td>
                  <td className="px-3 py-2">
                    <div className="grid grid-cols-3 gap-1">
                      <input className={inputClass} value={category.maxLengthMm ?? ""} onChange={(e) => updateCategory(category.id, { maxLengthMm: toNumber(e.target.value) })} />
                      <input className={inputClass} value={category.maxWidthMm ?? ""} onChange={(e) => updateCategory(category.id, { maxWidthMm: toNumber(e.target.value) })} />
                      <input className={inputClass} value={category.maxHeightMm ?? ""} onChange={(e) => updateCategory(category.id, { maxHeightMm: toNumber(e.target.value) })} />
                    </div>
                  </td>
                  <td className="px-3 py-2">{numberInput(category.pricePer10Km, (value) => updateCategory(category.id, { pricePer10Km: value }))}</td>
                  <td className="px-3 py-2">{numberInput(category.fixedUnder200Km, (value) => updateCategory(category.id, { fixedUnder200Km: value }))}</td>
                  <td className="px-3 py-2">{numberInput(category.fixedSurcharge, (value) => updateCategory(category.id, { fixedSurcharge: value }))}</td>
                  <td className="px-3 py-2">{numberInput(category.routeCheckPer10Km, (value) => updateCategory(category.id, { routeCheckPer10Km: value }))}</td>
                  <td className="px-3 py-2">{numberInput(category.routeCheckUnder200Km, (value) => updateCategory(category.id, { routeCheckUnder200Km: value }))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Mobilkranar">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {draft.cranes.map((crane, index) => (
            <div key={`${crane.minWeightKg}-${index}`} className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-medium text-slate-800">{crane.rangeLabel}</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kran">
                  <input className={inputClass} value={crane.crane} onChange={(e) => updateCrane(index, { crane: e.target.value })} />
                </Field>
                <Field label="Lossningskostnad">
                  {numberInput(crane.cost, (value) => updateCrane(index, { cost: value }))}
                </Field>
                <Field label="Etablering norr">
                  {numberInput(crane.establishmentNorthCost, (value) => updateCrane(index, { establishmentNorthCost: value }))}
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Ändringslogg"
        action={
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <History size={14} /> {freightCalculatorChangeLog.length} poster
          </div>
        }
      >
        <div className="space-y-4">
          {freightCalculatorChangeLog.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{formatDate(entry.changedAt)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {entry.source === "excel" ? "Excel" : "App"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{entry.summary}</p>
                </div>
                <div className="text-xs text-slate-500">{entry.changedBy}</div>
              </div>
              {entry.changes.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-b border-border text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Värde</th>
                        <th className="px-3 py-2 font-medium">Före</th>
                        <th className="px-3 py-2 font-medium">Efter</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entry.changes.map((change) => (
                        <tr key={change.path}>
                          <td className="py-2 pr-3 font-medium text-slate-700">{change.label}</td>
                          <td className="px-3 py-2 text-slate-500">{formatValue(change.before)}</td>
                          <td className="px-3 py-2 text-slate-800">{formatValue(change.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

const EXTRA_LABELS: Record<string, string> = {
  cityVtlMobileCrane: "VTL mobilkran storstad",
  siteInspection: "Besiktning av site",
  siteDelivery: "Leverans på site",
  permit: "Dispenskostnader",
  denmarkZealand: "Danmark, Själland",
  denmarkJutlandFunen: "Danmark, Jylland/Fyn",
};
