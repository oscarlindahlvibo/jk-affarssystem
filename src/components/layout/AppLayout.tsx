import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const TITLE_BY_PATH: { pattern: string; title: string }[] = [
  { pattern: "/", title: "Dashboard" },
  { pattern: "/mina-uppgifter", title: "Mina uppgifter" },
  { pattern: "/projekt", title: "Projekt" },
  { pattern: "/projekt/:id", title: "Projektdetalj" },
  { pattern: "/kunder", title: "Kunder" },
  { pattern: "/kunder/:id", title: "Kunddetalj" },
  { pattern: "/kontakter", title: "Kontaktpersoner" },
  { pattern: "/leverantorer", title: "Leverantörer" },
  { pattern: "/dokument", title: "Dokument" },
  { pattern: "/kontakter/:id", title: "Kontaktperson" },
  { pattern: "/importera", title: "Importera Excel" },
  { pattern: "/importera-order", title: "Importera order (LTC)" },
  { pattern: "/personal", title: "Personal" },
  { pattern: "/installningar", title: "Inställningar" },
];

function useTitle() {
  const location = useLocation();
  for (const { pattern, title } of TITLE_BY_PATH) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    if (matchPath(pattern, location.pathname)) return title;
  }
  return "JK Projektlogistik";
}

function matchPath(pattern: string, pathname: string) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) => part.startsWith(":") || part === pathParts[i]);
}

export function AppLayout() {
  const title = useTitle();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
