// Svenska helgdagar (röda dagar) och helgdagsaftnar för att kunna klassificera arbetsdagar.
import { addDays } from "./stockholmTime";

export type HolidayKind = "holiday" | "eve";

export interface Holiday {
  date: string;
  name: string;
  kind: HolidayKind;
}

const pad = (value: number) => String(value).padStart(2, "0");

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Påskdagen (Gauss algoritm för gregorianska kalendern)
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKey(year, month, day);
}

function weekdayOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function saturdayInRange(year: number, month: number, firstDay: number) {
  for (let day = firstDay; day < firstDay + 7; day += 1) {
    const key = dateKey(year, month, day);
    if (weekdayOf(key) === 6) return key;
  }
  throw new Error("Ingen lördag i intervallet");
}

export function swedishHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const midsummerDay = saturdayInRange(year, 6, 20);
  // Alla helgons dag är lördagen mellan 31 oktober och 6 november.
  let allSaintsDay = dateKey(year, 10, 31);
  while (weekdayOf(allSaintsDay) !== 6) allSaintsDay = addDays(allSaintsDay, 1);
  return [
    { date: dateKey(year, 1, 1), name: "Nyårsdagen", kind: "holiday" },
    { date: dateKey(year, 1, 6), name: "Trettondedag jul", kind: "holiday" },
    { date: addDays(easter, -3), name: "Skärtorsdagen", kind: "eve" },
    { date: addDays(easter, -2), name: "Långfredagen", kind: "holiday" },
    { date: addDays(easter, -1), name: "Påskafton", kind: "eve" },
    { date: easter, name: "Påskdagen", kind: "holiday" },
    { date: addDays(easter, 1), name: "Annandag påsk", kind: "holiday" },
    { date: dateKey(year, 4, 30), name: "Valborgsmässoafton", kind: "eve" },
    { date: dateKey(year, 5, 1), name: "Första maj", kind: "holiday" },
    { date: addDays(easter, 38), name: "Dagen före Kristi himmelsfärd", kind: "eve" },
    { date: addDays(easter, 39), name: "Kristi himmelsfärdsdag", kind: "holiday" },
    { date: addDays(easter, 48), name: "Pingstafton", kind: "eve" },
    { date: addDays(easter, 49), name: "Pingstdagen", kind: "holiday" },
    { date: dateKey(year, 6, 6), name: "Sveriges nationaldag", kind: "holiday" },
    { date: addDays(midsummerDay, -1), name: "Midsommarafton", kind: "eve" },
    { date: midsummerDay, name: "Midsommardagen", kind: "holiday" },
    { date: allSaintsDay, name: "Alla helgons dag", kind: "holiday" },
    { date: dateKey(year, 12, 24), name: "Julafton", kind: "eve" },
    { date: dateKey(year, 12, 25), name: "Juldagen", kind: "holiday" },
    { date: dateKey(year, 12, 26), name: "Annandag jul", kind: "holiday" },
    { date: dateKey(year, 12, 31), name: "Nyårsafton", kind: "eve" },
  ];
}

const cache = new Map<number, Map<string, Holiday>>();

export function holidayOn(date: string): Holiday | null {
  const year = Number(date.slice(0, 4));
  let map = cache.get(year);
  if (!map) {
    map = new Map(swedishHolidays(year).map((holiday) => [holiday.date, holiday]));
    cache.set(year, map);
  }
  return map.get(date) ?? null;
}
