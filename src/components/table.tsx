import { type ReactNode } from "react";

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  sorted?: boolean;
  width?: string; /* fração da grid, ex. "1.5fr" */
}

export type TableCellValue = { value: ReactNode; muted?: boolean; strong?: boolean; name?: boolean; market?: "up" | "down" };

interface DenseTableProps {
  columns: TableColumn[];
  rows: Record<string, TableCellValue>[];
  totalRow?: Record<string, TableCellValue>;
}

/** Tabela densa (#2f): cabeçalho surface-2 caps, números à direita, linha total. */
export function DenseTable({ columns, rows, totalRow }: DenseTableProps) {
  const template = columns.map((c) => c.width ?? "1fr").join(" ");

  const renderCell = (col: TableColumn, cell?: TableCellValue) => {
    if (!cell) return <span key={col.key} />;
    const classes = [
      col.align === "right" ? "table__cell--right" : "",
      cell.muted ? "table__cell--muted" : "",
      cell.strong ? "table__cell--strong" : "",
      cell.name ? "table__cell--name" : "",
      cell.market ? `market-${cell.market}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span key={col.key} className={classes || undefined}>
        {cell.value}
      </span>
    );
  };

  return (
    <div className="table" role="table">
      <div className="table__head" style={{ gridTemplateColumns: template }} role="row">
        {columns.map((col) => (
          <span key={col.key} className={col.align === "right" ? "table__cell--right" : col.sorted ? "table__sort" : undefined}>
            {col.label}
            {col.sorted && <i className="ph ph-caret-up" aria-hidden />}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} className="table__row" style={{ gridTemplateColumns: template }} role="row">
          {columns.map((col) => renderCell(col, row[col.key]))}
        </div>
      ))}
      {totalRow && (
        <div className="table__row table__row--total" style={{ gridTemplateColumns: template }} role="row">
          {columns.map((col) => renderCell(col, totalRow[col.key]))}
        </div>
      )}
    </div>
  );
}

export interface CollapseRowData {
  title: string;
  sub: string;
  value: string;
  pct?: { text: string; up: boolean };
}

/** Colapso mobile 390px (#2f): identidade à esquerda, valor à direita. */
export function CollapseList({ rows }: { rows: CollapseRowData[] }) {
  return (
    <div className="table">
      {rows.map((row) => (
        <div key={row.sub} className="collapse-row">
          <span>
            <span className="collapse-row__title">{row.title}</span>
            <span className="collapse-row__sub">{row.sub}</span>
          </span>
          <span className="collapse-row__right">
            <span className="collapse-row__value">{row.value}</span>
            {row.pct && <span className={`collapse-row__pct ${row.pct.up ? "market-up" : "market-down"}`}>{row.pct.text}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
