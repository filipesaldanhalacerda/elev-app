/**
 * Tela 13 · Cards — quadros "13 Cards lista claro" e "13 Novo card escuro" (#3f).
 * No celular NÃO há kanban: lista por status, botão de próxima ação e swipe como atalho.
 */
import { useMemo, useRef, useState } from "react";
import { MobileShell } from "../components/MobileShell";
import { Button } from "../components/Button";
import { Toggle } from "../components/Field";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useCards, useColleagues, createCard, advanceCard, isOverdue, type CardRow, type CardStatus } from "../lib/cards";
import { formatDate, formatTime } from "../lib/format";

const HINT_KEY = "elev.cards.dica-dispensada";

function cardMeta(card: CardRow, myId: string): string {
  const parts: string[] = [];
  if (card.client_name) parts.push(card.client_name);
  if (card.due_at) {
    const d = new Date(card.due_at);
    const today = new Date().toDateString() === d.toDateString();
    parts.push(isOverdue(card) ? `venceu ${formatDate(card.due_at).slice(0, 5)}` : today ? `hoje ${formatTime(card.due_at)}` : formatDate(card.due_at).slice(0, 5));
  }
  if (card.creator !== myId && card.creator_name) parts.push(`delegado por ${card.creator_name.split(" ")[0]}`);
  if (card.creator === myId && card.assignee !== myId && card.assignee_name) parts.push(`com ${card.assignee_name.split(" ")[0]}`);
  return parts.join(" · ");
}

function NewCardSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const colleagues = useColleagues();
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [assignee, setAssignee] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta">("media");
  const [reminder, setReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);

  useMemo(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
  }, []);

  async function save() {
    setSaving(true);
    const due = date ? new Date(`${date}T${time || "09:00"}:00-03:00`).toISOString() : null;
    await createCard(profile!.id, {
      title: title.trim(),
      account_code: client || null,
      assignee: assignee || profile!.id,
      due_at: due,
      priority,
      daily_reminder: reminder,
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Novo card">
        <div className="sheet__handle"><span /></div>
        <div className="sheet__title">Novo card</div>
        <div className="sheet__fields" style={{ gap: 13 }}>
          <div className="field">
            <label className="field__label" htmlFor="card-titulo" style={{ display: "block" }}>Título</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="card-titulo" className="field__input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label className="field__label" htmlFor="card-cliente" style={{ display: "block" }}>Cliente</label>
              <div className="field__box" style={{ height: 46 }}>
                <select id="card-cliente" className="field__input" style={{ appearance: "none", width: "100%" }} value={client} onChange={(e) => setClient(e.target.value)}>
                  <option value="">Sem cliente</option>
                  {clients.map((c) => (
                    <option key={c.account_code} value={c.account_code}>{c.name ?? `Conta ${c.account_code}`}</option>
                  ))}
                </select>
                <i className="ph ph-caret-down field__caret" aria-hidden />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="card-resp" style={{ display: "block" }}>Responsável</label>
              <div className="field__box" style={{ height: 46 }}>
                <select id="card-resp" className="field__input" style={{ appearance: "none", width: "100%" }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Você</option>
                  {colleagues.filter((c) => c.id !== profile?.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <i className="ph ph-caret-down field__caret" aria-hidden />
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label className="field__label" htmlFor="card-prazo" style={{ display: "block" }}>Prazo</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="card-prazo" className="field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="card-hora" style={{ display: "block" }}>Hora</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="card-hora" className="field__input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
          </div>
          <div className="field">
            <span className="field__label" style={{ display: "block" }}>Prioridade</span>
            <div className="segmented" style={{ height: 46 }}>
              {(["baixa", "media", "alta"] as const).map((p) => (
                <button key={p} type="button" className={`segmented__item${priority === p ? " segmented__item--active" : ""}`} onClick={() => setPriority(p)}>
                  {p === "baixa" ? "Baixa" : p === "media" ? "Média" : "Alta"}
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ borderRadius: 12, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", font: "500 12.5px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Lembrete diário</span>
              <span style={{ display: "block", marginTop: 3, font: "400 11px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                resumo dos cards do dia às 08:00
              </span>
            </span>
            <Toggle checked={reminder} onChange={setReminder} label="Lembrete diário" />
          </div>
        </div>
        <div className="sheet__footer" style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!title.trim()} loading={saving} onClick={save}>Criar card</Button>
        </div>
      </div>
    </>
  );
}

export default function Cards() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"meus" | "criados">("meus");
  const [status, setStatus] = useState<CardStatus>("pendente");
  const [sheet, setSheet] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem(HINT_KEY) === "1");
  const { rows, reload } = useCards(tab, profile?.id);
  const touchStart = useRef<number | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<CardStatus, CardRow[]> = { pendente: [], andamento: [], concluido: [] };
    for (const c of rows ?? []) map[c.status].push(c);
    return map;
  }, [rows]);

  async function advance(card: CardRow) {
    await advanceCard(card);
    await reload();
  }

  return (
    <MobileShell active="cards">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Cards</span>
        <Button icon="ph-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => setSheet(true)}>Novo</Button>
      </header>
      <nav className="tabs-42" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "meus"} className={`tab-42${tab === "meus" ? " tab-42--active" : ""}`} onClick={() => setTab("meus")}>
          Meus cards
        </button>
        <button type="button" role="tab" aria-selected={tab === "criados"} className={`tab-42${tab === "criados" ? " tab-42--active" : ""}`} onClick={() => setTab("criados")}>
          Criados por mim
        </button>
      </nav>

      <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="status-segment" role="tablist" aria-label="Status">
          {(["pendente", "andamento", "concluido"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={`status-segment__item${status === s ? " status-segment__item--active" : ""}`} onClick={() => setStatus(s)}>
              {s === "pendente" ? "Pendente" : s === "andamento" ? "Andamento" : "Concluído"}
              <span className="status-segment__count">{byStatus[s].length}</span>
            </button>
          ))}
        </div>

        {rows === null && <div className="skeleton" style={{ height: 140, borderRadius: 12 }} />}

        {rows !== null && byStatus[status].length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="ph ph-kanban" aria-hidden /></span>
            <span className="empty-state__title">Nada em {status === "pendente" ? "Pendente" : status === "andamento" ? "Andamento" : "Concluído"}</span>
            <span className="empty-state__desc">
              {status === "pendente" ? "Crie o primeiro card para organizar o dia." : "Os cards chegam aqui conforme avançam de status."}
            </span>
            {status === "pendente" && (
              <span className="empty-state__action">
                <Button icon="ph-plus" onClick={() => setSheet(true)}>Novo card</Button>
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows !== null && byStatus[status].map((card) => (
            <div
              key={card.id}
              className="card-row"
              onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                // deslizar para a direita = atalho para avançar status
                if (touchStart.current !== null && e.changedTouches[0].clientX - touchStart.current > 80 && card.status !== "concluido") {
                  void advance(card);
                }
                touchStart.current = null;
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="card-row__title" style={card.status === "concluido" ? { color: "var(--text-2)" } : undefined}>{card.title}</span>
                <span className="card-row__meta-row">
                  {isOverdue(card) && <span className="card-row__late">atrasado</span>}
                  <span className="card-row__meta">{cardMeta(card, profile?.id ?? "")}</span>
                </span>
              </span>
              {card.status !== "concluido" && (
                <button
                  type="button"
                  className="card-row__action"
                  aria-label={card.status === "pendente" ? `Iniciar ${card.title}` : `Concluir ${card.title}`}
                  onClick={() => advance(card)}
                >
                  <i className={`ph ${card.status === "pendente" ? "ph-play" : "ph-check"}`} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>

        {!hintDismissed && rows !== null && byStatus[status].length > 0 && (
          <div className="swipe-hint">
            <i className="ph ph-caret-double-right" aria-hidden />
            <span className="swipe-hint__text">Dica: deslizar um card para a direita também avança o status.</span>
            <button
              type="button"
              className="swipe-hint__close"
              aria-label="Dispensar dica"
              onClick={() => {
                localStorage.setItem(HINT_KEY, "1");
                setHintDismissed(true);
              }}
            >
              <i className="ph ph-x" aria-hidden />
            </button>
          </div>
        )}
        {rows !== null && byStatus[status].length > 0 && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
            O botão de cada card executa a próxima ação (iniciar, concluir). O gesto de deslizar é atalho, apresentado pela dica acima — dispensada, não volta.
          </div>
        )}
      </div>

      {sheet && <NewCardSheet onClose={() => setSheet(false)} onCreated={reload} />}
    </MobileShell>
  );
}
