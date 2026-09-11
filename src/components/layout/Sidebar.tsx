import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  ListChecks,
  Users,
  Contact,
  FileText,
  Settings,
  Truck,
  Boxes,
  Upload,
  FileUp,
  UserCog,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useStore } from "../../data/store";
import { usePermissions } from "../../lib/usePermissions";
import { ROLE_LABELS } from "../../types";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, show: () => true },
  { to: "/mina-uppgifter", label: "Mina uppgifter", icon: ListChecks, show: () => true },
  { to: "/projekt", label: "Projekt", icon: ClipboardList, show: () => true },
  { to: "/kunder", label: "Kunder", icon: Users, show: () => true },
  { to: "/kontakter", label: "Kontaktpersoner", icon: Contact, show: () => true },
  { to: "/leverantorer", label: "Leverantörer", icon: Truck, show: () => true },
  { to: "/dokument", label: "Dokument", icon: FileText, show: () => true },
  {
    to: "/importera",
    label: "Importera Excel",
    icon: Upload,
    show: (p: ReturnType<typeof usePermissions>) => p.can("projects", "create"),
  },
  {
    to: "/importera-order",
    label: "Importera order (LTC)",
    icon: FileUp,
    show: (p: ReturnType<typeof usePermissions>) => p.can("projects", "create"),
  },
  { to: "/personal", label: "Personal", icon: UserCog, show: (p: ReturnType<typeof usePermissions>) => p.isAdmin },
  { to: "/installningar", label: "Inställningar", icon: Settings, show: (p: ReturnType<typeof usePermissions>) => p.isAdmin },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { currentProfile, signOut } = useAuth();
  const permissions = usePermissions();
  const { projects } = useStore();

  const myOpenTaskCount = currentProfile
    ? projects.reduce(
        (sum, p) => sum + (p.tasks ?? []).filter((t) => t.assignee_id === currentProfile.id && t.status !== "Klar").length,
        0
      )
    : 0;

  return (
    <>
      {open && <button type="button" aria-label="Stäng meny" className="fixed inset-0 z-40 bg-slate-950/50 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col bg-navy-950 text-slate-300 shadow-2xl transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:translate-x-0 md:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white">
          <Boxes size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white leading-tight">JK Projektlogistik</div>
          <div className="text-[11px] text-slate-400 leading-tight">Internt system</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white md:hidden" aria-label="Stäng meny">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.filter((item) => item.show(permissions)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {to === "/mina-uppgifter" && myOpenTaskCount > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {myOpenTaskCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">
            {currentProfile?.initials ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-white">{currentProfile?.full_name ?? "Okänd"}</div>
            <div className="truncate text-[11px] text-slate-400">{currentProfile ? ROLE_LABELS[currentProfile.role] : ""}</div>
          </div>
          <button onClick={() => signOut()} title="Byt användare / logga ut" className="text-slate-400 hover:text-white">
            <LogOut size={15} />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
