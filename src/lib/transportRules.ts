// Regelmotor för när en transport kräver skylt/följebil/vägtransportledare/dispens,
// baserat på Transportstyrelsens och Trafikverkets regler för dispens-/bredlasttransporter.
//
// Källor (kontrollera alltid mot aktuellt dispensbeslut – detta är vägledande, inte juridiskt bindande):
// - Transportstyrelsen, "Regler om vägtransportledare"
// - Transportstyrelsen, "Odelbar last och fordon som överskrider vikt- och dimensionsbestämmelser"
// - Trafikverket, handbok Dispenstransporter (TSFS 2023:37 m.fl.)

import type { TaskCategory } from "../types";

export type RuleSeverity = "info" | "warning" | "critical";

export interface TransportRule {
  id: string;
  severity: RuleSeverity;
  label: string;
  detail: string;
}

export interface CargoDimensions {
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  weight_ton: number | null;
}

export interface SuggestedTransportTask {
  task: string;
  category: TaskCategory;
  description: string;
}

const WIDTH_SIGN_LIMIT = 2.6; // över denna: skylt "Bred last", ev. dispens för odelbar last
const WIDTH_ESCORT_LIMIT = 3.1; // över denna: följebil krävs
const WIDTH_PERMIT_LIMIT = 3.5; // över denna: dispenshantering behövs normalt
const WIDTH_ROUTE_CHECK_LIMIT = 4.1; // över denna: färdväg bör kontrolleras i detalj
const WIDTH_PILOT_LIMIT = 4.5; // över denna: vägtransportledare istället för vanlig följebil
const LENGTH_STANDARD_LIMIT = 24.0; // standardgräns för fordonståg
const LENGTH_PERMIT_LIMIT = 30.0; // över denna krävs dispens för längd
const LENGTH_PILOT_LIMIT = 35.0; // över denna krävs vägtransportledare
const HEIGHT_ROUTE_CHECK_LIMIT = 4.5; // över denna: kontrollera fri höjd på rutten
const WEIGHT_BK_CAUTION_LIMIT = 64; // ton – vanlig övre gräns på delar av vägnätet (BK1), kontrollera BK-klass

export function evaluateTransportRules(cargo: CargoDimensions): TransportRule[] {
  const rules: TransportRule[] = [];
  const { length_m: length, width_m: width, height_m: height, weight_ton: weight } = cargo;

  if (width !== null) {
    if (width > WIDTH_PILOT_LIMIT) {
      rules.push({
        id: "vtl-bredd",
        severity: "critical",
        label: "Vägtransportledare krävs",
        detail: `Bredd ${width} m överstiger ${WIDTH_PILOT_LIMIT} m – kräver vägtransportledare (särskilt förordnad eskort/polis), inte bara vanlig följebil.`,
      });
    } else if (width > WIDTH_ESCORT_LIMIT) {
      rules.push({
        id: "foljebil-bredd",
        severity: "warning",
        label: "Följebil krävs (fram)",
        detail: `Bredd ${width} m överstiger ${WIDTH_ESCORT_LIMIT} m – följebil krävs enligt Transportstyrelsens regler, oavsett om lasten är delbar eller ej.`,
      });
    } else if (width > WIDTH_SIGN_LIMIT) {
      rules.push({
        id: "bred-skylt",
        severity: "info",
        label: 'Skylt "Bred last" krävs',
        detail: `Bredd ${width} m överstiger ${WIDTH_SIGN_LIMIT} m – varningsskylt krävs. Odelbar last upp till ${WIDTH_ESCORT_LIMIT} m går normalt utan dispens.`,
      });
    }

    if (width > WIDTH_PERMIT_LIMIT) {
      rules.push({
        id: "dispens-bredd",
        severity: "warning",
        label: "Dispens krävs för bredden",
        detail: `Bredd ${width} m överstiger ${WIDTH_PERMIT_LIMIT} m – dispenshantering behöver planeras.`,
      });
    }

    if (width > WIDTH_ROUTE_CHECK_LIMIT) {
      rules.push({
        id: "bredd-ruttkontroll",
        severity: "warning",
        label: "Vägrekning/ruttkontroll rekommenderas",
        detail: `Bredd ${width} m överstiger ${WIDTH_ROUTE_CHECK_LIMIT} m – kontrollera framkomlighet och kritiska punkter på rutten.`,
      });
    }
  }

  if (length !== null) {
    if (length > LENGTH_PILOT_LIMIT) {
      rules.push({
        id: "vtl-langd",
        severity: "critical",
        label: "Vägtransportledare krävs",
        detail: `Längd ${length} m överstiger ${LENGTH_PILOT_LIMIT} m – kräver vägtransportledare.`,
      });
    } else if (length > LENGTH_PERMIT_LIMIT) {
      rules.push({
        id: "dispens-langd",
        severity: "warning",
        label: "Dispens krävs för längden",
        detail: `Längd ${length} m överstiger ${LENGTH_PERMIT_LIMIT} m – kräver dispensbeslut från väghållaren.`,
      });
    } else if (length > LENGTH_STANDARD_LIMIT) {
      rules.push({
        id: "langt-fordon",
        severity: "info",
        label: 'Skylt "Långt fordon" + följebil bak',
        detail: `Längd ${length} m överstiger standardgränsen ${LENGTH_STANDARD_LIMIT} m – märkning krävs och följebil bak behövs normalt.`,
      });
    }
  }

  if (width !== null && width > WIDTH_ESCORT_LIMIT && length !== null && length > LENGTH_PERMIT_LIMIT) {
    rules.push({
      id: "dubbel-foljebil",
      severity: "warning",
      label: "Följebil krävs både fram och bak",
      detail: `Lasten är både bred (över ${WIDTH_ESCORT_LIMIT} m) och lång (över ${LENGTH_PERMIT_LIMIT} m) – normalt krävs följebil i båda ändar.`,
    });
  }

  if (height !== null && height > HEIGHT_ROUTE_CHECK_LIMIT) {
    rules.push({
      id: "hojd-ruttkontroll",
      severity: "warning",
      label: "Ruttkontroll/färdvägsintyg rekommenderas",
      detail: `Höjd ${height} m överstiger ${HEIGHT_ROUTE_CHECK_LIMIT} m – kontrollera fri höjd på hela rutten (broar, ledningar, tunnlar) innan transport.`,
    });
  }

  if (weight !== null && weight > WEIGHT_BK_CAUTION_LIMIT) {
    rules.push({
      id: "bk-vikt",
      severity: "info",
      label: "Kontrollera bärighetsklass (BK)",
      detail: `Vikt ${weight} ton kan överstiga tillåten bruttovikt på delar av vägnätet – kontrollera BK-klass på rutten och ev. dispens för vikt.`,
    });
  }

  return rules;
}

