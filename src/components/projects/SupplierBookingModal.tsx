import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, Send } from "lucide-react";
import type { Project, Supplier } from "../../types";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function SupplierBookingModal({
  open,
  onClose,
  project,
  suppliers,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  suppliers: Supplier[];
  onSend: (supplierIds: string[]) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [selected, setSelected] = useState<string[]>(project.supplier_ids ?? (project.supplier_id ? [project.supplier_id] : []));
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => a.company_name.localeCompare(b.company_name, "sv")),
    [suppliers]
  );
  const invalidSelected = selected.some((id) => !suppliers.find((supplier) => supplier.id === id)?.email?.trim());

  const toggle = (supplierId: string) => {
    setSelected((current) => current.includes(supplierId) ? current.filter((id) => id !== supplierId) : [...current, supplierId]);
    setMessage(null);
  };

  const send = async () => {
    setSending(true);
    setMessage(null);
    try {
      const result = await onSend(selected);
      setMessage({ kind: result.ok ? "success" : "error", text: result.message ?? (result.ok ? "Bokningen skickades." : "Alla utskick kunde inte genomföras.") });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Bokningen kunde inte skickas." });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tilldela transportör / leverantör" wide>
      <p className="text-sm text-slate-600">
        Valda leverantörer kopplas till projektet och får en bokning med innehållet i Transportinformation och Gods.
      </p>

      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
        {sortedSuppliers.map((supplier) => {
          const hasEmail = Boolean(supplier.email?.trim());
          return (
            <label key={supplier.id} className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${hasEmail ? "cursor-pointer hover:bg-slate-50" : "bg-slate-50 opacity-65"}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-orange-500"
                checked={selected.includes(supplier.id)}
                disabled={!hasEmail}
                onChange={() => toggle(supplier.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{supplier.company_name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Mail size={12} /> {supplier.email || "E-post saknas"}
                </span>
              </span>
              <span className="text-xs text-slate-400">{(supplier.service_types?.length ? supplier.service_types : [supplier.type]).join(", ")}</span>
            </label>
          );
        })}
      </div>

      {message && (
        <div className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.kind === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          {message.text}
        </div>
      )}

      {(project.supplier_booking_dispatches?.length ?? 0) > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tidigare utskick</h3>
          <div className="mt-2 space-y-2">
            {project.supplier_booking_dispatches?.slice(0, 5).map((dispatch) => (
              <div key={dispatch.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium text-slate-700">{dispatch.supplier?.company_name ?? dispatch.recipient_name ?? dispatch.recipient_email}</span>
                  <span className="ml-2 text-xs text-slate-400">{formatDateTime(dispatch.sent_at)} av {dispatch.sent_by_name}</span>
                </div>
                <span className={dispatch.status === "sent" ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-red-600"}>
                  {dispatch.status === "sent" ? "Skickad" : "Misslyckades"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Stäng</Button>
        <Button type="button" disabled={sending || selected.length === 0 || invalidSelected} onClick={send}>
          <Send size={14} /> {sending ? "Skickar…" : `Skicka bokning${selected.length > 1 ? ` (${selected.length})` : ""}`}
        </Button>
      </div>
    </Modal>
  );
}
