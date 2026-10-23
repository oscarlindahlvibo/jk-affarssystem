// Valda filter och flik i projektlistan sparas för webbläsarsessionen, så att man hamnar kvar i samma vy (t.ex. "Nästa vecka")
// när man går in på ett projekt och tillbaka. Sessionen avslutas när fliken stängs, så ett gammalt val dröjer sig inte kvar.
export const QUICK_FILTER_KEYS = [
  "alla", "nya", "kundbokningar", "forfragningar", "planera", "prioriterade", "denna-vecka", "nasta-vecka", "pa-vag", "levererade", "saknar-uppgifter", "kraver-foljebil",
] as const;
export type QuickFilterKey = (typeof QUICK_FILTER_KEYS)[number];

export interface FilterPrefs {
  quickFilter: QuickFilterKey;
  status: string;
  customerId: string;
  responsible: string;
  measurement: "" | "finns" | "saknas";
  dateFrom: string;
  showClosed: boolean;
  search: string;
}

export const FILTER_STORAGE_KEY = "jk.projectList.filters";
export const EMPTY_FILTERS: FilterPrefs = { quickFilter: "alla", status: "", customerId: "", responsible: "", measurement: "", dateFrom: "", showClosed: false, search: "" };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isQuickFilter(value: unknown): value is QuickFilterKey {
  return QUICK_FILTER_KEYS.includes(value as QuickFilterKey);
}

export function readFilterPrefs(storage: StorageLike | null): FilterPrefs {
  if (!storage) return EMPTY_FILTERS;
  try {
    const stored = JSON.parse(storage.getItem(FILTER_STORAGE_KEY) ?? "null") as Partial<FilterPrefs> | null;
    if (!stored || typeof stored !== "object") return EMPTY_FILTERS;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      quickFilter: isQuickFilter(stored.quickFilter) ? stored.quickFilter : "alla",
      status: text(stored.status),
      customerId: text(stored.customerId),
      responsible: text(stored.responsible),
      measurement: stored.measurement === "finns" || stored.measurement === "saknas" ? stored.measurement : "",
      dateFrom: text(stored.dateFrom),
      showClosed: stored.showClosed === true,
      search: text(stored.search),
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function writeFilterPrefs(storage: StorageLike | null, prefs: FilterPrefs) {
  try {
    storage?.setItem(FILTER_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Utan lagring fungerar filtren som förut, men återställs när man lämnar listan.
  }
}

// Kommer man via en länk med filter eller sökning (t.ex. från dashboarden) gäller länken, inte det som sparats från förra besöket.
export function initialFilters(storage: StorageLike | null, urlFilter: QuickFilterKey | null, urlSearch: string): FilterPrefs {
  return urlFilter || urlSearch ? { ...EMPTY_FILTERS, quickFilter: urlFilter ?? "alla" } : readFilterPrefs(storage);
}
