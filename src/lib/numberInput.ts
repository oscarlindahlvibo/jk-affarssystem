// Tolkar användarinmatning med svenskt decimalkomma. Tom inmatning blir null.
export function parseDecimal(value: string): number | null {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function decimalText(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "";
  return String(Math.round(value * 10 ** digits) / 10 ** digits).replace(".", ",");
}
