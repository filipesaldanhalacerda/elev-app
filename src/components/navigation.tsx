import { type ReactNode } from "react";

/** Header mobile 56px (#2g). */
export function MobileHeader({
  title,
  onBack,
  actions,
}: {
  title: ReactNode;
  onBack?: () => void;
  actions?: { icon: string; label: string; onClick?: () => void }[];
}) {
  return (
    <header className="mheader">
      <span className="mheader__lead">
        {onBack && (
          <button type="button" className="mheader__back" aria-label="Voltar" onClick={onBack}>
            <i className="icon-arrow-left" aria-hidden />
          </button>
        )}
        <span className="mheader__title">{title}</span>
      </span>
      {actions && (
        <span className="mheader__actions">
          {actions.map((a) => (
            <button key={a.icon} type="button" className="mheader__action" aria-label={a.label} onClick={a.onClick}>
              <i className={`${a.icon}`} aria-hidden />
            </button>
          ))}
        </span>
      )}
    </header>
  );
}

/** Abas internas 42px (#2g): ativo 600 + sublinhado 2px action; rolagem com fade. */
export function Tabs({ items, active, onChange }: { items: string[]; active: string; onChange?: (tab: string) => void }) {
  return (
    <nav className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={item === active}
          className={`tab${item === active ? " tab--active" : ""}`}
          onClick={() => onChange?.(item)}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

export const BOTTOM_NAV_ITEMS = [
  { key: "inicio", label: "Início", icon: "icon-house" },
  { key: "clientes", label: "Clientes", icon: "icon-users-round" },
  { key: "cotacoes", label: "Cotações", icon: "icon-chart-line" },
  { key: "tarefas", label: "Tarefas", icon: "icon-square-check" },
  { key: "agenda", label: "Agenda", icon: "icon-calendar" },
] as const;

export type BottomNavKey = (typeof BOTTOM_NAV_ITEMS)[number]["key"];

/** Bottom nav mobile (#2g): 5 itens fixos, ativo em action + 600, indicador de home. */
export function BottomNav({ active, onNavigate }: { active: BottomNavKey; onNavigate?: (key: BottomNavKey) => void }) {
  return (
    <nav className="bottom-nav">
      <span className="bottom-nav__indicator" aria-hidden />
      {BOTTOM_NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`bottom-nav__item${item.key === active ? " bottom-nav__item--active" : ""}`}
          aria-current={item.key === active ? "page" : undefined}
          onClick={() => onNavigate?.(item.key)}
        >
          <i className={`${item.icon}`} aria-hidden />
          <span className="bottom-nav__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export const ADMIN_SIDEBAR_ITEMS = [
  { key: "visao-geral", label: "Visão geral", icon: "icon-layout-grid" },
  { key: "metatrader", label: "MetaTrader", icon: "icon-plug-zap" },
  { key: "usuarios", label: "Usuários", icon: "icon-users-round" },
  { key: "salas", label: "Salas", icon: "icon-door-open" },
  { key: "importacoes", label: "Importações", icon: "icon-upload" },
  { key: "auditoria", label: "Auditoria", icon: "icon-text-search" },
] as const;

export type AdminSidebarKey = (typeof ADMIN_SIDEBAR_ITEMS)[number]["key"];

/** Sidebar admin (#2g): logo "e" + "elev Admin", itens 38px, ativo em tinta brand. */
export function AdminSidebar({
  active,
  onNavigate,
  footer,
  width = 212,
}: {
  active: AdminSidebarKey;
  onNavigate?: (key: AdminSidebarKey) => void;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <aside className="sidebar" style={{ width, display: "flex", flexDirection: "column" }}>
      <div className="sidebar__logo">
        <span className="sidebar__mark">e</span>
        <span className="sidebar__name">elev Admin</span>
      </div>
      <div className="sidebar__items" style={{ flex: 1 }}>
        {ADMIN_SIDEBAR_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar__item${item.key === active ? " sidebar__item--active" : ""}`}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => onNavigate?.(item.key)}
          >
            <i className={`${item.icon}`} aria-hidden />
            {item.label}
          </button>
        ))}
      </div>
      {footer}
    </aside>
  );
}
