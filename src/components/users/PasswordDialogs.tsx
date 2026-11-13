import { useState } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { resetAccountPassword } from "../../lib/userInvitations";

export type GeneratedPassword = { name: string; email: string; password: string; reset?: boolean };

// Visar ett genererat lösenord en enda gång, med kopiera-knapp.
export function GeneratedPasswordModal({ info, onClose }: { info: GeneratedPassword; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={info.reset ? "Nytt lösenord" : "Användaren är skapad"}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <span className="font-medium">{info.name}</span> ({info.email}) {info.reset ? "har fått ett nytt lösenord och kan logga in direkt." : "är aktiv och kan logga in direkt."}
        </p>
        <div>
          <div className="text-xs font-medium text-slate-500">Lösenord</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-border bg-slate-50 px-3 py-2 text-base tracking-wide select-all">{info.password}</code>
            <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(info.password).catch(() => undefined); }}>Kopiera</Button>
          </div>
        </div>
        <p className="text-xs text-amber-700">Lösenordet visas bara nu och kan inte hämtas senare. Skicka det säkert till användaren.</p>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={onClose}>Klar</Button>
        </div>
      </div>
    </Modal>
  );
}

type Target = { id: string; full_name: string; email: string };

// Val: generera nytt lösenord (visas) eller skicka återställningslänk per e-post.
export function ResetPasswordModal({
  target,
  onClose,
  onGenerated,
  onEmailed,
  onError,
}: {
  target: Target;
  onClose: () => void;
  onGenerated: (info: GeneratedPassword) => void;
  onEmailed: (message: string) => void;
  onError: (reason: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(mode: "generate" | "email") {
    setBusy(true);
    const result = await resetAccountPassword(target.id, mode);
    setBusy(false);
    if (!result.ok) return onError(result.reason);
    if (mode === "generate" && result.password) onGenerated({ name: target.full_name, email: target.email, password: result.password, reset: true });
    else onEmailed(`En länk för att välja nytt lösenord har skickats till ${target.email}.`);
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Nytt lösenord – ${target.full_name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">Välj hur {target.full_name} ska få ett nytt lösenord. Det gamla slutar gälla direkt när du genererar ett nytt.</p>
        <div className="space-y-2">
          <Button type="button" className="w-full" disabled={busy} onClick={() => void run("generate")}>
            {busy ? "Arbetar..." : "Generera nytt lösenord och visa det"}
          </Button>
          <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => void run("email")}>
            Skicka länk till {target.email}
          </Button>
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Avbryt</Button>
        </div>
      </div>
    </Modal>
  );
}

export function NoticeModal({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">{message}</p>
        <div className="flex justify-end border-t border-border pt-4"><Button type="button" onClick={onClose}>Klar</Button></div>
      </div>
    </Modal>
  );
}
