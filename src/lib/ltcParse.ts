// Tolkning av digitala fraktbeställningar (LTC-blad) från kunder som Holtab.
// Läser text ur en PDF (klientsidan, via pdf.js) och plockar ut fält utifrån
// blankettens etiketter. Detta är en bästa-möjliga-tolkning – layouten kan skilja
// sig mellan kunder/versioner, så allt presenteras i en granskningsvy där
// användaren kompletterar och rättar innan projekt skapas.

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
  loadingDate: string | null;
  deliveryDate: string | null;
  recipientCompany: string | null;
  recipientContact: string | null;
  recipientPhone: string | null;
  recipientMobile: string | null;
  recipientEmail: string | null;
  deliveryCoordinateN: string | null;
  deliveryCoordinateE: string | null;
  deliveryPostnr: string | null;
  deliveryCity: string | null;
  deliveryTerms: string | null;
  items: ParsedLtcItem[];
  rawText: string;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

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

export function parseLtcOrder(text: string): ParsedLtcOrder {
  const documentNumber = match1(text, /Nr\.\s*([A-Z0-9]+)/i);
  const senderCompanyRaw = match1(text, /Avsändare\s+(.+)/i);
  const senderCompany = senderCompanyRaw ? senderCompanyRaw.replace(/\s*\/\s*[A-Z]{2,5}$/, "").trim() : null;
  const senderAddress = match1(text, /^Adress\s+(.+)/im);
  const senderPostnr = match1(text, /Postnr\s+(\d{3}\s?\d{2})/i);
  const senderCity = match1(text, /Avsändarort\s+(.+)/i);
  const loadingDate = parseDate(match1(text, /Lastningsdag\s+(\d{4}-\d{2}-\d{2})/i));
  const deliveryDate = parseDate(match1(text, /Lev\.?dag på plats\s+(\d{4}-\d{2}-\d{2})/i));
  const recipientCompany = match1(text, /^Kund\s+(.+)/im);
  const recipientContact = match1(text, /Kontaktperson\s+(.+)/i);
  const recipientPhone = match1(text, /^Telefon\s+([\d\s+-]+)/im);
  const recipientMobile = match1(text, /Mobil ?nr\s+([\d\s+-]+)/i);
  const recipientEmail = match1(text, /E-post\s+([^\s@]+@[^\s@]+\.[^\s@]+)/i);
  const coordN = match1(text, /N:\s*(\d+)/i);
  const coordE = match1(text, /E:\s*(\d+)/i);
  const deliveryPostnrMatch = /Leveransort\s+(\d{3}\s?\d{2})\s+(.+)/i.exec(text);
  const deliveryPostnr = deliveryPostnrMatch ? deliveryPostnrMatch[1].trim() : null;
  const deliveryCity = deliveryPostnrMatch ? deliveryPostnrMatch[2].trim() : null;
  const deliveryTerms = match1(text, /Leveransvillkor\s+(.+)/i);

  // Godsrader: "1 SC2500CL T69889 3,89 3,1 3,15 11 901" – antal, typ, ordernr,
  // längd, bredd, höjd, vikt (kg, kan innehålla mellanslag som tusentalsavgränsare).
  const itemPattern = /^(\d+)\s+([A-Za-zÅÄÖåäö0-9]+)\s+([A-Za-z]?\d{3,})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d][\d\s]*\d|\d)\s*$/gm;
  const items: ParsedLtcItem[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    itemPattern.lastIndex = 0;
    const m = itemPattern.exec(lines[i]);
    if (!m) continue;
    const goodsMarkLine = lines.slice(i + 1, i + 4).find((l) => /Godsmärke/i.test(l));
    const goodsMark = goodsMarkLine ? goodsMarkLine.replace(/.*Godsmärke\s+/i, "").trim() : null;
    const additionLine = lines.slice(i + 1, i + 6).find((l) => /Tillägg leveransvillkor/i.test(l));
    const deliveryTermsAddition = additionLine ? additionLine.replace(/.*Tillägg leveransvillkor\s+/i, "").trim() : null;
    items.push({
      quantity: parseNum(m[1]),
      typeName: m[2],
      orderRef: m[3],
      length_m: parseNum(m[4]),
      width_m: parseNum(m[5]),
      height_m: parseNum(m[6]),
      weight_ton: parseWeightTons(m[7]),
      goodsMark,
      deliveryTermsAddition,
    });
  }

  return {
    documentNumber,
    senderCompany,
    senderAddress,
    senderPostnr,
    senderCity,
    loadingDate,
    deliveryDate,
    recipientCompany,
    recipientContact,
    recipientPhone,
    recipientMobile,
    recipientEmail,
    deliveryCoordinateN: coordN,
    deliveryCoordinateE: coordE,
    deliveryPostnr,
    deliveryCity,
    deliveryTerms,
    items,
    rawText: text,
  };
}
