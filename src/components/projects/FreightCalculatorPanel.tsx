import { useMemo, useState } from "react";
import { Calculator, Save } from "lucide-react";
import { useStore } from "../../data/store";
import { calculateFreight, type FreightCalculationInput } from "../../lib/freightCalculator";
import type { Project } from "../../types";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

export function FreightCalculatorPanel({
  project,
  canApplyToFinance,
}: {
  project: Project;
  canApplyToFinance: boolean;
}) {
  const { freightCalculatorConfig, updateProjectFinance } = useStore();
  const cargoItems = project.cargo_items ?? [];
  const [cargoIndex, setCargoIndex] = useState(0);
  const selectedCargo = cargoItems[cargoIndex] ?? cargoItems[0];
  const [distanceKm, setDistanceKm] = useState(project.route_distance_km?.toString() ?? "270");
  const [inputOverrides, setInputOverrides] = useState({
    weightKg: "",
    lengthMm: "",
    widthMm: "",
    heightMm: "",
  });
  const [options, setOptions] = useState({
    cityVtlMobileCrane: false,
    siteInspection: true,
    siteDelivery: true,
    establishmentNorth: false,
    denmarkZealand: false,
    denmarkJutlandFunen: false,
  });

  const defaultInput = useMemo(
    () => ({
      weightKg: selectedCargo?.weight_ton ? selectedCargo.weight_ton * 1000 : 0,
      lengthMm: selectedCargo?.length_m ? selectedCargo.length_m * 1000 : 0,
      widthMm: selectedCargo?.width_m ? selectedCargo.width_m * 1000 : 0,
      heightMm: selectedCargo?.height_m ? selectedCargo.height_m * 1000 : 0,
    }),
    [selectedCargo]
  );

  const input: FreightCalculationInput = useMemo(
    () => ({
      distanceKm: toNumber(distanceKm),
      weightKg: inputOverrides.weightKg ? toNumber(inputOverrides.weightKg) : defaultInput.weightKg,
      lengthMm: inputOverrides.lengthMm ? toNumber(inputOverrides.lengthMm) : defaultInput.lengthMm,
      widthMm: inputOverrides.widthMm ? toNumber(inputOverrides.widthMm) : defaultInput.widthMm,
      heightMm: inputOverrides.heightMm ? toNumber(inputOverrides.heightMm) : defaultInput.heightMm,
      ...options,
    }),
    [defaultInput, distanceKm, inputOverrides, options]
  );

  const result = useMemo(() => calculateFreight(input, freightCalculatorConfig), [input, freightCalculatorConfig]);

  return (
    <Panel title="Räknesnurra">
      <div className="space-y-4">
        {cargoItems.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Godsrad">
                <select
                  className={inputClass}
                  value={cargoIndex}
                  onChange={(e) => {
                    setCargoIndex(Number(e.target.value));
                    setInputOverrides({ weightKg: "", lengthMm: "", widthMm: "", heightMm: "" });
                  }}
                >
                  {cargoItems.map((cargo, index) => (
                    <option key={cargo.id ?? index} value={index}>
                      {index + 1}. {cargo.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Avstånd">
                <div className="flex items-center gap-2">
                  <input inputMode="decimal" className={inputClass} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
                  <span className="text-xs text-slate-500">km</span>
                </div>
                {project.route_distance_km && (
                  <p className="mt-1 text-xs text-slate-500">
                    Hämtat från projektets beräknade transportsträcka. Kan justeras manuellt här.
                  </p>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Vikt">
                <input inputMode="decimal" className={inputClass} value={inputOverrides.weightKg || defaultInput.weightKg || ""} onChange={(e) => setInputOverrides((prev) => ({ ...prev, weightKg: e.target.value }))} />
              </Field>
              <Field label="Längd">
                <input inputMode="decimal" className={inputClass} value={inputOverrides.lengthMm || defaultInput.lengthMm || ""} onChange={(e) => setInputOverrides((prev) => ({ ...prev, lengthMm: e.target.value }))} />
              </Field>
              <Field label="Bredd">
                <input inputMode="decimal" className={inputClass} value={inputOverrides.widthMm || defaultInput.widthMm || ""} onChange={(e) => setInputOverrides((prev) => ({ ...prev, widthMm: e.target.value }))} />
              </Field>
              <Field label="Höjd">
                <input inputMode="decimal" className={inputClass} value={inputOverrides.heightMm || defaultInput.heightMm || ""} onChange={(e) => setInputOverrides((prev) => ({ ...prev, heightMm: e.target.value }))} />
              </Field>
            </div>
            <div className="-mt-2 text-xs text-slate-400">Mått anges i mm och vikt i kg. Projektets godsrad fyller i värden automatiskt.</div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ["cityVtlMobileCrane", "VTL mobilkran storstad"],
                ["siteInspection", "Besiktning av site"],
                ["siteDelivery", "Leverans på site"],
                ["establishmentNorth", "Etablering norr"],
                ["denmarkZealand", "Danmark, Själland"],
                ["denmarkJutlandFunen", "Danmark, Jylland/Fyn"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={options[key as keyof typeof options]}
                    onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>

            {result.warning ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{result.warning}</div>
            ) : (
              <div className="rounded-lg border border-border">
                <div className="flex items-center gap-3 border-b border-border p-3">
                  {result.selectedCategory?.image && (
                    <img src={result.selectedCategory.image} alt="" className="h-16 w-28 rounded bg-white object-contain" />
                  )}
                  <div>
                    <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      <Calculator size={13} /> Vald fordonskategori
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
                </div>
                <div className="divide-y divide-border">
                  {result.lines.map((line) => (
                    <div key={line.label} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-slate-600">{line.label}</span>
                      <span className="font-medium text-slate-800">{money(line.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                    <span>Total beräknad kostnad</span>
                    <span>{money(result.total)}</span>
                  </div>
                </div>
              </div>
            )}

            {canApplyToFinance && !result.warning && (
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={() => updateProjectFinance(project.id, { price: Math.round(result.total) })}>
                  <Save size={14} /> Använd som pris/offert
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Lägg till gods med mått och vikt för att använda räknesnurran.</p>
        )}
      </div>
    </Panel>
  );
}
