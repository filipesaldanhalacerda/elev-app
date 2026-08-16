/**
 * Filtro padrão do sistema (mobile-first): um botão largo de 44px com o resumo
 * do que está ativo, que abre o sheet de filtros com grupos segmentados e
 * Limpar/Aplicar. Toda tela com filtro usa ESTE componente — nunca chips soltos.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { Button } from "./Button";

export interface FilterOption {
  value: string;
  label: string;
  icon?: string;
}

export interface FilterSection {
  key: string;
  label: string;
  options: FilterOption[];
}

export function Filters({
  label,
  sections,
  values,
  onChange,
  onClear,
  trailing,
  style,
}: {
  /** rótulo acessível do sheet, ex.: "Filtros de clientes" */
  label: string;
  sections: FilterSection[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  /** conteúdo à direita do botão, ex.: pílula com o total da lista */
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const summary = sections
    .map((s) => s.options.find((o) => o.value === values[s.key])?.label)
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        type="button"
        className="filter-sort"
        data-open-filters
        style={{ width: "100%", height: 44, justifyContent: "space-between", gap: 8, paddingInline: 14, ...style }}
        onClick={() => setOpen(true)}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <i className="icon-sliders-horizontal" aria-hidden />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Filtros · {summary}</span>
        </span>
        {trailing}
      </button>

      {open && (
        <Sheet label={label} onClose={() => setOpen(false)}>
          <div className="sheet__title">Filtros</div>
          <div className="sheet__fields" style={{ gap: 14 }}>
            {sections.map((s) => (
              <div key={s.key} className="field">
                <span className="field__label" style={{ display: "block" }}>{s.label}</span>
                <div className="segmented" style={{ height: 44 }}>
                  {s.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`segmented__item${values[s.key] === o.value ? " segmented__item--active" : ""}`}
                      onClick={() => onChange(s.key, o.value)}
                    >
                      {o.icon && <i className={o.icon} aria-hidden />}
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="sheet__footer" style={{ marginTop: 14 }}>
            <Button variant="secondary" onClick={onClear}>Limpar</Button>
            <Button onClick={() => setOpen(false)}>Aplicar</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
