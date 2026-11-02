import { describe, expect, it } from "vitest";
import { isInitialNote, parseProjectEvent, projectEventMessage } from "../../supabase/functions/_shared/projectEvents";

const ID = "7543c8a8-0714-4ee1-b211-50b61ced51fd";

describe("projectEvents", () => {
  it("godtar bara kända händelser med riktiga id", () => {
    expect(parseProjectEvent({ type: "note", id: ID, actor: null })).toEqual({ type: "note", id: ID, actor: null });
    expect(parseProjectEvent({ type: "project", id: ID, actor: ID })?.actor).toBe(ID);
    expect(parseProjectEvent({ type: "project", id: ID, actor: "x" })?.actor).toBeNull();
    expect(parseProjectEvent({ type: "delete", id: ID })).toBeNull();
    expect(parseProjectEvent({ type: "note", id: "1 or 1=1" })).toBeNull();
    expect(parseProjectEvent(null)).toBeNull();
  });

  it("hoppar över anteckningen som skapas samtidigt som projektet", () => {
    expect(isInitialNote("2026-11-02T08:00:03Z", "2026-11-02T08:00:00Z")).toBe(true);
    expect(isInitialNote("2026-11-02T08:05:00Z", "2026-11-02T08:00:00Z")).toBe(false);
  });

  it("formulerar notisen för projekt och anteckning", () => {
    const project = { project_number: "JK-2026-0101", name: "Kran till Boden", customer: "Holtab", booking_source: "customer_portal" };
    expect(projectEventMessage("project", project)).toEqual({ title: "Nytt projekt · JK-2026-0101", body: "Kran till Boden · Holtab (bokning via kundportalen)" });
    const note = projectEventMessage("note", project, { user_name: "Patricia", text: `Ring   kunden\n${"x".repeat(300)}` });
    expect(note.title).toBe("Ny anteckning · JK-2026-0101");
    expect(note.body.startsWith("Patricia: Ring kunden xxx")).toBe(true);
    expect(note.body.length).toBe(200);
    expect(projectEventMessage("note", project, { text: "hej" }).body).toBe("Någon: hej");
  });
});
