import { describe, expect, it } from "vitest";
import {
  addEntries, changeEntry, clockTransition, decideCorrection, deleteEntry, emptyAttendanceState, lockState, requestCorrection, saveAbsence,
  type Actor, type AttendanceState,
} from "./attendanceEngine";
import { attestStatement, createExport, createPeriod, recordAdjustment, reviewStatement, submitStatement, unattestStatement } from "./payrollFlow";
import { zonedTimeToUtc } from "./stockholmTime";

const org = "o1";
const admin: Actor = { id: "admin", orgId: org, role: "admin" };
const pl: Actor = { id: "pl", orgId: org, role: "projektledare" };
const eko: Actor = { id: "eko", orgId: org, role: "ekonomi" };
const emp: Actor = { id: "emp", orgId: org, role: "lasare" };
const NOW = "2026-10-18T12:00:00.000Z";
const at = (date: string, time: string) => zonedTimeToUtc(date, time).toISOString();

function dayShift(state: AttendanceState, actor: Actor, date: string) {
  return addEntries(state, actor, [
    { type: "work", start: at(date, "07:00"), end: at(date, "12:00") },
    { type: "lunch", start: at(date, "12:00"), end: at(date, "12:30") },
    { type: "work", start: at(date, "12:30"), end: at(date, "17:00") },
  ], null, null, NOW);
}

describe("stämpelklocka", () => {
  it("stämplar in, tar lunch, återgår och stämplar ut: 9,5 timmar arbete", () => {
    let s = emptyAttendanceState();
    let r = clockTransition(s, emp, { id: "a", action: "clockin", expected: null, eventIso: at("2026-10-12", "07:00") }, NOW);
    r = clockTransition(r.state, emp, { id: "b", action: "lunch", expected: "a", eventIso: at("2026-10-12", "12:00"), comment: "Förmiddag" }, NOW);
    r = clockTransition(r.state, emp, { id: "c", action: "resume", expected: "b", eventIso: at("2026-10-12", "12:30") }, NOW);
    r = clockTransition(r.state, emp, { id: "d", action: "clockout", expected: "c", eventIso: at("2026-10-12", "17:00"), comment: "Klart" }, NOW);
    s = r.state;
    expect(r.current).toBeNull();
    expect(s.entries.filter((e) => e.entry_type === "work").reduce((m, e) => m + e.total_minutes, 0)).toBe(570);
    expect(s.entries.filter((e) => !e.end_time)).toHaveLength(0);
    expect(s.entries.find((e) => e.id === "a")!.comment).toContain("Förmiddag");
  });

  it("förhindrar dubbla öppna stämplingar och hanterar flera enheter säkert", () => {
    const first = clockTransition(emptyAttendanceState(), emp, { id: "a", action: "clockin", expected: null, eventIso: at("2026-10-12", "07:00") }, NOW);
    expect(() => clockTransition(first.state, emp, { id: "x", action: "clockin", expected: null, eventIso: at("2026-10-12", "07:05") }, NOW)).toThrow("CLOCK_STATE_CONFLICT");
    const paused = clockTransition(first.state, emp, { id: "b", action: "break", expected: "a", eventIso: at("2026-10-12", "09:00") }, NOW);
    expect(() => clockTransition(paused.state, emp, { id: "y", action: "break", expected: "a", eventIso: at("2026-10-12", "09:05") }, NOW)).toThrow("CLOCK_STATE_CONFLICT");
    expect(() => clockTransition(first.state, emp, { id: "z", action: "clockout", expected: null, eventIso: at("2026-10-12", "10:00") }, NOW)).toThrow("CLOCK_STATE_CONFLICT");
  });

  it("nekar utstämpling utan pågående pass och pass i framtiden", () => {
    expect(() => clockTransition(emptyAttendanceState(), emp, { id: "a", action: "clockout", expected: null, eventIso: at("2026-10-12", "07:00") }, NOW)).toThrow("Ingen pågående");
    expect(() => clockTransition(emptyAttendanceState(), emp, { id: "a", action: "clockin", expected: null, eventIso: "2027-01-01T07:00:00Z" }, NOW)).toThrow("Ogiltig");
  });

  it("lägger till missad dag atomiskt och nekar överlapp, framtid och >24 h", () => {
    const s = dayShift(emptyAttendanceState(), emp, "2026-10-12");
    expect(s.entries).toHaveLength(3);
    expect(() => addEntries(s, emp, [{ type: "work", start: at("2026-10-12", "08:00"), end: at("2026-10-12", "09:00") }], null, null, NOW)).toThrow("överlappar");
    expect(() => addEntries(emptyAttendanceState(), emp, [{ type: "work", start: at("2030-10-12", "08:00"), end: at("2030-10-12", "09:00") }], null, null, NOW)).toThrow("framtiden");
    expect(() => addEntries(emptyAttendanceState(), emp, [{ type: "work", start: at("2026-10-10", "08:00"), end: at("2026-10-11", "10:00") }], null, null, NOW)).toThrow("24 timmar");
    expect(() => addEntries(emptyAttendanceState(), emp, [{ type: "work", start: at("2026-10-12", "08:00"), end: at("2026-10-12", "10:00") }, { type: "work", start: at("2026-10-12", "09:00"), end: at("2026-10-12", "11:00") }], null, null, NOW)).toThrow("överlappar");
  });

  it("anställd kan inte lägga in tid åt andra men projektledare kan, med orsak", () => {
    const item = [{ type: "work" as const, start: at("2026-10-12", "08:00"), end: at("2026-10-12", "09:00") }];
    expect(() => addEntries(emptyAttendanceState(), emp, item, "other", "x", NOW)).toThrow("nekas");
    expect(() => addEntries(emptyAttendanceState(), pl, item, "emp", "", NOW)).toThrow("orsak");
    expect(addEntries(emptyAttendanceState(), pl, item, "emp", "Glömd stämpling", NOW).entries[0].source).toBe("admin");
  });
});

