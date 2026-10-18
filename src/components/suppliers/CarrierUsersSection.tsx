import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { Supplier } from "../../types";
import { USER_STATUS_LABELS } from "../../types";
import { useAuth } from "../../lib/auth";
import { useCarrierUsers } from "../../data/carrierUsers";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";

export function CarrierUsersSection({ supplier }: { supplier: Supplier }) {
  const { currentProfile } = useAuth();
  const { users, error, invite, setStatus } = useCarrierUsers(supplier.id, supplier.org_id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (currentProfile?.role !== "admin") return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const result = await invite({ full_name: name.trim(), email: email.trim().toLowerCase() });
    if (!result.ok) setMessage({ kind: "error", text: result.reason });
    else {
      setMessage({ kind: "ok", text: "Inbjudan skickades." });
      setName("");
      setEmail("");
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-slate-800">Transportörsportal</h3>
      <p className="mt-1 text-xs text-slate-500">
        Personer hos {supplier.company_name} som får logga in och rapportera arbete på uppdrag som tilldelats företaget. De ser aldrig pris, kostnad eller andra uppdrag.
      </p>
      <ul className="mt-3 space-y-1.5">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="min-w-0"><span className="font-medium text-slate-800">{u.full_name}</span> <span className="text-xs text-slate-500">{u.email}</span></span>
            <span className="flex items-center gap-2">
              <span className="status-pill bg-slate-100 text-slate-600">{USER_STATUS_LABELS[u.status]}</span>
              {u.status === "aktiv" && <button type="button" className="text-xs text-red-600 hover:text-red-700" onClick={() => void setStatus(u.id, "inaktiverad")}>Inaktivera</button>}
              {u.status === "inaktiverad" && <button type="button" className="text-xs text-orange-600 hover:text-orange-700" onClick={() => void setStatus(u.id, "aktiv")}>Aktivera</button>}
            </span>
          </li>
        ))}
        {users.length === 0 && <li className="text-sm text-slate-500">Inga transportörsanvändare ännu.</li>}
      </ul>
      {(error || message) && (
        <p role={message?.kind === "ok" ? "status" : "alert"} className={`mt-2 text-sm ${message?.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{error ?? message?.text}</p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Namn"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-post"><input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="button" variant="secondary" disabled={name.trim().length < 2 || !email.includes("@")} onClick={(e) => void submit(e as unknown as React.FormEvent)}><UserPlus size={14} /> Bjud in</Button>
      </div>
    </section>
  );
}
