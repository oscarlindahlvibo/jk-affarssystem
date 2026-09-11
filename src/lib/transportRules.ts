// Regelmotor för när en transport kräver skylt/följebil/vägtransportledare/dispens,
// baserat på Transportstyrelsens och Trafikverkets regler för dispens-/bredlasttransporter.
//
// Källor (kontrollera alltid mot aktuellt dispensbeslut – detta är vägledande, inte juridiskt bindande):
// - Transportstyrelsen, "Regler om vägtransportledare"
// - Transportstyrelsen, "Odelbar last och fordon som överskrider vikt- och dimensionsbestämmelser"
// - Trafikverket, handbok Dispenstransporter (TSFS 2023:37 m.fl.)

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

const WIDTH_SIGN_LIMIT = 2.6; // över denna: skylt "Bred last", ev. dispens för odelbar last
const WIDTH_ESCORT_LIMIT = 3.1; // över denna: följebil krävs
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

export const RULE_SOURCE_NOTE =
  "Baserat på Transportstyrelsens och Trafikverkets regler för dispens-/bredlasttransporter, oavsett vald transporttyp. Vägledande – kontrollera alltid mot det faktiska dispensbeslutet för aktuell transport och rutt.";
