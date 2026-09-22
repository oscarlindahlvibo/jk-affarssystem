export interface FreightCategory {
  id: number;
  name: string;
  image: string;
  maxWeightKg: number | null;
  maxHeightMm: number | null;
  maxLengthMm: number | null;
  maxWidthMm: number | null;
  weightBufferKg: number;
  craneWeightBufferKg: number;
  vtlWeightThresholdKg: number | null;
  permitWidthMm: number | null;
  permitWeightKg: number | null;
  routeHeightMm: number | null;
  routeWidthMm: number | null;
  pricePer10Km: number;
  fixedUnder200Km: number;
  fixedSurcharge: number;
  routeCheckPer10Km: number;
  routeCheckUnder200Km: number;
}

export interface CranePrice {
  minWeightKg: number;
  rangeLabel: string;
  crane: string;
  cost: number;
  establishmentNorthCost: number;
}

export interface FreightCalculatorConfig {
  dmt: number;
  margin: number;
  wideLoadThresholdMm: number;
  wideLoadTransportIncrease: number;
  wideLoadRouteCheckIncrease: number;
  followVehicleWidthMm: number;
  followVehicleWeightKg: number;
  vtlWidthMm: number;
  extraCosts: {
    cityVtlMobileCrane: number;
    siteInspection: number;
    siteDelivery: number;
    permit: number;
    denmarkZealand: number;
    denmarkJutlandFunen: number;
  };
  categories: FreightCategory[];
  cranes: CranePrice[];
}

export interface FreightCalculationInput {
  distanceKm: number;
  weightKg: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  cityVtlMobileCrane: boolean;
  siteInspection: boolean;
  siteDelivery: boolean;
  establishmentNorth: boolean;
  denmarkZealand: boolean;
  denmarkJutlandFunen: boolean;
}

export interface FreightCostLine {
  label: string;
  amount: number;
}

export interface FreightCalculationResult {
  selectedCategory: FreightCategory | null;
  vehicleCandidates: Array<{ category: FreightCategory; possible: boolean; transportCost: number; reason?: string }>;
  warning: string | null;
  requirements: {
    followVehicle: boolean;
    vtl: boolean;
    cityVtlMobileCrane: boolean;
    permit: boolean;
    routeCheck: boolean;
  };
  crane: CranePrice | null;
  lines: FreightCostLine[];
  total: number;
}

