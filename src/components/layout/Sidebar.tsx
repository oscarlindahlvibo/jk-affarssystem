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
  UserCog,
  LogOut,
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
  { to: "/personal", label: "Personal", icon: UserCog, show: (p: ReturnType<typeof usePermissions>) => p.isAdmin },
  { to: "/installningar", label: "Inställningar", icon: Settings, show: (p: ReturnType<typeof usePermissions>) => p.isAdmin },
];

export function Sidebar() {
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
    <aside className="flex h-full w-60 shrink-0 flex-col bg-navy-950 text-slate-300">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white">
          <Boxes size={18} />
        </div>
        <div>
          <div className="text-sm font-semibold text-white leading-tight">JK Projektlogistik</div>
          <div className="text-[11px] text-slate-400 leading-tight">Internt system</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.filter((item) => item.show(permissions)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
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
  );
}
