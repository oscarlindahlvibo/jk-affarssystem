import { useState } from "react";
import type { BillingRateType } from "../../types";
import { useWorkReports } from "../../data/workReports";
import { decimalText, parseDecimal } from "../../lib/numberInput";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { Panel } from "../ui/Panel";

const FIELDS: { type: BillingRateType; label: string; unit: string }[] = [
  { type: "hours", label: "Transportarbete", unit: "kr/h" },
  { type: "distance", label: "Körsträcka", unit: "kr/mil" },
  { type: "waiting", label: "Väntetid", unit: "kr/h" },
];

export function CustomerRatesPanel({ customerId }: { customerId: string }) {
  const { canSeeFinance, rates, setRate } = useWorkReports();
  const [drafts, setDrafts] = useState<Partial<Record<BillingRateType, string>>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (!canSeeFinance) return null;
  const current = (type: BillingRateType) => rates.find((r) => r.customer_id === customerId && r.rate_type === type)?.unit_price ?? null;
  const value = (type: BillingRateType) => drafts[type] ?? decimalText(current(type));

  async function save() {
    setMessage(null);
    try {
      for (const field of FIELDS) {
        const parsed = parseDecimal(value(field.type));
        if (parsed !== null && Number.isNaN(parsed)) throw new Error(`Ogiltigt pris för ${field.label.toLowerCase()}.`);
        if (parsed !== current(field.type)) await setRate({ customerId }, field.type, parsed);
      }
      setDrafts({});
      setMessage({ kind: "ok", text: "Priserna sparades." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Priserna kunde inte sparas." });
    }
  }

  return (
    <Panel title="Priser för rapporterat arbete">
      <p className="mb-3 text-xs text-slate-500">Gäller alla kundens projekt som inte har egna priser. Syns bara för ekonomi, projektledare och admin.</p>
      {message && <div role={message.kind === "error" ? "alert" : "status"} className={`mb-3 rounded-lg border px-3 py-2 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>{message.text}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <Field key={field.type} label={`${field.label} (${field.unit})`}>
            <input inputMode="decimal" className={inputClass} value={value(field.type)} onChange={(e) => setDrafts({ ...drafts, [field.type]: e.target.value })} placeholder="Saknas" />
          </Field>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="secondary" disabled={Object.keys(drafts).length === 0} onClick={() => void save()}>Spara priser</Button>
      </div>
    </Panel>
  );
}