export const DEFAULT_FREIGHT_CALCULATOR_CONFIG: FreightCalculatorConfig = {
  dmt: 0,
  margin: 0.15,
  wideLoadThresholdMm: 3600,
  wideLoadTransportIncrease: 0.1,
  wideLoadRouteCheckIncrease: 0.1,
  followVehicleWidthMm: 3100,
  followVehicleWeightKg: 30000,
  vtlWidthMm: 4100,
  extraCosts: {
    cityVtlMobileCrane: 10000,
    siteInspection: 7000,
    siteDelivery: 7000,
    permit: 1800,
    denmarkZealand: 2500,
    denmarkJutlandFunen: 5500,
  },
  categories: [
    { id: 1, name: "2 axl låglastare", image: "/calculator/image2.png", maxWeightKg: 20000, maxHeightMm: 4120, maxLengthMm: 11000, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: null, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: 4120, routeWidthMm: 4100, pricePer10Km: 480, fixedUnder200Km: 14000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 2, name: "3 axl låglastare", image: "/calculator/image3.png", maxWeightKg: 36000, maxHeightMm: 4120, maxLengthMm: 11000, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 33000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: 4120, routeWidthMm: 4100, pricePer10Km: 520, fixedUnder200Km: 16000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 3, name: "3 axl låglastare med balk", image: "/calculator/image4.png", maxWeightKg: 40000, maxHeightMm: 4120, maxLengthMm: 14700, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 35000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: 4120, routeWidthMm: 4100, pricePer10Km: 520, fixedUnder200Km: 16000, fixedSurcharge: 5000, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 4, name: "4 axl låglastare", image: "/calculator/image5.png", maxWeightKg: 54000, maxHeightMm: 4120, maxLengthMm: 12500, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 35000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: 4120, routeWidthMm: 4100, pricePer10Km: 760, fixedUnder200Km: 20000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 5, name: "2 + 4 SL/ET låglastare", image: "/calculator/image6.png", maxWeightKg: 60000, maxHeightMm: 4400, maxLengthMm: 16000, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 25000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: 4000, routeWidthMm: 4100, pricePer10Km: 800, fixedUnder200Km: 20000, fixedSurcharge: 8000, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 6, name: "6 axl jumbo", image: "/calculator/image7.png", maxWeightKg: 60000, maxHeightMm: 3500, maxLengthMm: 15500, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 45000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: null, routeWidthMm: 4300, pricePer10Km: 760, fixedUnder200Km: 20000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 7, name: "4 axl jumbo", image: "/calculator/image8.png", maxWeightKg: 36000, maxHeightMm: 3600, maxLengthMm: 15000, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: 40000, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: null, routeWidthMm: 4300, pricePer10Km: 440, fixedUnder200Km: 13000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 8, name: "3 axl jumbo", image: "/calculator/image9.png", maxWeightKg: 28000, maxHeightMm: 3600, maxLengthMm: 15000, maxWidthMm: 4500, weightBufferKg: 2000, craneWeightBufferKg: 2000, vtlWeightThresholdKg: null, permitWidthMm: 3500, permitWeightKg: 30000, routeHeightMm: null, routeWidthMm: 4300, pricePer10Km: 400, fixedUnder200Km: 12000, fixedSurcharge: 0, routeCheckPer10Km: 190, routeCheckUnder200Km: 13500 },
    { id: 10, name: "Följebil", image: "/calculator/image11.png", maxWeightKg: null, maxHeightMm: null, maxLengthMm: null, maxWidthMm: null, weightBufferKg: 0, craneWeightBufferKg: 0, vtlWeightThresholdKg: null, permitWidthMm: null, permitWeightKg: null, routeHeightMm: null, routeWidthMm: null, pricePer10Km: 240, fixedUnder200Km: 8000, fixedSurcharge: 0, routeCheckPer10Km: 0, routeCheckUnder200Km: 0 },
    { id: 11, name: "VTL", image: "/calculator/image12.png", maxWeightKg: null, maxHeightMm: null, maxLengthMm: null, maxWidthMm: null, weightBufferKg: 0, craneWeightBufferKg: 0, vtlWeightThresholdKg: null, permitWidthMm: null, permitWeightKg: null, routeHeightMm: null, routeWidthMm: null, pricePer10Km: 280, fixedUnder200Km: 12500, fixedSurcharge: 0, routeCheckPer10Km: 0, routeCheckUnder200Km: 0 },
  ],
  cranes: [
    { minWeightKg: 5000, rangeLabel: "5000-16999", crane: "70 ton", cost: 12800, establishmentNorthCost: 4000 },
    { minWeightKg: 17000, rangeLabel: "17000-19999", crane: "90 ton", cost: 29500, establishmentNorthCost: 4000 },
    { minWeightKg: 20000, rangeLabel: "20000-24999", crane: "100 ton", cost: 34592, establishmentNorthCost: 4000 },
    { minWeightKg: 25000, rangeLabel: "25000-29999", crane: "110 ton", cost: 40000, establishmentNorthCost: 4000 },
    { minWeightKg: 30000, rangeLabel: "30000-34999", crane: "130 ton", cost: 42376, establishmentNorthCost: 4000 },
    { minWeightKg: 35000, rangeLabel: "35000-39999", crane: "150 ton", cost: 51092, establishmentNorthCost: 4000 },
    { minWeightKg: 40000, rangeLabel: "40000-44999", crane: "160 ton", cost: 56100, establishmentNorthCost: 5000 },
    { minWeightKg: 45000, rangeLabel: "45000-49999", crane: "160 ton", cost: 56100, establishmentNorthCost: 5000 },
    { minWeightKg: 50000, rangeLabel: "50000-54999", crane: "200 ton", cost: 62300, establishmentNorthCost: 5000 },
    { minWeightKg: 55000, rangeLabel: "55000-59999", crane: "220 ton", cost: 68000, establishmentNorthCost: 5000 },
    { minWeightKg: 60000, rangeLabel: "60000-70000", crane: "250 ton", cost: 70000, establishmentNorthCost: 8000 },
  ],
};

function withMargin(value: number, config: FreightCalculatorConfig) {
  return value * (1 + config.margin);
}

function withDmtAndMargin(value: number, config: FreightCalculatorConfig) {
  return (value + value * config.dmt) * (1 + config.margin);
}

function pricedTransport(category: FreightCategory, distanceKm: number, config: FreightCalculatorConfig, widthMm: number) {
  const distance10Km = distanceKm / 10;
  const isService = category.id >= 10;
  const per10Km = isService ? withMargin(category.pricePer10Km, config) : withDmtAndMargin(category.pricePer10Km, config);
  const fixedUnder200 = withMargin(category.fixedUnder200Km, config);
  const fixedSurcharge = isService ? withMargin(category.fixedSurcharge, config) : withDmtAndMargin(category.fixedSurcharge, config);
  const base = distance10Km < 20 ? fixedUnder200 + fixedSurcharge : distance10Km * per10Km + fixedSurcharge;
  const wideIncrease = category.id <= 5 && widthMm > config.wideLoadThresholdMm ? 1 + config.wideLoadTransportIncrease : 1;
  return base * wideIncrease;
}

function routeCheckCost(category: FreightCategory, input: FreightCalculationInput, config: FreightCalculatorConfig) {
  const needsHeight = category.routeHeightMm !== null && input.heightMm > category.routeHeightMm;
  const needsWidth = category.routeWidthMm !== null && input.widthMm > category.routeWidthMm;
  if (!needsHeight && !needsWidth) return 0;
  const distance10Km = input.distanceKm / 10;
  const per10Km = withDmtAndMargin(category.routeCheckPer10Km, config);
  const fixedUnder200 = withMargin(category.routeCheckUnder200Km, config);
  const base = distance10Km < 20 ? fixedUnder200 : distance10Km * per10Km;
  const wideIncrease = category.id <= 5 && input.widthMm > config.wideLoadThresholdMm ? 1 + config.wideLoadRouteCheckIncrease : 1;
  return base * wideIncrease;
}