describe("korrigeringar och revisionshistorik", () => {
  it("anställd föreslår, behörig godkänner och historiken bevarar ursprung, ny, tid, vem och orsak", () => {
    let s = dayShift(emptyAttendanceState(), emp, "2026-10-12");
    const entry = s.entries.find((e) => e.entry_type === "work" && e.start_time === at("2026-10-12", "12:30"))!;
    s = requestCorrection(s, emp, { id: "c1", action: "change", entryId: entry.id, type: "work", start: entry.start_time, end: at("2026-10-12", "17:30"), reason: "Glömde stämpla ut" }, NOW);
    expect(() => decideCorrection(s, emp, "c1", true, "", NOW)).toThrow("nekas");
    s = decideCorrection(s, pl, "c1", true, "Ok", NOW);
    expect(s.entries.find((e) => e.id === entry.id)!.end_time).toBe(at("2026-10-12", "17:30"));
    const log = s.audit.find((a) => a.action === "update")!;
    expect(log.before!.end_time).toBe(at("2026-10-12", "17:00"));
    expect(log.after!.end_time).toBe(at("2026-10-12", "17:30"));
    expect(log.changed_by).toBe("pl");
    expect(log.reason).toContain("Glömde stämpla ut");
    expect(() => decideCorrection(s, pl, "c1", true, "", NOW)).toThrow("redan hanterad");
  });

  it("kräver orsak för ändring och borttagning och loggar borttagning", () => {
    const s = dayShift(emptyAttendanceState(), emp, "2026-10-12");
    const entry = s.entries[2];
    expect(() => deleteEntry(s, emp, entry.id, "", NOW)).toThrow("orsak");
    const after = deleteEntry(s, emp, entry.id, "Felaktigt pass", NOW);
    expect(after.entries).toHaveLength(2);
    expect(after.audit.find((a) => a.action === "delete")!.before!.id).toBe(entry.id);
  });
});

