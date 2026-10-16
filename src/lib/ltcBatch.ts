// Gruppering och sammanslagning av flera LTC-/orderblad som importeras samtidigt.
// Blad som går till samma kund, samma lossningsplats och samma lossningsdatum
// hör normalt ihop och föreslås som en leverans (en grupp).
import type { ContactPerson, Customer, TransportType } from "../types";
import type { ParsedLtcItem, ParsedLtcOrder } from "./ltcParse";
import { canonicalCustomerName, normalizeCustomerName } from "./importLogic";

export interface LtcSheet {
  id: string;
  file: File | null;
  fileName: string;
  parsed: ParsedLtcOrder;
  previewUrl: string | null;
}

export interface EditableItem extends ParsedLtcItem {
  include: boolean;
  sheetId: string;
}

export type GroupMode = "single" | "split";

export interface LtcGroup {
  id: string;
  key: string;
  sheetIds: string[];
  mode: GroupMode;
  order: ParsedLtcOrder;
  customerId: string;
  showNewCustomer: boolean;
  newCustomerName: string;
  contactId: string;
  loadingPlace: string;
  unloadingPlace: string;
  loadingCompany: string;
  unloadingCompany: string;
  unloadingContactName: string;
  unloadingContactPhone: string;
  loadingDate: string;
  loadingTime: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryTerms: string;
  transportType: TransportType;
  supplierId: string;
  responsibleId: string;
  items: EditableItem[];
  previewSheetId: string | null;
  done: boolean;
  createdNumbers: string[];
}

