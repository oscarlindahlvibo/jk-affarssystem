import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Boxes, Building2, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { usePersonnel } from "../data/personnel";
import { customerUsers, customers } from "../data/mockData";
import { isSupabaseConfigured } from "../lib/supabase";
import { Field, inputClass } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { ROLE_LABELS, USER_STATUS_LABELS } from "../types";

export function Login() {
  const { isAuthenticated, accountType, signIn, continueInMockMode, continueAsCustomer } = useAuth();
  const { allProfiles, organizations } = usePersonnel();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mockTab, setMockTab] = useState<"internal" | "customer">("internal");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={accountType === "customer" ? "/kundportal" : "/"} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  }

  function handleMockLogin(userEmail: string) {
    const err = continueInMockMode(userEmail);
    if (err) setError(err);
  }

  function handleCustomerLogin(userEmail: string) {
    const err = continueAsCustomer(userEmail);
    if (err) setError(err);
  }

  const orgName = (orgId: string) => organizations.find((o) => o.id === orgId)?.name ?? orgId;
  const customerName = (customerId: string) => customers.find((c) => c.id === customerId)?.company_name ?? customerId;

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Boxes size={20} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">JK Projektlogistik</h1>
          <p className="text-sm text-slate-500">Affärssystem och kundportal</p>
        </div>

        {isSupabaseConfigured ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="E-post">
              <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Lösenord">
              <input type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full justify-center">
              {loading ? "Loggar in..." : "Logga in"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-500">
              Supabase Auth är förberett men inte anslutet i denna miljö. Välj en testanvändare för att prova
              interna roller eller kundportalen.
            </p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => { setMockTab("internal"); setError(null); }}
                className={`rounded-md px-3 py-2 ${mockTab === "internal" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
              >
                JK personal
              </button>
              <button
                type="button"
                onClick={() => { setMockTab("customer"); setError(null); }}
                className={`rounded-md px-3 py-2 ${mockTab === "customer" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
              >
                Kundportal
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {mockTab === "internal"
                ? allProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleMockLogin(p.email)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                          {p.initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{p.full_name}</div>
                          <div className="text-xs text-slate-500">{orgName(p.org_id)} · {ROLE_LABELS[p.role]}</div>
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          p.status === "aktiv"
                            ? "bg-green-100 text-green-700"
                            : p.status === "inbjuden"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {p.status === "inaktiverad" && <Lock size={10} />}
                        {USER_STATUS_LABELS[p.status]}
                      </span>
                    </button>
                  ))
                : customerUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleCustomerLogin(u.email)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
                          {u.initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{u.full_name}</div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Building2 size={11} /> {customerName(u.customer_id)}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          u.status === "aktiv"
                            ? "bg-green-100 text-green-700"
                            : u.status === "inbjuden"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {u.status === "inaktiverad" && <Lock size={10} />}
                        {USER_STATUS_LABELS[u.status]}
                      </span>
                    </button>
                  ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
