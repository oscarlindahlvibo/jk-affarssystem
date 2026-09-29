import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Field, inputClass } from "../components/ui/Field";
import { supabase } from "../lib/supabase";

export function SetPasswordPage() {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 12) {
      setError("Lösenordet måste innehålla minst 12 tecken.");
      return;
    }
    if (password !== confirmation) {
      setError("Lösenorden stämmer inte överens.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setSaving(false);
      setError(passwordError.message);
      return;
    }

    const { error: activationError } = await supabase.rpc("activate_invited_account");
    if (activationError && !activationError.message.includes("No invited account")) {
      setSaving(false);
      setError("Lösenordet sparades, men kontot kunde inte aktiveras. Kontakta administratören.");
      return;
    }

    window.location.assign("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-orange-500 text-white">
            <KeyRound size={20} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Välj ett lösenord</h1>
          <p className="text-sm text-slate-500">Lösenordet används för JK Projektlogistik.</p>
        </div>

        {hasSession === false ? (
          <div className="space-y-4 text-center">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              Länken är ogiltig eller har gått ut. Begär en ny återställningslänk från inloggningssidan.
            </p>
            <Button className="w-full justify-center" onClick={() => navigate("/login")}>Till inloggningen</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nytt lösenord">
              <input
                required
                minLength={12}
                autoComplete="new-password"
                type="password"
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="Upprepa lösenord">
              <input
                required
                minLength={12}
                autoComplete="new-password"
                type="password"
                className={inputClass}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            <p className="text-xs text-slate-500">Använd minst 12 tecken och gärna en lösenordshanterare.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={saving || hasSession === null} className="w-full justify-center">
              {saving ? "Sparar..." : "Spara lösenord"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