export interface LtcContext {
  customers: Customer[];
  contacts: ContactPerson[];
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function compact(value: string | null | undefined) {
  return normalizeText(value).replace(/[^a-z0-9åäö]+/g, "");
}

export function findMatchingContact(contacts: ContactPerson[], customerId: string, order: ParsedLtcOrder | null) {
  const contactName = normalizeText(order?.customerContact ?? order?.recipientContact);
  const contactEmail = normalizeText(order?.recipientEmail);
  const contactPhone = digitsOnly(order?.customerPhone ?? order?.recipientMobile ?? order?.recipientPhone);
  if (!customerId || (!contactName && !contactEmail && !contactPhone)) return undefined;

  return contacts.find((contact) => {
    if (contact.customer_id !== customerId) return false;
    if (contactName && normalizeText(contact.name) === contactName) return true;
    if (contactEmail && normalizeText(contact.email) === contactEmail) return true;
    if (contactPhone && [contact.mobile, contact.phone].some((value) => digitsOnly(value) === contactPhone)) return true;
    return false;
  });
}

export function suggestedTransportType(items: Pick<ParsedLtcItem, "typeName">[]): TransportType {
  const goods = items.map((item) => item.typeName ?? "").join(" ").toLowerCase();
  if (/kranbil|mobilkran|\bkran\b/.test(goods)) return "Krantransport";
  if (/container/.test(goods)) return "Container";
  if (/maskin|grävmaskin|hjullastare/.test(goods)) return "Maskintransport";
  if (/styckegods|pallgods|pall/.test(goods)) return "Styckegods";
  return "Specialtransport";
}

// Nyckeln avgör vilka blad som föreslås bli samma leverans.
export function ltcGroupKey(order: ParsedLtcOrder): string {
  const customer = normalizeCustomerName(order.senderCompany ?? "");
  const place =
    [digitsOnly(order.deliveryPostnr), compact(order.deliveryAddress)].filter(Boolean).join("|") ||
    [order.deliveryCoordinateN, order.deliveryCoordinateE].filter(Boolean).join("|") ||
    compact(order.deliveryCity) ||
    compact(order.recipientCompany);
  return [customer, place, order.deliveryDate ?? order.loadingDate ?? ""].join("¤");
}

export function uniqueJoin(values: (string | null | undefined)[], separator: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.join(separator);
}

function withCountry(place: string, country: string | null | undefined) {
  const trimmed = (country ?? "").trim();
  if (!trimmed || /^sverige$|^sweden$/i.test(trimmed)) return place;
  return place ? `${place}, ${trimmed}` : trimmed;
}

function placeFromOrder(order: ParsedLtcOrder) {
  const loadingPostalCity = [order.senderPostnr, order.senderCity].filter(Boolean).join(" ");
  const loadingPlace = withCountry(
    [order.senderAddress, loadingPostalCity].filter(Boolean).join(", ") || order.senderCity || "",
    order.senderCountry
  );
  const coords =
    order.deliveryCoordinateN && order.deliveryCoordinateE
      ? ` (N: ${order.deliveryCoordinateN}, E: ${order.deliveryCoordinateE})`
      : "";
  const deliveryPostalCity = [order.deliveryPostnr, order.deliveryCity].filter(Boolean).join(" ");
  const unloadingPlace = withCountry([order.deliveryAddress, deliveryPostalCity].filter(Boolean).join(", "), order.deliveryCountry) + coords;
  return { loadingPlace, unloadingPlace };
}

let groupCounter = 0;
export function newGroupId() {
  groupCounter += 1;
  return `grp-${Date.now().toString(36)}-${groupCounter}`;
}

export function buildGroup(sheets: LtcSheet[], ctx: LtcContext): LtcGroup {
  const first = sheets[0];
  const order = first.parsed;
  const matchedCustomer = ctx.customers.find(
    (c) => normalizeCustomerName(c.company_name) === normalizeCustomerName(order.senderCompany ?? "")
  );
  const matchedContact = matchedCustomer ? findMatchingContact(ctx.contacts, matchedCustomer.id, order) : undefined;
  const { loadingPlace, unloadingPlace } = placeFromOrder(order);
  const items: EditableItem[] = sheets.flatMap((sheet) => sheet.parsed.items.map((item) => ({ ...item, include: true, sheetId: sheet.id })));
  return {
    id: newGroupId(),
    key: ltcGroupKey(order),
    sheetIds: sheets.map((s) => s.id),
    mode: "single",
    order,
    customerId: matchedCustomer?.id ?? "",
    showNewCustomer: !matchedCustomer && Boolean(order.senderCompany),
    newCustomerName: canonicalCustomerName(order.senderCompany ?? ""),
    contactId: matchedContact?.id ?? "",
    loadingPlace,
    unloadingPlace,
    loadingCompany: order.loadingCompany ?? order.senderCompany ?? "",
    unloadingCompany: order.deliveryCompany ?? order.recipientCompany ?? "",
    unloadingContactName: order.recipientCompany ? `${order.recipientContact ?? ""} (${order.recipientCompany})`.trim() : "",
    unloadingContactPhone: order.recipientCompany ? order.recipientMobile ?? order.recipientPhone ?? "" : "",
    loadingDate: order.loadingDate ?? "",
    loadingTime: "",
    deliveryDate: order.deliveryDate ?? "",
    deliveryTime: "",
    deliveryTerms: uniqueJoin(sheets.map((s) => s.parsed.deliveryTerms), " + "),
    transportType: suggestedTransportType(items),
    supplierId: "",
    responsibleId: "",
    items,
    previewSheetId: first.id,
    done: false,
    createdNumbers: [],
  };
}

// Lägger nya blad i en befintlig öppen grupp med samma nyckel, annars i en ny grupp.
export function addSheetsToGroups(groups: LtcGroup[], newSheets: LtcSheet[], ctx: LtcContext): LtcGroup[] {
  let next = [...groups];
  for (const sheet of newSheets) {
    const key = ltcGroupKey(sheet.parsed);
    const index = next.findIndex((g) => !g.done && g.key === key);
    if (index === -1) {
      next = [...next, buildGroup([sheet], ctx)];
      continue;
    }
    const group = next[index];
    next = next.map((g, i) =>
      i === index
        ? {
            ...g,
            sheetIds: [...g.sheetIds, sheet.id],
            items: [...g.items, ...sheet.parsed.items.map((item) => ({ ...item, include: true, sheetId: sheet.id }))],
            deliveryTerms: uniqueJoin([group.deliveryTerms, sheet.parsed.deliveryTerms], " + "),
            loadingDate: group.loadingDate || sheet.parsed.loadingDate || "",
          }
        : g
    );
  }
  return next;
}

// Flyttar ett blad (med dess godsrader) till en annan grupp, eller till en egen ny grupp.
export function moveSheet(
  groups: LtcGroup[],
  sheets: LtcSheet[],
  sheetId: string,
  targetGroupId: string | "new",
  ctx: LtcContext
): LtcGroup[] {
  const source = groups.find((g) => g.sheetIds.includes(sheetId));
  const sheet = sheets.find((s) => s.id === sheetId);
  if (!source || !sheet || source.id === targetGroupId || source.done) return groups;
  const movedItems = source.items.filter((i) => i.sheetId === sheetId);

  const withoutSheet = groups
    .map((g) =>
      g.id === source.id
        ? {
            ...g,
            sheetIds: g.sheetIds.filter((id) => id !== sheetId),
            items: g.items.filter((i) => i.sheetId !== sheetId),
            previewSheetId: g.previewSheetId === sheetId ? g.sheetIds.find((id) => id !== sheetId) ?? null : g.previewSheetId,
          }
        : g
    )
    .filter((g) => g.sheetIds.length > 0);

  if (targetGroupId === "new") return [...withoutSheet, buildGroup([sheet], ctx)];
  return withoutSheet.map((g) =>
    g.id === targetGroupId
      ? {
          ...g,
          sheetIds: [...g.sheetIds, sheetId],
          items: [...g.items, ...movedItems],
          deliveryTerms: uniqueJoin([g.deliveryTerms, sheet.parsed.deliveryTerms], " + "),
        }
      : g
  );
}

export function combinedDocumentRef(documentNumbers: (string | null | undefined)[]): string | null {
  return uniqueJoin(documentNumbers, ", ") || null;
}

export function describeItem(item: Pick<ParsedLtcItem, "typeName" | "goodsMark">) {
  return [item.typeName, item.goodsMark ? `– Godsmärke ${item.goodsMark}` : null].filter(Boolean).join(" ");
}

// Antal projekt en grupp skapar utifrån valt läge och inkluderade rader.
export function projectCountForGroup(group: LtcGroup): number {
  const included = group.items.filter((i) => i.include).length;
  if (included === 0) return 0;
  return group.mode === "single" ? 1 : included;
}
