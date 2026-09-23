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
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const loading = location(project, "lastning");
  const unloading = location(project, "lossning");
  const cargoItems = project.cargo_items ?? [];

  page.drawText("LETTRE DE VOITURE INTERNATIONALE / INTERNATIONAL CONSIGNMENT NOTE", {
    x: 110,
    y: 810,
    size: 10,
    font: bold,
  });
  page.drawText("CMR", { x: 276, y: 790, size: 18, font: bold, color: rgb(0.85, 0.2, 0.05) });
  page.drawText(`Projekt: ${project.project_number}`, { x: 36, y: 790, size: 9, font });
  page.drawText(`Datum: ${today()}`, { x: 480, y: 790, size: 9, font });

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

  drawTextBox(page, font, "1. Sender / Avsändare", sender || "-", 36, 675, 250, 100, { maxChars: 42 });
  drawTextBox(page, font, "6. Carrier / Transportör", carrier || "-", 309, 675, 250, 100, { maxChars: 42 });
  drawTextBox(page, font, "2. Consignee / Mottagare", consignee || "-", 36, 560, 250, 100, { maxChars: 42 });
  drawTextBox(page, font, "7. Successive carriers / Efterföljande transportörer", "-", 309, 560, 250, 100, { maxChars: 42 });
  drawTextBox(
    page,
    font,
    "3. Taking over the goods / Övertagande",
    [`Plats: ${safe(loading?.name)}`, `Adress: ${safe(loading?.address)}`, `Datum: ${safe(project.planned_loading_date)}`].join("\n"),
    36,
    475,
    250,
    72,
    { maxChars: 42 }
  );
  drawTextBox(
    page,
    font,
    "4. Delivery of the goods / Leverans",
    [`Plats: ${safe(unloading?.name)}`, `Adress: ${safe(unloading?.address)}`, `Datum: ${safe(project.planned_delivery_date)}`].join("\n"),
    309,
    475,
    250,
    72,
    { maxChars: 42 }
  );
  drawTextBox(page, font, "5. Sender's instructions / Avsändarens instruktioner", project.special_requirements ?? "-", 36, 390, 523, 72, {
    maxChars: 92,
  });

  const tableTop = 360;
  const columns = [
    { label: "10. Marks / Märkning", x: 36, w: 118 },
    { label: "11. Antal", x: 154, w: 56 },
    { label: "12. Varuslag", x: 210, w: 170 },
    { label: "13. Vikt kg", x: 380, w: 76 },
    { label: "14. Volym m3", x: 456, w: 70 },
    { label: "15. Obs", x: 526, w: 33 },
  ];
  for (const column of columns) {
    page.drawRectangle({ x: column.x, y: tableTop, width: column.w, height: 28, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.6 });
    page.drawText(column.label, { x: column.x + 3, y: tableTop + 10, size: 6.7, font: bold });
  }
  const rowHeight = 34;
  const rows = cargoItems.slice(0, 6);
  rows.forEach((cargo, index) => {
    const y = tableTop - rowHeight * (index + 1);
    for (const column of columns) {
      page.drawRectangle({ x: column.x, y, width: column.w, height: rowHeight, borderColor: rgb(0.82, 0.82, 0.82), borderWidth: 0.5 });
    }
    page.drawText(project.customer_reference ?? "-", { x: 39, y: y + 20, size: 7, font });
    page.drawText(safe(cargo.quantity), { x: 160, y: y + 20, size: 8, font });
    splitLines(cargo.description, 31).slice(0, 2).forEach((line, lineIndex) => page.drawText(line, { x: 214, y: y + 21 - lineIndex * 9, size: 7, font }));
    page.drawText(weightKg(cargo), { x: 384, y: y + 20, size: 8, font });
    page.drawText(volume(cargo), { x: 460, y: y + 20, size: 8, font });
  });

  drawTextBox(page, font, "16. Special agreements / Särskilda avtal", project.delivery_terms ?? "-", 36, 96, 250, 84, { maxChars: 44 });
  drawTextBox(page, font, "18. Other useful particulars / Andra uppgifter", `Sträcka: ${safe(project.route_distance_km)} km`, 309, 96, 250, 84, {
    maxChars: 44,
  });
  drawTextBox(page, font, "22. Sender signature / Avsändare", "", 36, 30, 160, 52);
  drawTextBox(page, font, "23. Carrier signature / Transportör", "", 216, 30, 160, 52);
  drawTextBox(page, font, "24. Goods received / Mottagare", "", 396, 30, 163, 52);

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
