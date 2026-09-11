import { useState } from "react";
import { Plus, Truck } from "lucide-react";
import { useStore } from "../data/store";
import { Button } from "../components/ui/Button";
import { SupplierModal } from "../components/suppliers/SupplierModal";
import { usePermissions } from "../lib/usePermissions";
import type { Supplier } from "../types";

const TYPE_COLORS: Record<string, string> = {
  "Åkeri": "bg-sky-100 text-sky-700",
  "Kran": "bg-orange-100 text-orange-700",
  "Följebil": "bg-purple-100 text-purple-700",
  "Vägtransportledare": "bg-rose-100 text-rose-700",
  "Konsult": "bg-emerald-100 text-emerald-700",
  "Annat": "bg-slate-100 text-slate-600",
};

export function SuppliersPage() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useStore();
  const permissions = usePermissions();
  const canCreate = permissions.can("suppliers", "create");
  const canEdit = permissions.can("suppliers", "edit");
  const canDelete = permissions.can("suppliers", "delete");
  const [type, setType] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const filtered = type ? suppliers.filter((s) => s.type === type) : suppliers;
  const types = Array.from(new Set(suppliers.map((s) => s.type)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <option value="">Alla typer</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Ny leverantör
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          const content = (
            <>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white">
                    <Truck size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{s.company_name}</div>
                    <div className="text-xs text-slate-500">{s.area ?? "Område ej angivet"}</div>
                  </div>
                </div>
                <span className={`status-pill ${TYPE_COLORS[s.type]}`}>{s.type}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {s.contact_person && <div>Kontakt: {s.contact_person}</div>}
                {s.phone && <div>{s.phone}</div>}
                {s.email && <div>{s.email}</div>}
              </div>
              {s.notes && <p className="mt-2 text-xs text-slate-500">{s.notes}</p>}
            </>
          );
          return canEdit ? (
            <button
              key={s.id}
              onClick={() => setEditing(s)}
              className="rounded-xl border border-border bg-panel p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              {content}
            </button>
          ) : (
            <div key={s.id} className="rounded-xl border border-border bg-panel p-4 shadow-sm">
              {content}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-500">Inga leverantörer i denna kategori.</p>
        )}
      </div>

      {canCreate && (
        <SupplierModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSave={(data) => { addSupplier(data); setCreateOpen(false); }}
        />
      )}

      {editing && canEdit && (
        <SupplierModal
          key={editing.id}
          open={Boolean(editing)}
          supplier={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => { updateSupplier(editing.id, data); setEditing(null); }}
          onDelete={
            canDelete
              ? () => {
                  const result = deleteSupplier(editing.id);
                  if (result.ok) setEditing(null);
                  return result;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
