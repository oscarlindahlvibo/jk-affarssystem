import { Menu } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { TaskNotifications } from "./TaskNotifications";

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-col gap-3 border-b border-border bg-panel px-4 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Öppna meny">
          <Menu size={20} />
        </button>
        <h1 className="truncate text-lg font-semibold text-slate-800">{title}</h1>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-4">
        <GlobalSearch />
        <TaskNotifications />
      </div>
    </header>
  );
}
