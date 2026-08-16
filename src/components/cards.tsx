import { type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { formatBRL, formatPct } from "../lib/format";

const pct = (v: number, digits = 2) => formatPct(v, digits).replace("−", "-");

/** Card genérico (superfície, borda, raio 14, pad 13/14). */
export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

export interface TickerItem {
  code: string;
  price: string;
  changePct: number;
  /** DI1F27 varia em "pp" */
  suffix?: string;
}

/** Faixa de cotações 38px (#2e) com esmaecimento de 44px à direita. */
export function MarketTickerStrip({ items }: { items: TickerItem[] }) {
  return (
    <div className="ticker-strip">
      <span className="ticker-strip__fade" aria-hidden />
      <div className="ticker-strip__scroll">
        {items.map((item, i) => (
          <span key={item.code} style={{ display: "contents" }}>
            {i > 0 && <span className="ticker-strip__sep" aria-hidden />}
            <span className="ticker-strip__item">
              <span className="ticker-strip__code">{item.code}</span>
              <span className="ticker-strip__price">{item.price}</span>
              <span className={`ticker-strip__pct ${item.changePct >= 0 ? "market-up" : "market-down"}`}>
                {pct(item.changePct)}
                {item.suffix ?? ""}
              </span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface ClientCardProps {
  name: string;
  account: string;
  suitability?: string;
  patrimony: number;
  monthPct: number;
  inactive?: boolean;
  onClick?: () => void;
}

/** Card de cliente (#2e): avatar 36, nome 14/500, conta+suitability, patrimônio à direita. */
export function ClientCard({ name, account, suitability, patrimony, monthPct, inactive, onClick }: ClientCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="card client-card" onClick={onClick} style={onClick ? { width: "100%", textAlign: "left" } : undefined}>
      <Avatar name={name} size={36} neutral={inactive} />
      <span className="client-card__main">
        <span className="client-card__name">{name}</span>
        <span className="client-card__meta">
          conta {account}
          {suitability ? ` · suitability ${suitability}` : ""}
        </span>
      </span>
      <span className="client-card__right">
        <span className="client-card__value">{formatBRL(patrimony)}</span>
        <span className={`client-card__pct ${monthPct >= 0 ? "market-up" : "market-down"}`}>{pct(monthPct, 1)} mês</span>
      </span>
    </Tag>
  );
}

interface AlertCardProps {
  ticker: string;
  direction: "alta" | "baixa";
  currentPrice: number;
  dayChangePct: number;
  targetPrice: number;
  /** 0–1: fração do caminho até o alvo */
  progress: number;
  remainingPct: number;
  footer?: ReactNode;
}

/** Card de alerta (#2e): barra 6px até o alvo com marca 2×14 na ponta. */
export function AlertCard({ ticker, direction, currentPrice, dayChangePct, targetPrice, progress, remainingPct, footer }: AlertCardProps) {
  const up = direction === "alta";
  return (
    <div className="card">
      <div className="alert-card__head">
        <span className="alert-card__id">
          <span className="alert-card__ticker">{ticker}</span>
          <span className="alert-card__dir">
            <i className={`${up ? "icon-arrow-up-right" : "icon-arrow-down-right"}`} aria-hidden />
            alvo de {direction}
          </span>
        </span>
        <span className="alert-card__price-wrap">
          <span className="alert-card__price">{formatBRL(currentPrice)}</span>
          <span className={`alert-card__var ${dayChangePct >= 0 ? "market-up" : "market-down"}`}>{pct(dayChangePct)}</span>
        </span>
      </div>
      <div className="alert-card__track">
        <div
          className={`alert-card__fill ${up ? "" : "alert-card__fill--down"}`}
          style={{ width: `${Math.round(progress * 100)}%`, background: `var(--market-${up ? "up" : "down"})` }}
        />
        <span className="alert-card__mark" aria-hidden />
      </div>
      <div className="alert-card__foot">
        <span className="alert-card__remaining">faltam {String(remainingPct).replace(".", ",")}% para o alvo</span>
        <span className="alert-card__target">alvo {formatBRL(targetPrice)}</span>
      </div>
      {footer}
    </div>
  );
}

interface TaskCardProps {
  title: string;
  meta: string;
  assignee?: string;
  children?: ReactNode;
}

/** Card de tarefa (#2e): sem barra lateral; título 13,5/500; meta em texto; avatar 26. */
export function TaskCard({ title, meta, assignee, children }: TaskCardProps) {
  return (
    <div className="card">
      <div className="task-card__row">
        <span className="task-card__main">
          <span className="task-card__title">{title}</span>
          <span className="task-card__meta">{meta}</span>
        </span>
        {assignee && <Avatar name={assignee} size={26} />}
      </div>
      {children}
    </div>
  );
}

interface QuoteCardProps {
  ticker: string;
  price: string;
  changePct: number;
  high: string;
  low: string;
}

/** Card de cotação compacto (#2e). */
export function QuoteCard({ ticker, price, changePct, high, low }: QuoteCardProps) {
  return (
    <div className="card">
      <div className="quote-card__head">
        <span className="quote-card__ticker">{ticker}</span>
        <span className={`quote-card__pct ${changePct >= 0 ? "market-up" : "market-down"}`}>{pct(changePct)}</span>
      </div>
      <div className="quote-card__price">{price}</div>
      <div className="quote-card__range">
        <span>máx {high}</span>
        <span>mín {low}</span>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  context?: ReactNode;
}

/** Card de KPI (#2e): rótulo 11/500, valor 18/600 tabular, linha de contexto. */
export function KpiCard({ label, value, context }: KpiCardProps) {
  return (
    <div className="card">
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{value}</div>
      {context && <div className="kpi-card__context">{context}</div>}
    </div>
  );
}
