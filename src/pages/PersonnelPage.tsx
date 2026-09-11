import { useState } from "react";
import { Plus, UserX, UserCheck, Pencil } from "lucide-react";
import { useStore } from "../data/store";
import { useAuth } from "../lib/auth";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, inputClass } from "../components/ui/Field";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, USER_ROLES, USER_STATUS_LABELS, type Profile, type UserRole } from "../types";

const STATUS_BADGE: Record<string, string> = {
  aktiv: "bg-green-100 text-green-700",
  inbjuden: "bg-amber-100 text-amber-700",
  inaktiverad: "bg-slate-200 text-slate-500",
};

export function PersonnelPage() {
  const { profiles, invitePersonnel, updatePersonnel, deactivatePersonnel, reactivatePersonnel } = useStore();
  const { currentProfile } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name));

  function handleDeactivate(id: string) {
    const result = deactivatePersonnel(id);
    if (!result.ok) setError(result.reason ?? null);
  }

  function handleReactivate(id: string) {
    const result = reactivatePersonnel(id);
    if (!result.ok) setError(result.reason ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Hantera vilka personer i bolaget som får använda systemet och vad de har behörighet till.
        </p>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} /> Bjud in användare
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Stäng</button>
        </p>
      )}

      <Panel>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 font-medium">Namn</th>
              <th className="py-2 font-medium">E-post</th>
              <th className="py-2 font-medium">Roll</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((p) => (
              <tr key={p.id}>
                <td className="py-3 font-medium text-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                      {p.initials}
                    </div>
                    {p.full_name}
                    {p.id === currentProfile?.id && <span className="text-xs text-slate-400">(du)</span>}
                  </div>
                </td>
                <td className="py-3 text-slate-600">{p.email}</td>
                <td className="py-3">
                  <span className="status-pill bg-navy-900/5 text-navy-900">{ROLE_LABELS[p.role]}</span>
                </td>
                <td className="py-3">
                  <span className={`status-pill ${STATUS_BADGE[p.status]}`}>{USER_STATUS_LABELS[p.status]}</span>
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setEditing(p)} title="Redigera" className="text-slate-400 hover:text-orange-600">
                      <Pencil size={15} />
                    </button>
                    {p.status === "inaktiverad" ? (
                      <button onClick={() => handleReactivate(p.id)} title="Aktivera" className="text-slate-400 hover:text-green-600">
                        <UserCheck size={15} />
                      </button>
                    ) : (
                      p.id !== currentProfile?.id && (
                        <button onClick={() => handleDeactivate(p.id)} title="Inaktivera" className="text-slate-400 hover:text-red-600">
                          <UserX size={15} />
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Roller och behörigheter">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {USER_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-border p-3">
              <div className="text-sm font-semibold text-slate-800">{ROLE_LABELS[r]}</div>
              <p className="mt-1 text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={(data) => {
          const result = invitePersonnel(data);
          if (result.ok) setInviteOpen(false);
          else setError(result.reason ?? null);
        }}
      />

      {editing && (
        <EditModal
          key={editing.id}
          profile={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            const result = updatePersonnel(editing.id, patch);
            if (result.ok) setEditing(null);
            else setError(result.reason ?? null);
          }}
        />
      )}
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (data: { full_name: string; email: string; role: UserRole }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("projektledare");

  function handleClose() {
    setFullName("");
    setEmail("");
    setRole("projektledare");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Bjud in användare">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!fullName.trim() || !email.trim()) return;
          onInvite({ full_name: fullName.trim(), email: email.trim(), role });
          setFullName("");
          setEmail("");
          setRole("projektledare");
        }}
        className="space-y-4"
      >
        <Field label="Namn *">
          <input required className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="E-post *">
          <input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Roll">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
        </Field>
        <p className="text-xs text-slate-500">
          Användaren skapas med status <span className="font-medium">Inbjuden</span> och kan logga in när kontot har
          aktiverats.
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={handleClose}>Avbryt</Button>
          <Button type="submit">Skicka inbjudan</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (patch: { full_name: string; email: string; role: UserRole }) => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState<UserRole>(profile.role);

  return (
    <Modal open onClose={onClose} title="Redigera användare">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ full_name: fullName, email, role });
        }}
        className="space-y-4"
      >
        <Field label="Namn *">
          <input required className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="E-post *">
          <input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Roll">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
        </Field>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit">Spara ändringar</Button>
        </div>
      </form>
    </Modal>
  );
}
