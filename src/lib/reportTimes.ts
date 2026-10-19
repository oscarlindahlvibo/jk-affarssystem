// Start- och sluttid på rapporterat arbete. Klockslag i svensk tid på rapportdatumet ("HH:MM"). Slut före start betyder
// att passet går över midnatt. Timmarna kan alltid anges direkt och begränsas inte av start/slut.
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export const normalizeTime = (value: string | null | undefined): string | null => {
  const match = value ? TIME.exec(value.trim()) : null;
  return match ? `${match[1]}:${match[2]}` : null;
};

// Minuter mellan start och slut; slut före eller lika med start räknas som nästa dygn. Null om något saknas/är ogiltigt.
export function spanMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!s || !e) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(e) - toMin(s);
  return diff > 0 ? diff : diff + 24 * 60;
}

export const formatTimeRange = (start: string | null | undefined, end: string | null | undefined): string | null => {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  return s && e ? `${s}–${e}` : null;
};