function possibleReason(category: FreightCategory, input: FreightCalculationInput) {
  if (category.maxWeightKg !== null && input.weightKg + category.weightBufferKg > category.maxWeightKg) return "Vikt";
  if (category.maxLengthMm !== null && input.lengthMm > category.maxLengthMm) return "Längd";
  if (category.maxWidthMm !== null && input.widthMm > category.maxWidthMm) return "Bredd";
  if (category.maxHeightMm !== null && input.heightMm > category.maxHeightMm) return "Höjd";
  return null;
}

export function calculateFreight(input: FreightCalculationInput, config: FreightCalculatorConfig): FreightCalculationResult {
  const vehicleCategories = config.categories.filter((category) => category.id <= 8);
  const vehicleCandidates = vehicleCategories.map((category) => {
    const reason = possibleReason(category, input);
    return {
      category,
      possible: !reason,
      transportCost: pricedTransport(category, input.distanceKm, config, input.widthMm),
      reason: reason ?? undefined,
    };
  });
  const possible = vehicleCandidates.filter((candidate) => candidate.possible);
  const selected = possible.sort((a, b) => a.transportCost - b.transportCost)[0] ?? null;
  const selectedCategory = selected?.category ?? null;
  const serviceFollow = config.categories.find((category) => category.id === 10);
  const serviceVtl = config.categories.find((category) => category.id === 11);

  const followVehicle = input.widthMm > config.followVehicleWidthMm || input.weightKg + 2000 > config.followVehicleWeightKg;
  const vtl =
    input.widthMm > config.vtlWidthMm ||
    Boolean(selectedCategory?.vtlWeightThresholdKg && input.weightKg + selectedCategory.weightBufferKg > selectedCategory.vtlWeightThresholdKg);
  const permit = Boolean(
    selectedCategory &&
      ((selectedCategory.permitWidthMm !== null && input.widthMm > selectedCategory.permitWidthMm) ||
        (selectedCategory.permitWeightKg !== null && input.weightKg > selectedCategory.permitWeightKg))
  );
  const routeCheck = selectedCategory ? routeCheckCost(selectedCategory, input, config) > 0 : false;

  const craneWeight = input.weightKg + (selectedCategory?.craneWeightBufferKg ?? 0);
  const crane = [...config.cranes].sort((a, b) => b.minWeightKg - a.minWeightKg).find((row) => craneWeight >= row.minWeightKg) ?? null;

  const lines: FreightCostLine[] = [];
  if (selectedCategory) lines.push({ label: "Grundkostnad transport", amount: selected?.transportCost ?? 0 });
  if (followVehicle && serviceFollow) lines.push({ label: "Följebil", amount: pricedTransport(serviceFollow, input.distanceKm, config, input.widthMm) });
  if (vtl && serviceVtl) lines.push({ label: "VTL", amount: pricedTransport(serviceVtl, input.distanceKm, config, input.widthMm) });
  if (input.cityVtlMobileCrane) lines.push({ label: "VTL tillägg mobilkran storstad", amount: withMargin(config.extraCosts.cityVtlMobileCrane, config) });
  if (routeCheck && selectedCategory) lines.push({ label: "Vägrekning", amount: routeCheckCost(selectedCategory, input, config) });
  if (input.siteInspection) lines.push({ label: "Besiktning av site", amount: withMargin(config.extraCosts.siteInspection, config) });
  if (input.siteDelivery) lines.push({ label: "Leverans på site", amount: withMargin(config.extraCosts.siteDelivery, config) });
  if (permit) lines.push({ label: "Dispens", amount: withMargin(config.extraCosts.permit, config) });
  if (crane) lines.push({ label: `Grundkostnad mobilkran (${crane.crane})`, amount: withMargin(crane.cost, config) });
  if (input.denmarkZealand) lines.push({ label: "Leverans Danmark, Själland", amount: config.extraCosts.denmarkZealand });
  if (input.denmarkJutlandFunen) lines.push({ label: "Leverans Danmark, Jylland/Fyn", amount: config.extraCosts.denmarkJutlandFunen });
  if (input.establishmentNorth && crane) lines.push({ label: "Etableringskostnad mobilkran", amount: withMargin(crane.establishmentNorthCost, config) });

  return {
    selectedCategory,
    vehicleCandidates,
    warning: selectedCategory ? null : "Angiven vikt eller mått överskrider tillåtna värden. Kontakta JK Projektlogistik AB.",
    requirements: { followVehicle, vtl, cityVtlMobileCrane: input.cityVtlMobileCrane, permit, routeCheck },
    crane,
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}
