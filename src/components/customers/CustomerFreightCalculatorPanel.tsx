import { useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { useStore } from "../../data/store";
import { calculateFreight, type FreightCalculationInput } from "../../lib/freightCalculator";
import { Field, inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

export function CustomerFreightCalculatorPanel() {
  const { freightCalculatorConfig } = useStore();
  const [distanceKm, setDistanceKm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [includeCrane, setIncludeCrane] = useState(false);

  const hasInput = Boolean(distanceKm && weightKg && lengthMm && widthMm && heightMm);

  const input: FreightCalculationInput = useMemo(
    () => ({
      distanceKm: toNumber(distanceKm),
      weightKg: toNumber(weightKg),
      lengthMm: toNumber(lengthMm),
      widthMm: toNumber(widthMm),
      heightMm: toNumber(heightMm),
      selectedCategoryId: null,
      includeCrane,
      cityVtlMobileCrane: false,
      siteInspection: false,
      siteDelivery: false,
      establishmentNorth: false,
      denmarkZealand: false,
      denmarkJutlandFunen: false,
    }),
    [distanceKm, heightMm, includeCrane, lengthMm, weightKg, widthMm]
  );

  const result = useMemo(() => (hasInput ? calculateFreight(input, freightCalculatorConfig) : null), [hasInput, input, freightCalculatorConfig]);

  return (
    <Panel title="Räknesnurra – uppskatta transportkostnad">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Avstånd (km)">
            <input inputMode="decimal" className={inputClass} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="270" />
          </Field>
          <Field label="Vikt (kg)">
            <input inputMode="decimal" className={inputClass} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="12000" />
          </Field>
          <Field label="Längd (mm)">
            <input inputMode="decimal" className={inputClass} value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} placeholder="8000" />
          </Field>
          <Field label="Bredd (mm)">
            <input inputMode="decimal" className={inputClass} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} placeholder="2600" />
          </Field>
          <Field label="Höjd (mm)">
            <input inputMode="decimal" className={inputClass} value={heightMm} onChange={(e) => setHeightMm(e.target.value)} placeholder="3200" />
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-slate-700">
          <input type="checkbox" checked={includeCrane} onChange={(e) => setIncludeCrane(e.target.checked)} />
          Behöver mobilkran vid lossning
        </label>

        {!hasInput && (
          <p className="text-sm text-slate-500">Fyll i avstånd, vikt och mått för att se en uppskattad kostnad.</p>
        )}

        {result && (
          result.warning ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{result.warning}</div>
          ) : (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border p-3">
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calculator size={13} /> Rekommenderat ekipage
                </div>
                <div className="font-semibold text-slate-800">
                  Kategori {result.selectedCategory?.id} · {result.selectedCategory?.name}
                </div>
                <div className="text-xs text-slate-500">
                  {result.requirements.followVehicle && "Följebil · "}
                  {result.requirements.vtl && "VTL · "}
                  {result.requirements.permit && "Dispens · "}
                  {result.requirements.routeCheck && "Vägrekning · "}
                  {result.crane ? `Mobilkran ${result.crane.crane}` : ""}
                </div>
              </div>
              <div className="flex items-center justify-between bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                <span>Uppskattad kostnad</span>
                <span>{money(result.total)}</span>
              </div>
            </div>
          )
        )}

        <div className="flex items-start gap-2 text-xs text-slate-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Priset är en uppskattning utifrån angivna mått och inte en bindande offert. Skicka en bokningsförfrågan för en exakt bekräftelse från JK.
        </div>
      </div>
    </Panel>
  );
}
