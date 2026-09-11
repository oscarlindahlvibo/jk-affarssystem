import { Search, Bell, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/projekt?sok=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-col gap-3 border-b border-border bg-panel px-4 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Öppna meny">
          <Menu size={20} />
        </button>
        <h1 className="truncate text-lg font-semibold text-slate-800">{title}</h1>
        <button type="button" className="relative ml-auto shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 sm:hidden" aria-label="Notiser">
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
        <form onSubmit={onSearch} className="relative min-w-0 flex-1 sm:max-w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök projekt, kund..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
        </form>
        <button type="button" className="relative hidden shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 sm:block" aria-label="Notiser">
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
        </button>
      </div>
    </header>
  );
}
