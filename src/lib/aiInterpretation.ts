// AI-tolkning av orderblad utan textlager. Webbläsaren renderar PDF-sidorna till bilder och skickar dem till JK:s
// Edge Function interpret-order-document, som anropar VI-HEM. Tolkningen debiteras per sida (pris hämtas från tjänsten).
import "./pdfPolyfills";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import type { ParsedLtcItem, ParsedLtcOrder, PdfRow } from "./ltcParse";

export const MAX_AI_PAGES = 10;

export interface AiQuote {
  price_per_page: number;
  vat_rate: number;
  max_pages_per_request: number;
  monthly_page_limit: number | null;
  month_pages_used: number;
}

export interface AiPageImage {
  content_type: "image/jpeg";
  base64: string;
}

export interface AiInterpretResult {
  orders: AiOrder[];
  warnings: string[];
  billed: boolean;
  duplicate: boolean;
  pages: number;
  amount_ex_vat: number;
  price_per_page: number;
  vat_rate: number;
  raw_text?: string;
}

export type AiOrder = Omit<ParsedLtcOrder, "rawText" | "items"> & { items: ParsedLtcItem[] };

// Ett blad saknar läsbar text när pdf.js hittar (nästan) inga tecken, eller när tolkningen inte fann något alls.
export function needsAiFallback(rows: PdfRow[], parsed: Pick<ParsedLtcOrder, "items" | "documentNumber"> | null): boolean {
  const characters = rows.reduce((sum, row) => sum + row.reduce((inner, fragment) => inner + fragment.str.replace(/---SIDBRYTNING---/g, "").trim().length, 0), 0);
  if (characters < 80) return true;
  return parsed !== null && parsed.items.length === 0 && !parsed.documentNumber && characters < 400;
}

export function mapAiOrderToParsed(order: AiOrder, rawText = ""): ParsedLtcOrder {
  return {
    documentNumber: order.documentNumber ?? null,
    senderCompany: order.senderCompany ?? null,
    senderAddress: order.senderAddress ?? null,
    senderPostnr: order.senderPostnr ?? null,
    senderCity: order.senderCity ?? null,
    customerContact: order.customerContact ?? null,
    customerPhone: order.customerPhone ?? null,
    loadingDate: order.loadingDate ?? null,
    deliveryDate: order.deliveryDate ?? null,
    recipientCompany: order.recipientCompany ?? null,
    recipientContact: order.recipientContact ?? null,
    recipientPhone: order.recipientPhone ?? null,
    recipientMobile: order.recipientMobile ?? null,
    recipientEmail: order.recipientEmail ?? null,
    deliveryCoordinateN: order.deliveryCoordinateN ?? null,
    deliveryCoordinateE: order.deliveryCoordinateE ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    deliveryPostnr: order.deliveryPostnr ?? null,
    deliveryCity: order.deliveryCity ?? null,
    deliveryTerms: order.deliveryTerms ?? null,
    loadingCompany: order.loadingCompany ?? null,
    deliveryCompany: order.deliveryCompany ?? null,
    senderCountry: order.senderCountry ?? null,
    deliveryCountry: order.deliveryCountry ?? null,
    items: (order.items ?? []).map((item) => ({
      quantity: item.quantity ?? null, typeName: item.typeName ?? null, orderRef: item.orderRef ?? null,
      length_m: item.length_m ?? null, width_m: item.width_m ?? null, height_m: item.height_m ?? null,
      weight_ton: item.weight_ton ?? null, goodsMark: item.goodsMark ?? null, deliveryTermsAddition: item.deliveryTermsAddition ?? null,
    })),
    rawText,
  };
}

export function estimateAiCost(pages: number, quote: Pick<AiQuote, "price_per_page" | "vat_rate">) {
  const exVat = Math.round(pages * quote.price_per_page * 100) / 100;
  const vat = Math.round(exVat * quote.vat_rate) / 100;
  return { exVat, vat, total: Math.round((exVat + vat) * 100) / 100 };
}

async function pdfjs() {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!lib.GlobalWorkerOptions.workerPort) {
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL("./pdfWorker.ts", import.meta.url), { type: "module" });
  }
  return lib;
}

