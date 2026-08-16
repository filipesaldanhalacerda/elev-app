/**
 * Tela 13 · Cards — quadros "13 Cards lista claro" e "13 Novo card escuro" (#3f).
 * No celular NÃO há kanban: lista por status, botão de próxima ação e swipe como atalho.
 */
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { Button } from "../components/Button";
import { Toggle } from "../components/Field";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useCards, createCard, updateCard, advanceCard, isOverdue, type CardRow, type CardStatus } from "../lib/cards";
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

const spDayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const spTimeOf = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

function NewCardSheet({ initialClient = "", editing, onClose, onCreated }: { initialClient?: string; editing?: CardRow | null; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [client, setClient] = useState(editing?.account_code ?? initialClient);
  const [date, setDate] = useState(editing?.due_at ? spDayOf(editing.due_at) : "");
  const [time, setTime] = useState(editing?.due_at ? spTimeOf(editing.due_at) : "");
  const [priority, setPriority] = useState<"baixa" | "media" | "alta">(editing?.priority ?? "media");
  const [reminder, setReminder] = useState(editing?.daily_reminder ?? true);
  // hora do lembrete é preferência do usuário (vale para todos os lembretes dele)
  const [reminderTime, setReminderTime] = useState("08:00");
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);

  useMemo(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
    if (profile) {
      supabase.from("profiles").select("reminder_time").eq("id", profile.id).single().then(({ data }) => {
        if (data?.reminder_time) setReminderTime(String(data.reminder_time).slice(0, 5));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F2-10: prazo não pode ficar no passado — mas editar SEM mexer no prazo de uma
  // tarefa já atrasada continua permitido.
  const todaySP = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dueUnchanged = !!editing && date === (editing.due_at ? spDayOf(editing.due_at) : "") && time === (editing.due_at ? spTimeOf(editing.due_at) : "");
  const pastDue = !dueUnchanged && !!date && new Date(`${date}T${time || "23:59"}:00-03:00`).getTime() < Date.now();

  async function save() {
    setSaving(true);
    const due = date ? new Date(`${date}T${time || "09:00"}:00-03:00`).toISOString() : null;
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      account_code: client || null,
      due_at: due,
      priority,
      daily_reminder: reminder,
    };
    if (editing) await updateCard(editing.id, values);
    else await createCard(profile!.id, { ...values, assignee: profile!.id }); // tarefa é sempre sua
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <Sheet label={editing ? "Editar tarefa" : "Nova tarefa"} onClose={onClose}>
        <div className="sheet__title">{editing ? "Editar tarefa" : "Nova tarefa"}</div>
        <div className="sheet__fields" style={{ gap: 13 }}>
          <div className="field">
            <label className="field__label" htmlFor="card-titulo" style={{ display: "block" }}>Título</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="card-titulo" className="field__input" autoFocus={!editing} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="card-descricao" style={{ display: "block" }}>Descrição · opcional</label>
            <textarea
              id="card-descricao"
              className="field__textarea"
              placeholder="O que precisa ser feito nesta tarefa?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="card-cliente" style={{ display: "block" }}>Cliente · opcional</label>
            <div className="field__box" style={{ height: 46 }}>
              <select id="card-cliente" className="field__input" style={{ appearance: "none", width: "100%" }} value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.account_code} value={c.account_code}>{c.name ?? `Conta ${c.account_code}`}</option>
                ))}
              </select>
              <i className="icon-chevron-down field__caret" aria-hidden />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div className={`field${pastDue ? " field--error" : ""}`}>
              <label className="field__label" htmlFor="card-prazo" style={{ display: "block" }}>Prazo</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="card-prazo" className="field__input" type="date" min={todaySP} value={date} onChange={(e) => setDate(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
            <div className={`field${pastDue ? " field--error" : ""}`}>
              <label className="field__label" htmlFor="card-hora" style={{ display: "block" }}>Hora</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="card-hora" className="field__input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
          </div>
          {pastDue && (
            <div className="field--error" style={{ marginTop: -6 }}>
              <div className="field__help">
                <i className="icon-circle-alert" aria-hidden />
                O prazo não pode ficar no passado.
              </div>
            </div>
          )}
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
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "500 12.5px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Lembrete diário</span>
              <span style={{ display: "block", marginTop: 3, font: "400 11px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                resumo das tarefas do dia às {reminderTime} · horário no Perfil
              </span>
            </span>
            <Toggle checked={reminder} onChange={setReminder} label="Lembrete diário" />
          </div>
        </div>
        <div className="sheet__footer" style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!title.trim() || pastDue} loading={saving} onClick={save}>{editing ? "Salvar alterações" : "Criar tarefa"}</Button>
        </div>
    </Sheet>
  );
}

export default function Cards() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<CardStatus>("pendente");
  const [sheet, setSheet] = useState(params.get("novo") !== null);
  const [editing, setEditing] = useState<CardRow | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem(HINT_KEY) === "1");
  const { rows, reload } = useCards("meus", profile?.id);
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
    <MobileShell active="tarefas">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Tarefas</span>
        <Button icon="icon-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => setSheet(true)}>Novo</Button>
      </header>

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
            <span className="empty-state__icon"><i className="icon-kanban" aria-hidden /></span>
            <span className="empty-state__title">Nada em {status === "pendente" ? "Pendente" : status === "andamento" ? "Andamento" : "Concluído"}</span>
            <span className="empty-state__desc">
              {status === "pendente" ? "Crie a primeira tarefa para organizar o dia." : "As tarefas chegam aqui conforme avançam de status."}
            </span>
            {status === "pendente" && (
              <span className="empty-state__action">
                <Button icon="icon-plus" onClick={() => setSheet(true)}>Nova tarefa</Button>
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
              <button
                type="button"
                style={{ flex: 1, minWidth: 0, display: "block", textAlign: "left" }}
                aria-label={`Abrir tarefa ${card.title}`}
                onClick={() => { setEditing(card); setSheet(true); }}
              >
                <span className="card-row__title" style={card.status === "concluido" ? { color: "var(--text-2)" } : undefined}>{card.title}</span>
                <span className="card-row__meta-row">
                  {isOverdue(card) && <span className="card-row__late">atrasada</span>}
                  <span className="card-row__meta">{cardMeta(card, profile?.id ?? "")}</span>
                </span>
                {card.description && (
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 4, font: "400 11.5px/1.45 var(--font-sans)", color: "var(--text-2)" }}>
                    {card.description}
                  </span>
                )}
              </button>
              {card.status !== "concluido" && (
                <button
                  type="button"
                  className="card-row__action"
                  aria-label={card.status === "pendente" ? `Iniciar ${card.title}` : `Concluir ${card.title}`}
                  onClick={() => advance(card)}
                >
                  <i className={`${card.status === "pendente" ? "icon-play" : "icon-check"}`} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>

        {!hintDismissed && rows !== null && byStatus[status].length > 0 && (
          <div className="swipe-hint">
            <i className="icon-chevrons-right" aria-hidden />
            <span className="swipe-hint__text">Dica: deslizar uma tarefa para a direita também avança o status.</span>
            <button
              type="button"
              className="swipe-hint__close"
              aria-label="Dispensar dica"
              onClick={() => {
                localStorage.setItem(HINT_KEY, "1");
                setHintDismissed(true);
              }}
            >
              <i className="icon-x" aria-hidden />
            </button>
          </div>
        )}
        {rows !== null && byStatus[status].length > 0 && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
            O botão de cada card executa a próxima ação (iniciar, concluir). O gesto de deslizar é atalho, apresentado pela dica acima — dispensada, não volta.
          </div>
        )}
      </div>

      {sheet && <NewCardSheet initialClient={params.get("cliente") ?? ""} editing={editing} onClose={() => { setSheet(false); setEditing(null); }} onCreated={reload} />}
    </MobileShell>
  );
}
