export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // raw:true håller kvar CSV-textvärden som de är (t.ex. "2026-07-01") istället för
  // att SheetJS gissar typ och gör om till Excel-serienummer. cellDates:true gör att
  // riktiga datumceller i .xlsx-filer blir JS Date-objekt, hanterat nedan.
  const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = data[0].map((h) => String(h ?? "").trim());
  const rows = data.slice(1).map((row) =>
    headers.map((_, i) => {
      const cell = row[i];
      if (cell === undefined || cell === null) return "";
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell).trim();
    })
  );

  // Kräv minst två ifyllda celler per rad – rensar bort t.ex. förberedda
  // tomma veckorader i JK:s Excel där bara ett veckonummer är ifyllt.
  return { headers, rows: rows.filter((r) => r.filter((cell) => cell !== "").length >= 2) };
}
