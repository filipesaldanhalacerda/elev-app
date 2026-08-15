/**
 * Telas 06–10 · Ficha do cliente — quadros #3c e #3d.
 * Shell comum: header com voltar + nome + conta Mono; abas roláveis com fade.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Card } from "../components/cards";
import { LineChart, Donut } from "../components/charts";
import { StatusChip, Banner } from "../components/feedback";
import { Button } from "../components/Button";
import {
  useClient, usePatrimonySeries, usePortfolio, useMovements, useClientExtras, useTimeline,
  saveClientExtra, addTimelineNote, type Position,
} from "../lib/clientData";
import { useAuth } from "../lib/auth";
import { formatBRL, formatSignedBRL, formatPct, formatDate, formatInt, initials } from "../lib/format";

const TABS = ["Visão geral", "Carteira", "Movimentações", "Cadastro", "Linha do tempo"] as const;
type Tab = (typeof TABS)[number];

const maskAccount = (acc: string) =>
  acc.length < 3 ? acc : `${acc.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${acc.slice(-1)}`;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_CAP = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ---------- Aba 06 · Visão geral ----------
function OverviewTab({ account }: { account: string }) {
  const { data: client, loading } = useClient(account);
  const [period, setPeriod] = useState<3 | 6 | 12>(12);
  const { data: series, loading: seriesLoading } = usePatrimonySeries(account, period);
  const { data: extras } = useClientExtras(account);

  if (loading) return <FichaSkeleton />;
  if (!client)
    return (
      <div className="ficha-body">
        <div className="empty-state" style={{ borderRadius: 14 }} data-testid="ficha-nao-encontrada">
          <span className="empty-state__icon"><i className="ph ph-user" aria-hidden /></span>
          <span className="empty-state__title">Cliente não encontrado na sua carteira</span>
          <span className="empty-state__desc">Confira a conta ou volte para a lista de clientes.</span>
        </div>
      </div>
    );
  const inactive = client.status !== null && client.status !== "ATIVO";
  const sinceYear = client.xp_registered_at ? new Date(client.xp_registered_at).getFullYear() : null;
  const monthName = client.position_date ? MONTHS[new Date(`${client.position_date}T12:00:00Z`).getUTCMonth()] : "";

  return (
    <div className="ficha-body">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {inactive ? <StatusChip kind="neutral">Inativo</StatusChip> : <StatusChip kind="success">Ativo</StatusChip>}
        {client.suitability && <span className="filter-chip" style={{ height: 26, fontSize: 11 }}>Suitability {client.suitability.toLowerCase()}</span>}
        {sinceYear && <span className="filter-chip" style={{ height: 26, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>Cliente desde {sinceYear}</span>}
      </div>

      <Card style={{ padding: 16 }}>
        <div className="kpi-card__label" style={{ fontSize: 11.5 }}>Patrimônio atual</div>
        <div className="patrimony-value">
          <span className="patrimony-value__amount">{client.patrimony !== null ? formatBRL(client.patrimony) : "—"}</span>
          {client.month_pct !== null && (
            <span className={`patrimony-value__pct ${client.month_pct >= 0 ? "market-up" : "market-down"}`}>
              {formatPct(client.month_pct, 1).replace("−", "-")}
            </span>
          )}
        </div>
        {client.position_date && <div className="patrimony-source">posição de {formatDate(client.position_date)} · fonte Positivador</div>}
        <div className="period-chips">
          {([3, 6, 12] as const).map((p) => (
            <button key={p} type="button" className={`period-chip${period === p ? " period-chip--active" : ""}`} onClick={() => setPeriod(p)}>
              {p}M
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          {seriesLoading ? (
            <div className="skeleton" style={{ height: 104, borderRadius: 8 }} />
          ) : series && series.length >= 2 ? (
            <LineChart
              points={series.map((s) => s.net_em_m!)}
              height={104}
              axis={[series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]].map((s) =>
                `${String(new Date(`${s.ref_date}T12:00:00Z`).getUTCMonth() + 1).padStart(2, "0")}/${String(new Date(`${s.ref_date}T12:00:00Z`).getUTCFullYear()).slice(2)}`
              )}
            />
          ) : (
            <div className="empty-state" style={{ border: "none", padding: "12px 0" }}>
              <span className="empty-state__desc">A evolução aparece a partir da segunda importação do Positivador.</span>
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card>
          <div className="kpi-card__label" style={{ lineHeight: 1.3 }}>Captação líquida · {monthName}</div>
          <div style={{ marginTop: 8, font: "600 17px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>
            {client.captacao_liquida_m !== null ? formatBRL(client.captacao_liquida_m) : "—"}
          </div>
          <div style={{ marginTop: 7, font: "400 10.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>
            fonte Positivador
          </div>
        </Card>
        <Card>
          <div className="kpi-card__label" style={{ lineHeight: 1.3 }}>Rentabilidade · 12M</div>
          <div style={{ marginTop: 8, font: "600 17px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>—</div>
          <div style={{ marginTop: 7, font: "400 10.5px/1 var(--font-sans)", color: "var(--text-3)" }}>disponível na fase 2</div>
        </Card>
      </div>

      <div className="quick-actions">
        <a className="quick-action quick-action--wa" href={extras?.phone ? `https://wa.me/55${extras.phone.replace(/\D/g, "")}` : "https://wa.me/"} target="_blank" rel="noreferrer">
          <i className="ph ph-whatsapp-logo" aria-hidden />
          <span>WhatsApp</span>
        </a>
        <button type="button" className="quick-action" onClick={() => (window.location.href = "/cards")}>
          <i className="ph ph-kanban" aria-hidden />
          <span>Novo card</span>
        </button>
        <button type="button" className="quick-action" onClick={() => (window.location.href = "/alertas?novo")}>
          <i className="ph ph-target" aria-hidden />
          <span>Alerta</span>
        </button>
        <button type="button" className="quick-action" onClick={() => (window.location.href = "/salas")}>
          <i className="ph ph-door-open" aria-hidden />
          <span>Sala</span>
        </button>
      </div>

      <Card style={{ padding: 14 }}>
        <div style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Dados cadastrais</div>
        <div className="data-rows">
          <div className="data-row"><span className="data-row__label">Telefone</span><span className="data-row__value">{extras?.phone ?? "—"}</span></div>
          <div className="data-row"><span className="data-row__label">E-mail</span><span className="data-row__value">{extras?.email ?? "—"}</span></div>
          <div className="data-row"><span className="data-row__label">Nascimento</span><span className="data-row__value">{client.birth_date ? formatDate(client.birth_date) : "—"}</span></div>
          {client.profession && <div className="data-row"><span className="data-row__label">Profissão</span><span className="data-row__value">{client.profession}</span></div>}
          {client.segment && <div className="data-row"><span className="data-row__label">Segmento</span><span className="data-row__value">{client.segment}</span></div>}
        </div>
      </Card>
      <div style={{ height: 8 }} />
    </div>
  );
}

// ---------- Aba 07 · Carteira ----------
function isTicker(asset: string) {
  return /^[A-Z]{4}\d{1,2}$/.test(asset.trim());
}

function positionMeta(p: Position): string {
  const parts: string[] = [];
  if (p.sub_product) parts.push(p.sub_product);
  else if (isTicker(p.asset) && p.quantity) parts.push(`${formatInt(p.quantity)} cotas`);
  if (p.maturity_date) parts.push(`vence ${formatDate(p.maturity_date)}`);
  else if (p.issuer) parts.push(p.issuer);
  return parts.join(" · ");
}

function PortfolioTab({ account }: { account: string }) {
  const { data, loading } = usePortfolio(account);
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (loading || !data) return <FichaSkeleton donut />;
  if (data.groups.length === 0) {
    return (
      <div className="ficha-body">
        <div className="empty-state" style={{ borderRadius: 14 }}>
          <span className="empty-state__icon"><i className="ph ph-chart-pie-slice" aria-hidden /></span>
          <span className="empty-state__title">Sem posições importadas</span>
          <span className="empty-state__desc">A carteira aparece após a importação do relatório de Diversificação.</span>
        </div>
      </div>
    );
  }

  const expanded = (product: string, index: number) => open.has(product) || (open.size === 0 && index < 2);
  const assetCount = data.groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="ficha-body" style={{ gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <Donut
          size={88}
          hole={54}
          slices={data.groups.slice(0, 4).map((g) => ({ label: g.product, pct: g.pct }))}
        />
      </Card>
      {data.groups.map((group, gi) => {
        const isOpen = expanded(group.product, gi);
        return (
          <div key={group.product} className={`class-group${isOpen ? "" : " class-group--collapsed"}`}>
            <button
              type="button"
              className={`class-group__head${isOpen ? " class-group__head--bordered" : ""}`}
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s.size === 0 ? data.groups.slice(0, 2).map((g) => g.product) : s);
                  if (next.has(group.product)) next.delete(group.product);
                  else next.add(group.product);
                  return next;
                })
              }
            >
              <span className="class-group__title">
                <i className={`ph ${isOpen ? "ph-caret-down" : "ph-caret-right"}`} aria-hidden />
                {group.product}
              </span>
              <span className="class-group__totals">
                <span className="class-group__total">{formatBRL(group.total)}</span>
                <span className="class-group__pct">{group.pct}%</span>
              </span>
            </button>
            {isOpen &&
              group.items.slice(0, 8).map((p, i) => (
                <div key={i} className="position-row">
                  <div className="position-row__top">
                    <span className={`position-row__name${isTicker(p.asset) ? " position-row__name--ticker" : ""}`}>{p.asset}</span>
                    <span className="position-row__value">{formatBRL(p.value)}</span>
                  </div>
                  <div className="position-row__bottom">
                    <span>{positionMeta(p)}</span>
                    {p.quantity !== null && !isTicker(p.asset) && <span>{formatInt(p.quantity)} un.</span>}
                  </div>
                </div>
              ))}
            {isOpen && group.items.length > 8 && (
              <div className="position-row" style={{ font: "400 11px/1.4 var(--font-sans)", color: "var(--text-3)" }}>
                + {group.items.length - 8} posições nesta classe
              </div>
            )}
          </div>
        );
      })}
      <div className="list-footnote" style={{ paddingTop: 0 }}>
        {formatInt(assetCount)} ativos · posição de {data.refDate ? formatDate(data.refDate) : "—"} · fonte Diversificação
      </div>
    </div>
  );
}

// ---------- Aba 08 · Movimentações ----------
function MovementsTab({ account }: { account: string }) {
  const [filter, setFilter] = useState<"tudo" | "aportes" | "resgates">("tudo");
  const [days, setDays] = useState<30 | 365>(365);
  const { data, loading } = useMovements(account, filter, days);

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, typeof data.rows>();
    for (const m of data.rows) {
      const key = m.mov_date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()].map(([month, rows]) => ({
      month,
      label: `${MONTHS_CAP[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`,
      net: rows.reduce((acc, r) => acc + r.amount, 0),
      rows,
    }));
  }, [data]);

  return (
    <div className="ficha-body" style={{ gap: 12, paddingTop: 14 }}>
      <div className="filter-row">
        {(["tudo", "aportes", "resgates"] as const).map((f) => (
          <button key={f} type="button" className={`filter-chip${filter === f ? " filter-chip--active" : ""}`} onClick={() => setFilter(f)}>
            {f === "tudo" ? "Tudo" : f === "aportes" ? "Aportes" : "Resgates"}
          </button>
        ))}
        <button type="button" className="filter-sort" onClick={() => setDays((d) => (d === 365 ? 30 : 365))}>
          {days === 365 ? "12 meses" : "30 dias"}
          <i className="ph ph-caret-down" aria-hidden />
        </button>
      </div>

      {loading && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}

      {!loading && data && groups.length === 0 && (
        <div className="empty-state" style={{ borderRadius: 14, padding: "28px 20px" }}>
          <span className="empty-state__icon" style={{ width: 46, height: 46, borderRadius: 12 }}>
            <i className="ph ph-arrows-down-up" style={{ fontSize: 22 }} aria-hidden />
          </span>
          <span className="empty-state__title" style={{ fontSize: 15 }}>
            Nenhuma movimentação em {days === 30 ? "30 dias" : "12 meses"}
          </span>
          <span className="empty-state__desc" style={{ maxWidth: 270 }}>
            {data.lastEver
              ? `O último ${data.lastEver.amount >= 0 ? "aporte" : "resgate"} deste cliente foi em ${formatDate(data.lastEver.mov_date)}. Amplie o período para ver o histórico completo.`
              : "As movimentações chegam pela importação do relatório de Captação."}
          </span>
          {days === 30 && (
            <span style={{ marginTop: 16 }}>
              <Button icon="ph-calendar-blank" onClick={() => setDays(365)}>Ver 12 meses</Button>
            </span>
          )}
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <div key={g.month} className="mov-group">
            <div className="mov-group__head">
              <span className="mov-group__month">{g.label}</span>
              <span className="mov-group__net">líquido {formatSignedBRL(g.net)}</span>
            </div>
            {g.rows.map((m) => (
              <div key={m.id} className="mov-row">
                <span className="mov-row__icon">
                  <i className={`ph ${m.amount >= 0 ? "ph-arrow-down-left" : "ph-arrow-up-right"}`} aria-hidden />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="mov-row__title">{m.amount >= 0 ? "Aporte" : "Resgate"} · {m.kind}</span>
                  <span className="mov-row__meta">{formatDate(m.mov_date)} · liquidado</span>
                </span>
                <span className="mov-row__amount">{formatSignedBRL(m.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      {!loading && groups.length > 0 && (
        <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "2px 2px 14px" }}>
          Aporte e resgate são fluxo de caixa, não variação de preço: entram em neutro com sinal, nunca no verde ou vermelho de mercado.
        </div>
      )}
    </div>
  );
}

// ---------- Aba 09 · Cadastro complementar ----------
function ExtrasTab({ account, advisorCode }: { account: string; advisorCode: string }) {
  const { data: extras, reload } = useClientExtras(account);
  const { data: client } = useClient(account);
  const [editing, setEditing] = useState<"phone" | "email" | "notes" | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (field: "phone" | "email" | "notes") => {
    setEditing(field);
    setValue((extras?.[field] as string) ?? "");
  };
  const save = async () => {
    setSaving(true);
    await saveClientExtra(account, advisorCode, editing!, value);
    setSaving(false);
    setEditing(null);
    reload();
  };

  const row = (field: "phone" | "email", label: string) =>
    editing === field ? (
      <div key={field} className="extras-edit">
        <span className="extras-row__label">{label}</span>
        <div className="field" style={{ marginTop: 7 }}>
          <div className="field__box">
            <input className="field__input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={label} />
          </div>
        </div>
        <div className="extras-edit__buttons">
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Salvar</Button>
        </div>
      </div>
    ) : (
      <div key={field} className="extras-row">
        <span style={{ flex: 1 }}>
          <span className="extras-row__label">{label}</span>
          <span className={`extras-row__value${extras?.[field] ? "" : " extras-row__value--empty"}`}>{extras?.[field] ?? "não informado"}</span>
        </span>
        <button type="button" className="extras-row__edit" aria-label={`Editar ${label.toLowerCase()}`} onClick={() => startEdit(field)}>
          <i className="ph ph-pencil-simple" aria-hidden />
        </button>
      </div>
    );

  return (
    <div className="ficha-body" style={{ gap: 12 }}>
      <div className="extras-card">
        {row("phone", "Telefone")}
        {row("email", "E-mail")}
        <div className="extras-row">
          <span style={{ flex: 1 }}>
            <span className="extras-row__label">Nascimento</span>
            <span className={`extras-row__value${client?.birth_date ? "" : " extras-row__value--empty"}`}>
              {client?.birth_date ? formatDate(client.birth_date) : "não informado"}
            </span>
          </span>
        </div>
      </div>

      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Observações</span>
          {extras?.updated_at && (
            <span className="obs-meta">
              editado {formatDate(extras.updated_at)}{extras.updated_by_name ? ` por ${extras.updated_by_name.split(" ")[0]}` : ""}
            </span>
          )}
        </div>
        {editing === "notes" ? (
          <>
            <textarea className="field__textarea" style={{ marginTop: 10 }} autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Observações" />
            <div className="extras-edit__buttons">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button loading={saving} onClick={save}>Salvar</Button>
            </div>
          </>
        ) : (
          <>
            <div className="obs-body">{extras?.notes ?? "Nenhuma observação ainda."}</div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" icon="ph-pencil-simple" style={{ height: 40, fontSize: 12.5 }} onClick={() => startEdit("notes")}>
                Editar observações
              </Button>
            </div>
          </>
        )}
      </Card>

      <Banner kind="info" icon="ph-list-magnifying-glass">
        Toda alteração aqui fica registrada na auditoria com autor e horário. Dados vindos da XP são somente leitura.
      </Banner>
    </div>
  );
}

// ---------- Aba 10 · Linha do tempo ----------
interface TlEvent {
  at: string;
  icon: string;
  nodeClass?: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
}

function TimelineTab({ account, advisorCode }: { account: string; advisorCode: string }) {
  const { profile } = useAuth();
  const { data, loading, reload } = useTimeline(account);
  const [filter, setFilter] = useState<"tudo" | "alertas" | "reunioes" | "cards" | "anotacoes">("tudo");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const events = useMemo(() => {
    if (!data) return [];
    const list: TlEvent[] = [];
    if (filter === "tudo" || filter === "anotacoes") {
      for (const n of data.notes) {
        list.push({
          at: n.created_at,
          icon: "ph-note-pencil",
          title: "Anotação",
          extra: (
            <>
              <span className="tl-item__note">{n.body}</span>
              <span className="tl-item__row">
                <span style={{ width: 20, height: 20, borderRadius: 999, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 8.5px/1 var(--font-sans)" }}>
                  {initials(n.author_name || "?")}
                </span>
                <span style={{ font: "400 10.5px/1 var(--font-sans)", color: "var(--text-3)" }}>{n.author_name}</span>
              </span>
            </>
          ),
        });
      }
    }
    if (filter === "tudo") {
      for (const m of data.movements) {
        list.push({
          at: `${m.mov_date}T12:00:00Z`,
          icon: m.amount >= 0 ? "ph-arrow-down-left" : "ph-arrow-up-right",
          title: `${m.amount >= 0 ? "Aporte" : "Resgate"} liquidado`,
          extra: (
            <span className="tl-item__row">
              <span className="tl-item__amount">{formatSignedBRL(m.amount)}</span>
              <span className="tl-item__source">importação Captação</span>
            </span>
          ),
        });
      }
    }
    if (filter === "tudo" || filter === "alertas") {
      for (const a of data.alerts) {
        list.push({
          at: a.triggered_at ?? new Date().toISOString(),
          icon: "ph-target",
          nodeClass: "tl-item__node--brand",
          title: (
            <>
              Alerta de <code>{a.ticker}</code> {a.status === "disparado" ? "disparado" : "ativo"}
            </>
          ),
          extra: a.target_price ? (
            <span className="tl-item__row">
              <span className="tl-item__chip">alvo {formatBRL(a.target_price)}</span>
            </span>
          ) : undefined,
        });
      }
    }
    if (filter === "tudo" || filter === "cards") {
      for (const c of data.cards) {
        const done = c.status === "concluido";
        list.push({
          at: c.completed_at ?? c.created_at,
          icon: done ? "ph-check" : "ph-kanban",
          nodeClass: done ? "tl-item__node--success" : undefined,
          title: done ? "Card concluído" : "Card criado",
          extra: (
            <span className="tl-item__row">
              <span style={{ font: "400 11.5px/1 var(--font-sans)", color: "var(--field-label)" }}>{c.title}</span>
            </span>
          ),
        });
      }
    }
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [data, filter]);

  const days = useMemo(() => {
    const map = new Map<string, TlEvent[]>();
    for (const e of events) {
      const key = e.at.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return [...map.entries()].map(([day, items]) => ({
      day,
      label: day === today ? `Hoje · ${formatDate(day).slice(0, 5)}` : day === yesterday ? `Ontem · ${formatDate(day).slice(0, 5)}` : formatDate(day),
      items,
    }));
  }, [events]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    await addTimelineNote(account, advisorCode, draft.trim());
    setDraft("");
    setSending(false);
    reload();
  }

  return (
    <div className="ficha-body" style={{ gap: 18, paddingTop: 12 }}>
      <div className="filter-row" style={{ overflowX: "auto" }}>
        {([["tudo", "Tudo"], ["alertas", "Alertas"], ["reunioes", "Reuniões"], ["cards", "Cards"], ["anotacoes", "Anotações"]] as const).map(([key, label]) => (
          <button key={key} type="button" className={`filter-chip${filter === key ? " filter-chip--active" : ""}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {!loading && events.length > 0 && (
        <div style={{ padding: "0 2px" }}>
          <div className="tl-summary__title">
            {(() => {
              const last = events[0].at.slice(0, 10);
              const today = new Date().toISOString().slice(0, 10);
              const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
              return `Último contato ${last === today ? "hoje" : last === yesterday ? "ontem" : `em ${formatDate(last)}`}`;
            })()}
          </div>
          <div className="tl-summary__meta">
            {(() => {
              const month = new Date().toISOString().slice(0, 7);
              const inMonth = events.filter((e) => e.at.startsWith(month)).length;
              return `${inMonth} evento${inMonth !== 1 ? "s" : ""} em ${MONTHS[new Date().getMonth()]}`;
            })()}
          </div>
        </div>
      )}

      {loading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}

      {!loading && events.length === 0 && (
        <div className="empty-state" style={{ borderRadius: 14 }}>
          <span className="empty-state__icon"><i className="ph ph-clock-counter-clockwise" aria-hidden /></span>
          <span className="empty-state__title">Nada registrado ainda</span>
          <span className="empty-state__desc">Anote a primeira conversa abaixo — reuniões, cards e alertas entram aqui sozinhos.</span>
        </div>
      )}

      {!loading && days.map((d) => (
        <div key={d.day}>
          <div className="tl-day__head">
            <span className="tl-day__label">{d.label}</span>
            <span className="tl-day__count">{d.items.length} evento{d.items.length > 1 ? "s" : ""}</span>
          </div>
          <div className="tl-track">
            {d.items.length > 1 && <span className="tl-track__rail" aria-hidden />}
            {d.items.map((e, i) => (
              <div key={i} className="tl-item" style={i === d.items.length - 1 ? { paddingBottom: 0 } : undefined}>
                <span className="tl-item__time">{e.at.includes("T") ? new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : ""}</span>
                <span className="tl-item__node-col">
                  <span className={`tl-item__node${e.nodeClass ? ` ${e.nodeClass}` : ""}`}>
                    <i className={`ph ${e.icon}`} aria-hidden />
                  </span>
                </span>
                <span className="tl-item__main">
                  <span className="tl-item__title">{e.title}</span>
                  {e.extra}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="tl-composer">
        <span style={{ width: 30, height: 30, flex: "none", borderRadius: 999, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 10.5px/1 var(--font-sans)" }}>
          {profile ? initials(profile.name) : ""}
        </span>
        <span className="tl-composer__box">
          <input
            className="tl-composer__input"
            placeholder="Anotar algo desta conversa"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Anotar algo desta conversa"
            disabled={sending}
          />
          <button type="button" className="tl-composer__send" aria-label="Enviar anotação" onClick={send} disabled={sending}>
            <i className="ph ph-paper-plane-tilt" aria-hidden />
          </button>
        </span>
      </div>
    </div>
  );
}

function FichaSkeleton({ donut }: { donut?: boolean }) {
  return (
    <div className="ficha-body" style={{ gap: 14 }}>
      <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
        {donut && <div className="skeleton" style={{ width: 88, height: 88, borderRadius: 999, flex: "none" }} />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
          <div className="skeleton" style={{ width: "82%", height: 11 }} />
          <div className="skeleton" style={{ width: "66%", height: 11 }} />
          <div className="skeleton" style={{ width: "74%", height: 11 }} />
          <div className="skeleton" style={{ width: "58%", height: 11 }} />
        </div>
      </Card>
      <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="skeleton" style={{ width: "62%", height: 11 }} />
        <div className="skeleton" style={{ width: "44%", height: 9 }} />
        <div className="skeleton" style={{ width: "70%", height: 11 }} />
        <div className="skeleton" style={{ width: "38%", height: 9 }} />
      </Card>
    </div>
  );
}

export default function ClientFile() {
  const { account = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab | null) ?? "Visão geral";
  const { data: client } = useClient(account);
  const { profile } = useAuth();
  const advisorCode = client?.advisor_code ?? profile?.advisor_code ?? "";

  return (
    <MobileShell active="clientes">
      <header className="ficha-header">
        <span className="ficha-header__lead">
          <button type="button" className="ficha-header__back" aria-label="Voltar" onClick={() => navigate("/clientes")}>
            <i className="ph ph-arrow-left" aria-hidden />
          </button>
          <span>
            <span className="ficha-header__name">{client?.name ?? maskAccount(account)}</span>
            <span className="ficha-header__account">{maskAccount(account)}</span>
          </span>
        </span>
        <button type="button" className="ficha-header__menu" aria-label="Mais opções">
          <i className="ph ph-dots-three-vertical" aria-hidden />
        </button>
      </header>

      <nav className="ficha-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            className={`ficha-tab${t === tab ? " ficha-tab--active" : ""}`}
            onClick={() => setParams({ aba: t })}
          >
            {t}
          </button>
        ))}
        <span className="ficha-tabs__fade" aria-hidden />
      </nav>

      {tab === "Visão geral" && <OverviewTab account={account} />}
      {tab === "Carteira" && <PortfolioTab account={account} />}
      {tab === "Movimentações" && <MovementsTab account={account} />}
      {tab === "Cadastro" && <ExtrasTab account={account} advisorCode={advisorCode} />}
      {tab === "Linha do tempo" && <TimelineTab account={account} advisorCode={advisorCode} />}
    </MobileShell>
  );
}
