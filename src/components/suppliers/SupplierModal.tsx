import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Field, inputClass } from "../ui/Field";
import { Button } from "../ui/Button";
import type { Supplier, SupplierType } from "../../types";

const SUPPLIER_TYPES: SupplierType[] = ["Åkeri", "Kran", "Följebil", "Vägtransportledare", "Konsult", "Annat"];

type FormState = {
  company_name: string;
  type: SupplierType;
  contact_person: string;
  phone: string;
  email: string;
  area: string;
  notes: string;
};

function toFormState(supplier?: Supplier): FormState {
  return {
    company_name: supplier?.company_name ?? "",
    type: supplier?.type ?? "Åkeri",
    contact_person: supplier?.contact_person ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    area: supplier?.area ?? "",
    notes: supplier?.notes ?? "",
  };
}

export function SupplierModal({
  open,
  onClose,
  supplier,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier;
  onSave: (data: FormState) => void;
  onDelete?: () => { ok: boolean; reason?: string };
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(supplier));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleClose() {
    setForm(toFormState(supplier));
    setConfirmingDelete(false);
    setDeleteError(null);
    onClose();
  }

  function handleDelete() {
    if (!onDelete) return;
    const result = onDelete();
    if (!result.ok) setDeleteError(result.reason ?? "Leverantören kunde inte raderas.");
  }

  return (
    <Modal open={open} onClose={handleClose} title={supplier ? "Redigera leverantör" : "Ny leverantör"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.company_name.trim()) return;
          onSave(form);
        }}
        className="space-y-4"
      >
        <Field label="Företagsnamn *">
          <input required className={inputClass} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Typ">
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SupplierType })}>
              {SUPPLIER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Område">
            <input className={inputClass} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="t.ex. Södra Sverige" />
          </Field>
        </div>
        <Field label="Kontaktperson">
          <input className={inputClass} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Telefon">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="E-post">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Anteckningar">
          <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>

        {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</p>}

        <div className="flex items-center justify-between border-t border-border pt-4">
          {onDelete ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Radera leverantören permanent?</span>
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
                <Trash2 size={14} /> Radera leverantör
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>Avbryt</Button>
            <Button type="submit">{supplier ? "Spara ändringar" : "Skapa leverantör"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
