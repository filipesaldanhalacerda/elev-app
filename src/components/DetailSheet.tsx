/**
 * Sheet de DETALHES padrão do sistema (tarefas, agendamentos, reservas):
 * cabeçalho com ícone e chip de status, informações em linhas rotuladas,
 * bloco de descrição e lista de ações — sempre com o mesmo desenho.
 */
import { type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { Button } from "./Button";
import { StatusChip } from "./feedback";

export interface DetailRow {
  icon: string;
  label: string;
  value: ReactNode;
}

export interface DetailAction {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export function DetailSheet({
  label,
  icon,
  title,
  chip,
  chipKind = "neutral",
  rows,
  description,
  actions,
  footnote,
  onClose,
}: {
  label: string;
  icon: string;
  title: string;
  chip?: string;
  chipKind?: "success" | "neutral" | "warning";
  rows: DetailRow[];
  description?: string | null;
  actions: DetailAction[];
  footnote?: string;
  onClose: () => void;
}) {
  return (
    <Sheet label={label} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <i className={icon} style={{ fontSize: 19 }} aria-hidden />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="sheet__title" style={{ display: "block", overflowWrap: "anywhere" }}>{title}</span>
          {chip && <span style={{ display: "inline-flex", marginTop: 6 }}><StatusChip kind={chipKind}>{chip}</StatusChip></span>}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
          {rows.map((r, i) => (
            <div key={r.label} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}>
              <i className={r.icon} style={{ fontSize: 15, color: "var(--field-label)", flex: "none" }} aria-hidden />
              <span style={{ flex: "none", font: "400 12px/1.4 var(--font-sans)", color: "var(--text-2)" }}>{r.label}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "right", font: "500 12.5px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {description !== undefined && (
        description ? (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--surface-2)", borderLeft: "3px solid var(--border-strong)", borderRadius: "4px 12px 12px 4px", font: "400 13px/1.55 var(--font-sans)", color: "var(--text-1)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {description}
          </div>
        ) : (
          <div style={{ marginTop: 12, font: "400 12px/1.5 var(--font-sans)", color: "var(--text-3)" }}>Sem descrição.</div>
        )
      )}

      {actions.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}
              onClick={a.onClick}
            >
              <span style={{ width: 30, height: 30, borderRadius: 9, background: a.danger ? "var(--danger-action-hover-bg)" : "var(--chip-pill-bg)", color: a.danger ? "var(--danger-action-text)" : "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <i className={a.icon} style={{ fontSize: 15 }} aria-hidden />
              </span>
              <span style={{ flex: 1, font: `${a.danger ? "600" : "400"} 13px/1.35 var(--font-sans)`, color: a.danger ? "var(--danger-action-text)" : "var(--text-1)" }}>{a.label}</span>
              {!a.danger && <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />}
            </button>
          ))}
        </div>
      )}

      {footnote && (
        <div style={{ marginTop: 12, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-2)" }}>{footnote}</div>
      )}

      <div className="sheet__footer" style={{ marginTop: 14 }}>
        <Button variant="secondary" block onClick={onClose}>Fechar</Button>
      </div>
    </Sheet>
  );
}
