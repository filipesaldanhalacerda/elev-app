import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { AppSplash } from "./components/AppSplash";
import Showcase from "./pages/Showcase";
import Login from "./pages/auth/Login";
import FirstAccess from "./pages/auth/FirstAccess";
import LostPassword from "./pages/auth/LostPassword";
import Users from "./pages/admin/Users";
import Imports from "./pages/admin/Imports";
import Clients from "./pages/Clients";
import ClientFile from "./pages/ClientFile";
import Quotes from "./pages/Quotes";
import Alerts from "./pages/Alerts";
import Cards from "./pages/Cards";
import Kanban from "./pages/admin/Kanban";
import Rooms from "./pages/Rooms";
import RoomsAdmin from "./pages/admin/RoomsAdmin";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Agenda from "./pages/Agenda";
import AdminHome from "./pages/admin/AdminHome";
import Audit from "./pages/admin/Audit";
import MetaTrader from "./pages/admin/MetaTrader";

function Guard({ children, admin = false, advisorOnly = false }: { children: React.ReactNode; admin?: boolean; advisorOnly?: boolean }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <AppSplash />;
  if (!session) return <Navigate to="/login" replace />;
  if (admin && profile?.role !== "admin") return <Navigate to="/" replace />;
  // admin não atende clientes: a visão dele é o desktop /admin, nunca as telas de carteira
  if (advisorOnly && profile?.role === "admin") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/primeiro-acesso" element={<FirstAccess />} />
          <Route path="/perdi-a-senha" element={<LostPassword />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route
            path="/admin/usuarios"
            element={
              <Guard admin>
                <Users />
              </Guard>
            }
          />
          <Route
            path="/clientes"
            element={
              <Guard advisorOnly>
                <Clients />
              </Guard>
            }
          />
          <Route
            path="/clientes/:account"
            element={
              <Guard advisorOnly>
                <ClientFile />
              </Guard>
            }
          />
          <Route
            path="/cotacoes"
            element={
              <Guard advisorOnly>
                <Quotes />
              </Guard>
            }
          />
          <Route
            path="/alertas"
            element={
              <Guard advisorOnly>
                <Alerts />
              </Guard>
            }
          />
          <Route
            path="/cards"
            element={
              <Guard advisorOnly>
                <Cards />
              </Guard>
            }
          />
          <Route
            path="/admin/kanban"
            element={
              <Guard admin>
                <Kanban />
              </Guard>
            }
          />
          <Route
            path="/salas"
            element={
              <Guard advisorOnly>
                <Rooms />
              </Guard>
            }
          />
          <Route
            path="/admin/salas"
            element={
              <Guard admin>
                <RoomsAdmin />
              </Guard>
            }
          />
          <Route
            path="/agenda"
            element={
              <Guard advisorOnly>
                <Agenda />
              </Guard>
            }
          />
          <Route
            path="/notificacoes"
            element={
              <Guard>
                <Notifications />
              </Guard>
            }
          />
          <Route
            path="/perfil"
            element={
              <Guard>
                <Profile />
              </Guard>
            }
          />
          <Route
            path="/admin"
            element={
              <Guard admin>
                <AdminHome />
              </Guard>
            }
          />
          <Route
            path="/admin/auditoria"
            element={
              <Guard admin>
                <Audit />
              </Guard>
            }
          />
          <Route
            path="/admin/metatrader"
            element={
              <Guard admin>
                <MetaTrader />
              </Guard>
            }
          />
          <Route
            path="/admin/importacoes"
            element={
              <Guard admin>
                <Imports />
              </Guard>
            }
          />
          <Route
            path="*"
            element={
              <Guard advisorOnly>
                <Dashboard />
              </Guard>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
