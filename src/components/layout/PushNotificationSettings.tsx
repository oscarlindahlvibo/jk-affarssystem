import { useEffect, useState } from "react";
import { BellPlus, BellOff, Send } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { disableWebPush, enableWebPush, needsHomeScreenInstall, pushEnabled, supportsWebPush, testWebPush } from "../../lib/webPush";

export function PushNotificationSettings() {
  const { currentProfile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const supported = supportsWebPush();
  const needsInstall = needsHomeScreenInstall();

  useEffect(() => {
    let active = true;
    if (!supabase || !supported) return;
    pushEnabled().then((value) => { if (active) setEnabled(value); })
      .catch(() => { if (active) setError("Kunde inte läsa notisinställningen. Försök igen."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [currentProfile?.id, supported]);

  async function change(test = false) {
    setBusy(true); setMessage(""); setError("");
    try {
      if (test) { await testWebPush(); setMessage("Testnotis skickad till den här enheten."); }
      else if (enabled) { await disableWebPush(); setEnabled(false); }
      else { await enableWebPush(); setEnabled(true); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Notisinställningen kunde inte ändras.");
    } finally { setBusy(false); }
  }

  return (
    <div className="border-t border-border px-4 py-3">
      {needsInstall ? (
        <p className="text-xs text-slate-500">För iPhone-notiser: lägg till JK Projekt på hemskärmen och öppna appen därifrån.</p>
      ) : !supported ? (
        <p className="text-xs text-slate-500">Pushnotiser stöds inte i den här webbläsaren.</p>
      ) : !supabase ? (
        <p className="text-xs text-slate-500">Pushnotiser finns i det skarpa systemet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || checking} onClick={() => void change()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {enabled ? <BellOff size={15} /> : <BellPlus size={15} />}
            {busy ? "Vänta..." : enabled ? "Stäng av pushnotiser" : "Aktivera pushnotiser"}
          </button>
          {enabled && <button type="button" disabled={busy} onClick={() => void change(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 disabled:opacity-50"><Send size={14} />Skicka testnotis</button>}
        </div>
      )}
      {message && <p role="status" className="mt-2 text-xs text-green-700">{message}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
