// Tolkare för "Uppdragslista" – en kolumnbaserad lista (Uppdragsnr / Från / Till /
// Godsinformation) som en kund skickar. Kolumnerna hittas via rubrikradens x-positioner,
// eftersom en vanlig radvis textläsning slår ihop Från- och Till-kolumnen.
import { rowsToText, type ParsedLtcItem, type ParsedLtcOrder, type PdfRow } from "./ltcParse";

interface Column {
  key: "u" | "f" | "t" | "g";
  x: number;
}

interface Place {
  company: string | null;
  address: string | null;
  postnr: string | null;
  city: string | null;
  country: string | null;
}

interface Block {
  uppdragsnr: string | null;
  date: string;
  from: string[];
  to: string[];
  goods: string[];
}

const DATE_LINE = /^\d{4}-\d{2}-\d{2}$/;
const POSTAL_LINE = /^(\d{3}\s?\d{2}|\d{4,5})\s+(.+)$/;
const COUNTRY_LINE = /^[A-ZÅÄÖÆØ][A-ZÅÄÖÆØ\s-]{3,}$/;

function rowText(row: PdfRow) {
  return row.map((item) => item.str).join(" ");
}

export function isUppdragslista(rows: PdfRow[]): boolean {
  const text = rows.map(rowText).join("\n");
  return /UPPDRAGSLISTA/i.test(text) && /Uppdragsnr/i.test(text) && /Godsinformation/i.test(text) && /\bFrån\b/.test(text) && /\bTill\b/.test(text);
}

function findColumns(header: PdfRow): Column[] | null {
  const find = (pattern: RegExp) => header.find((item) => pattern.test(item.str.trim()))?.x;
  const u = find(/^Uppdragsnr$/i);
  const f = find(/^Från$/i);
  const t = find(/^Till$/i);
  const g = find(/^Godsinformation$/i);
  if (u === undefined || f === undefined || t === undefined || g === undefined) return null;
  return ([
    { key: "u", x: u },
    { key: "f", x: f },
    { key: "t", x: t },
    { key: "g", x: g },
  ] as Column[]).sort((a, b) => a.x - b.x);
}

function cellsForRow(row: PdfRow, columns: Column[]): Record<Column["key"], string> {
  const cells: Record<Column["key"], string[]> = { u: [], f: [], t: [], g: [] };
  for (const item of row) {
    const text = item.str.trim();
    if (!text) continue;
    let column = columns[0];
    for (const candidate of columns) if (item.x >= candidate.x - 4) column = candidate;
    cells[column.key].push(text);
  }
  return { u: cells.u.join(" "), f: cells.f.join(" "), t: cells.t.join(" "), g: cells.g.join(" ") };
}

