import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import type { Supplier } from "../../types";
import { USER_STATUS_LABELS } from "../../types";
import { useAuth } from "../../lib/auth";
import { useCarrierUsers } from "../../data/carrierUsers";
import { isSupabaseConfigured } from "../../lib/supabase";
import { GeneratedPasswordModal, ResetPasswordModal, type GeneratedPassword } from "../users/PasswordDialogs";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";

export function CarrierUsersSection({ supplier }: { supplier: Supplier }) {
  const { currentProfile } = useAuth();
  const { users, error, invite, setStatus, markActive } = useCarrierUsers(supplier.id, supplier.org_id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [withPassword, setWithPassword] = useState(true);
  const [created, setCreated] = useState<GeneratedPassword | null>(null);
  const [resetting, setResetting] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (currentProfile?.role !== "admin") return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const fullName = name.trim();
    const address = email.trim().toLowerCase();
    const result = await invite({ full_name: fullName, email: address, create_with_password: isSupabaseConfigured && withPassword });
    if (!result.ok) setMessage({ kind: "error", text: result.reason });
    else {
      if (result.password) {
        setCreated({ name: fullName, email: address, password: result.password });
        setMessage(null);
      } else setMessage({ kind: "ok", text: "Inbjudan skickades." });
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
              {isSupabaseConfigured && u.status !== "inaktiverad" && (
                <button type="button" title="Nytt lösenord" className="text-slate-400 hover:text-orange-600" onClick={() => setResetting(u)}><KeyRound size={15} /></button>
              )}
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
      {isSupabaseConfigured && (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={withPassword} onChange={(e) => setWithPassword(e.target.checked)} />
          <span>
            Skapa direkt med genererat lösenord
            <span className="block text-xs text-slate-500">Användaren blir aktiv direkt, utan e-postbekräftelse. Lösenordet visas en gång. Avmarkera för att skicka en e-postinbjudan.</span>
          </span>
        </label>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Namn"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-post"><input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="button" variant="secondary" disabled={name.trim().length < 2 || !email.includes("@")} onClick={(e) => void submit(e as unknown as React.FormEvent)}><UserPlus size={14} /> {isSupabaseConfigured && withPassword ? "Skapa" : "Bjud in"}</Button>
      </div>
      {resetting && (
        <ResetPasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onError={(reason) => { setResetting(null); setMessage({ kind: "error", text: reason }); }}
          onEmailed={(text) => { setResetting(null); setMessage({ kind: "ok", text }); }}
          onGenerated={(info) => { markActive(resetting.id); setResetting(null); setCreated(info); }}
        />
      )}
      {created && <GeneratedPasswordModal info={created} onClose={() => setCreated(null)} />}
    </section>
  );
}
