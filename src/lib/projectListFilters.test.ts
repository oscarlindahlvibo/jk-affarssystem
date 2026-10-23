import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, FILTER_STORAGE_KEY, initialFilters, readFilterPrefs, writeFilterPrefs } from "./projectListFilters";

const memory = (initial?: string) => {
  let value: string | null = initial ?? null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
};

describe("filter i projektlistan", () => {
  it("återställer det som sparats, t.ex. Nästa vecka", () => {
    const storage = memory();
    writeFilterPrefs(storage, { ...EMPTY_FILTERS, quickFilter: "nasta-vecka", responsible: "Anna", showClosed: true, search: "volvo" });
    expect(readFilterPrefs(storage)).toMatchObject({ quickFilter: "nasta-vecka", responsible: "Anna", showClosed: true, search: "volvo" });
  });
  it("faller tillbaka till alla projekt utan lagring eller med trasigt innehåll", () => {
    expect(readFilterPrefs(null)).toEqual(EMPTY_FILTERS);
    expect(readFilterPrefs(memory("{trasigt"))).toEqual(EMPTY_FILTERS);
    expect(readFilterPrefs(memory(JSON.stringify({ quickFilter: "finns-inte", measurement: "x", showClosed: "ja", status: 5 })))).toEqual(EMPTY_FILTERS);
    expect(FILTER_STORAGE_KEY).toContain("projectList");
  });
  it("en länk med filter eller sökning går före det sparade", () => {
    const storage = memory(JSON.stringify({ ...EMPTY_FILTERS, quickFilter: "nasta-vecka", customerId: "k1" }));
    expect(initialFilters(storage, null, "")).toMatchObject({ quickFilter: "nasta-vecka", customerId: "k1" });
    expect(initialFilters(storage, "pa-vag", "")).toEqual({ ...EMPTY_FILTERS, quickFilter: "pa-vag" });
    expect(initialFilters(storage, null, "volvo")).toEqual(EMPTY_FILTERS);
  });
  it("skriver inte om lagringen kastar fel", () => {
    expect(() => writeFilterPrefs({ getItem: () => null, setItem: () => { throw new Error("full"); } }, EMPTY_FILTERS)).not.toThrow();
  });
});
