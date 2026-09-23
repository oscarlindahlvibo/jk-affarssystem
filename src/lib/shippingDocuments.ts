import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CargoItem, Project } from "../types";

export type ShippingDocumentKind = "cmr" | "domestic-waybill";

function location(project: Project, type: "lastning" | "lossning") {
  return project.locations?.find((item) => item.type === type);
}

function today() {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

function safe(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function weightKg(cargo: CargoItem) {
  if (cargo.weight_ton === null) return "";
  return Math.round(cargo.weight_ton * 1000).toString();
}

function volume(cargo: CargoItem) {
  if (cargo.length_m === null || cargo.width_m === null || cargo.height_m === null) return "";
  return (cargo.length_m * cargo.width_m * cargo.height_m * (cargo.quantity ?? 1)).toFixed(2);
}

function projectFilePrefix(project: Project) {
  return project.project_number.replace(/[^a-z0-9-]+/gi, "_");
}

function pdfBlob(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "application/pdf" });
}

export function shippingDocumentFileName(project: Project, kind: ShippingDocumentKind) {
  return `${projectFilePrefix(project)}-${kind === "cmr" ? "CMR" : "Fraktsedel"}.pdf`;
}

function splitLines(text: string, maxChars: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function drawTextBox(
  page: PDFPage,
  font: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { maxChars?: number; fontSize?: number } = {}
) {
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.7 });
  page.drawText(label, { x: x + 5, y: y + height - 12, size: 7, font, color: rgb(0.25, 0.25, 0.25) });
  const maxChars = options.maxChars ?? Math.max(18, Math.floor(width / 5.2));
  const fontSize = options.fontSize ?? 8.5;
  splitLines(value, maxChars)
    .slice(0, Math.max(1, Math.floor((height - 17) / (fontSize + 2))))
    .forEach((line, index) => {
      page.drawText(line, { x: x + 5, y: y + height - 25 - index * (fontSize + 2), size: fontSize, font });
    });
}

