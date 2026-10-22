import { describe, expect, it } from "vitest";
import { dismissKey, formatEventWindow, visibleNotices, type SystemNotice } from "./systemNotices";

const base: SystemNotice = {
  id: "a", title: "Underhåll", body: "", severity: "warning", kind: "maintenance", show_from: "2026-10-22T08:00:00Z", show_until: "2026-10-24T08:00:00Z",
  event_starts_at: null, event_ends_at: null, updated_at: "2026-10-21T10:00:00Z",
};
const now = new Date("2026-10-23T08:00:00Z");

describe("driftmeddelanden", () => {
  it("visas bara inom visningsfönstret", () => {
    expect(visibleNotices([base], [], now)).toHaveLength(1);
    expect(visibleNotices([base], [], new Date("2026-10-22T07:59:00Z"))).toHaveLength(0);
    expect(visibleNotices([base], [], new Date("2026-10-24T08:00:00Z"))).toHaveLength(0);
  });
  it("kritiska först och de går inte att dölja", () => {
    const critical = { ...base, id: "c", severity: "critical" as const };
    const info = { ...base, id: "i", severity: "info" as const };
    expect(visibleNotices([info, base, critical], [], now).map((n) => n.id)).toEqual(["c", "a", "i"]);
    expect(visibleNotices([critical], [dismissKey(critical)], now)).toHaveLength(1);
  });
  it("dolt meddelande visas igen när det ändrats", () => {
    expect(visibleNotices([base], [dismissKey(base)], now)).toHaveLength(0);
    expect(visibleNotices([{ ...base, updated_at: "2026-10-22T09:00:00Z" }], [dismissKey(base)], now)).toHaveLength(1);
  });
  it("underhållsfönstret formateras", () => {
    expect(formatEventWindow(null, null)).toBe("");
    expect(formatEventWindow("2026-10-23T20:00:00Z", "2026-10-23T21:30:00Z")).toMatch(/kl\. \d\d:\d\d–\d\d:\d\d/);
    expect(formatEventWindow("2026-10-23T20:00:00Z", null)).toMatch(/kl\. \d\d:\d\d$/);
  });
});
