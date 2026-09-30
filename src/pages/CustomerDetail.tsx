import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Plus, Star, Pencil, ChevronRight, Trash2, UserPlus } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import { Field, inputClass } from "../components/ui/Field";
import { formatDateAndTime } from "../lib/format";
import { usePermissions } from "../lib/usePermissions";

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getCustomer, getContactsByCustomer, getProjectsByCustomer, updateCustomer, deleteCustomer, addContactPerson, customerUsers, inviteCustomerUser } = useStore();
  const permissions = usePermissions();
  const canEditCustomer = permissions.can("customers", "edit");
  const canDeleteCustomer = permissions.can("customers", "delete");
  const canCreateContact = permissions.can("contacts", "create");
  const canInviteCustomer = permissions.can("users", "create");
  const customer = id ? getCustomer(id) : undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showClosedProjects, setShowClosedProjects] = useState(false);

  if (!customer) {
    return (
      <div className="py-20 text-center text-slate-500">
        Kunden hittades inte.
        <div className="mt-3">
          <Link to="/kunder" className="text-orange-600 hover:text-orange-700">Tillbaka till kundlistan</Link>
        </div>
      </div>
    );
  }

  const contacts = getContactsByCustomer(customer.id);
  const custProjects = getProjectsByCustomer(customer.id);
  const visibleProjects = custProjects
    .filter((project) => showClosedProjects || (!["Avslutad", "Avbruten"].includes(project.status) && project.invoice_status !== "Fakturerad"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const portalUsers = customerUsers.filter((user) => user.customer_id === customer.id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/kunder" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600">
          <ArrowLeft size={14} /> Tillbaka till kunder
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">{customer.company_name}</h2>
            <div className="text-sm text-slate-500">{customer.org_number ?? "Org.nr saknas"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-pill ${customer.status === "aktiv" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {customer.status}
            </span>
            {canEditCustomer && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Redigera
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Företagsinformation">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Fakturaadress</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-800"><MapPin size={13} />{customer.invoice_address ?? "–"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Besöksadress</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-800"><MapPin size={13} />{customer.visiting_address ?? "–"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Telefon</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-800"><Phone size={13} />{customer.phone ?? "–"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">E-post</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-800"><Mail size={13} />{customer.email ?? "–"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Webbplats</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-800"><Globe size={13} />{customer.website ?? "–"}</div>
              </div>
            </div>
            {customer.notes && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{customer.notes}</p>
            )}
          </Panel>

          <Panel
            title="Projekt kopplade till kunden"
            action={(
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showClosedProjects} onChange={(event) => setShowClosedProjects(event.target.checked)} />
                Visa avslutade
              </label>
            )}
          >
            <ul className="divide-y divide-border">
              {visibleProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <Link to={`/projekt/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
                      {p.project_number} · {p.name}
                    </Link>
                    <div className="text-xs text-slate-500">Lastning {formatDateAndTime(p.planned_loading_date, p.planned_loading_time)}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
              {visibleProjects.length === 0 && (
                <p className="py-2 text-sm text-slate-500">
                  {custProjects.length === 0 ? "Inga projekt kopplade ännu." : "Inga aktiva projekt. Markera Visa avslutade för att se historiken."}
                </p>
              )}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Kontaktpersoner"
            action={
              canCreateContact && (
                <Button variant="secondary" onClick={() => setContactOpen(true)} className="!px-2.5 !py-1.5">
                  <Plus size={14} /> Ny kontakt
                </Button>
              )
            }
          >
            <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/kontakter/${c.id}`}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border p-3 hover:border-orange-300 hover:bg-orange-50/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      {c.name}
                      {c.is_primary && <Star size={13} className="fill-orange-400 text-orange-400" />}
                    </div>
                    <div className="text-xs text-slate-500">{c.role}</div>
                    <div className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                      {c.phone && <div className="flex items-center gap-1.5"><Phone size={11} />{c.phone}</div>}
                      {c.mobile && <div className="flex items-center gap-1.5"><Phone size={11} />{c.mobile} (mobil)</div>}
                      {c.email && <div className="flex items-center gap-1.5"><Mail size={11} />{c.email}</div>}
                    </div>
                  </div>
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
            {contacts.length === 0 && <p className="text-sm text-slate-500">Inga kontaktpersoner tillagda.</p>}
            </ul>
          </Panel>

          <Panel
            title="Kundportal"
            action={canInviteCustomer ? (
              <Button variant="secondary" onClick={() => { setInviteError(null); setInviteOpen(true); }} className="!px-2.5 !py-1.5">
                <UserPlus size={14} /> Bjud in
              </Button>
            ) : undefined}
          >
            {inviteError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{inviteError}</p>}
            <ul className="space-y-2">
              {portalUsers.map((user) => (
                <li key={user.id} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium text-slate-800">{user.full_name}</div>
                  <div className="break-all text-xs text-slate-500">{user.email}</div>
                  <span className={`mt-2 inline-flex status-pill ${user.status === "aktiv" ? "bg-green-100 text-green-700" : user.status === "inbjuden" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
                    {user.status === "aktiv" ? "Aktiv" : user.status === "inbjuden" ? "Inbjuden" : "Inaktiverad"}
                  </span>
                </li>
              ))}
              {portalUsers.length === 0 && <p className="text-sm text-slate-500">Inga användare har tillgång till kundportalen.</p>}
            </ul>
          </Panel>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Redigera kund" wide>
        <EditCustomerForm
          customer={customer}
          canDelete={canDeleteCustomer}
          onSave={(patch) => { updateCustomer(customer.id, patch); setEditOpen(false); }}
          onCancel={() => setEditOpen(false)}
          onDelete={() => {
            const result = deleteCustomer(customer.id);
            if (result.ok) {
              navigate("/kunder");
            }
            return result;
          }}
        />
      </Modal>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title="Ny kontaktperson">
        <NewContactForm
          onSave={(data) => { addContactPerson({ ...data, customer_id: customer.id }); setContactOpen(false); }}
          onCancel={() => setContactOpen(false)}
        />
      </Modal>

      <CustomerInviteModal
        open={inviteOpen}
        contacts={contacts}
        onClose={() => setInviteOpen(false)}
        onInvite={async (data) => {
          const result = await inviteCustomerUser({ ...data, customer_id: customer.id });
          if (!result.ok) {
            setInviteError(result.reason ?? "Inbjudan kunde inte skickas.");
            return false;
          }
          setInviteError(null);
          setInviteOpen(false);
          return true;
        }}
      />
    </div>
  );
}

function CustomerInviteModal({
  open,
  contacts,
  onClose,
  onInvite,
}: {
  open: boolean;
  contacts: ReturnType<typeof useStore>["contactPersons"];
  onClose: () => void;
  onInvite: (data: { contact_person_id: string | null; full_name: string; email: string }) => Promise<boolean>;
}) {
  const [contactId, setContactId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  function selectContact(id: string) {
    setContactId(id);
    const contact = contacts.find((item) => item.id === id);
    if (contact) {
      setFullName(contact.name);
      setEmail(contact.email ?? "");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bjud in till kundportalen">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSending(true);
          const sent = await onInvite({ contact_person_id: contactId || null, full_name: fullName.trim(), email: email.trim() });
          setSending(false);
          if (sent) {
            setContactId("");
            setFullName("");
            setEmail("");
          }
        }}
      >
        {contacts.length > 0 && (
          <Field label="Kontaktperson">
            <select className={inputClass} value={contactId} onChange={(event) => selectContact(event.target.value)}>
              <option value="">Ingen kopplad kontaktperson</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Namn *">
          <input required className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>
        <Field label="E-post *">
          <input required type="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Användaren får endast åtkomst till det här företagets projekt och kundsynliga information.</p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>Avbryt</Button>
          <Button type="submit" disabled={sending}>{sending ? "Skickar..." : "Skicka inbjudan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditCustomerForm({
  customer,
  onSave,
  onCancel,
  onDelete,
  canDelete,
}: {
  customer: ReturnType<typeof useStore>["customers"][number];
  onSave: (patch: Partial<typeof customer>) => void;
  onCancel: () => void;
  onDelete: () => { ok: boolean; reason?: string };
  canDelete: boolean;
}) {
  const [form, setForm] = useState({
    company_name: customer.company_name,
    org_number: customer.org_number ?? "",
    invoice_address: customer.invoice_address ?? "",
    visiting_address: customer.visiting_address ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    website: customer.website ?? "",
    notes: customer.notes ?? "",
    status: customer.status,
    freight_calculator_enabled: customer.freight_calculator_enabled ?? false,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    const result = onDelete();
    if (!result.ok) setDeleteError(result.reason ?? "Kunden kunde inte raderas.");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-4"
    >
      <Field label="Företagsnamn *">
        <input required className={inputClass} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Organisationsnummer">
          <input className={inputClass} value={form.org_number} onChange={(e) => setForm({ ...form, org_number: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "aktiv" | "inaktiv" })}>
            <option value="aktiv">Aktiv</option>
            <option value="inaktiv">Inaktiv</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Fakturaadress">
          <input className={inputClass} value={form.invoice_address} onChange={(e) => setForm({ ...form, invoice_address: e.target.value })} />
        </Field>
        <Field label="Besöksadress">
          <input className={inputClass} value={form.visiting_address} onChange={(e) => setForm({ ...form, visiting_address: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Telefon">
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="E-post">
          <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Webbplats">
          <input className={inputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </Field>
      </div>
      <Field label="Anteckningar">
        <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>

      <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.freight_calculator_enabled}
          onChange={(e) => setForm({ ...form, freight_calculator_enabled: e.target.checked })}
        />
        <span>
          <span className="font-medium">Räknesnurra i kundportalen</span>
          <span className="block text-xs text-slate-500">
            Kunden kan själv räkna på ett uppskattat transportpris i portalen. Av som standard – slå bara på för kunder som ska ha tillgång.
          </span>
        </span>
      </label>

      {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</p>}

      <div className="flex items-center justify-between border-t border-border pt-4">
        {canDelete ? (
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Radera kunden permanent?</span>
              <button type="button" onClick={handleDelete} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                Ja, radera
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-sm text-slate-500 hover:text-slate-700">
                Avbryt
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} /> Radera kund
            </button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Avbryt</Button>
          <Button type="submit">Spara ändringar</Button>
        </div>
      </div>
    </form>
  );
}

function NewContactForm({
  onSave,
  onCancel,
}: {
  onSave: (data: { name: string; role: string | null; phone: string | null; mobile: string | null; email: string | null; note: string | null; is_primary: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name) return;
        onSave({ name, role: role || null, phone: phone || null, mobile: mobile || null, email: email || null, note: null, is_primary: isPrimary });
      }}
      className="space-y-4"
    >
      <Field label="Namn *">
        <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Titel/roll">
        <input className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Telefon">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Mobil">
          <input className={inputClass} value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Field>
      </div>
      <Field label="E-post">
        <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
        Primär kontakt
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">Lägg till</Button>
      </div>
    </form>
  );
}
