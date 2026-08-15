import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
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
import MetaTrader from "./pages/admin/MetaTrader";

function Guard({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <div data-app-shell style={{ minHeight: "100dvh", background: "var(--bg)" }} />;
  if (!session) return <Navigate to="/login" replace />;
  if (admin && profile?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Home do assessor (tela 04) entra na E13 — até lá, casca vazia autenticada. */
function HomePlaceholder() {
  return <div data-app-shell data-home style={{ minHeight: "100dvh", background: "var(--bg)" }} />;
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
              <Guard>
                <Clients />
              </Guard>
            }
          />
          <Route
            path="/clientes/:account"
            element={
              <Guard>
                <ClientFile />
              </Guard>
            }
          />
          <Route
            path="/cotacoes"
            element={
              <Guard>
                <Quotes />
              </Guard>
            }
          />
          <Route
            path="/alertas"
            element={
              <Guard>
                <Alerts />
              </Guard>
            }
          />
          <Route
            path="/cards"
            element={
              <Guard>
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
              <Guard>
                <HomePlaceholder />
              </Guard>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
