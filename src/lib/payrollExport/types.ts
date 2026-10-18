import type { PayrollPeriod } from "../../types";

export interface ExportEmployee {
  userId: string;
  name: string;
  employmentNumber: string | null;
  externalRef: string | null;
}

export type ExportLineKind = "period" | "adjustment";

export interface ExportLine {
  employee: ExportEmployee;
  date: string | null;
  timeType: string;
  label: string;
  externalCode: string | null;
  minutes: number;
  status: string;
  kind: ExportLineKind;
  reason: string | null;
}

export interface ExportInput {
  period: Pick<PayrollPeriod, "id" | "name" | "start_date" | "end_date">;
  lines: ExportLine[];
  exportedAt: string;
  exportKind: "regular" | "correction" | "reexport";
}

export interface BuiltExport {
  fileName: string;
  mimeType: string;
  content: string | Uint8Array;
  rowCount: number;
  warnings: string[];
}

export interface PayrollExportAdapter {
  id: string;
  label: string;
  description: string;
  // true endast när formatet verifierats mot officiell dokumentation för målsystemet.
  verifiedForSystem: string | null;
  build: (input: ExportInput) => BuiltExport;
}
