// Tidsberäkningar i svensk tid (Europe/Stockholm) oberoende av webbläsarens tidszon.
// Passlängder räknas alltid på verkliga tidpunkter (UTC), så sommar-/vintertid ger
// 23- respektive 25-timmarsdygn utan särskild hantering.
export const PAYROLL_TIME_ZONE = "Europe/Stockholm";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let cached = formatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(instant: Date | string | number, timeZone = PAYROLL_TIME_ZONE): LocalParts {
  const date = instant instanceof Date ? instant : new Date(instant);
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function localDateKey(instant: Date | string | number, timeZone = PAYROLL_TIME_ZONE): string {
  const parts = localParts(instant, timeZone);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function localTimeKey(instant: Date | string | number, timeZone = PAYROLL_TIME_ZONE): string {
  const parts = localParts(instant, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function offsetMinutes(utcMs: number, timeZone: string) {
  const parts = localParts(utcMs, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

// Veggtid (datum + HH:MM i angiven tidszon) -> verklig tidpunkt. Tider som inte finns
// (hoppet vid sommartidens start) flyttas framåt, tider som finns två gånger tolkas som den första.
export function zonedTimeToUtc(dateKey: string, time: string, timeZone = PAYROLL_TIME_ZONE): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetMinutes(wall - 86400000, timeZone);
  const after = offsetMinutes(wall + 86400000, timeZone);
  const candidates = [...new Set([wall - before * 60000, wall - after * 60000])]
    .filter((candidate) => {
      const parts = localParts(candidate, timeZone);
      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) === wall;
    })
    .sort((a, b) => a - b);
  // Tid som saknas (hoppet vid sommartidens start) tolkas med tidigare förskjutning, d.v.s. flyttas framåt.
  return new Date(candidates.length > 0 ? candidates[0] : wall - before * 60000);
}

export function startOfLocalDay(dateKey: string, timeZone = PAYROLL_TIME_ZONE): Date {
  return zonedTimeToUtc(dateKey, "00:00", timeZone);
}

export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// 1 = måndag ... 7 = söndag
export function isoWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function startOfIsoWeek(dateKey: string): string {
  return addDays(dateKey, -(isoWeekday(dateKey) - 1));
}

export function compareDateKeys(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; compareDateKeys(cursor, end) <= 0; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function minutesBetweenInstants(start: Date | string, end: Date | string): number {
  return Math.max(Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000), 0);
}
