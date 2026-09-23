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
  options: { maxChars?: number; fontSize?: number; labelMaxChars?: number; labelLines?: number } = {}
) {
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 0.85 });
  const labelFontSize = 6.5;
  const labelLineHeight = 7.2;
  const labelLines = splitLines(label, options.labelMaxChars ?? Math.max(16, Math.floor(width / 4.2))).slice(0, options.labelLines ?? 2);
  labelLines.forEach((line, index) => {
    page.drawText(line, { x: x + 4, y: y + height - 10 - index * labelLineHeight, size: labelFontSize, font, color: rgb(0.05, 0.05, 0.05) });
  });
  const maxChars = options.maxChars ?? Math.max(18, Math.floor(width / 4.8));
  const fontSize = options.fontSize ?? 7.4;
  const lineHeight = fontSize + 1.3;
  const valueTop = y + height - 13 - labelLines.length * labelLineHeight;
  splitLines(value, maxChars)
    .slice(0, Math.max(1, Math.floor((valueTop - y - 4) / lineHeight)))
    .forEach((line, index) => {
      page.drawText(line, { x: x + 4, y: valueTop - index * lineHeight, size: fontSize, font });
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
    const border = rgb(0.05, 0.05, 0.05);
    const left = 24;
    const right = 298;
    const pageWidth = 547;
    const columnWidth = 274;

    page.drawRectangle({ x: left, y: 804, width: pageWidth, height: 20, color: copy.color });
    page.drawText(copy.label, { x: 31, y: 810, size: 8.4, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Pays / Country: SE", { x: 438, y: 810, size: 8, font: bold, color: rgb(1, 1, 1) });

    page.drawRectangle({ x: left, y: 742, width: 164, height: 62, borderColor: border, borderWidth: 0.8 });
    page.drawRectangle({ x: left + 164, y: 742, width: 220, height: 62, borderColor: border, borderWidth: 0.8 });
    page.drawRectangle({ x: left + 384, y: 742, width: 163, height: 62, borderColor: border, borderWidth: 0.8 });
    page.drawEllipse({ x: 106, y: 773, xScale: 43, yScale: 18, borderColor: border, borderWidth: 3 });
    page.drawText("CMR", { x: 82, y: 763, size: 22, font: bold });
    page.drawText("LETTRE DE VOITURE INTERNATIONALE", {
      x: 235,
      y: 781,
      size: 8.8,
      font: bold,
    });
    page.drawText("INTERNATIONAL CONSIGNMENT NOTE", {
      x: 234,
      y: 765,
      size: 8.8,
      font: bold,
    });
    page.drawText(`CMR #${project.project_number}`, { x: left + 2, y: 732, size: 7.5, font: bold });
    page.drawText(`Issued / Upprättad: ${today()}`, { x: 432, y: 732, size: 7.2, font });

    drawTextBox(page, font, "1. Sender (name, address, country) / Avsändare", sender || "-", left, 674, columnWidth, 54, {
      maxChars: 46,
      fontSize: 7.1,
    });
    drawTextBox(page, font, "6. Carrier (name, address, country, references) / Transportör", carrier || "-", right, 614, columnWidth, 114, {
      maxChars: 47,
      fontSize: 7.1,
    });
    drawTextBox(page, font, "2. Consignee (name, address, country) / Mottagare", consignee || "-", left, 614, columnWidth, 60, {
      maxChars: 46,
      fontSize: 7.1,
    });
    drawTextBox(page, font, "3. Taking over the goods / Övertagande av varorna", takingOver, left, 558, columnWidth, 56, {
      maxChars: 47,
      fontSize: 7,
    });
    drawTextBox(page, font, "7. Successive carriers / Efterföljande transportörer", "-", right, 558, columnWidth, 56, {
      maxChars: 47,
      fontSize: 7.1,
    });
    drawTextBox(page, font, "4. Delivery of the goods / Leverans av varorna", delivery, left, 502, columnWidth, 56, {
      maxChars: 47,
      fontSize: 7,
    });
    drawTextBox(page, font, "8. Carrier's reservations and observations / Transportörens förbehåll", "", right, 502, columnWidth, 56, {
      maxChars: 47,
    });
    drawTextBox(page, font, "5. Sender's instructions / Avsändarens instruktioner", project.special_requirements ?? "-", left, 428, columnWidth, 74, {
      maxChars: 52,
      fontSize: 7,
    });
    drawTextBox(page, font, "9. Documents handed to carrier / Dokument överlämnade", documents, right, 428, columnWidth, 74, {
      maxChars: 47,
      fontSize: 7.1,
    });

    const tableTop = 392;
    const columns = [
      { label: "10. Marks and Numbers / Märken och Nummer", x: left, w: 117 },
      { label: "11. Number of Packages / Antal Paket", x: 141, w: 90 },
      { label: "12. Method of Packing / Förpackningsmetod", x: 231, w: 120 },
      { label: "13. Gross Weight / Bruttovikt", x: 351, w: 76 },
      { label: "14. Volume / Volym", x: 427, w: 54 },
      { label: "15. Observations / Observationer", x: 481, w: 90 },
    ];
    for (const column of columns) {
      page.drawRectangle({ x: column.x, y: tableTop, width: column.w, height: 36, borderColor: border, borderWidth: 0.85 });
      splitLines(column.label, Math.floor(column.w / 4.5))
        .slice(0, 3)
        .forEach((line, index) => page.drawText(line, { x: column.x + 4, y: tableTop + 24 - index * 8, size: 6.5, font: bold }));
    }
    const rowHeight = 24;
    const visibleCargo = cargoItems.slice(0, 4);
    visibleCargo.forEach((cargo, index) => {
      const y = tableTop - rowHeight * (index + 1);
      for (const column of columns) {
        page.drawRectangle({ x: column.x, y, width: column.w, height: rowHeight, borderColor: border, borderWidth: 0.65 });
      }
      page.drawText(project.customer_reference ?? project.project_number, { x: left + 4, y: y + 14, size: 6.8, font });
      page.drawText(safe(cargo.quantity), { x: 145, y: y + 14, size: 7.2, font });
      const goodsText = [cargo.description, cargo.technical_info].filter(Boolean).join(" - ");
      splitLines(goodsText, 25).slice(0, 2).forEach((line, lineIndex) => page.drawText(line, { x: 235, y: y + 15 - lineIndex * 8, size: 6.6, font }));
      page.drawText(weightKg(cargo), { x: 355, y: y + 14, size: 7.2, font });
      page.drawText(volume(cargo), { x: 431, y: y + 14, size: 7.2, font });
    });
    const emptyRows = Math.max(0, 5 - visibleCargo.length);
    for (let index = 0; index < emptyRows; index += 1) {
      const y = tableTop - rowHeight * (visibleCargo.length + index + 1);
      for (const column of columns) {
        page.drawRectangle({ x: column.x, y, width: column.w, height: rowHeight, borderColor: border, borderWidth: 0.65 });
      }
    }

    drawTextBox(page, font, "16. Special agreements between the sender and carrier / Särskilda avtal", project.delivery_terms ?? "-", left, 188, 190, 84, {
      maxChars: 36,
      fontSize: 6.9,
      labelMaxChars: 42,
      labelLines: 3,
    });
    page.drawRectangle({ x: 214, y: 188, width: 357, height: 84, borderColor: border, borderWidth: 0.85 });
    page.drawText("17. To be paid by / Att betalas av", { x: 219, y: 259, size: 6.8, font: bold });
    page.drawText("expeditor / expeditor", { x: 378, y: 259, size: 6.3, font: bold });
    page.drawText("destinatar / destinatär", { x: 480, y: 259, size: 6.3, font: bold });
    [248, 233, 218, 203].forEach((lineY) => page.drawLine({ start: { x: 214, y: lineY }, end: { x: 571, y: lineY }, thickness: 0.65, color: border }));
    [374, 476].forEach((lineX) => page.drawLine({ start: { x: lineX, y: 188 }, end: { x: lineX, y: 272 }, thickness: 0.65, color: border }));
    ["Carriage charges / Transportkostnader", "Supplementary charges / Tilläggsavgifter", "Customs duties / Tullavgifter", "Other charges / Övriga avgifter"].forEach(
      (line, index) => page.drawText(line, { x: 219, y: 237 - index * 15, size: 6.5, font })
    );

    drawTextBox(page, font, "18. Other useful particulars / Andra användbara uppgifter", usefulParticulars || "-", left, 156, columnWidth, 32, {
      maxChars: 52,
      fontSize: 6.6,
    });
    drawTextBox(page, font, "19. Cash on delivery / Postförskott", "-", right, 156, columnWidth, 32, { maxChars: 45, fontSize: 6.6 });
    page.drawRectangle({ x: left, y: 126, width: pageWidth, height: 30, borderColor: border, borderWidth: 0.85 });
    splitLines(
      "20. This carriage is subject, notwithstanding any clause to the contrary, to the Convention on the Contract for the International Carriage of Goods by Road (CMR).",
      115
    )
      .slice(0, 3)
      .forEach((line, index) => page.drawText(line, { x: left + 4, y: 145 - index * 8, size: 6.2, font }));
    page.drawRectangle({ x: left, y: 102, width: pageWidth, height: 24, borderColor: border, borderWidth: 0.85 });
    page.drawText(`21. Established in / Upprättad i ${safe(loading?.name)} / Date ${today()}`, { x: left + 4, y: 111, size: 7, font: bold });
    drawTextBox(page, font, "22. Signature or stamp of the sender / Avsändarens underskrift eller stämpel", "", left, 36, 164, 66, {
      fontSize: 6.6,
      labelMaxChars: 33,
      labelLines: 3,
    });
    drawTextBox(page, font, "23. Signature or stamp of the carrier / Transportörens underskrift eller stämpel", "", 188, 36, 164, 66, {
      fontSize: 6.6,
      labelMaxChars: 33,
      labelLines: 3,
    });
    drawTextBox(page, font, "24. Goods received / Varor mottagna", "locul / locu\ndata / data\nSignature or stamp of the consignee / Mottagarens underskrift eller stämpel", 352, 36, 219, 66, {
      maxChars: 48,
      fontSize: 6.4,
      labelMaxChars: 44,
      labelLines: 2,
    });
    page.drawText(`CMR No / Nr: ${project.project_number}`, { x: left, y: 22, size: 5.8, font, color: copy.color });
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
