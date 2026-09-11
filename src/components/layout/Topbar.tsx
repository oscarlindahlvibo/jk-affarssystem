import { Search, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export function Topbar({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/projekt?sok=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-panel px-6">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-4">
        <form onSubmit={onSearch} className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök projekt, kund..."
            className="w-64 rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </form>
        <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
        </button>
      </div>
    </header>
  );
}
