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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök kontaktperson..."
            className="w-72 rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </div>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <option value="">Alla kunder</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company_name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-panel shadow-sm">
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