function titleCaseCountry(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function parsePlace(lines: string[]): Place {
  const rest = lines.map((line) => line.trim()).filter(Boolean);
  let country: string | null = null;
  const last = rest[rest.length - 1];
  if (last && COUNTRY_LINE.test(last) && !POSTAL_LINE.test(last)) {
    country = titleCaseCountry(last);
    rest.pop();
  }
  let postnr: string | null = null;
  let city: string | null = null;
  const postalIndex = rest.findIndex((line) => POSTAL_LINE.test(line));
  if (postalIndex >= 0) {
    const match = POSTAL_LINE.exec(rest[postalIndex])!;
    postnr = match[1];
    city = match[2].trim();
    rest.splice(postalIndex, 1);
  }
  // Först kommer företaget, därefter gatuadressen. En ensam rad med siffror är en adress.
  let company: string | null = null;
  let address: string | null = null;
  if (rest.length === 1) {
    if (/\d/.test(rest[0])) address = rest[0];
    else company = rest[0];
  } else if (rest.length > 1) {
    company = rest[0];
    address = rest.slice(1).join(", ");
  }
  return { company, address, postnr, city, country };
}

function toNumber(raw: string | undefined) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseGoods(lines: string[], uppdragsnr: string | null): ParsedLtcItem {
  let text = lines.join(" ").replace(/\s+/g, " ").trim();
  const take = (pattern: RegExp) => {
    const match = pattern.exec(text);
    if (!match) return null;
    text = text.replace(match[0], " ");
    return match;
  };
  const width = take(/\bB\s*:\s*([\d.,]+)\s*m?/i);
  const length = take(/\bL\s*:\s*([\d.,]+)\s*m?/i);
  const height = take(/\bH\s*:\s*([\d.,]+)\s*m?/i);
  const weight = take(/\b(?:V|Vikt)\s*:\s*([\d.,]+)\s*(kg|ton|t)?\b/i);
  const weightValue = toNumber(weight?.[1]);
  const weightTon = weightValue === null ? null : weight?.[2]?.toLowerCase() === "kg" ? weightValue / 1000 : weightValue;
  return {
    quantity: 1,
    typeName: text.replace(/\s+/g, " ").trim() || "Gods",
    orderRef: uppdragsnr,
    length_m: toNumber(length?.[1]),
    width_m: toNumber(width?.[1]),
    height_m: toNumber(height?.[1]),
    weight_ton: weightTon,
    goodsMark: null,
    deliveryTermsAddition: null,
  };
}

export function parseUppdragslista(rows: PdfRow[]): ParsedLtcOrder[] {
  const headerIndex = rows.findIndex((row) => row.some((item) => /^Uppdragsnr$/i.test(item.str.trim())));
  if (headerIndex < 0) return [];
  const columns = findColumns(rows[headerIndex]);
  if (!columns) return [];

  // Kundens (avsändarens) uppgifter står ovanför tabellen, i vänsterspalten.
  const titleX = rows.slice(0, headerIndex).flat().find((item) => /UPPDRAGSLISTA/i.test(item.str))?.x ?? columns[columns.length - 1].x;
  const headerLines = rows
    .slice(0, headerIndex)
    .map((row) => row.filter((item) => item.x < titleX - 4).map((item) => item.str.trim()).filter(Boolean).join(" "))
    .filter(Boolean);
  const issuer = headerLines[0] ?? null;

  const blocks: Block[] = [];
  let currentNumber: string | null = null;
  let current: Block | null = null;
  for (const row of rows.slice(headerIndex + 1)) {
    const cells = cellsForRow(row, columns);
    if (/^---SIDBRYTNING---$/.test(cells.u.trim()) || (!cells.u && !cells.f && !cells.t && !cells.g)) continue;
    if (/^Uppdragsnr$/i.test(cells.u.trim())) continue;
    if (/^Kund\s*:/i.test(cells.f) || /^Kund\s*:/i.test(cells.u)) {
      current = null;
      continue;
    }
    if (cells.u) currentNumber = cells.u.trim();
    if (DATE_LINE.test(cells.f.trim())) {
      current = { uppdragsnr: currentNumber, date: cells.f.trim(), from: [], to: [], goods: [] };
      blocks.push(current);
    } else if (current && cells.f) {
      current.from.push(cells.f);
    }
    if (current) {
      if (cells.t) current.to.push(cells.t);
      if (cells.g) current.goods.push(cells.g);
    }
  }

  const text = rowsToText(rows);
  const orders = new Map<string, ParsedLtcOrder>();
  for (const block of blocks) {
    const from = parsePlace(block.from);
    const to = parsePlace(block.to);
    const key = [block.uppdragsnr, block.date, from.address, from.city, to.address, to.city].join("¤");
    const item = parseGoods(block.goods, block.uppdragsnr);
    const existing = orders.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    orders.set(key, {
      documentNumber: block.uppdragsnr,
      senderCompany: issuer,
      senderAddress: from.address,
      senderPostnr: from.postnr,
      senderCity: from.city,
      customerContact: null,
      customerPhone: null,
      loadingDate: block.date,
      deliveryDate: null,
      recipientCompany: null,
      recipientContact: null,
      recipientPhone: null,
      recipientMobile: null,
      recipientEmail: null,
      deliveryCoordinateN: null,
      deliveryCoordinateE: null,
      deliveryAddress: to.address,
      deliveryPostnr: to.postnr,
      deliveryCity: to.city,
      deliveryTerms: null,
      loadingCompany: from.company,
      deliveryCompany: to.company,
      senderCountry: from.country,
      deliveryCountry: to.country,
      items: [item],
      rawText: text,
    });
  }
  return [...orders.values()];
}