describe("löneperiod, attest, export och rättelse", () => {
  const totals = { workedMinutes: 570, ordinaryMinutes: 480, overtime: { overtime_1: 90 }, absence: {} };

  function prepared() {
    let s = dayShift(emptyAttendanceState(), emp, "2026-09-15");
    s = createPeriod(s, eko, "September", "2026-09-01", "2026-09-30");
    return { s, periodId: s.periods[0].id };
  }

  it("skapar bara icke-överlappande perioder och bara för ekonomi/admin", () => {
    const { s } = prepared();
    expect(() => createPeriod(s, eko, "Dubbel", "2026-09-15", "2026-10-15")).toThrow("överlappar");
    expect(() => createPeriod(s, emp, "X", "2026-11-01", "2026-11-30")).toThrow("nekas");
  });

  it("attesterar, låser perioden för anställd men låter behörig öppna den igen med orsak", () => {
    let { s, periodId } = prepared();
    s = submitStatement(s, emp, periodId, NOW);
    expect(() => attestStatement(s, pl, periodId, "pl", totals, [], {}, NOW)).toThrow("egen tid");
    expect(() => attestStatement(s, pl, periodId, "emp", { x: 1 }, [], {}, NOW)).toThrow("Ogiltigt");
    s = attestStatement(s, pl, periodId, "emp", totals, [], { rules: 1 }, NOW);
    expect(lockState(s, "emp", "2026-09-15", "2026-09-15")).toBe("attested");
    const entry = s.entries.find((e) => e.start_time === at("2026-09-15", "07:00"))!;
    const change = { type: "work" as const, start: entry.start_time, end: entry.end_time!, comment: "" };
    expect(() => changeEntry(s, emp, entry.id, change, "x", NOW)).toThrow("attesterad");
    expect(() => changeEntry(s, pl, entry.id, change, "", NOW)).toThrow("orsak");
    const reopened = changeEntry(s, pl, entry.id, change, "Rättat start", NOW);
    expect(reopened.statements[0].status).toBe("preliminary");
    expect(reopened.log.some((l) => l.action === "reopened_by_change")).toBe(true);
  });

  it("ekonomi kan inte registrera frånvaro i attesterad period", () => {
    let { s, periodId } = prepared();
    s = attestStatement(s, pl, periodId, "emp", totals, [], {}, NOW);
    expect(() => saveAbsence(s, eko, { userId: "emp", date: "2026-09-20", kind: "absence_sick", minutes: 480, comment: "" }, "x", NOW)).toThrow("attesterad");
  });

  it("kräver granskning före export och förhindrar dubbel export utan bekräftelse med orsak", () => {
    let { s, periodId } = prepared();
    s = attestStatement(s, pl, periodId, "emp", totals, [], {}, NOW);
    const statementId = s.statements[0].id;
    const req = { periodId, statementIds: [statementId], format: "csv", checksum: "abc", rowCount: 3, force: false, reason: "" };
    expect(() => createExport(s, eko, req, NOW)).toThrow("granskade");
    s = reviewStatement(s, eko, statementId, NOW);
    expect(() => createExport(s, pl, req, NOW)).toThrow("admin eller ekonomi");
    s = createExport(s, eko, req, NOW).state;
    expect(s.statements[0].status).toBe("exported");
    expect(() => createExport(s, eko, req, NOW)).toThrow("Redan exporterat");
    expect(() => createExport(s, eko, { ...req, force: true }, NOW)).toThrow("Redan exporterat");
    const again = createExport(s, eko, { ...req, force: true, reason: "Behövde filen igen" }, NOW);
    expect(again.kind).toBe("reexport");
    expect(() => unattestStatement(s, pl, statementId, "x", NOW)).toThrow("Exporterade");
  });

  it("rättelse efter export är spårbar: flaggas, registreras som differens och exporteras som korrigering", () => {
    let { s, periodId } = prepared();
    s = attestStatement(s, pl, periodId, "emp", totals, [], {}, NOW);
    const statementId = s.statements[0].id;
    s = reviewStatement(s, eko, statementId, NOW);
    s = createExport(s, eko, { periodId, statementIds: [statementId], format: "csv", checksum: "a", rowCount: 1, force: false, reason: "" }, NOW).state;
    const entry = s.entries.find((e) => e.start_time === at("2026-09-15", "07:00"))!;
    const change = { type: "work" as const, start: entry.start_time, end: entry.end_time!, comment: "" };
    expect(() => changeEntry(s, pl, entry.id, change, "x", NOW)).toThrow("exporterad");
    expect(() => changeEntry(s, admin, entry.id, change, "", NOW)).toThrow("orsak");
    s = changeEntry(s, admin, entry.id, { ...change, end: at("2026-09-15", "11:30") }, "Rättelse", NOW);
    expect(s.statements[0].pending_adjustment).toBe(true);
    expect(() => createExport(s, eko, { periodId, statementIds: [statementId], format: "csv", checksum: "b", rowCount: 1, force: false, reason: "" }, NOW)).toThrow("rättelse väntar");
    const adjusted = recordAdjustment(s, eko, statementId, { workedMinutes: 600, ordinaryMinutes: 480, overtime: { overtime_1: 120 }, absence: {} }, [], "Rättelse", NOW);
    expect(adjusted.rows).toBe(1);
    expect(adjusted.state.adjustments[0]).toMatchObject({ time_type: "overtime_1", minutes_delta: 30, export_id: null });
    const corrected = createExport(adjusted.state, eko, { periodId, statementIds: [statementId], format: "csv", checksum: "c", rowCount: 1, force: false, reason: "" }, NOW);
    expect(corrected.kind).toBe("correction");
    expect(corrected.state.adjustments.every((a) => a.export_id === corrected.exportId)).toBe(true);
  });

  it("lokalt datum avgör perioden: pass 00:30 den 1 sep ligger i september trots UTC-datum 31 aug", () => {
    let s = createPeriod(emptyAttendanceState(), eko, "Augusti", "2026-08-01", "2026-08-31");
    s = attestStatement(s, pl, s.periods[0].id, "emp", totals, [], {}, NOW);
    expect(() => addEntries(s, emp, [{ type: "work", start: "2026-08-31T21:30:00Z", end: "2026-08-31T21:50:00Z" }], null, null, NOW)).toThrow("attesterad");
    expect(addEntries(s, emp, [{ type: "work", start: "2026-08-31T22:30:00Z", end: "2026-08-31T23:30:00Z" }], null, null, NOW).entries).toHaveLength(1);
  });
});
