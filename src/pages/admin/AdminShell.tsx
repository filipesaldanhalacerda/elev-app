/** Shell admin (quadro #4d): sidebar 212px com 7 itens + usuário/sair, header 64px. */
import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { initials } from "../../lib/format";

const ITEMS = [
  { path: "/admin", label: "Visão geral", icon: "ph-squares-four" },
  { path: "/admin/metatrader", label: "MetaTrader", icon: "ph-plugs-connected" },
  { path: "/admin/usuarios", label: "Usuários", icon: "ph-users-three" },
  { path: "/admin/salas", label: "Salas", icon: "ph-door-open" },
  { path: "/admin/importacoes", label: "Importações", icon: "ph-upload-simple" },
  { path: "/admin/auditoria", label: "Auditoria", icon: "ph-list-magnifying-glass" },
  { path: "/admin/kanban", label: "Kanban geral", icon: "ph-kanban" },
];

export function AdminShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <span className="admin-sidebar__mark">e</span>
          <span className="admin-sidebar__name">elev Admin</span>
        </div>
        <nav className="admin-sidebar__items">
          {ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`admin-sidebar__item${location.pathname === item.path ? " admin-sidebar__item--active" : ""}`}
              aria-current={location.pathname === item.path ? "page" : undefined}
              onClick={() => navigate(item.path)}
            >
              <i className={`ph ${item.icon}`} aria-hidden />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__avatar">{profile ? initials(profile.name) : ""}</span>
          <span className="admin-sidebar__user">
            <span className="admin-sidebar__username">{profile?.name}</span>
            <span className="admin-sidebar__role">{profile?.role === "admin" ? "administradora" : "assessor"}</span>
          </span>
          <button
            type="button"
            className="admin-sidebar__signout"
            aria-label="Sair da conta"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <i className="ph ph-sign-out" aria-hidden />
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <span className="admin-header__title">{title}</span>
          {actions && <span className="admin-header__actions">{actions}</span>}
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
