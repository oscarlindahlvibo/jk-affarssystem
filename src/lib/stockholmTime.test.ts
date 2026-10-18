import { describe, expect, it } from "vitest";
import { addDays, eachDate, isoWeekday, localDateKey, localTimeKey, startOfIsoWeek, zonedTimeToUtc } from "./stockholmTime";
import { easterSunday, holidayOn, swedishHolidays } from "./swedishHolidays";

describe("stockholmTime", () => {
  it("konverterar svensk veggtid till UTC med sommar- och vintertid", () => {
    expect(zonedTimeToUtc("2026-07-01", "12:00").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "12:00").toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("hanterar tiden som saknas vid sommartidens start (flyttas framåt)", () => {
    // 2026-03-29 02:30 finns inte; klockan hoppar från 02:00 till 03:00 (UTC+2).
    expect(zonedTimeToUtc("2026-03-29", "03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
  });

  it("tolkar dubbel tid vid vintertidens start som första förekomsten", () => {
    // 2026-10-25 02:30 inträffar två gånger. Första är UTC+2 = 00:30Z.
    expect(zonedTimeToUtc("2026-10-25", "02:30").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("ger rätt lokalt datum nära midnatt oavsett webbläsarens tidszon", () => {
    expect(localDateKey("2026-06-30T22:30:00Z")).toBe("2026-07-01");
    expect(localDateKey("2026-06-30T21:59:00Z")).toBe("2026-06-30");
    expect(localTimeKey("2026-12-24T23:30:00Z")).toBe("00:30");
  });

  it("räknar veckodagar och veckostart", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(startOfIsoWeek("2026-10-18")).toBe("2026-10-12");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(eachDate("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("swedishHolidays", () => {
  it("beräknar påsk och rörliga helgdagar 2026", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    const names = Object.fromEntries(swedishHolidays(2026).map((h) => [h.name, h.date]));
    expect(names["Långfredagen"]).toBe("2026-04-03");
    expect(names["Annandag påsk"]).toBe("2026-04-06");
    expect(names["Kristi himmelsfärdsdag"]).toBe("2026-05-14");
    expect(names["Pingstdagen"]).toBe("2026-05-24");
    expect(names["Midsommardagen"]).toBe("2026-06-20");
    expect(names["Midsommarafton"]).toBe("2026-06-19");
    expect(names["Alla helgons dag"]).toBe("2026-10-31");
  });

  it("skiljer röda dagar från helgdagsaftnar", () => {
    expect(holidayOn("2026-05-01")?.kind).toBe("holiday");
    expect(holidayOn("2026-12-24")?.kind).toBe("eve");
    expect(holidayOn("2026-10-14")).toBeNull();
  });
});
