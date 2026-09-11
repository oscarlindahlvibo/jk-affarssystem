import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Phone, Mail } from "lucide-react";
import { useStore } from "../data/store";
import { Button } from "../components/ui/Button";
import { NewCustomerModal } from "../components/customers/NewCustomerModal";
import { usePermissions } from "../lib/usePermissions";

export function CustomerList() {
  const { customers, projects } = useStore();
  const canCreate = usePermissions().can("customers", "create");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter((c) => !q || c.company_name.toLowerCase().includes(q) || (c.org_number ?? "").includes(q));
  }, [customers, search]);

  const projectCount = (customerId: string) => projects.filter((p) => p.customer_id === customerId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök kund, org.nr..."
            className="w-72 rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Ny kund
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/kunder/${c.id}`}
            className="rounded-xl border border-border bg-panel p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800">{c.company_name}</div>
                <div className="text-xs text-slate-500">{c.org_number ?? "Org.nr saknas"}</div>
              </div>
              <span className={`status-pill ${c.status === "aktiv" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {c.status}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {c.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {c.phone}</div>}
              {c.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {c.email}</div>}
            </div>
            <div className="mt-3 border-t border-border pt-2.5 text-xs text-slate-500">
              {projectCount(c.id)} projekt kopplade
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-500">Inga kunder matchar sökningen.</p>
        )}
      </div>

      <NewCustomerModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
