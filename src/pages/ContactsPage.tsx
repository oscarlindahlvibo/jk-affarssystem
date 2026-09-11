import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Star, Phone, Mail, ChevronRight } from "lucide-react";
import { useStore } from "../data/store";

export function ContactsPage() {
  const { contactPersons, customers } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");

  const customerName = (id: string) => customers.find((c) => c.id === id)?.company_name ?? "–";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contactPersons.filter((c) => {
      if (customerId && c.customer_id !== customerId) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || customerName(c.customer_id).toLowerCase().includes(q);
    });
  }, [contactPersons, search, customerId, customers]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative min-w-0">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök kontaktperson..."
            className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </div>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm sm:w-auto">
          <option value="">Alla kunder</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company_name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((c) => (
          <Link key={c.id} to={`/kontakter/${c.id}`} className="block rounded-xl border border-border bg-panel p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <span className="truncate">{c.name}</span>
                  {c.is_primary && <Star size={13} className="shrink-0 fill-orange-400 text-orange-400" />}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{c.role ?? "Titel saknas"}</div>
                <div className="mt-1 text-sm text-slate-600">{customerName(c.customer_id)}</div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-300" />
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {c.phone && <div className="flex items-center gap-1.5"><Phone size={12} />{c.phone}</div>}
              {c.mobile && <div className="flex items-center gap-1.5"><Phone size={12} />{c.mobile}</div>}
              {c.email && <div className="flex items-center gap-1.5 break-all"><Mail size={12} className="shrink-0" />{c.email}</div>}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-panel px-4 py-10 text-center text-sm text-slate-500">Inga kontaktpersoner matchar.</div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-panel shadow-sm md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Namn</th>
              <th className="px-4 py-3 font-medium">Titel/roll</th>
              <th className="px-4 py-3 font-medium">Kund</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Mobil</th>
              <th className="px-4 py-3 font-medium">E-post</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/kontakter/${c.id}`)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span className="flex items-center gap-1.5">
                    {c.name}
                    {c.is_primary && <Star size={13} className="fill-orange-400 text-orange-400" />}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.role ?? "–"}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/kunder/${c.customer_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-600 hover:text-orange-600"
                  >
                    {customerName(c.customer_id)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.phone ? <span className="flex items-center gap-1.5"><Phone size={12} />{c.phone}</span> : "–"}</td>
                <td className="px-4 py-3 text-slate-600">{c.mobile ?? "–"}</td>
                <td className="px-4 py-3 text-slate-600">{c.email ? <span className="flex items-center gap-1.5"><Mail size={12} />{c.email}</span> : "–"}</td>
                <td className="px-4 py-3 text-slate-300"><ChevronRight size={15} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Inga kontaktpersoner matchar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