export async function generateCmrPdf(project: Project) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const loading = location(project, "lastning");
  const unloading = location(project, "lossning");
  const cargoItems = project.cargo_items ?? [];
  const sender = [
    project.customer?.company_name,
    loading?.name,
    loading?.address,
    loading?.contact_name ? `Kontakt: ${loading.contact_name}` : null,
    loading?.contact_phone ? `Telefon: ${loading.contact_phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const consignee = [
    unloading?.name,
    unloading?.address,
    unloading?.contact_name ? `Kontakt: ${unloading.contact_name}` : null,
    unloading?.contact_phone ? `Telefon: ${unloading.contact_phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const carrier = [
    project.supplier?.company_name,
    project.supplier?.contact_person,
    project.supplier?.phone,
    project.vehicle ? `Fordon: ${project.vehicle}` : null,
    project.driver_name ? `Chaufför: ${project.driver_name}` : null,
    project.carrier_order_number ? `Ordernr: ${project.carrier_order_number}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const takingOver = [
    `Place / Plats: ${safe(loading?.name)}`,
    `Address / Adress: ${safe(loading?.address)}`,
    `Date / Datum: ${safe(project.planned_loading_date)}`,
    "Arrival/departure time / Ankomst/avgång: __________",
  ].join("\n");
  const delivery = [
    `Place / Plats: ${safe(unloading?.name)}`,
    `Address / Adress: ${safe(unloading?.address)}`,
    `Date / Datum: ${safe(project.planned_delivery_date)}`,
    "Opening/arrival time / Tid: __________",
  ].join("\n");
  const documents = [project.source_document_ref, project.customer_reference].filter(Boolean).join(", ") || "-";
  const usefulParticulars = [
    project.route_distance_km ? `Route distance / Transportsträcka: ${project.route_distance_km} km` : null,
    project.vehicle ? `Vehicle / Fordon: ${project.vehicle}` : null,
    project.driver_name ? `Driver / Chaufför: ${project.driver_name}` : null,
    project.carrier_order_number ? `Carrier order no / Transportörens ordernr: ${project.carrier_order_number}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const copies = [
    { label: "1 - Consignor copy / Avsändarens exemplar", color: rgb(0.78, 0.08, 0.08) },
    { label: "2 - Consignee copy / Mottagarens exemplar - accompanies goods", color: rgb(0.05, 0.25, 0.72) },
    { label: "3 - Carrier copy / Transportörens exemplar", color: rgb(0.0, 0.45, 0.22) },
    { label: "4 - Administrative copy / Administrativt exemplar", color: rgb(0.05, 0.05, 0.05) },
  ];

  for (const copy of copies) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 24, y: 804, width: 547, height: 20, color: copy.color });
    page.drawText(copy.label, { x: 32, y: 810, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Pays / Country: SE", { x: 432, y: 810, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("LETTRE DE VOITURE INTERNATIONALE / INTERNATIONAL CONSIGNMENT NOTE", {
      x: 86,
      y: 786,
      size: 10,
      font: bold,
    });
    page.drawText("CMR", { x: 270, y: 765, size: 18, font: bold, color: copy.color });
    page.drawText(`CMR No / Nr: ${project.project_number}`, { x: 36, y: 770, size: 8.5, font: bold });
    page.drawText(`Issued / Upprättad: ${today()}`, { x: 420, y: 770, size: 8.5, font });

    drawTextBox(page, font, "1. Sender (name, address, country) / Avsändare", sender || "-", 36, 658, 250, 96, { maxChars: 42 });
    drawTextBox(page, font, "6. Carrier (name, address, country) / Transportör", carrier || "-", 309, 658, 250, 96, { maxChars: 42 });
    drawTextBox(page, font, "2. Consignee (name, address, country) / Mottagare", consignee || "-", 36, 552, 250, 94, { maxChars: 42 });
    drawTextBox(page, font, "7. Successive carriers / Efterföljande transportörer", "-", 309, 552, 250, 94, { maxChars: 42 });
    drawTextBox(page, font, "3. Taking over the goods / Övertagande av godset", takingOver, 36, 462, 250, 78, { maxChars: 42 });
    drawTextBox(page, font, "4. Delivery of the goods / Leverans av godset", delivery, 309, 462, 250, 78, { maxChars: 42 });
    drawTextBox(page, font, "5. Sender's instructions / Avsändarens instruktioner", project.special_requirements ?? "-", 36, 382, 250, 68, {
      maxChars: 42,
    });
    drawTextBox(page, font, "8. Carrier reservations / Transportörens förbehåll", "", 309, 382, 250, 68, { maxChars: 42 });

    const tableTop = 352;
    const columns = [
      { label: "10. Marks and Numbers / Märken och nummer", x: 36, w: 100 },
      { label: "11. Packages / Antal", x: 136, w: 55 },
      { label: "12. Packing and nature of goods / Förpackning och varuslag", x: 191, w: 195 },
      { label: "13. Gross weight kg / Bruttovikt", x: 386, w: 78 },
      { label: "14. Volume m3 / Volym", x: 464, w: 55 },
      { label: "15. Observations / Anm.", x: 519, w: 40 },
    ];
    for (const column of columns) {
      page.drawRectangle({ x: column.x, y: tableTop, width: column.w, height: 30, borderColor: copy.color, borderWidth: 0.8 });
      splitLines(column.label, Math.floor(column.w / 4.5))
        .slice(0, 2)
        .forEach((line, index) => page.drawText(line, { x: column.x + 3, y: tableTop + 19 - index * 8, size: 6.3, font: bold }));
    }
    const rowHeight = 30;
    cargoItems.slice(0, 5).forEach((cargo, index) => {
      const y = tableTop - rowHeight * (index + 1);
      for (const column of columns) {
        page.drawRectangle({ x: column.x, y, width: column.w, height: rowHeight, borderColor: rgb(0.78, 0.78, 0.78), borderWidth: 0.5 });
      }
      page.drawText(project.customer_reference ?? project.project_number, { x: 39, y: y + 18, size: 6.8, font });
      page.drawText(safe(cargo.quantity), { x: 142, y: y + 18, size: 7.5, font });
      const goodsText = [cargo.description, cargo.technical_info].filter(Boolean).join(" - ");
      splitLines(goodsText, 42).slice(0, 2).forEach((line, lineIndex) => page.drawText(line, { x: 195, y: y + 19 - lineIndex * 8, size: 6.8, font }));
      page.drawText(weightKg(cargo), { x: 390, y: y + 18, size: 7.5, font });
      page.drawText(volume(cargo), { x: 468, y: y + 18, size: 7.5, font });
    });

    drawTextBox(page, font, "9. Documents handed to carrier / Dokument överlämnade", documents, 36, 158, 250, 48, { maxChars: 42 });
    drawTextBox(page, font, "16. Special agreements / Särskilda avtal", project.delivery_terms ?? "-", 309, 158, 250, 48, { maxChars: 42 });
    drawTextBox(page, font, "17. Charges / Avgifter", "Carriage charges / Transportkostnader: ______\nOther charges / Övriga avgifter: ______", 36, 98, 250, 48, {
      maxChars: 42,
      fontSize: 7.5,
    });
    drawTextBox(page, font, "18. Other useful particulars / Andra uppgifter", usefulParticulars || "-", 309, 98, 250, 48, { maxChars: 42, fontSize: 7.5 });
    drawTextBox(page, font, "19. Cash on delivery / Postförskott", "-", 36, 64, 250, 24, { maxChars: 42, fontSize: 7.5 });
    page.drawRectangle({ x: 309, y: 64, width: 250, height: 24, borderColor: copy.color, borderWidth: 0.8 });
    splitLines(
      "20. This carriage is subject, notwithstanding any clause to the contrary, to the Convention on the Contract for the International Carriage of Goods by Road (CMR).",
      76
    )
      .slice(0, 3)
      .forEach((line, index) => page.drawText(line, { x: 314, y: 80 - index * 7, size: 5.8, font: bold }));
    page.drawText(`21. Established in / Upprättad i: ${safe(loading?.name)}  Date / Datum: ${today()}`, { x: 36, y: 48, size: 7.4, font });
    drawTextBox(page, font, "22. Sender signature/stamp / Avsändare", "", 36, 12, 160, 30, { fontSize: 7 });
    drawTextBox(page, font, "23. Carrier signature/stamp / Transportör", "", 216, 12, 160, 30, { fontSize: 7 });
    drawTextBox(page, font, "24. Goods received / Varor mottagna", "", 396, 12, 163, 30, { fontSize: 7 });
    page.drawText(`CMR No / Nr: ${project.project_number}`, { x: 36, y: 4, size: 5.8, font, color: copy.color });
  }

  return pdfBlob(await pdf.save());
}

