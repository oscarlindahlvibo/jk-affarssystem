import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../../data/store";

export function GlobalSearch() {
  const { projects, customers, contactPersons, suppliers, isLoading, dataError } = useStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navigate = useNavigate();
  const resultId = useId();
  const terms = query.trim().toLocaleLowerCase("sv").split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("sv").split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const matches = (values: (string | null | undefined)[]) => {
      const text = values.filter(Boolean).join(" ").toLocaleLowerCase("sv");
      return terms.every((term) => text.includes(term));
    };
    return [
      ...projects.filter((p) => matches([p.project_number, p.name, p.customer?.company_name, p.customer_reference,
        ...(p.locations ?? []).flatMap((l) => [l.name, l.address]),
        ...(p.cargo_items ?? []).map((item) => item.description)]))
        .slice(0, 5).map((p) => ({ key: `project-${p.id}`, title: `${p.project_number} · ${p.name}`, detail: `Projekt · ${p.status}`, to: `/projekt/${p.id}` })),
      ...customers.filter((c) => matches([c.company_name, c.org_number, c.email, c.phone]))
        .slice(0, 5).map((c) => ({ key: `customer-${c.id}`, title: c.company_name, detail: "Kund", to: `/kunder/${c.id}` })),
      ...contactPersons.filter((c) => matches([c.name, c.email, c.phone, c.mobile, customers.find((customer) => customer.id === c.customer_id)?.company_name]))
        .slice(0, 5).map((c) => ({ key: `contact-${c.id}`, title: c.name, detail: "Kontaktperson", to: `/kontakter/${c.id}` })),
      ...suppliers.filter((s) => matches([s.company_name, s.contact_person, s.email, s.phone, s.area]))
        .slice(0, 5).map((s) => ({ key: `supplier-${s.id}`, title: s.company_name, detail: "Leverantör", to: `/leverantorer?sok=${encodeURIComponent(s.company_name)}` })),
    ];
  }, [projects, customers, contactPersons, suppliers, query]);

  const expanded = open && terms.length > 0;
  const close = () => { setOpen(false); setActiveIndex(-1); };

  return (
    <form
      className="relative min-w-0 flex-1 sm:max-w-80"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onSubmit={(event) => {
        event.preventDefault();
        const result = results[activeIndex >= 0 ? activeIndex : 0];
        if (result) { navigate(result.to); close(); }
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-3 top-4 text-slate-400" />
      <input
        role="combobox"
        aria-label="Sök projekt, kunder, kontaktpersoner och leverantörer"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? resultId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${resultId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => event.key === "ArrowDown"
              ? (index + 1) % results.length
              : (index <= 0 ? results.length - 1 : index - 1));
          }
        }}
        placeholder="Sök projekt, kund..."
        className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
      {expanded && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg sm:w-96">
          {isLoading || dataError || results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500" role="status">
              {isLoading ? "Läser data..." : dataError ? "Sökningen kunde inte läsa data." : "Inga träffar"}
            </div>
          ) : (
            <ul id={resultId} role="listbox" aria-label="Sökresultat">
              {results.map((result, index) => (
                <li key={result.key} role="none">
                  <Link
                    id={`${resultId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    to={result.to}
                    onClick={close}
                    className={`block border-b border-border px-4 py-3 last:border-0 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none ${index === activeIndex ? "bg-orange-50" : ""}`}
                  >
                    <div className="break-words text-sm font-medium text-slate-800">{result.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{result.detail}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
