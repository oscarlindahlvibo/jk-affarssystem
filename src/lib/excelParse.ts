export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

const TRANSPORT_HEADERS = ["bokningsnr", "kund", "lastplats/tid", "lossplats/tid", "gods", "transportör"];

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("sv-SE").replace(/\s+/g, " ");
}

function dateToIso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // raw:true håller kvar CSV-textvärden som de är (t.ex. "2026-07-01") istället för
  // att SheetJS gissar typ och gör om till Excel-serienummer. cellDates:true gör att
  // riktiga datumceller i .xlsx-filer blir JS Date-objekt, hanterat nedan.
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: true });
  const scoredSheets = workbook.SheetNames.map((sheetName, index) => {
    const candidate = workbook.Sheets[sheetName];
    const firstRow = XLSX.utils.sheet_to_json<unknown[]>(candidate, { header: 1, range: 0, blankrows: false, defval: "" })[0] ?? [];
    const normalized = firstRow.map(normalizeHeader);
    const score = TRANSPORT_HEADERS.filter((header) => normalized.includes(header)).length;
    return { sheetName, sheet: candidate, score, index };
  });
  const selected = scoredSheets.sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const sheetName = selected?.score >= 3 ? selected.sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  if (data.length === 0) {
    return { sheetName, headers: [], rows: [] };
  }

  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data.slice(1).map((row) =>
    headers.map((_, i) => {
      const cell = row[i];
      if (cell === undefined || cell === null) return "";
      if (cell instanceof Date) return dateToIso(cell);
      return String(cell).trim();
    })
  );

  // Kräv minst två ifyllda celler per rad – rensar bort t.ex. förberedda
  // tomma veckorader i JK:s Excel där bara ett veckonummer är ifyllt.
  return { sheetName, headers, rows: rows.filter((r) => r.filter((cell) => cell !== "").length >= 2) };
}
