import { useRef } from "react";
import { decimalText, parseDecimal } from "../../lib/numberInput";
import { spanMinutes } from "../../lib/reportTimes";
import { Field, inputClass } from "../ui/Field";

// Räknar arbetstiden från start och slut (minus väntetid) så länge användaren inte själv skrivit timmar.
// Skrivs timmar för hand eller förifylls de från klockan lämnas de ifred; tömda timmar går tillbaka till automatik.
export function useAutoHours(setHours: (text: string) => void, initiallyTouched: boolean) {
  const touched = useRef(initiallyTouched);
  return {
    hoursChanged: (text: string) => {
      touched.current = text.trim() !== "";
    },
    recompute: (start: string, end: string, waitingText: string) => {
      if (touched.current) return;
      const span = spanMinutes(start, end);
      if (span === null) return;
      const waiting = parseDecimal(waitingText);
      const waitingMinutes = waiting === null || Number.isNaN(waiting) ? 0 : Math.round(waiting * 60);
      setHours(decimalText(Math.max(span - waitingMinutes, 0) / 60));
    },
  };
}

export function TimeFields({ start, end, onStart, onEnd, big = false }: { start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void; big?: boolean }) {
  const span = spanMinutes(start, end);
  const cls = `${inputClass}${big ? " !py-3" : ""}`;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starttid (valfri)"><input type="time" className={cls} value={start} onChange={(e) => onStart(e.target.value)} /></Field>
        <Field label="Sluttid (valfri)"><input type="time" className={cls} value={end} onChange={(e) => onEnd(e.target.value)} /></Field>
      </div>
      {(start || end) && span === null && <p className="text-xs text-amber-700">Ange både start- och sluttid, eller lämna båda tomma.</p>}
      {span !== null && (
        <p className="text-xs text-slate-500">
          Tid mellan start och slut: {Math.floor(span / 60)} h {span % 60} min{end <= start ? " (över midnatt)" : ""}. Arbetstiden fylls i automatiskt (minus väntetid) men kan ändras.
        </p>
      )}
    </div>
  );
}