const FOLLOW_VEHICLE_RULE_IDS = ["foljebil-bredd", "vtl-bredd", "vtl-langd", "dispens-langd", "langt-fordon", "dubbel-foljebil"];
const PILOT_RULE_IDS = ["vtl-bredd", "vtl-langd"];
const PERMIT_RULE_IDS = ["dispens-bredd", "dispens-langd", "bk-vikt"];
const ROUTE_CHECK_RULE_IDS = ["bredd-ruttkontroll", "hojd-ruttkontroll", "bk-vikt"];

function ruleSummary(cargoItems: CargoDimensions[], ruleIds: string[]) {
  return cargoItems
    .map((cargo, index) => ({
      index,
      rules: evaluateTransportRules(cargo).filter((rule) => ruleIds.includes(rule.id)),
    }))
    .filter((item) => item.rules.length > 0)
    .map((item) => `godsrad ${item.index + 1}: ${item.rules.map((rule) => rule.label).join(", ")}`)
    .join("; ");
}

// Gäller oavsett vald transporttyp (Specialtransport, Maskintransport, Krantransport,
// Styckegods, Container, Annat) – det är enbart lastens uppmätta dimensioner som styr,
// inte vilken typ av transport som valts i formuläret.
export function needsFollowVehicle(cargo: CargoDimensions): boolean {
  return evaluateTransportRules(cargo).some((r) => FOLLOW_VEHICLE_RULE_IDS.includes(r.id));
}

// Föreslår vilken uppgift som automatiskt bör läggas till i checklistan – oberoende av
// transporttyp/mall – baserat enbart på om måtten utlöser krav på följebil/vägtransportledare.
export function suggestedFollowVehicleTask(cargo: CargoDimensions): string | null {
  const rules = evaluateTransportRules(cargo);
  if (rules.some((r) => PILOT_RULE_IDS.includes(r.id))) return "Boka vägtransportledare";
  if (rules.some((r) => FOLLOW_VEHICLE_RULE_IDS.includes(r.id))) return "Boka följebil";
  return null;
}

export function suggestedTransportTasks(cargoItems: CargoDimensions[]): SuggestedTransportTask[] {
  const tasks: SuggestedTransportTask[] = [];
  const hasRule = (ruleIds: string[]) =>
    cargoItems.some((cargo) => evaluateTransportRules(cargo).some((rule) => ruleIds.includes(rule.id)));

  if (hasRule(FOLLOW_VEHICLE_RULE_IDS)) {
    tasks.push({
      task: "Boka följebil",
      category: "Följebil",
      description: `Föreslagen automatiskt utifrån godsets mått. ${ruleSummary(cargoItems, FOLLOW_VEHICLE_RULE_IDS)}`,
    });
  }

  if (hasRule(PILOT_RULE_IDS)) {
    tasks.push({
      task: "Boka vägtransportledare (VTL)",
      category: "Följebil",
      description: `Föreslagen automatiskt utifrån godsets mått. ${ruleSummary(cargoItems, PILOT_RULE_IDS)}`,
    });
  }

  if (hasRule(PERMIT_RULE_IDS)) {
    tasks.push({
      task: "Ansök om dispens",
      category: "Dispensansökan",
      description: `Föreslagen automatiskt utifrån godsets mått och/eller vikt. ${ruleSummary(cargoItems, PERMIT_RULE_IDS)}`,
    });
  }

  if (hasRule(ROUTE_CHECK_RULE_IDS)) {
    tasks.push({
      task: "Vägrekning / ruttkontroll",
      category: "Rekning",
      description: `Föreslagen automatiskt utifrån godsets höjd/vikt. ${ruleSummary(cargoItems, ROUTE_CHECK_RULE_IDS)}`,
    });
  }

  if (cargoItems.some((cargo) => (cargo.weight_ton ?? 0) >= 30 || (cargo.width_m ?? 0) > WIDTH_ESCORT_LIMIT || (cargo.height_m ?? 0) > HEIGHT_ROUTE_CHECK_LIMIT)) {
    tasks.push({
      task: "Besiktning av site",
      category: "Rekning",
      description: "Föreslagen automatiskt för tung, bred eller hög transport där lastnings-/lossningsplats bör kontrolleras.",
    });
  }

  return tasks;
}

export const RULE_SOURCE_NOTE =
  "Baserat på Transportstyrelsens och Trafikverkets regler för dispens-/bredlasttransporter, oavsett vald transporttyp. Vägledande – kontrollera alltid mot det faktiska dispensbeslutet för aktuell transport och rutt.";
