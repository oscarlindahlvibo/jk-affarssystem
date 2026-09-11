import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { PersonnelProvider } from "./data/personnel";
import { GoogleDriveProvider } from "./lib/googleDriveContext";
import { StoreProvider } from "./data/store";
import { AppLayout } from "./components/layout/AppLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ProjectList } from "./pages/ProjectList";
import { ProjectDetail } from "./pages/ProjectDetail";
import { CustomerList } from "./pages/CustomerList";
import { CustomerDetail } from "./pages/CustomerDetail";
import { ContactsPage } from "./pages/ContactsPage";
import { ContactDetail } from "./pages/ContactDetail";
import { SuppliersPage } from "./pages/SuppliersPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { MyTasksPage } from "./pages/MyTasksPage";
import { ImportPage } from "./pages/ImportPage";
import { OrderImportPage } from "./pages/OrderImportPage";
import { ProjectPrint } from "./pages/ProjectPrint";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Laddar...</div>;
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { currentProfile } = useAuth();
  if (currentProfile?.role !== "admin") {
    return (
      <div className="py-20 text-center text-slate-500">
        Du har inte behörighet att se den här sidan.
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <GoogleDriveProvider>
              <StoreProvider>
                <Outlet />
              </StoreProvider>
            </GoogleDriveProvider>
          </RequireAuth>
        }
      >
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mina-uppgifter" element={<MyTasksPage />} />
          <Route path="/projekt" element={<ProjectList />} />
          <Route path="/projekt/:id" element={<ProjectDetail />} />
          <Route path="/kunder" element={<CustomerList />} />
          <Route path="/kunder/:id" element={<CustomerDetail />} />
          <Route path="/kontakter" element={<ContactsPage />} />
          <Route path="/kontakter/:id" element={<ContactDetail />} />
          <Route path="/leverantorer" element={<SuppliersPage />} />
          <Route path="/dokument" element={<DocumentsPage />} />
          <Route path="/importera" element={<ImportPage />} />
          <Route path="/importera-order" element={<OrderImportPage />} />
          <Route path="/personal" element={<RequireAdmin><PersonnelPage /></RequireAdmin>} />
          <Route path="/installningar" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        </Route>
        <Route path="/projekt/:id/skriv-ut" element={<ProjectPrint />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <PersonnelProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </PersonnelProvider>
    </BrowserRouter>
  );
}

export default App;
