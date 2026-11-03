import { describe, expect, it } from "vitest";
import type { DocumentFolder } from "./centralDrive";
import { childFolders, folderChain, folderNameError, locationParam, parseLocation } from "./documentFolders";

const folder = (id: string, name: string, parent_id: string | null = null): DocumentFolder => ({ id, name, parent_id, created_at: "2026-11-03T08:00:00Z" });
const folders = [folder("a", "Lyftinstruktioner"), folder("b", "Kranar", "a"), folder("c", "Åtkomst"), folder("d", "Arkiv")];

describe("documentFolders", () => {
  it("läser och skriver platsen i adressen", () => {
    expect(parseLocation(null)).toEqual({ kind: "root" });
    expect(parseLocation("projekt")).toEqual({ kind: "projects" });
    expect(parseLocation("p:123")).toEqual({ kind: "project", projectId: "123" });
    expect(parseLocation("a")).toEqual({ kind: "folder", folderId: "a" });
    for (const value of [null, "projekt", "p:123", "a"]) expect(locationParam(parseLocation(value))).toBe(value);
  });

  it("listar undermappar sorterade på svenska", () => {
    expect(childFolders(folders, null).map((f) => f.name)).toEqual(["Arkiv", "Lyftinstruktioner", "Åtkomst"]);
    expect(childFolders(folders, "a").map((f) => f.name)).toEqual(["Kranar"]);
  });

  it("bygger mappkedjan och klarar saknade mappar och cykler", () => {
    expect(folderChain(folders, "b").map((f) => f.id)).toEqual(["a", "b"]);
    expect(folderChain(folders, "saknas")).toEqual([]);
    expect(folderChain([folder("x", "X", "y"), folder("y", "Y", "x")], "x")).toEqual([]);
  });

  it("validerar mappnamn", () => {
    expect(folderNameError("  ", folders, null)).toMatch(/namn/);
    expect(folderNameError("a/b", folders, null)).toMatch(/snedstreck/);
    expect(folderNameError("projekt", folders, null)).toMatch(/reserverat/);
    expect(folderNameError("projekt", folders, "a")).toBeNull();
    expect(folderNameError("lyftinstruktioner", folders, null)).toMatch(/redan/);
    expect(folderNameError("Lyftinstruktioner", folders, null, "a")).toBeNull();
    expect(folderNameError("Kranar", folders, null)).toBeNull();
    expect(folderNameError("x".repeat(121), folders, null)).toMatch(/120/);
  });
});
