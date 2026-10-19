import { describe, expect, it } from "vitest";
import { cancelSession, elapsedMinutes, finishSession, setWaiting, startSession, suggestedReport, waitingMinutes } from "./sessionEngine";
import type { AssignmentSession } from "../types";

const actor = { id: "u1", orgId: "o1" };
const NOW = "2026-10-14T08:00:00.000Z";
const at = (minutes: number) => new Date(new Date(NOW).getTime() + minutes * 60000).toISOString();
const projects = {
  a: { id: "pa", org_id: "o1", status: "Bokad", tasks: [{ id: "t1" }] },
  b: { id: "pb", org_id: "o1", status: "Bokad" },
};
const start = (s: AssignmentSession[], id: string, project: keyof typeof projects, now = NOW) =>
  startSession(s, actor, { id, projectId: projects[project].id, taskId: null, startedIso: now }, projects[project], now);

describe("uppdrag på stämpelklockan", () => {
  it("flera uppdrag på olika projekt kan pågå samtidigt, men inte samma projekt två gånger", () => {
    let s = start([], "s1", "a");
    s = start(s, "s2", "b");
    expect(s.filter((x) => !x.ended_at)).toHaveLength(2);
    expect(() => start(s, "s3", "a")).toThrow("pågår redan");
  });

  it("är idempotent per id och nekar andras id, avbokade projekt, andra organisationer och backdatering", () => {
    const s = start([], "s1", "a");
    expect(start(s, "s1", "a")).toHaveLength(1);
    expect(() => startSession(s, { id: "u2", orgId: "o1" }, { id: "s1", projectId: "pa", taskId: null, startedIso: NOW }, projects.a, NOW)).toThrow("nekas");
    expect(() => startSession([], actor, { id: "x", projectId: "pc", taskId: null, startedIso: NOW }, { id: "pc", org_id: "o1", status: "Avbokad" }, NOW)).toThrow("avbokad");
    expect(() => startSession([], actor, { id: "x", projectId: "pz", taskId: null, startedIso: NOW }, { id: "pz", org_id: "o2", status: "Bokad" }, NOW)).toThrow("hittades inte");
    expect(() => startSession([], actor, { id: "x", projectId: "pa", taskId: null, startedIso: at(-180) }, projects.a, NOW)).toThrow("starttid");
    expect(() => startSession([], actor, { id: "x", projectId: "pa", taskId: "främmande", startedIso: NOW }, projects.a, NOW)).toThrow("Arbetsordern");
  });

  it("högst fem pågående uppdrag", () => {
    let s: AssignmentSession[] = [];
    for (let i = 0; i < 5; i++) s = startSession(s, actor, { id: `s${i}`, projectId: `p${i}`, taskId: null, startedIso: NOW }, { id: `p${i}`, org_id: "o1", status: "Bokad" }, NOW);
    expect(() => startSession(s, actor, { id: "s9", projectId: "p9", taskId: null, startedIso: NOW }, { id: "p9", org_id: "o1", status: "Bokad" }, NOW)).toThrow("fem");
  });

  it("väntetid på/av ackumuleras och förslaget delar arbetstid och väntetid", () => {
    let s = start([], "s1", "a");
    s = setWaiting(s, actor, "s1", true, at(60));
    s = setWaiting(s, actor, "s1", true, at(70)); // upprepning är ofarlig
    s = setWaiting(s, actor, "s1", false, at(90));
    expect(s[0].waiting_minutes).toBe(30);
    s = setWaiting(s, actor, "s1", true, at(120)); // väntar fortfarande vid avslut
    const nowMs = new Date(at(150)).getTime();
    expect(elapsedMinutes(s[0], nowMs)).toBe(150);
    expect(waitingMinutes(s[0], nowMs)).toBe(60);
    expect(suggestedReport(s[0], nowMs)).toEqual({ hours: 1.5, waitingHours: 1 });
  });

  it("avslut stänger pågående väntetid och kopplar rapporten; omförsök ändrar inget", () => {
    let s = start([], "s1", "a");
    s = setWaiting(s, actor, "s1", true, at(100));
    const done = finishSession(s, actor, "s1", at(130), "r1", at(131));
    expect(done[0]).toMatchObject({ report_id: "r1", waiting_started_at: null, waiting_minutes: 30 });
    expect(finishSession(done, actor, "s1", at(200), "r2", at(201))[0].report_id).toBe("r1");
    expect(() => setWaiting(done, actor, "s1", true, at(140))).toThrow("avslutat");
    expect(() => cancelSession(done, actor, "s1")).toThrow("avslutat");
  });

  it("andra användare kan inte röra uppdraget", () => {
    const s = start([], "s1", "a");
    const other = { id: "u2", orgId: "o1" };
    expect(() => setWaiting(s, other, "s1", true, NOW)).toThrow("hittades inte");
    expect(() => finishSession(s, other, "s1", null, "r", NOW)).toThrow("hittades inte");
  });

  it("två samtidiga uppdrag kan ge mer fakturerbar tid än arbetad tid (förslag per uppdrag, ingen spärr)", () => {
    let s = start([], "s1", "a");
    s = start(s, "s2", "b");
    const nowMs = new Date(at(600)).getTime(); // 10 h arbetsdag
    const total = s.reduce((sum, x) => sum + suggestedReport(x, nowMs).hours, 0);
    expect(total).toBe(20);
  });
});
