import { type ReactNode } from "react";
import { Button } from "./Button";

/** Barra de skeleton (shimmer 1,5s). A busca de cliente NUNCA vira skeleton. */
export function SkeletonBar({ width = "100%", height = 9, radius = 6, style }: { width?: string | number; height?: string | number; radius?: number; style?: React.CSSProperties }) {
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


/* ------------------------------------------------------------------
 * Kit de carregamento (#2i) — padrões de lista, tabela e gráfico.
 * Regra: o skeleton tem a MESMA geometria do conteúdo real (mesma altura
 * de linha, mesmo container, mesmas colunas), para a tela não pular quando
 * o dado chega. A busca de cliente nunca vira skeleton.
 * ------------------------------------------------------------------ */

/** Larguras variadas e estáveis — a onda parece texto, não uma pilha de barras iguais. */
const W = [72, 56, 66, 81, 60, 74, 52, 68, 78, 58];
const wide = (i: number) => `${W[i % W.length]}%`;
const narrow = (i: number) => `${Math.round(W[(i + 3) % W.length] * 0.55)}%`;
/** Escalona o shimmer: cada linha entra 0,1s adiantada na mesma volta de 1,5s. */
export const stagger = (i: number) => ({ ["--skeleton-delay" as string]: `-${(i % 8) * 0.1}s` } as React.CSSProperties);

/** Envelope acessível: anuncia "carregando" uma única vez e some quando o dado chega. */
export function SkeletonRegion({
  label,
  children,
  className,
  style,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div role="status" aria-busy="true" data-skeleton className={className} style={style}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Padrão LISTA (#2i) — container .client-list com linhas de 68px (avatar + nome + valor). */
export function SkeletonList({
  rows = 5,
  avatar = true,
  value = true,
  height = 68,
  label = "Carregando lista",
  className = "client-list",
  style,
}: {
  rows?: number;
  avatar?: boolean;
  value?: boolean;
  height?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <SkeletonRegion label={label} className={className} style={style}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            minHeight: height,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderTop: i > 0 ? "1px solid var(--divider)" : undefined,
          }}
        >
          {avatar && <SkeletonBar width={36} height={36} radius={999} style={stagger(i)} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={wide(i)} height={11} style={stagger(i)} />
            <SkeletonBar width={narrow(i)} height={9} style={{ marginTop: 6, ...stagger(i + 1) }} />
          </div>
          {value && (
            <div style={{ width: 88, flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <SkeletonBar width={70} height={12} style={stagger(i + 2)} />
              <SkeletonBar width={44} height={9} style={stagger(i + 3)} />
            </div>
          )}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Linhas de duas alturas dentro de um cartão — a lista sem avatar (avisos, tarefas, histórico). */
export function SkeletonCardRows({
  rows = 3,
  height = 56,
  label = "Carregando",
  radius = 14,
  trailing,
  icon,
  lead,
  className = "card",
}: {
  rows?: number;
  height?: number;
  label?: string;
  radius?: number;
  /** largura do bloco à direita (chip, hora, valor) */
  trailing?: number;
  /** lado esquerdo em quadrado (ícone de tipo), no tamanho do real */
  icon?: number;
  /** coluna estreita à esquerda (rótulo de hora em Mono) */
  lead?: number;
  className?: string;
}) {
  return (
    <SkeletonRegion label={label} className={className} style={{ padding: 0, overflow: "hidden", borderRadius: radius }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            minHeight: height,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            borderTop: i > 0 ? "1px solid var(--divider)" : undefined,
          }}
        >
          {lead && (
            <span style={{ width: lead, flex: "none" }}>
              <SkeletonBar width={34} height={9} style={stagger(i)} />
            </span>
          )}
          {icon && <SkeletonBar width={icon} height={icon} radius={9} style={{ flex: "none", ...stagger(i) }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={wide(i)} height={12} style={stagger(i)} />
            <SkeletonBar width={narrow(i)} height={10} style={{ marginTop: 7, ...stagger(i + 1) }} />
          </div>
          {trailing && <SkeletonBar width={trailing} height={12} style={stagger(i + 2)} />}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Cabeçalho de grupo por dia (Mono caps) — acompanha as listas agrupadas. */
export function SkeletonDayHeader({ width = 132 }: { width?: number }) {
  return (
    <div style={{ padding: "0 2px 8px" }} aria-hidden>
      <SkeletonBar width={width} height={10} />
    </div>
  );
}

/** Forma de uma célula da tabela: texto por padrão, chip ou botões quando a coluna é assim. */
export interface SkeletonCell {
  width: string | number;
  height?: number;
  radius?: number;
  align?: "right";
  /** repete a forma (ex.: os três botões da coluna de ações) */
  repeat?: number;
}

/** Padrão TABELA (#2i) — linhas na mesma grade da tabela real (admin). */
export function SkeletonTableRows({
  template,
  columns,
  cells,
  rows = 6,
  label = "Carregando tabela",
}: {
  template: string;
  /** atalho: N colunas de texto */
  columns?: number;
  /** forma coluna a coluna — chips e botões não são barras de texto */
  cells?: SkeletonCell[];
  rows?: number;
  label?: string;
}) {
  const colW = [68, 84, 46, 52, 60, 74];
  const spec: SkeletonCell[] =
    cells ?? Array.from({ length: columns ?? 4 }, (_, c) => ({ width: `${colW[c % colW.length]}%` }));
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="users-table__row" style={{ gridTemplateColumns: template }}>
          {spec.map((cell, c) => (
            <span
              key={c}
              style={{ display: "flex", gap: 6, justifyContent: cell.align === "right" ? "flex-end" : undefined }}
            >
              {Array.from({ length: cell.repeat ?? 1 }).map((__, r) => (
                <SkeletonBar
                  key={r}
                  width={cell.width}
                  height={cell.height ?? 11}
                  radius={cell.radius ?? 6}
                  style={stagger(i + c + r)}
                />
              ))}
            </span>
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Padrão GRÁFICO (#2i) — silhueta de série + eixo, na altura exata do gráfico real. */
export function SkeletonChart({ height = 104, bars = 14, label = "Carregando gráfico" }: { height?: number; bars?: number; label?: string }) {
  // perfil suave e estável: parece uma série, não ruído
  const profile = Array.from({ length: bars }, (_, i) => Math.min(1, 0.42 + 0.4 * Math.abs(Math.sin((i + 1) * 0.9)) + (i / bars) * 0.16));
  return (
    <SkeletonRegion label={label}>
      <div style={{ height, display: "flex", alignItems: "flex-end", gap: 4 }}>
        {profile.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h * 100}%` }}>
            <SkeletonBar width="100%" height="100%" radius={4} style={{ height: "100%", ...stagger(i) }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
        <SkeletonBar width={64} height={9} style={stagger(1)} />
        <SkeletonBar width={52} height={9} style={stagger(3)} />
      </div>
    </SkeletonRegion>
  );
}

/** Donut da carteira + legenda (tela 07: alocação primeiro, posições depois). */
export function SkeletonDonut({ size = 88, label = "Carregando alocação" }: { size?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <SkeletonBar width={size} height={size} radius={999} style={{ flex: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBar key={i} width={wide(i)} height={11} style={stagger(i)} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Cartão de indicador do admin (rótulo → número grande → nota → atalho). */
export function SkeletonKpiCard({ label = "Carregando indicador" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SkeletonBar width={104} height={10} />
        <SkeletonBar width={62} height={20} radius={999} style={stagger(2)} />
      </div>
      <SkeletonBar width={128} height={22} style={{ marginTop: 12, ...stagger(1) }} />
      <SkeletonBar width={168} height={10} style={{ marginTop: 8, ...stagger(3) }} />
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
        <SkeletonBar width={96} height={10} style={stagger(4)} />
      </div>
    </SkeletonRegion>
  );
}

/** Cartões de sala (grade 2 colunas do admin). */
export function SkeletonRoomCards({ count = 2, label = "Carregando salas" }: { count?: number; label?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRegion key={i} label={i === 0 ? label : ""} className="room-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SkeletonBar width={112} height={14} style={stagger(i)} />
              <SkeletonBar width={58} height={20} radius={999} style={stagger(i + 1)} />
            </div>
            <SkeletonBar width={78} height={36} radius={9} style={stagger(i + 2)} />
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 14 }}>
            <SkeletonBar width={92} height={11} style={stagger(i + 3)} />
            <SkeletonBar width={104} height={11} style={stagger(i + 4)} />
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <SkeletonBar width={72} height={24} radius={999} style={stagger(i + 5)} />
            <SkeletonBar width={58} height={24} radius={999} style={stagger(i + 6)} />
          </div>
        </SkeletonRegion>
      ))}
    </>
  );
}

/** Cartões soltos (tarefas, kanban) — fora de container com divisórias. */
export function SkeletonLooseCards({ count = 3, action = true, label = "Carregando" }: { count?: number; action?: boolean; label?: string }) {
  return (
    <SkeletonRegion label={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={wide(i)} height={12} style={stagger(i)} />
            <SkeletonBar width={narrow(i)} height={10} style={{ marginTop: 7, ...stagger(i + 1) }} />
          </div>
          {action && <SkeletonBar width={44} height={44} radius={10} style={{ flex: "none", ...stagger(i + 2) }} />}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Radar/central de alertas: título, alvo e a barra de progresso com a marca. */
export function SkeletonAlertCards({ count = 3, label = "Carregando alertas" }: { count?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: "13px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <SkeletonBar width={150} height={13} style={stagger(i)} />
            <SkeletonBar width={96} height={13} style={stagger(i + 1)} />
          </div>
          <div style={{ marginTop: 14, height: 6, borderRadius: 999, background: "var(--border)" }} aria-hidden />
          <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <SkeletonBar width={112} height={10} style={stagger(i + 2)} />
            <SkeletonBar width={76} height={10} style={stagger(i + 3)} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Grade de horas (salas/agenda): o trilho real com blocos ainda por revelar. */
export function SkeletonDayGrid({
  hours = 8,
  hourHeight = 56,
  label = "Carregando agenda",
}: {
  hours?: number;
  hourHeight?: number;
  label?: string;
}) {
  const blocks = [
    { top: hourHeight + 4, height: hourHeight - 10 },
    { top: hourHeight * 4 + 4, height: hourHeight * 1.5 - 10 },
  ];
  return (
    <SkeletonRegion label={label} className="card" style={{ padding: "16px 14px" }}>
      <div style={{ position: "relative", height: hours * hourHeight + 1 }}>
        {Array.from({ length: hours }).map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * hourHeight, height: hourHeight, display: "flex", alignItems: "flex-start" }}>
            <span style={{ width: 52, flex: "none" }}>
              <SkeletonBar width={34} height={9} style={stagger(i)} />
            </span>
            <span style={{ flex: 1, height: "100%", borderTop: "1px solid var(--divider)" }} />
          </div>
        ))}
        {blocks.map((b, i) => (
          <div key={i} style={{ position: "absolute", left: 58, right: 2, top: b.top, height: b.height }}>
            <SkeletonBar width="100%" height="100%" radius={8} style={{ height: "100%", ...stagger(i * 3) }} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Linhas de cotação (ticker à esquerda, preço e variação à direita). */
export function SkeletonQuoteRows({ rows = 4, bare = false, label = "Carregando cotações" }: { rows?: number; bare?: boolean; label?: string }) {
  return (
    <SkeletonRegion label={label} className={bare ? undefined : "client-list"}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ minHeight: 62, display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBar width={62} height={12} style={stagger(i)} />
            <SkeletonBar width={narrow(i)} height={9} style={{ marginTop: 6, ...stagger(i + 1) }} />
          </div>
          <div style={{ width: 88, flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
            <SkeletonBar width={72} height={13} style={stagger(i + 2)} />
            <SkeletonBar width={64} height={22} radius={7} style={stagger(i + 3)} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Herói do detalhe de cotação (ticker, preço, série e os 4 fios). */
export function SkeletonQuoteHero({ label = "Carregando ativo" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="quote-hero">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <span>
          <SkeletonBar width={92} height={20} />
          <SkeletonBar width={132} height={10} style={{ marginTop: 8, ...stagger(1) }} />
        </span>
        <SkeletonBar width={78} height={26} radius={8} style={stagger(2)} />
      </div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <SkeletonBar width={148} height={26} style={stagger(3)} />
        <SkeletonBar width={68} height={10} style={stagger(4)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <SkeletonChart height={88} bars={16} label="Carregando série" />
      </div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i}>
            <SkeletonBar width="72%" height={9} style={stagger(i)} />
            <SkeletonBar width="88%" height={12} style={{ marginTop: 7, ...stagger(i + 2) }} />
          </span>
        ))}
      </div>
    </SkeletonRegion>
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
