import { type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { formatBRL, formatPct } from "../lib/format";

export interface ClientSearchResult {
  account: string;
  name: string;
  patrimony: number;
  monthPct: number;
}

interface ClientSearchProps {
  value: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  onSelect?: (result: ClientSearchResult) => void;
  results?: ClientSearchResult[];
  loading?: boolean;
  /** termo sem resultado — exibe o estado vazio do quadro #2d */
  emptyTerm?: string;
  autoFocus?: boolean;
}

/** Destaca o trecho buscado no nome (brand-100 / #1F5B45). */
function highlight(name: string, term: string): ReactNode {
  if (!term) return name;
  const idx = name.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark>{name.slice(idx, idx + term.length)}</mark>
      {name.slice(idx + term.length)}
    </>
  );
}

/**
 * Busca de cliente (#2d) — componente central: 52px, raio 12, placeholder permanente.
 * Resultados SEMPRE restritos à carteira do assessor (o RLS garante; o componente só exibe).
 * Nunca entra em skeleton.
 */
export function ClientSearch({ value, onChange, onClear, onSelect, results, loading, emptyTerm, autoFocus }: ClientSearchProps) {
  return (
    <div className="csearch">
      <div className="csearch__box">
        <i className="ph ph-magnifying-glass csearch__icon" aria-hidden />
        <input
          className="csearch__input"
          type="search"
          placeholder="Buscar cliente por nome ou conta"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange?.(e.target.value)}
          aria-label="Buscar cliente por nome ou conta"
        />
        {value && (
          <button type="button" className="csearch__clear" aria-label="Limpar busca" onClick={onClear}>
            <i className="ph ph-x" aria-hidden />
          </button>
        )}
      </div>

      {loading && (
        <div className="csearch__loading" style={{ marginTop: 8 }}>
          <span className="spinner" aria-hidden />
          Buscando…
        </div>
      )}

      {!loading && emptyTerm && (
        <div className="csearch__empty" style={{ marginTop: 8 }}>
          <i className="ph ph-magnifying-glass" aria-hidden />
          Nenhum cliente com “{emptyTerm}” na sua carteira.
        </div>
      )}

      {!loading && !emptyTerm && results && results.length > 0 && (
        <div className="csearch__results" role="listbox">
          {results.map((r, i) => (
            <button
              key={r.account}
              type="button"
              role="option"
              aria-selected={i === 0}
              className={`csearch__row${i === 0 ? " csearch__row--active" : ""}`}
              onClick={() => onSelect?.(r)}
            >
              <Avatar name={r.name} size={34} />
              <span className="csearch__main">
                <span className="csearch__name">{highlight(r.name, value)}</span>
                <span className="csearch__account">conta {r.account}</span>
              </span>
              <span className="csearch__right">
                <span className="csearch__value">{formatBRL(r.patrimony)}</span>
                <span className={`csearch__pct ${r.monthPct >= 0 ? "market-up" : "market-down"}`}>
                  {formatPct(r.monthPct, 1).replace("−", "-")} mês
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