export async function countPdfPages(file: File): Promise<number> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const pages = doc.numPages;
  await task.destroy();
  return pages;
}

// Sidor som är kopior av en tidigare sida (t.ex. en fraktsedel i flera exemplar för avsändare, mottagare och transportör)
// behöver inte tolkas igen. Två sidor räknas som samma när all text i princip överlappar och alla identifierande tal
// (dokumentnummer, telefonnummer, mått m.m.) är exakt desamma. Sidor utan textlager kan inte jämföras och skickas alltid.
export function distinctPageIndexes(pageTexts: string[]): number[] {
  const signature = (text: string) => {
    const tokens = text.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
    return { all: new Set(tokens), ids: new Set(tokens.filter((t) => /\d/.test(t) && t.length >= 3)) };
  };
  const kept: { index: number; all: Set<string>; ids: Set<string> }[] = [];
  const result: number[] = [];
  pageTexts.forEach((text, index) => {
    if (text.trim().length < 40) { result.push(index); return; }
    const sig = signature(text);
    const duplicate = kept.some((other) => {
      if (other.ids.size !== sig.ids.size || [...sig.ids].some((id) => !other.ids.has(id))) return false;
      const shared = [...sig.all].filter((t) => other.all.has(t)).length;
      return shared / Math.min(sig.all.size, other.all.size) >= 0.8;
    });
    if (!duplicate) { kept.push({ index, ...sig }); result.push(index); }
  });
  return result;
}

// Räknar sidorna och väljer vilka som behöver skickas (1-baserade sidnummer).
export async function analyzePdfForAi(file: File): Promise<{ total: number; send: number[] }> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    const texts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return { total: doc.numPages, send: distinctPageIndexes(texts).map((index) => index + 1) };
  } finally {
    await task.destroy();
  }
}

// Renderar sidorna till JPEG (ca 1400 px bredd) – tillräckligt för OCR men litet nog för anropet.
// pageNumbers (1-baserade) väljer vilka sidor som renderas; utan den renderas alla.
export async function renderPdfPages(file: File, maxPages = MAX_AI_PAGES, pageNumbers?: number[]): Promise<AiPageImage[]> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const wanted = pageNumbers ?? Array.from({ length: doc.numPages }, (_, i) => i + 1);
  if (wanted.length > maxPages) {
    await task.destroy();
    throw new Error(`Dokumentet har ${wanted.length} sidor (högst ${maxPages} kan AI-tolkas).`);
  }
  const images: AiPageImage[] = [];
  for (const pageNumber of wanted) {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.2, 1400 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Webbläsaren kan inte rendera sidorna.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    images.push({ content_type: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    page.cleanup();
  }
  await task.destroy();
  return images;
}

export async function sha256OfFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) throw new Error("AI-tolkning kräver en ansluten databas.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Du behöver logga in igen.");
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/interpret-order-document`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Kunde inte nå servern. Kontrollera nätverket. Ingen AI-tolkning har gjorts eller debiterats.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `AI-tolkningen misslyckades (${response.status}).`);
  return payload as T;
}

export async function fetchAiQuote(): Promise<AiQuote> {
  const quote = await call<AiQuote & { ok: boolean }>({ action: "quote" });
  return { price_per_page: Number(quote.price_per_page), vat_rate: Number(quote.vat_rate), max_pages_per_request: Number(quote.max_pages_per_request), monthly_page_limit: quote.monthly_page_limit ?? null, month_pages_used: Number(quote.month_pages_used ?? 0) };
}

// requestId ska vara stabilt per dokument och försök, så ett omförsök efter nätverksfel aldrig debiteras två gånger.
// accuracy "high": bildmodellen läser sidorna direkt (när användaren själv valt AI eller vill ha en om-tolkning).
export async function interpretWithAi(file: File, pages: AiPageImage[], requestId: string, accuracy: "standard" | "high" = "standard"): Promise<AiInterpretResult> {
  const result = await call<AiInterpretResult & { ok: boolean }>({
    action: "interpret", request_id: requestId, file_name: file.name, file_sha256: await sha256OfFile(file), pages, accuracy,
  });
  return { ...result, orders: result.orders ?? [], warnings: result.warnings ?? [] };
}
