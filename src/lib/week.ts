// Veckan räknas från måndag. offset 0 = denna vecka, 1 = nästa vecka.
export function isInWeek(dateStr: string | null | undefined, offset = 0): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}
