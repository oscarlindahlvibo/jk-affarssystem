// Svenska decimaler i användarvänliga filer: komma som decimaltecken, timmar med två decimaler.
export function swedishDecimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace(".", ",");
}

export const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+@-]/.test(text) && Number.isNaN(Number(text.replace(",", "."))) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function sha256Hex(content: string | Uint8Array): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