function setText(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string | number | null | undefined) {
  try {
    form.getTextField(name).setText(safe(value));
  } catch {
    // Some templates may differ slightly; skip missing fields.
  }
}

function setDropdown(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string | number | null | undefined) {
  const nextValue = safe(value);
  try {
    const dropdown = form.getDropdown(name);
    try {
      dropdown.select(nextValue);
    } catch {
      dropdown.addOptions(nextValue);
      dropdown.select(nextValue);
    }
  } catch {
    try {
      form.getTextField(name).setText(nextValue);
    } catch {
      // Skip missing or incompatible fields.
    }
  }
}

export async function generateDomesticWaybillPdf(project: Project) {
  const template = await fetch("/templates/fraktsedelsmall-vid-bokning.pdf").then((response) => {
    if (!response.ok) throw new Error("Kunde inte läsa fraktsedelsmallen.");
    return response.arrayBuffer();
  });
  const pdf = await PDFDocument.load(template);
  const form = pdf.getForm();
  const loading = location(project, "lastning");
  const unloading = location(project, "lossning");
  const cargoItems = project.cargo_items ?? [];

  setText(form, "transportföretag", project.supplier?.company_name ?? "JK Projektlogistik AB");
  setText(form, "adressnamn", project.customer?.company_name);
  setText(form, "gatuadress", loading?.address ?? loading?.name);
  setText(form, "postadress", loading?.name);
  setText(form, "telefon", loading?.contact_phone ?? project.contact_person?.phone ?? project.contact_person?.mobile);
  setText(form, "kundnummer", project.customer_reference ?? project.project_number);
  setText(form, "mottagare", unloading?.name);
  setText(form, "bestämmelsoert", unloading?.address ?? unloading?.name);
  setText(form, "leveransaavvisning", unloading?.contact_name ? `${unloading.contact_name} ${unloading.contact_phone ?? ""}` : unloading?.contact_phone);
  setText(form, "fraktsedelnummer", project.project_number);
  setText(form, "utsdkriftdatum", today());
  setText(form, "avs ref", project.source_document_ref ?? project.customer_reference ?? project.project_number);
  setText(form, "Text17", project.special_requirements);
  setDropdown(form, "transp inst", project.transport_type);

  cargoItems.slice(0, 5).forEach((cargo, index) => {
    const row = index + 1;
    setText(form, `godsmärk ${row}`, project.customer_reference ?? project.project_number);
    setText(form, `varuslag ${row}`, cargo.description);
    setText(form, `vikt ${row}`, weightKg(cargo));
    setText(form, `volym ${row}`, volume(cargo));
    setDropdown(form, `kolliant ${row}`, cargo.quantity ?? 1);
    setDropdown(form, `kollislag ${row}`, "kolli");
  });

  form.flatten();
  return pdfBlob(await pdf.save());
}

export async function generateShippingDocument(project: Project, kind: ShippingDocumentKind) {
  return kind === "cmr" ? generateCmrPdf(project) : generateDomesticWaybillPdf(project);
}
