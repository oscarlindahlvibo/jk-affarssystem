import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Pencil, Phone, Star, Trash2 } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, inputClass } from "../components/ui/Field";
import { usePermissions } from "../lib/usePermissions";

export function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getContact, getCustomer, updateContactPerson, deleteContactPerson } = useStore();
  const permissions = usePermissions();
  const canEdit = permissions.can("contacts", "edit");
  const canDelete = permissions.can("contacts", "delete");
  const contact = id ? getContact(id) : undefined;
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!contact) {
    return (
      <div className="py-20 text-center text-slate-500">
        Kontaktpersonen hittades inte.
        <div className="mt-3">
          <Link to="/kontakter" className="text-orange-600 hover:text-orange-700">Tillbaka till kontaktpersoner</Link>
        </div>
      </div>
    );
  }

  const customer = getCustomer(contact.customer_id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/kontakter" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-orange-600">
          <ArrowLeft size={14} /> Tillbaka till kontaktpersoner
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
              {contact.name}
              {contact.is_primary && <Star size={16} className="fill-orange-400 text-orange-400" />}
            </h2>
            <div className="text-sm text-slate-500">{contact.role ?? "Titel/roll ej angiven"}</div>
          </div>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={14} /> Redigera
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Kontaktuppgifter" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">Kund</div>
              {customer ? (
                <Link to={`/kunder/${customer.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600">
                  {customer.company_name}
                </Link>
              ) : (
                <div className="text-sm text-slate-800">–</div>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500">Primär kontakt</div>
              <div className="text-sm text-slate-800">{contact.is_primary ? "Ja" : "Nej"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Telefon</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-800"><Phone size={13} />{contact.phone ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Mobil</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-800"><Phone size={13} />{contact.mobile ?? "–"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">E-post</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-800"><Mail size={13} />{contact.email ?? "–"}</div>
            </div>
          </div>
          {contact.note && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{contact.note}</p>
          )}
        </Panel>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Redigera kontaktperson">
        <EditContactForm
          contact={contact}
          onSave={(patch) => { updateContactPerson(contact.id, patch); setEditOpen(false); }}
          onCancel={() => setEditOpen(false)}
        />
        {canDelete && (
          <div className="mt-4 border-t border-border pt-4">
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Radera kontaktpersonen permanent?</span>
                <button
                  type="button"
                  onClick={() => { deleteContactPerson(contact.id); navigate("/kontakter"); }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
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
                <Trash2 size={14} /> Radera kontaktperson
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function EditContactForm({
  contact,
  onSave,
  onCancel,
}: {
  contact: ReturnType<typeof useStore>["contactPersons"][number];
  onSave: (patch: Partial<typeof contact>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: contact.name,
    role: contact.role ?? "",
    phone: contact.phone ?? "",
    mobile: contact.mobile ?? "",
    email: contact.email ?? "",
    note: contact.note ?? "",
    is_primary: contact.is_primary,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-4"
    >
      <Field label="Namn *">
        <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Titel/roll">
        <input className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Telefon">
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Mobil">
          <input className={inputClass} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
        </Field>
      </div>
      <Field label="E-post">
        <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Anteckning">
        <textarea rows={2} className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
        Primär kontakt
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Avbryt</Button>
        <Button type="submit">Spara ändringar</Button>
      </div>
    </form>
  );
}
