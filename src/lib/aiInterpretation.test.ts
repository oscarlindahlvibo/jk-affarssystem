import { describe, expect, it } from "vitest";
import { distinctPageIndexes, estimateAiCost, mapAiOrderToParsed, needsAiFallback } from "./aiInterpretation";
import type { PdfRow } from "./ltcParse";

const row = (...texts: string[]): PdfRow => texts.map((str, i) => ({ x: i * 10, str }));
const emptyParse = { items: [], documentNumber: null };

describe("AI-tolkning som fallback", () => {
  it("erbjuds när PDF:en saknar textlager", () => {
    expect(needsAiFallback([], emptyParse)).toBe(true);
    expect(needsAiFallback([row("---SIDBRYTNING---")], emptyParse)).toBe(true);
    expect(needsAiFallback([row("Nr.")], emptyParse)).toBe(true);
  });

  it("erbjuds inte för text-PDF:er som tolkades", () => {
    const text = [row("Fraktbeställning JK Projektlogistik AB Avsändare Holtab AB Östergatan 4 Tingsryd Lastningsdag 2026-10-26 Leveransadress Bangatan 2 Falköping ".repeat(4))];
    expect(needsAiFallback(text, { items: [{} as never], documentNumber: "LTC0020553" })).toBe(false);
    expect(needsAiFallback(text, emptyParse)).toBe(false); // text finns men tolkaren hittade inget: manuellt, inte AI-debitering
  });

  it("erbjuds när det finns lite text och inget kunde tolkas", () => {
    const some = [row("x".repeat(120))];
    expect(needsAiFallback(some, emptyParse)).toBe(true);
    expect(needsAiFallback(some, { items: [], documentNumber: "LTC1" })).toBe(false);
  });

  it("mappar AI-resultatet till samma struktur som textläsningen, med null för saknade fält", () => {
    const parsed = mapAiOrderToParsed({
      documentNumber: "LTC0020553", deliveryCity: "Falköping", loadingDate: "2026-10-26", items: [{ quantity: 1, typeName: "Dörrar", weight_ton: 157 } as never],
    } as never, "rå text");
    expect(parsed.documentNumber).toBe("LTC0020553");
    expect(parsed.deliveryCity).toBe("Falköping");
    expect(parsed.recipientEmail).toBeNull();
    expect(parsed.items[0]).toMatchObject({ quantity: 1, typeName: "Dörrar", weight_ton: 157, length_m: null, goodsMark: null });
    expect(parsed.rawText).toBe("rå text");
  });

  it("räknar kostnaden per sida exkl. moms, moms och totalt", () => {
    expect(estimateAiCost(2, { price_per_page: 5, vat_rate: 25 })).toEqual({ exVat: 10, vat: 2.5, total: 12.5 });
    expect(estimateAiCost(3, { price_per_page: 4.99, vat_rate: 25 })).toEqual({ exVat: 14.97, vat: 3.74, total: 18.71 });
  });
});

describe("distinctPageIndexes", () => {
  const sheet = (docNo: string, extra = "") =>
    `FRAKTSEDEL TRANSPORTINSTRUKTION Transportföretag Tabergs Åkeri AB Godsavsändare Eksjöhus Bostad Entreprenad AB Galoppstigen 2 57595 EKSJÖ Godsmottagare Väsby 34 15196 Enhörna Fraktsedel nr ${docNo} Utskrivningsdatum 2026-10-27 Modul 14 L 6,35 B 395 H 340 ${extra}`;

  it("hoppar över kopior av samma sida men behåller första", () => {
    expect(distinctPageIndexes([sheet("58806", "Sida 1(4) Avsändarens blad"), sheet("58806", "Sida 2(4) Viktigt synlig avvikelse anmäls (7) dagar"), sheet("58806", "Sida 3(4)")])).toEqual([0]);
  });
  it("behåller sidor med annat dokumentnummer även om layouten är lika", () => {
    expect(distinctPageIndexes([sheet("58806"), sheet("58807")])).toEqual([0, 1]);
  });
  it("skickar alltid sidor utan textlager", () => {
    expect(distinctPageIndexes([sheet("58806"), "", sheet("58806"), "  "])).toEqual([0, 1, 3]);
  });
});

describe("leveranstid från AI", () => {
  const order = { ...mapAiOrderToParsed({ documentNumber: "58806", deliveryTime: "06:45", items: [] } as never), items: [] };
  it("tas med när den är en giltig tid", () => {
    expect(order.deliveryTime).toBe("06:45");
    expect(mapAiOrderToParsed({ documentNumber: "1", deliveryTime: "sen", items: [] } as never).deliveryTime).toBeNull();
    expect(mapAiOrderToParsed({ documentNumber: "1", items: [] } as never).deliveryTime).toBeNull();
  });
});
