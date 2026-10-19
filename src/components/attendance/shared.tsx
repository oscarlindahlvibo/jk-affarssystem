import { useRef, useState } from "react";
import type { AttendanceEntry, AttendanceEntryType } from "../../types";
import { addDays, localDateKey, localTimeKey, startOfIsoWeek, zonedTimeToUtc } from "../../lib/stockholmTime";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Modal } from "../ui/Modal";

export const ENTRY_TYPE_LABELS: Record<AttendanceEntryType, string> = { work: "Arbete", break: "Rast", lunch: "Lunch" };
export const SOURCE_LABELS: Record<string, string> = { clock: "Stämplad", manual: "Manuell", correction: "Rättad", admin: "Av ansvarig" };

export const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;

export function localInput(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  return { date: localDateKey(iso), time: localTimeKey(iso) };
}

export function toIso(date: string, time: string): string {
  return zonedTimeToUtc(date, time).toISOString();
}

// Minuter arbetad tid per intervall (svensk lokal tid), pågående pass räknas fram till nu.
export function workedMinutes(entries: AttendanceEntry[], from: string, to: string, nowMs: number): number {
  let total = 0;
  for (const e of entries) {
    if (e.entry_type !== "work") continue;
    const day = localDateKey(e.start_time);
    if (day < from || day > to) continue;
    total += e.end_time ? e.total_minutes : Math.max(Math.floor((nowMs - new Date(e.start_time).getTime()) / 60000), 0);
  }
  return total;
}

export function periodBounds(today: string) {
  const weekStart = startOfIsoWeek(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  const monthEnd = addDays(next.toISOString().slice(0, 10), -1);
  return { weekStart, weekEnd: addDays(weekStart, 6), monthStart, monthEnd };
}

export interface EntryFormResult {
  // Stabilt id per öppnad dialog: ett omförsök sparar aldrig samma tid två gånger.
  id: string;
  type: AttendanceEntryType;
  start: string;
  end: string;
  comment: string;
  reason: string;
}

// Modal för att lägga in missad stämpling eller ändra ett pass. Orsak krävs alltid.
export function EntryModal({
  open, title, initial, allowRequest, onClose, onSave, onRequest,
}: {
  open: boolean;
  title: string;
  initial: AttendanceEntry | null;
  allowRequest: boolean;
  onClose: () => void;
  onSave: (value: EntryFormResult) => Promise<void>;
  onRequest?: (value: EntryFormResult) => Promise<void>;
}) {
  const today = localDateKey(new Date());
  const start = localInput(initial?.start_time);
  const end = localInput(initial?.end_time);
  const [type, setType] = useState<AttendanceEntryType>(initial?.entry_type ?? "work");
  const [date, setDate] = useState(start.date || today);
  const [startTime, setStartTime] = useState(start.time || "08:00");
  const [endDate, setEndDate] = useState(end.date || start.date || today);
  const [endTime, setEndTime] = useState(end.time || "17:00");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryId = useRef(crypto.randomUUID()).current;

  async function submit(handler: (value: EntryFormResult) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const startIso = toIso(date, startTime);
      const endIso = toIso(endDate, endTime);
      if (new Date(endIso) <= new Date(startIso)) throw new Error("Sluttiden måste vara efter starttiden.");
      await handler({ id: entryId, type, start: startIso, end: endIso, comment, reason });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <Field label="Typ">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as AttendanceEntryType)}>
            {Object.entries(ENTRY_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Startdatum"><input type="date" className={inputClass} value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></Field>
          <Field label="Starttid"><input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
          <Field label="Slutdatum"><input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <Field label="Sluttid"><input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
        </div>
        <Field label="Kommentar (valfri)"><input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <Field label="Orsak (krävs, sparas i ändringsloggen)"><textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="T.ex. glömde stämpla ut" /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Avbryt</Button>
          {allowRequest && onRequest && <Button type="button" variant="secondary" disabled={busy} onClick={() => submit(onRequest)}>Skicka som rättelsebegäran</Button>}
          <Button type="button" disabled={busy} onClick={() => submit(onSave)}>Spara</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ReasonModal({ open, title, confirmLabel, onClose, onConfirm, children }: { open: boolean; title: string; confirmLabel: string; onClose: () => void; onConfirm: (reason: string) => Promise<void>; children?: React.ReactNode }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason);
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Åtgärden misslyckades.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {children}
        <Field label="Orsak"><textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button type="button" disabled={busy || !reason.trim()} onClick={go}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
