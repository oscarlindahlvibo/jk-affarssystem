import { describe, expect, it } from "vitest";
import { unreadCount, visibleNotifications, type InboxNotification } from "./notificationInbox";

const row = (id: string, created_at: string, read_at: string | null = null, cleared_at: string | null = null): InboxNotification => ({
  id, kind: "note", title: id, body: "", url: null, project_id: null, created_at, read_at, cleared_at,
});

describe("notificationInbox", () => {
  const rows = [
    row("gammal", "2026-11-01T08:00:00Z", "2026-11-01T09:00:00Z"),
    row("ny", "2026-11-03T08:00:00Z"),
    row("rensad", "2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z", "2026-11-02T09:00:00Z"),
    row("rensad-oläst", "2026-11-02T10:00:00Z", null, "2026-11-02T11:00:00Z"),
  ];

  it("räknar bara olästa notiser som inte är rensade", () => {
    expect(unreadCount(rows)).toBe(1);
  });

  it("döljer rensade som standard och visar dem som historik, nyast först", () => {
    expect(visibleNotifications(rows, false).map((r) => r.id)).toEqual(["ny", "gammal"]);
    expect(visibleNotifications(rows, true).map((r) => r.id)).toEqual(["ny", "rensad-oläst", "rensad", "gammal"]);
  });
});
