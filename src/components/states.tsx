import { type ReactNode } from "react";
import { Button } from "./Button";

/** Barra de skeleton (shimmer 1,5s). A busca de cliente NUNCA vira skeleton. */
export function SkeletonBar({ width = "100%", height = 9, radius = 6, style }: { width?: string | number; height?: number; radius?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden />;
}

/** Padrão de lista: avatar + duas linhas (#2i). */
export function SkeletonListItem() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }} aria-hidden>
      <SkeletonBar width={34} height={34} radius={999} />
      <div style={{ flex: 1 }}>
        <SkeletonBar width="70%" height={11} />
        <SkeletonBar width="44%" height={9} style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  /** variante de erro: tinta danger + recuperação */
  error?: boolean;
  actionIcon?: string;
}

/** Vazio/erro (#2i): nunca tela em branco — sempre causa + ação sugerida. */
export function EmptyState({ icon, title, description, action, onAction, error, actionIcon }: EmptyStateProps) {
  return (
    <div className={`empty-state${error ? " empty-state--error" : ""}`}>
      <span className="empty-state__icon">
        <i className={`${icon ?? (error ? "icon-cloud-alert" : "icon-inbox")}`} aria-hidden />
      </span>
      <span className="empty-state__title">{title}</span>
      <span className="empty-state__desc">{description}</span>
      {action && (
        <span className="empty-state__action">
          <Button variant={error ? "secondary" : "primary"} icon={error ? (actionIcon ?? "icon-rotate-cw") : actionIcon} onClick={onAction}>
            {action}
          </Button>
        </span>
      )}
    </div>
  );
}

export interface NotificationItem {
  id: string;
  title: ReactNode;
  time: string;
  unread?: boolean;
}

export interface NotificationDay {
  day: string;
  items: NotificationItem[];
}

/** Central de notificações (#2i): agrupada por dia, lida/não lida. */
export function NotificationList({ groups }: { groups: NotificationDay[] }) {
  return (
    <div className="notif-list">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="notif-group__day">{g.day}</div>
          {g.items.map((n) => (
            <div key={n.id} className={`notif${n.unread ? " notif--unread" : ""}`}>
              <span className="notif__dot" aria-hidden />
              <span className="notif__main">
                <span className="notif__title">{n.title}</span>
                <span className="notif__time">{n.time}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export type AgendaSlot =
  | { kind: "free"; hour: string; label?: string; onClick?: () => void }
  | { kind: "busy"; hour: string; title: string; meta: string; mine?: boolean }
  | { kind: "conflict"; hour: string; title: string; meta: string };

/** Agenda por hora (#2i): rótulo Mono 44px; reserva com borda-esquerda 3px (única barra lateral viva). */
export function AgendaGrid({ slots }: { slots: AgendaSlot[] }) {
  return (
    <div>
      {slots.map((slot) => (
        <div key={slot.hour} className="agenda__row">
          <span className="agenda__hour">{slot.hour}</span>
          {slot.kind === "free" ? (
            slot.label ? (
              <button type="button" className="agenda__free agenda__free--action" onClick={slot.onClick}>
                {slot.label}
              </button>
            ) : (
              <span className="agenda__free" />
            )
          ) : (
            <span className={`agenda__block${slot.kind === "conflict" ? " agenda__block--conflict" : ""}`}>
              <span className="agenda__block-title">{slot.title}</span>
              <span className="agenda__block-meta">{slot.meta}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Segmented pequeno da agenda (Manhã/Tarde/Dia). */
export function SegmentedSmall({ items, active, onChange }: { items: string[]; active: string; onChange?: (item: string) => void }) {
  return (
    <span className="segmented-sm">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={`segmented-sm__item${item === active ? " segmented-sm__item--active" : ""}`}
          aria-pressed={item === active}
          onClick={() => onChange?.(item)}
        >
          {item}
        </button>
      ))}
    </span>
  );
}
