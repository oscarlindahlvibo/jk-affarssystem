// Tolkning av digitala fraktbeställningar (LTC-blad) från kunder som Holtab.
// Läser text ur en PDF (klientsidan, via pdf.js) och plockar ut fält utifrån
// blankettens etiketter. Detta är en bästa-möjliga-tolkning – layouten kan skilja
// sig mellan kunder/versioner, så allt presenteras i en granskningsvy där
// användaren kompletterar och rättar innan projekt skapas.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface ParsedLtcItem {
  quantity: number | null;
  typeName: string | null;
  orderRef: string | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  weight_ton: number | null;
  goodsMark: string | null;
  deliveryTermsAddition: string | null;
}

export interface ParsedLtcOrder {
  documentNumber: string | null;
  senderCompany: string | null;
  senderAddress: string | null;
  senderPostnr: string | null;
  senderCity: string | null;
  customerContact: string | null;
  customerPhone: string | null;
  loadingDate: string | null;
  deliveryDate: string | null;
  recipientCompany: string | null;
  recipientContact: string | null;
  recipientPhone: string | null;
  recipientMobile: string | null;
  recipientEmail: string | null;
  deliveryCoordinateN: string | null;
  deliveryCoordinateE: string | null;
  deliveryAddress: string | null;
  deliveryPostnr: string | null;
  deliveryCity: string | null;
  deliveryTerms: string | null;
  items: ParsedLtcItem[];
  rawText: string;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Versionsparametern gör att webbläsare inte återanvänder worker-svaret som
  // tidigare serverades med fel MIME-typ och lång immutable-cache.
  pdfjs.GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}?v=20260930`;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    // Gruppera textfragment radvis utifrån y-position (annars kommer text i en
    // ospecificerad ordning som inte matchar den visuella layouten).
    const items = content.items as { str: string; transform: number[] }[];
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push(row.map((r) => r.str).join(" ").replace(/\s+/g, " ").trim());
    }
    lines.push("---SIDBRYTNING---");
  }
  return lines.filter(Boolean).join("\n");
}

function match1(text: string, pattern: RegExp): string | null {
  const m = pattern.exec(text);
  return m ? m[1].trim() : null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseNum(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseWeightTons(raw: string | null): number | null {
  const n = parseNum(raw);
  if (n === null) return null;
  return n > 200 ? Math.round((n / 1000) * 100) / 100 : n;
}

function cleanTableValue(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").replace(/,+$/, "").trim();
  return cleaned || null;
}

function isStopLine(line: string): boolean {
  return /^(Godsmärke|Koordinat|Fortsättning|---SIDBRYTNING---|Tillägg leveransvillkor|Nr\.|Fraktbeställning)/i.test(line.trim());
}

function findGoodsMark(lines: string[], fromIndex: number): string | null {
  const goodsMarkLine = lines.slice(fromIndex + 1, fromIndex + 6).find((l) => /Godsmärke/i.test(l));
  return goodsMarkLine ? cleanTableValue(goodsMarkLine.replace(/.*Godsmärke\s*/i, "")) : null;
}

function findDeliveryTermsAddition(lines: string[]): string | null {
  const additionLine = lines.find((l) => /Tillägg leveransvillkor/i.test(l));
  return additionLine ? cleanTableValue(additionLine.replace(/.*Tillägg leveransvillkor\s*/i, "")) : null;
}

function parseFreeTextItem(text: string, orderRef: string | null): ParsedLtcItem[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const goodsIndex = lines.findIndex((line) => /^Gods\s*:/i.test(line));
  if (goodsIndex < 0) return [];

  const firstLineValue = cleanTableValue(lines[goodsIndex].replace(/^Gods\s*:\s*/i, ""));
  const followingLines: string[] = [];
  for (const line of lines.slice(goodsIndex + 1)) {
    if (/^(Kvitterad fraktsedel|Transport enligt|Märk fakturan|Faktura mailas|---SIDBRYTNING---)/i.test(line)) break;
    followingLines.push(line);
  }
  const description = [firstLineValue, ...followingLines.slice(0, 3)].filter(Boolean).join(" ").trim();
  if (!description) return [];

  const dimensions = /(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d+(?:[.,]\d+)?)(?:\s*m)?\b/i.exec(description);
  const singleLength = dimensions ? null : /(\d+(?:[.,]\d+)?)\s*m\b/i.exec(description);
  const weight = /(\d+(?:[.,]\d+)?)\s*(kg|ton|t)\b/i.exec(description);
  const quantity = /^(\d+)\s*(?:st|x)\b/i.exec(description);
  const parsedWeight = weight ? parseNum(weight[1]) : null;

  return [{
    quantity: quantity ? parseNum(quantity[1]) : 1,
    typeName: description,
    orderRef,
    length_m: parseNum(dimensions?.[1] ?? singleLength?.[1] ?? null),
    width_m: parseNum(dimensions?.[2] ?? null),
    height_m: parseNum(dimensions?.[3] ?? null),
    weight_ton: parsedWeight === null ? null : weight?.[2].toLowerCase() === "kg" ? parsedWeight / 1000 : parsedWeight,
    goodsMark: null,
    deliveryTermsAddition: null,
  }];
}

function parseItems(text: string): ParsedLtcItem[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const deliveryTermsAddition = findDeliveryTermsAddition(lines);
  const items: ParsedLtcItem[] = [];

  // Godsrader kan vara en komplett rad, eller uppdelade av PDF-layouten:
  // "TSBI 2/2000,"
  // "1 Z00393 5,95 4,49 3,92 44 656"
  // "5940x4500"
  const itemLinePattern = /^(\d+)\s+([A-Za-zÅÄÖåäö]?\d{3,})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+(?:\s+\d{3})*|\d+)(?:\s+(.+))?$/;
  const completeLinePattern = /^(\d+)\s+(.+?)\s+([A-Za-zÅÄÖåäö]?\d{3,})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\d+(?:\s+\d{3})*|\d+)$/;

  let tableStarted = false;
  let pendingType: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^Antal\s+Typ\s+Order\s+Längd\s+Bredd\s+Höjd\s+Vikt/i.test(line)) {
      tableStarted = true;
      pendingType = null;
      continue;
    }

    const complete = completeLinePattern.exec(line);
    if (complete) {
      items.push({
        quantity: parseNum(complete[1]),
        typeName: cleanTableValue(complete[2]),
        orderRef: cleanTableValue(complete[3]),
        length_m: parseNum(complete[4]),
        width_m: parseNum(complete[5]),
        height_m: parseNum(complete[6]),
        weight_ton: parseWeightTons(complete[7]),
        goodsMark: findGoodsMark(lines, i),
        deliveryTermsAddition,
      });
      pendingType = null;
      tableStarted = false;
      continue;
    }

    if (!tableStarted) continue;
    if (isStopLine(line)) {
      pendingType = null;
      tableStarted = false;
      continue;
    }

    const split = itemLinePattern.exec(line);
    if (split) {
      const extraTypeInfo = cleanTableValue(split[7]);
      const nextLine = cleanTableValue(lines[i + 1]);
      const dimensionCode = nextLine && /^\d+(?:[xX]\d+)+$/.test(nextLine) ? nextLine : null;
      items.push({
        quantity: parseNum(split[1]),
        typeName: [pendingType, extraTypeInfo, dimensionCode].filter(Boolean).join(" ") || null,
        orderRef: cleanTableValue(split[2]),
        length_m: parseNum(split[3]),
        width_m: parseNum(split[4]),
        height_m: parseNum(split[5]),
        weight_ton: parseWeightTons(split[6]),
        goodsMark: findGoodsMark(lines, i),
        deliveryTermsAddition,
      });
      pendingType = null;
      continue;
    }

    pendingType = [pendingType, line].filter(Boolean).join(" ");
  }

  return items;
}

export function parseLtcOrder(text: string): ParsedLtcOrder {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const isTransportOrder = /Beställning Transport/i.test(text) && /Ordernr\s*:/i.test(text);
  const documentNumber = match1(text, /\b(LTC\d+)\b/i)
    ?? match1(text, /Ordernr\s*:\s*([A-Z0-9-]+)/i)
    ?? match1(text, /Nr\.\s*([A-Z0-9]+)/i);
  const senderCompanyRaw = match1(text, /Avsändare\s*:\s*(.+)/i) ?? match1(text, /Avsändare\s+(.+)/i);
  const senderCompany = senderCompanyRaw ? senderCompanyRaw.replace(/\s*\/\s*[A-Z]{2,5}$/, "").trim() : null;
  const senderIndex = lines.findIndex((line) => /Avsändare\s*:/i.test(line));
  const customerIndex = lines.findIndex((line) => /^Kund\s*:/i.test(line));
  const senderBlock = senderIndex >= 0 && customerIndex > senderIndex
    ? lines.slice(senderIndex + 1, customerIndex).filter((line) => !/^Fraktsedelsnr\s*:/i.test(line))
    : [];
  const senderPostalLine = senderBlock.find((line) => /^\d{3}\s?\d{2}\s+.+/.test(line));
  const senderPostalMatch = senderPostalLine ? /^(\d{3}\s?\d{2})\s+(.+)$/.exec(senderPostalLine) : null;
  const senderAddress = match1(text, /^Adress\s+(.+)/im) ?? senderBlock.find((line) => line !== senderPostalLine && !/^Sweden$/i.test(line)) ?? null;
  const senderPostnr = match1(text, /Postnr\s+(\d{3}\s?\d{2})/i) ?? senderPostalMatch?.[1] ?? null;
  const senderCity = match1(text, /Avsändarort\s+(.+)/i) ?? senderPostalMatch?.[2] ?? null;
  const customerCompany = match1(text, /^Kund\s*:\s*(.+)/im);
  const customerContact = match1(text, /Kundens ref\s*:\s*(.+)/i);
  const customerPhone = isTransportOrder
    ? lines.slice(customerIndex + 1, Math.max(customerIndex + 2, lines.findIndex((line) => /^Mottagare\s*:/i.test(line))))
      .find((line) => /^\+?[\d\s-]{6,}$/.test(line)) ?? null
    : null;
  const loadingDate = parseDate(match1(text, /(?:Lastningsdag|Lastas)\s*:?\s*(\d{4}-\d{2}-\d{2})/i));
  const deliveryDate = parseDate(match1(text, /(?:Lev\.?dag på plats|Lossas)\s*:?\s*(\d{4}-\d{2}-\d{2})/i));
  const recipientCompany = match1(text, /^Mottagare\s*:\s*(.+)/im) ?? match1(text, /^Kund\s+(.+)/im);
  const deliveryPostalLine = lines.find((line) => /^\d{3}\s?\d{2}\s+.+/.test(line) && line !== senderPostalLine);
  const deliveryPostalMatch = deliveryPostalLine ? /^(\d{3}\s?\d{2})\s+(.+)$/.exec(deliveryPostalLine) : null;
  const recipientIndex = lines.findIndex((line) => /^Mottagare\s*:/i.test(line));
  const goodsIndex = lines.findIndex((line) => /^Gods\s*:/i.test(line));
  const recipientBlock = recipientIndex >= 0 && goodsIndex > recipientIndex ? lines.slice(recipientIndex + 1, goodsIndex) : [];
  const recipientContactLine = recipientBlock.find((line) => /^\+?[\d\s-]{6,}\s*,\s*.+/.test(line));
  const recipientContactMatch = recipientContactLine ? /^(\+?[\d\s-]{6,})\s*,\s*(.+)$/.exec(recipientContactLine) : null;
  const recipientContact = match1(text, /Kontaktperson\s+(.+)/i) ?? recipientContactMatch?.[2] ?? null;
  const recipientPhone = match1(text, /^Telefon\s+([\d\s+-]+)/im);
  const recipientMobile = match1(text, /Mobil ?nr\s+([\d\s+-]+)/i) ?? recipientContactMatch?.[1]?.trim() ?? null;
  const recipientEmail = match1(text, /E-post\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i);
  const coordN = match1(text, /N:\s*(\d+)/i);
  const coordE = match1(text, /E:\s*(\d+)/i);
  const deliveryPostnrMatch = /Leveransort\s+(\d{3}\s?\d{2})\s+(.+)/i.exec(text);
  const deliveryPostnr = deliveryPostnrMatch?.[1].trim() ?? deliveryPostalMatch?.[1] ?? null;
  const deliveryCity = deliveryPostnrMatch?.[2].trim() ?? deliveryPostalMatch?.[2] ?? null;
  const deliveryAddress = isTransportOrder
    ? recipientBlock.find((line) =>
        !/^(Lastas|Lossas)\s*:/i.test(line) &&
        line !== deliveryPostalLine &&
        line !== recipientContactLine &&
        !/^Sweden$/i.test(line)
      ) ?? null
    : match1(text, /Leveransadress\s+(.+)/i);
  const deliveryTerms = match1(text, /Leveransvillkor\s+(.+)/i);

  const items = parseItems(text);
  if (items.length === 0) items.push(...parseFreeTextItem(text, documentNumber));

  return {
    documentNumber,
    senderCompany: customerCompany ?? senderCompany,
    senderAddress,
    senderPostnr,
    senderCity,
    customerContact,
    customerPhone,
    loadingDate,
    deliveryDate,
    recipientCompany,
    recipientContact,
    recipientPhone,
    recipientMobile,
    recipientEmail,
    deliveryCoordinateN: coordN,
    deliveryCoordinateE: coordE,
    deliveryAddress,
    deliveryPostnr,
    deliveryCity,
    deliveryTerms,
    items,
    rawText: text,
  };
}
