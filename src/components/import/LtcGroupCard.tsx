import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileText, Plus, X } from "lucide-react";
import type { ContactPerson, Customer, Profile, Supplier, TransportType } from "../../types";
import { Field, inputClass } from "../ui/Field";
import { findMatchingContact, projectCountForGroup, type EditableItem, type LtcGroup, type LtcSheet } from "../../lib/ltcBatch";

const TRANSPORT_TYPES: TransportType[] = ["Specialtransport", "Maskintransport", "Krantransport", "Styckegods", "Container", "Annat"];

export function LtcGroupCard({
  index,
  groupCount,
  group,
  sheets,
  allGroups,
  warnings,
  customers,
  contactPersons,
  suppliers,
  profiles,
  onChange,
  onMoveSheet,
}: {
  index: number;
  groupCount: number;
  group: LtcGroup;
  sheets: LtcSheet[];
  allGroups: LtcGroup[];
  warnings: string[];
  customers: Customer[];
  contactPersons: ContactPerson[];
  suppliers: Supplier[];
  profiles: Profile[];
  onChange: (patch: Partial<LtcGroup>) => void;
  onMoveSheet: (sheetId: string, target: string) => void;
}) {
  const [open, setOpen] = useState(index === 0 && groupCount <= 3);
  const includedCount = group.items.filter((i) => i.include).length;
  const contactsForCustomer = contactPersons.filter((c) => c.customer_id === group.customerId);
  const order = group.order;
  const parsedContactName = (order.customerContact ?? order.recipientContact)?.trim() ?? "";
  const parsedContactPhone = order.customerPhone ?? order.recipientMobile ?? order.recipientPhone ?? "";
  const customerName = customers.find((c) => c.id === group.customerId)?.company_name ?? group.newCustomerName;
  const previewSheet = sheets.find((s) => s.id === group.previewSheetId) ?? null;
  const activeProfiles = profiles.filter((p) => p.status === "aktiv");
  const projects = projectCountForGroup(group);

  function updateItem(itemIndex: number, patch: Partial<EditableItem>) {
    onChange({ items: group.items.map((it, i) => (i === itemIndex ? { ...it, ...patch } : it)) });
  }

  function changeCustomer(customerId: string) {
    onChange({ customerId, contactId: findMatchingContact(contactPersons, customerId, order)?.id ?? "" });
  }

  return (
    <div className={`rounded-xl border ${group.done ? "border-green-200 bg-green-50/40" : "border-border bg-white"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            {group.done ? <CheckCircle2 size={15} className="text-green-600" /> : null}
            Leverans {index + 1}
            <span className="font-normal text-slate-500">· {customerName || "Kund saknas"}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {group.unloadingPlace || "Lossningsplats saknas"} · {sheets.length} blad · {includedCount} godsrader
          </div>
          {group.done && <div className="mt-1 text-xs text-green-700">Skapad: {group.createdNumbers.join(", ")}</div>}
          {warnings.map((w) => (
            <div key={w} className="mt-1 flex items-start gap-1 text-xs text-amber-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {!group.done && <span>{projects} projekt</span>}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && !group.done && (
        <div className="space-y-6 border-t border-border p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Blad i leveransen</h3>
            <ul className="space-y-1.5">
              {sheets.map((sheet) => (
                <li key={sheet.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText size={14} className="shrink-0 text-orange-500" />
                    <span className="truncate">{sheet.fileName}</span>
                    {sheet.parsed.documentNumber && <span className="shrink-0 text-xs text-slate-500">{sheet.parsed.documentNumber}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {sheet.previewUrl && (
                      <button type="button" className="text-xs font-medium text-orange-600 hover:text-orange-700" onClick={() => onChange({ previewSheetId: sheet.id })}>
                        Visa
                      </button>
                    )}
                    {(allGroups.length > 1 || sheets.length > 1) && (
                      <select
                        aria-label={`Flytta ${sheet.fileName}`}
                        className="rounded border border-border bg-white px-1.5 py-1 text-xs"
                        value=""
                        onChange={(e) => e.target.value && onMoveSheet(sheet.id, e.target.value)}
                      >
                        <option value="">Flytta till...</option>
                        {sheets.length > 1 && <option value="new">Egen leverans</option>}
                        {allGroups.map((g, i) => g.id !== group.id && !g.done && <option key={g.id} value={g.id}>Leverans {i + 1}</option>)}
                      </select>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Kund (avsändare)</h3>
            {!group.showNewCustomer ? (
              <div className="flex gap-2">
                <select className={inputClass} value={group.customerId} onChange={(e) => changeCustomer(e.target.value)}>
                  <option value="">Välj kund</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
                <button type="button" onClick={() => onChange({ showNewCustomer: true })} className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  <Plus size={14} /> Ny
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Ny kund (från dokumentet)</span>
                  {customers.length > 0 && (
                    <button type="button" onClick={() => onChange({ showNewCustomer: false })} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                  )}
                </div>
                <input className={inputClass} value={group.newCustomerName} onChange={(e) => onChange({ newCustomerName: e.target.value })} placeholder="Företagsnamn" />
              </div>
            )}
            {!group.showNewCustomer && (
              <div className="mt-3">
                <Field label="Kontaktperson hos kunden">
                  <select className={inputClass} value={group.contactId} onChange={(e) => onChange({ contactId: e.target.value })} disabled={!group.customerId}>
                    <option value="">Välj kontaktperson</option>
                    {contactsForCustomer.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                {parsedContactName && !group.contactId && (
                  <p className="mt-2 text-xs text-slate-500">Skapar kontaktperson från ordern: {parsedContactName}{parsedContactPhone ? ` · ${parsedContactPhone}` : ""}</p>
                )}
              </div>
            )}
            {group.showNewCustomer && parsedContactName && (
              <p className="mt-2 text-xs text-slate-500">Skapar kontaktperson från ordern: {parsedContactName}{parsedContactPhone ? ` · ${parsedContactPhone}` : ""}</p>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Transport</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Företag vid lastning"><input className={inputClass} value={group.loadingCompany} onChange={(e) => onChange({ loadingCompany: e.target.value })} /></Field>
              <Field label="Företag vid lossning"><input className={inputClass} value={group.unloadingCompany} onChange={(e) => onChange({ unloadingCompany: e.target.value })} /></Field>
              <Field label="Lastningsplats"><input className={inputClass} value={group.loadingPlace} onChange={(e) => onChange({ loadingPlace: e.target.value })} /></Field>
              <Field label="Lossningsplats"><input className={inputClass} value={group.unloadingPlace} onChange={(e) => onChange({ unloadingPlace: e.target.value })} /></Field>
              <Field label="Kontakt vid lossning"><input className={inputClass} value={group.unloadingContactName} onChange={(e) => onChange({ unloadingContactName: e.target.value })} /></Field>
              <Field label="Telefon"><input className={inputClass} value={group.unloadingContactPhone} onChange={(e) => onChange({ unloadingContactPhone: e.target.value })} /></Field>
              <Field label="Planerat lastningsdatum"><input type="date" className={inputClass} value={group.loadingDate} onChange={(e) => onChange({ loadingDate: e.target.value })} /></Field>
              <Field label="Planerad lastningstid"><input type="time" className={inputClass} value={group.loadingTime} onChange={(e) => onChange({ loadingTime: e.target.value })} /></Field>
              <Field label="Planerat lossningsdatum"><input type="date" className={inputClass} value={group.deliveryDate} onChange={(e) => onChange({ deliveryDate: e.target.value })} /></Field>
              <Field label="Planerad lossningstid"><input type="time" className={inputClass} value={group.deliveryTime} onChange={(e) => onChange({ deliveryTime: e.target.value })} /></Field>
              <Field label="Leveransvillkor"><input className={inputClass} value={group.deliveryTerms} onChange={(e) => onChange({ deliveryTerms: e.target.value })} /></Field>
              <Field label="Transporttyp">
                <select className={inputClass} value={group.transportType} onChange={(e) => onChange({ transportType: e.target.value as TransportType })}>
                  {TRANSPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Transportör (saknas i dokumentet)">
                <select className={inputClass} value={group.supplierId} onChange={(e) => onChange({ supplierId: e.target.value })}>
                  <option value="">Välj transportör</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                </select>
              </Field>
              <Field label="Ansvarig hos JK (saknas i dokumentet)">
                <select className={inputClass} value={group.responsibleId} onChange={(e) => onChange({ responsibleId: e.target.value })}>
                  <option value="">Välj ansvarig</option>
                  {activeProfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Gods / bilar ({includedCount} av {group.items.length} inkluderade)</h3>
            {includedCount > 1 && (
              <div role="radiogroup" aria-label="Hur ska godsraderna importeras" className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  ["single", `Ett projekt med ${includedCount} godsrader`, "Samma transport och en gemensam order."],
                  ["split", `${includedCount} separata projekt`, "Varje rad blir en egen transport/fakturering."],
                ] as const).map(([mode, label, hint]) => (
                  <label key={mode} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${group.mode === mode ? "border-orange-300 bg-orange-50" : "border-border"}`}>
                    <input type="radio" name={`mode-${group.id}`} className="mt-0.5" checked={group.mode === mode} onChange={() => onChange({ mode })} />
                    <span><span className="font-medium text-slate-800">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {group.items.map((item, i) => {
                const sheet = sheets.find((s) => s.id === item.sheetId);
                return (
                  <div key={i} className={`rounded-lg border p-3 ${item.include ? "border-border" : "border-border bg-slate-50 opacity-60"}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={item.include} onChange={(e) => updateItem(i, { include: e.target.checked })} />
                        Order {item.orderRef ?? `#${i + 1}`}
                      </label>
                      {sheets.length > 1 && sheet && <span className="text-xs text-slate-400">{sheet.parsed.documentNumber ?? sheet.fileName}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      <Field label="Typ"><input className={inputClass} value={item.typeName ?? ""} onChange={(e) => updateItem(i, { typeName: e.target.value })} /></Field>
                      <Field label="Godsmärke"><input className={inputClass} value={item.goodsMark ?? ""} onChange={(e) => updateItem(i, { goodsMark: e.target.value })} /></Field>
                      <Field label="Längd (m)"><input className={inputClass} value={item.length_m ?? ""} onChange={(e) => updateItem(i, { length_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Bredd (m)"><input className={inputClass} value={item.width_m ?? ""} onChange={(e) => updateItem(i, { width_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Höjd (m)"><input className={inputClass} value={item.height_m ?? ""} onChange={(e) => updateItem(i, { height_m: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                      <Field label="Vikt (ton)"><input className={inputClass} value={item.weight_ton ?? ""} onChange={(e) => updateItem(i, { weight_ton: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
                    </div>
                    {item.deliveryTermsAddition && <p className="mt-2 text-xs text-slate-500">Tillägg leveransvillkor: {item.deliveryTermsAddition}</p>}
                  </div>
                );
              })}
              {group.items.length === 0 && (
                <p className="text-sm text-slate-500">Inga godsrader hittades automatiskt. Lägg till projekt manuellt via "Nytt projekt" istället, eller kontrollera dokumentet.</p>
              )}
            </div>
          </div>

          {previewSheet?.previewUrl && (
            <section className="border-t border-border pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText size={16} className="text-orange-500" /> Originaldokument: {previewSheet.fileName}</h3>
                  <p className="mt-1 text-xs text-slate-500">Jämför uppgifterna ovan med det uppladdade orderbladet.</p>
                </div>
                <a href={previewSheet.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <ExternalLink size={14} /> Öppna större
                </a>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-slate-100">
                <iframe src={`${previewSheet.previewUrl}#view=FitH`} title={`Förhandsgranskning av ${previewSheet.fileName}`} className="h-[70vh] min-h-[520px] w-full bg-white" />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
