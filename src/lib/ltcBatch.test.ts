import { describe, expect, it } from "vitest";
import { removeSheetsFromGroups, unloadingContactLabel, type LtcGroup } from "./ltcBatch";

describe("removeSheetsFromGroups", () => {
  const group = (id: string, sheetIds: string[], done = false) =>
    ({ id, sheetIds, done, previewSheetId: sheetIds[0] ?? null, items: sheetIds.map((sheetId) => ({ sheetId, include: true })) }) as unknown as LtcGroup;

  it("tar bort bladen och deras godsrader och tomma grupper", () => {
    const result = removeSheetsFromGroups([group("g1", ["a", "b"]), group("g2", ["c"])], ["b", "c"]);
    expect(result.map((g) => g.id)).toEqual(["g1"]);
    expect(result[0].sheetIds).toEqual(["a"]);
    expect(result[0].items.map((i) => i.sheetId)).toEqual(["a"]);
  });
  it("flyttar förhandsvisningen till ett kvarvarande blad", () => {
    const [g] = removeSheetsFromGroups([group("g1", ["a", "b"])], ["a"]);
    expect(g.previewSheetId).toBe("b");
  });
  it("lämnar färdiga grupper orörda", () => {
    const done = group("g1", ["a"], true);
    expect(removeSheetsFromGroups([done], ["a"])).toEqual([done]);
  });
});

describe("unloadingContactLabel", () => {
  it("visar kontakten även utan företagsnamn", () => {
    expect(unloadingContactLabel("Ulf (byggledare)", null)).toBe("Ulf (byggledare)");
    expect(unloadingContactLabel("Anders", "Falköpings Mejeri")).toBe("Anders (Falköpings Mejeri)");
    expect(unloadingContactLabel(null, "Falköpings Mejeri")).toBe("Falköpings Mejeri");
    expect(unloadingContactLabel(undefined, undefined)).toBe("");
  });
});
