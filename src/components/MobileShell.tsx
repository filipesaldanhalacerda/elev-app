/** Shell mobile do assessor: conteúdo + bottom nav 86px (padrão das telas 04–16). */
import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const ITEMS = [
  { key: "inicio", label: "Início", icon: "ph-house", path: "/" },
  { key: "clientes", label: "Clientes", icon: "ph-users-three", path: "/clientes" },
  { key: "cotacoes", label: "Cotações", icon: "ph-chart-line", path: "/cotacoes" },
  { key: "cards", label: "Cards", icon: "ph-kanban", path: "/cards" },
  { key: "perfil", label: "Perfil", icon: "ph-user-circle", path: "/perfil" },
] as const;

export type MobileNavKey = (typeof ITEMS)[number]["key"];

export function MobileShell({ active, children }: { active: MobileNavKey; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mobile-shell">
      <div className="mobile-shell__content">{children}</div>
      <nav className="mnav">
        <span className="mnav__indicator" aria-hidden />
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mnav__item${item.key === active ? " mnav__item--active" : ""}`}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => navigate(item.path)}
          >
            <i className={`ph ${item.icon}`} aria-hidden />
            <span className="mnav__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
