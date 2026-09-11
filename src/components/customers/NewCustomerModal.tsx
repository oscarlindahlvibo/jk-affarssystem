import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../ui/Modal";
import { Field, inputClass } from "../ui/Field";
import { Button } from "../ui/Button";
import { useStore } from "../../data/store";

export function NewCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCustomer } = useStore();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  function reset() {
    setCompanyName(""); setOrgNumber(""); setInvoiceAddress(""); setPhone(""); setEmail(""); setWebsite("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName) return;
    const created = addCustomer({
      company_name: companyName,
      org_number: orgNumber || null,
      invoice_address: invoiceAddress || null,
      visiting_address: null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      notes: null,
      status: "aktiv",
    });
    reset();
    onClose();
    navigate(`/kunder/${created.id}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Ny kund" wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Företagsnamn *">
          <input required className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Organisationsnummer">
            <input className={inputClass} value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} placeholder="XXXXXX-XXXX" />
          </Field>
          <Field label="Webbplats">
            <input className={inputClass} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="exempel.se" />
          </Field>
        </div>
        <Field label="Fakturaadress">
          <input className={inputClass} value={invoiceAddress} onChange={(e) => setInvoiceAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telefon">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="E-post">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button type="submit">Skapa kund</Button>
        </div>
      </form>
    </Modal>
  );
}
