import { type ReactNode } from "react";

interface KanbanColumnProps {
  title: string;
  count: number;
  children?: ReactNode;
  /** coluna vazia mostra a área tracejada "Solte aqui" */
  dropHint?: boolean;
}

/** Coluna de kanban (#2g) — desktop/admin. No mobile do assessor NÃO há kanban. */
export function KanbanColumn({ title, count, children, dropHint }: KanbanColumnProps) {
  return (
    <div className="kanban-col">
      <div className="kanban-col__head">
        <span className="kanban-col__title">{title}</span>
        <span className="kanban-col__count">{count}</span>
      </div>
      {dropHint ? <div className="kanban-drop">Solte aqui</div> : <div className="kanban-col__stack">{children}</div>}
    </div>
  );
}

interface KanbanCardProps {
  title: string;
  meta: string;
  dragging?: boolean;
  done?: boolean;
  children?: ReactNode;
}

/** Card interno do kanban (#2g): surface-2 raio 10; em arraste elev-2 + rotação -1,2°. */
export function KanbanCard({ title, meta, dragging, done, children }: KanbanCardProps) {
  const classes = ["kanban-card", dragging ? "kanban-card--dragging" : "", done ? "kanban-card--done" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <span className="kanban-card__title">{title}</span>
      <span className="kanban-card__meta">{meta}</span>
      {children}
    </div>
  );
}
