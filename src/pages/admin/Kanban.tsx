/**
 * Tela 23 · Kanban geral (admin) — quadro "23 Kanban geral claro" (#4g).
 * AQUI vive o kanban de arrasto; no mobile do assessor é lista (tela 13).
 */
import { useMemo, useState } from "react";
import { AdminShell } from "./AdminShell";
import { useAllCards, useColleagues, setCardStatus, isOverdue, type CardRow, type CardStatus } from "../../lib/cards";
import { initials, formatDate } from "../../lib/format";
import { SkeletonBar, SkeletonRegion, stagger } from "../../components/states";

const COLUMNS: { status: CardStatus; label: string }[] = [
  { status: "pendente", label: "Pendente" },
  { status: "andamento", label: "Em andamento" },
  { status: "concluido", label: "Concluído" },
];

export default function Kanban() {
  const { rows, reload } = useAllCards();
  const colleagues = useColleagues();
  const [filter, setFilter] = useState<string>("todos");
  const [dragging, setDragging] = useState<string | null>(null);

  const advisors = useMemo(() => {
    const withCards = new Set((rows ?? []).map((c) => c.assignee));
    return colleagues.filter((c) => withCards.has(c.id));
  }, [rows, colleagues]);

  const filtered = useMemo(
    () => (rows ?? []).filter((c) => filter === "todos" || c.assignee === filter),
    [rows, filter]
  );

  async function drop(status: CardStatus) {
    if (!dragging) return;
    await setCardStatus(dragging, status);
    setDragging(null);
    await reload();
  }

  return (
    <AdminShell
      title="Kanban geral"
      actions={
        <span className="kb-filter">
          <span className="kb-filter__label">Assessor:</span>
          <button type="button" className={`kb-chip${filter === "todos" ? " kb-chip--active" : ""}`} onClick={() => setFilter("todos")}>
            Todos
          </button>
          {advisors.map((a) => (
            <button key={a.id} type="button" className={`kb-chip${filter === a.id ? " kb-chip--active" : ""}`} onClick={() => setFilter(a.id)}>
              <span className="kb-chip__avatar">{initials(a.name)}</span>
              {a.name.split(" ")[0]}
            </button>
          ))}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="kb-columns">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((c) => c.status === col.status);
            return (
              <div
                key={col.status}
                className="kb-col"
                data-column={col.status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(col.status)}
              >
                <div className="kb-col__head">
                  <span className="kb-col__title">{col.label}</span>
                  <span className="kb-col__count">{rows === null ? "—" : cards.length}</span>
                </div>
                <div className="kb-col__stack">
                  {rows === null && (
                    <SkeletonRegion label="Carregando quadro" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="kb-card" style={{ cursor: "default" }}>
                          <SkeletonBar width="82%" height={12} style={stagger(i)} />
                          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <SkeletonBar width="54%" height={10} style={stagger(i + 1)} />
                            <SkeletonBar width={22} height={22} radius={999} style={{ flex: "none", ...stagger(i + 2) }} />
                          </div>
                        </div>
                      ))}
                    </SkeletonRegion>
                  )}
                  {cards.map((card) => (
                    <KbCard key={card.id} card={card} dragging={dragging === card.id} onDragStart={() => setDragging(card.id)} onDragEnd={() => setDragging(null)} />
                  ))}
                  {col.status === "concluido" && dragging && <div className="kb-drop">Solte aqui para concluir</div>}
                  {rows !== null && cards.length === 0 && col.status !== "concluido" && <div className="kb-drop">Solte aqui</div>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="kb-legend">
          Visão de leitura e reatribuição: o administrador arrasta e reatribui, mas a criação de tarefas continua com os assessores. Avatar
          identifica o dono; filtro por assessor no cabeçalho.
        </p>
      </div>
    </AdminShell>
  );
}

function KbCard({ card, dragging, onDragStart, onDragEnd }: { card: CardRow; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  return (
    <div
      className={`kb-card${dragging ? " kb-card--dragging" : ""}${card.status === "concluido" ? " kb-card--done" : ""}`}
      draggable
      data-card={card.id}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="kb-card__title">{card.title}</span>
      <span className="kb-card__foot">
        <span className="kb-card__meta">
          {isOverdue(card) && <span className="card-row__late">atrasada</span>}
          <span>
            {card.client_name ?? "Sem cliente"}
            {card.due_at ? ` · ${formatDate(card.due_at).slice(0, 5)}` : ""}
          </span>
        </span>
        <span className="kb-chip__avatar" style={{ width: 22, height: 22, fontSize: 8 }} title={card.assignee_name ?? ""}>
          {initials(card.assignee_name ?? "?")}
        </span>
      </span>
    </div>
  );
}
