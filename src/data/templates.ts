import type { ProjectTemplateKey, TaskCategory } from "../types";

export const PROJECT_TEMPLATES: ProjectTemplateKey[] = [
  "Specialtransport",
  "Tungt lyft",
  "Ruttkontroll",
  "Följebil / dispens",
  "Transportförmedling",
  "Projektlogistik",
];

export const TEMPLATE_DESCRIPTIONS: Record<ProjectTemplateKey, string> = {
  Specialtransport: "Bred, hög eller lång last som kräver dispens och ruttkontroll.",
  "Tungt lyft": "Tunga eller otympliga kollin som kräver kranlyft och lyftplanering.",
  Ruttkontroll: "Fokus på att säkerställa framkomlighet innan transport bokas.",
  "Följebil / dispens": "Transport som kräver tillstånd och eskort.",
  Transportförmedling: "JK förmedlar transport till underleverantör, mindre egen planering.",
  Projektlogistik: "Flera samordnade transporter inom ett större projekt.",
};

export interface TemplateTaskDef {
  task: string;
  category: TaskCategory;
}

export const TEMPLATE_TASKS: Record<ProjectTemplateKey, TemplateTaskDef[]> = {
  Specialtransport: [
    { task: "Kontrollera transportmått", category: "Dokumentation" },
    { task: "Kontrollera vikt och lyftpunkter", category: "Dokumentation" },
    { task: "Reka lastningsplats", category: "Rekning" },
    { task: "Reka lossningsplats", category: "Rekning" },
    { task: "Bedöm behov av ruttmätning", category: "Rekning" },
    { task: "Begär pris från transportör", category: "Bokning" },
    { task: "Kontrollera behov av dispens", category: "Dispensansökan" },
    { task: "Boka följebil vid behov", category: "Följebil" },
    { task: "Skicka information till kund", category: "Övrigt" },
    { task: "Markera klar för fakturering", category: "Övrigt" },
  ],
  "Tungt lyft": [
    { task: "Kontrollera vikt och tyngdpunkt", category: "Dokumentation" },
    { task: "Kontrollera lyftpunkter och lyftplan", category: "Dokumentation" },
    { task: "Beställ kran med rätt kapacitet", category: "Bokning" },
    { task: "Reka markförhållanden på plats", category: "Rekning" },
    { task: "Begär pris från kranleverantör", category: "Bokning" },
    { task: "Skicka information till kund", category: "Övrigt" },
    { task: "Markera klar för fakturering", category: "Övrigt" },
  ],
  Ruttkontroll: [
    { task: "Samla in transportmått", category: "Dokumentation" },
    { task: "Reka hela sträckan", category: "Rekning" },
    { task: "Granska mätpunkter och marginaler", category: "Rekning" },
    { task: "Åtgärda kritiska punkter", category: "Rekning" },
    { task: "Godkänn rutt för transport", category: "Övrigt" },
  ],
  "Följebil / dispens": [
    { task: "Kontrollera dispensbehov", category: "Dispensansökan" },
    { task: "Ansök om tillstånd hos Trafikverket", category: "Dispensansökan" },
    { task: "Boka följebil", category: "Följebil" },
    { task: "Boka vägtransportledare vid behov", category: "Följebil" },
    { task: "Bekräfta tillstånd innan lastning", category: "Tillstånd" },
  ],
  Transportförmedling: [
    { task: "Begär pris från transportör", category: "Bokning" },
    { task: "Bekräfta bokning med transportör", category: "Bokning" },
    { task: "Skicka transportinstruktion till transportör", category: "Övrigt" },
    { task: "Bekräfta lastning", category: "Övrigt" },
    { task: "Skicka information till kund", category: "Övrigt" },
    { task: "Markera klar för fakturering", category: "Övrigt" },
  ],
  Projektlogistik: [
    { task: "Kartlägg samtliga deltransporter", category: "Dokumentation" },
    { task: "Samordna tidsplan mellan transporter", category: "Övrigt" },
    { task: "Reka lastnings- och lossningsplatser", category: "Rekning" },
    { task: "Begär pris från transportörer", category: "Bokning" },
    { task: "Följ upp status per deltransport", category: "Övrigt" },
    { task: "Markera klar för fakturering", category: "Övrigt" },
  ],
};
