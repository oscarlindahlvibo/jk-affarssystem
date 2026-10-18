import * as XLSX from "xlsx";
import { csvCell, fileStamp, minutesToHours, swedishDecimal } from "./format";
import type { BuiltExport, ExportInput, PayrollExportAdapter } from "./types";

const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function baseName(input: ExportInput) {
  const suffix = input.exportKind === "correction" ? "-rattelse" : input.exportKind === "reexport" ? "-omexport" : "";
  return `loneunderlag-${slug(input.period.name)}${suffix}-${fileStamp(new Date(input.exportedAt))}`;
}

const HEADERS = ["Anställningsnr", "Extern anställd-ID", "Namn", "Löneperiod", "Från", "Till", "Tidstyp", "Lönekod", "Timmar", "Minuter", "Status", "Typ", "Orsak till rättelse"];

function warningsOf(input: ExportInput) {
  return [...new Set(input.lines.filter((line) => !line.externalCode).map((line) => `Lönekod saknas för "${line.label}".`))];
}

export const csvAdapter: PayrollExportAdapter = {
  id: "csv",
  label: "CSV (Excel, svenska decimaler)",
  description: "Semikolonseparerad fil med decimalkomma som öppnas direkt i svenska Excel. Egnar sig för manuell lönehantering och granskning.",
  verifiedForSystem: null,
  build(input): BuiltExport {
    const rows = input.lines.map((line) => [
      line.employee.employmentNumber ?? "",
      line.employee.externalRef ?? "",
      line.employee.name,
      input.period.name,
      input.period.start_date,
      input.period.end_date,
      line.label,
      line.externalCode ?? "",
      swedishDecimal(minutesToHours(line.minutes)),
      String(line.minutes),
      line.status,
      line.kind === "adjustment" ? "Rättelse" : "Period",
      line.reason ?? "",
    ]);
    const text = [HEADERS, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
    return { fileName: `${baseName(input)}.csv`, mimeType: "text/csv;charset=utf-8", content: `﻿${text}`, rowCount: rows.length, warnings: warningsOf(input) };
  },
};

export const xlsxAdapter: PayrollExportAdapter = {
  id: "xlsx",
  label: "Excel (XLSX)",
  description: "Arbetsbok med summering per anställd och tidstyp samt separat blad för rättelser. Siffror är riktiga tal med två decimaler.",
  verifiedForSystem: null,
  build(input): BuiltExport {
    const toRow = (line: ExportInput["lines"][number]) => ({
      Anställningsnr: line.employee.employmentNumber ?? "",
      "Extern anställd-ID": line.employee.externalRef ?? "",
      Namn: line.employee.name,
      Löneperiod: input.period.name,
      Från: input.period.start_date,
      Till: input.period.end_date,
      Tidstyp: line.label,
      Lönekod: line.externalCode ?? "",
      Timmar: minutesToHours(line.minutes),
      Minuter: line.minutes,
      Status: line.status,
      "Orsak till rättelse": line.reason ?? "",
    });
    const workbook = XLSX.utils.book_new();
    const periodLines = input.lines.filter((line) => line.kind === "period").map(toRow);
    const adjustments = input.lines.filter((line) => line.kind === "adjustment").map(toRow);
    const sheet = XLSX.utils.json_to_sheet(periodLines.length > 0 ? periodLines : [{ Information: "Inga periodrader i den här exporten (rättelseexport)." }]);
    sheet["!cols"] = [14, 18, 24, 18, 12, 12, 24, 12, 10, 10, 12, 30].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, "Löneunderlag");
    if (adjustments.length > 0) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(adjustments), "Rättelser");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return {
      fileName: `${baseName(input)}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: new Uint8Array(bytes),
      rowCount: periodLines.length + adjustments.length,
      warnings: warningsOf(input),
    };
  },
};

// Maskinläsbart format som framtida integrationer (t.ex. en verifierad Spiris-adapter) kan bygga vidare på.
export const jsonAdapter: PayrollExportAdapter = {
  id: "json",
  label: "Strukturerad JSON (för integrationer)",
  description: "Maskinläsbart löneunderlag med decimalpunkt, ISO-datum och tydligt skilda period- och rättelseposter.",
  verifiedForSystem: null,
  build(input): BuiltExport {
    const payload = {
      schema: "jk.payroll-basis.v1",
      exportedAt: input.exportedAt,
      exportKind: input.exportKind,
      period: { id: input.period.id, name: input.period.name, start: input.period.start_date, end: input.period.end_date },
      lines: input.lines.map((line) => ({
        employee: { id: line.employee.userId, employmentNumber: line.employee.employmentNumber, externalRef: line.employee.externalRef, name: line.employee.name },
        timeType: line.timeType,
        label: line.label,
        externalCode: line.externalCode,
        minutes: line.minutes,
        hours: minutesToHours(line.minutes),
        status: line.status,
        kind: line.kind,
        reason: line.reason,
      })),
    };
    return { fileName: `${baseName(input)}.json`, mimeType: "application/json", content: JSON.stringify(payload, null, 2), rowCount: input.lines.length, warnings: warningsOf(input) };
  },
};

export const EXPORT_ADAPTERS: PayrollExportAdapter[] = [csvAdapter, xlsxAdapter, jsonAdapter];

// Spiris Lön: ingen officiellt dokumenterad filimport eller API har kunnat verifieras. Därför finns ingen
// "Spiris-adapter" här. Se docs/lon-och-spiris.md. En framtida adapter läggs till i EXPORT_ADAPTERS när
// ett officiellt stödd format har bekräftats av Spiris.
export function adapterById(id: string): PayrollExportAdapter {
  const adapter = EXPORT_ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(`Okänt exportformat: ${id}`);
  return adapter;
}
