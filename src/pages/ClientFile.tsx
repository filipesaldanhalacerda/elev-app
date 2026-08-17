/**
 * Telas 06–10 · Ficha do cliente — quadros #3c e #3d.
 * Shell comum: header com voltar + nome + conta Mono; abas roláveis com fade.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Card } from "../components/cards";
import { LineChart, AllocationBar } from "../components/charts";
import { StatusChip, Banner } from "../components/feedback";
import { Button } from "../components/Button";
import { CharLimit } from "../components/Field";
import {
  useClient, usePatrimonySeries, usePortfolio, useMovements, useClientExtras, useClientNotes,
  saveClientExtra, addTimelineNote, updateTimelineNote, deleteTimelineNote, type Position, type TimelineNote,
} from "../lib/clientData";
import { Sheet } from "../components/Sheet";
import { Filters } from "../components/Filters";
import { DetailSheet } from "../components/DetailSheet";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { recordClientVisit } from "./Dashboard";
import { enqueueNote } from "../lib/offline";
import { formatBRL, formatSignedBRL, formatPct, formatDate, formatInt, formatPhone, isValidEmail } from "../lib/format";

const TABS = ["Visão geral", "Carteira", "Movimentações", "Cadastro", "Notas"] as const;
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
  const navigate = useNavigate();
  // tarefas ABERTAS vinculadas a este cliente — o vínculo aparece na Visão geral
  const [openTasks, setOpenTasks] = useState<{ id: string; title: string; due_at: string | null }[]>([]);
  useMemo(() => {
    supabase
      .from("cards")
      .select("id, title, due_at")
      .eq("account_code", account)
      .neq("status", "concluido")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(5)
      .then(({ data }) => setOpenTasks((data ?? []) as { id: string; title: string; due_at: string | null }[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  if (loading) return <FichaSkeleton />;
  if (!client)
    return (
      <div className="ficha-body">
        <div className="empty-state" style={{ borderRadius: 14 }} data-testid="ficha-nao-encontrada">
          <span className="empty-state__icon"><i className="icon-user" aria-hidden /></span>
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
              axis={(series.length >= 3
                ? [series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]]
                : [series[0], series[series.length - 1]]
              )
                .map((s) =>
                  `${String(new Date(`${s.ref_date}T12:00:00Z`).getUTCMonth() + 1).padStart(2, "0")}/${String(new Date(`${s.ref_date}T12:00:00Z`).getUTCFullYear()).slice(2)}`
                )
                .filter((label, i, arr) => i === 0 || label !== arr[i - 1])}
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
          <div style={{ marginTop: 8, font: "600 17px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: client.captacao_liquida_m === null ? "var(--text-1)" : client.captacao_liquida_m >= 0 ? "var(--market-up)" : "var(--market-down)" }}>
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
        {extras?.phone ? (
          <a className="quick-action quick-action--wa" href={`https://wa.me/55${extras.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
            <i className="icon-message-circle" aria-hidden />
            <span>WhatsApp</span>
          </a>
        ) : (
          <button
            type="button"
            className="quick-action quick-action--wa"
            style={{ opacity: 0.45 }}
            title="Cadastre o telefone na aba Cadastro"
            onClick={() => navigate({ search: "?aba=Cadastro" })}
          >
            <i className="icon-message-circle" aria-hidden />
            <span>WhatsApp</span>
          </button>
        )}
        <button type="button" className="quick-action" onClick={() => navigate(`/cards?novo=1&cliente=${account}`)}>
          <i className="icon-square-check" aria-hidden />
          <span>Tarefa</span>
        </button>
        <button type="button" className="quick-action" onClick={() => navigate(`/alertas?novo=1&cliente=${account}`)}>
          <i className="icon-radar" aria-hidden />
          <span>Alerta</span>
        </button>
      </div>

      {openTasks.length > 0 && (
        <button
          type="button"
          className="card"
          data-client-tasks
          style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%" }}
          onClick={() => navigate("/cards")}
        >
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <i className="icon-square-check" style={{ fontSize: 17 }} aria-hidden />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "500 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>
              {openTasks.length} tarefa{openTasks.length > 1 ? "s" : ""} aberta{openTasks.length > 1 ? "s" : ""} deste cliente
            </span>
            <span style={{ display: "block", marginTop: 2, font: "400 11.5px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              próxima: {openTasks[0].title}{openTasks[0].due_at ? ` · ${formatDate(openTasks[0].due_at).slice(0, 5)}` : ""}
            </span>
          </span>
          <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
        </button>
      )}

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
          <span className="empty-state__icon"><i className="icon-chart-pie" aria-hidden /></span>
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
      <Card style={{ padding: 16 }}>
        <AllocationBar items={data.groups.map((g) => ({ label: g.product, pct: g.pct }))} />
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
                <i className={`${isOpen ? "icon-chevron-down" : "icon-chevron-right"}`} aria-hidden />
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
      <Filters
        label="Filtros de movimentações"
        sections={[
          { key: "tipo", label: "Tipo", options: [{ value: "tudo", label: "Tudo" }, { value: "aportes", label: "Aportes" }, { value: "resgates", label: "Resgates" }] },
          { key: "periodo", label: "Período", options: [{ value: "365", label: "12 meses" }, { value: "30", label: "30 dias" }] },
        ]}
        values={{ tipo: filter, periodo: String(days) }}
        onChange={(key, value) => {
          if (key === "tipo") setFilter(value as typeof filter);
          else setDays(Number(value) as 30 | 365);
        }}
        onClear={() => { setFilter("tudo"); setDays(365); }}
      />

      {loading && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}

      {!loading && data && groups.length === 0 && (
        <div className="empty-state" style={{ borderRadius: 14, padding: "28px 20px" }}>
          <span className="empty-state__icon" style={{ width: 46, height: 46, borderRadius: 12 }}>
            <i className="icon-arrow-down-up" style={{ fontSize: 22 }} aria-hidden />
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
              <Button icon="icon-calendar" onClick={() => setDays(365)}>Ver 12 meses</Button>
            </span>
          )}
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <div key={g.month} className="mov-group">
            <div className="mov-group__head">
              <span className="mov-group__month">{g.label}</span>
              <span className="mov-group__net" style={{ color: g.net >= 0 ? "var(--market-up)" : "var(--market-down)" }}>líquido {formatSignedBRL(g.net)}</span>
            </div>
            {g.rows.map((m) => (
              <div key={m.id} className="mov-row">
                <span className="mov-row__icon" style={{ color: m.amount >= 0 ? "var(--market-up)" : "var(--market-down)" }}>
                  <i className={`${m.amount >= 0 ? "icon-arrow-down-left" : "icon-arrow-up-right"}`} aria-hidden />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="mov-row__title">{m.amount >= 0 ? "Aporte" : "Resgate"} · {m.kind}</span>
                  <span className="mov-row__meta">{formatDate(m.mov_date)}</span>
                </span>
                <span className="mov-row__amount" style={{ color: m.amount >= 0 ? "var(--market-up)" : "var(--market-down)" }}>{formatSignedBRL(m.amount)}</span>
              </div>
            ))}
          </div>
        ))}
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

  // F2-05/F2-06: telefone com máscara progressiva; e-mail validado antes de salvar.
  const emailInvalid = editing === "email" && value.trim() !== "" && !isValidEmail(value);

  const sectionTitle = (text: string) => (
    <div style={{ font: "600 11px/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-2)", padding: "2px 2px 0" }}>{text}</div>
  );

  const contactRow = (field: "phone" | "email", label: string, icon: string) => (
    <button
      key={field}
      type="button"
      aria-label={`Editar ${field === "phone" ? "telefone" : "e-mail"}`}
      style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left", borderTop: field === "email" ? "1px solid var(--divider)" : undefined }}
      onClick={() => startEdit(field)}
    >
      <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chip-pill-bg)", color: "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <i className={icon} style={{ fontSize: 15 }} aria-hidden />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="extras-row__label">{label}</span>
        <span className={`extras-row__value${extras?.[field] ? "" : " extras-row__value--empty"}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {extras?.[field] ?? "não informado"}
        </span>
      </span>
      <i className="icon-pencil" style={{ fontSize: 15, color: "var(--icon-decor)", flex: "none" }} aria-hidden />
    </button>
  );

  const xpRow = (icon: string, label: string, val: string | null, first = false) => (
    <div style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: first ? undefined : "1px solid var(--divider)" }}>
      <i className={icon} style={{ fontSize: 15, color: "var(--field-label)", flex: "none" }} aria-hidden />
      <span style={{ flex: "none", font: "400 12px/1.4 var(--font-sans)", color: "var(--text-2)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "right", font: "500 12.5px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: val ? "var(--text-1)" : "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {val ?? "—"}
      </span>
    </div>
  );

  const capitalize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

  return (
    <div className="ficha-body" style={{ gap: 12 }}>
      {sectionTitle("Contato")}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {contactRow("phone", "Telefone", "icon-phone")}
        {contactRow("email", "E-mail", "icon-mail")}
      </div>

      {sectionTitle("Dados da XP · somente leitura")}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {xpRow("icon-calendar", "Nascimento", client?.birth_date ? formatDate(client.birth_date) : null, true)}
        {xpRow("icon-briefcase", "Profissão", client?.profession ? capitalize(client.profession) : null)}
        {xpRow("icon-layers", "Segmento", client?.segment ?? null)}
        {xpRow("icon-gauge", "Suitability", client?.suitability ? capitalize(client.suitability) : null)}
        {xpRow("icon-id-card", "Cliente desde", client?.xp_registered_at ? formatDate(client.xp_registered_at) : null)}
      </div>

      {sectionTitle("Observações")}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 14px" }}>
          <div className="obs-body" style={{ marginTop: 0 }}>{extras?.notes ?? "Nenhuma observação ainda."}</div>
          {extras?.updated_at && (
            <div className="obs-meta" style={{ marginTop: 8, display: "block" }}>
              editado {formatDate(extras.updated_at)}{extras.updated_by_name ? ` por ${extras.updated_by_name.split(" ")[0]}` : ""}
            </div>
          )}
        </div>
        <button
          type="button"
          style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left", borderTop: "1px solid var(--divider)" }}
          onClick={() => startEdit("notes")}
        >
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chip-pill-bg)", color: "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <i className="icon-pencil" style={{ fontSize: 15 }} aria-hidden />
          </span>
          <span style={{ flex: 1, font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Editar observações</span>
          <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
        </button>
      </div>

      <Banner kind="info" icon="icon-text-search">
        Toda alteração aqui fica registrada na auditoria com autor e horário. Dados vindos da XP são somente leitura.
      </Banner>

      {(editing === "phone" || editing === "email") && (
        <Sheet label={editing === "phone" ? "Editar telefone" : "Editar e-mail"} onClose={() => setEditing(null)}>
          <div className="sheet__title">{editing === "phone" ? "Editar telefone" : "Editar e-mail"}</div>
          <div className="sheet__fields">
            <div className={`field${emailInvalid ? " field--error" : ""}`}>
              <label className="field__label" htmlFor="extra-campo" style={{ display: "block" }}>{editing === "phone" ? "Telefone" : "E-mail"}</label>
              <div className="field__box">
                <input
                  id="extra-campo"
                  className="field__input"
                  inputMode={editing === "phone" ? "tel" : "email"}
                  placeholder={editing === "phone" ? "(11) 98812-4402" : "nome@dominio.com"}
                  value={value}
                  onChange={(e) => setValue(editing === "phone" ? formatPhone(e.target.value) : e.target.value)}
                />
              </div>
              {emailInvalid && (
                <div className="field__help">
                  <i className="icon-circle-alert" aria-hidden />
                  Digite um e-mail válido, como nome@dominio.com.
                </div>
              )}
            </div>
          </div>
          <div className="sheet__footer">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={saving} disabled={emailInvalid} onClick={save}>Salvar</Button>
          </div>
        </Sheet>
      )}

      {editing === "notes" && (
        <Sheet label="Editar observações" onClose={() => setEditing(null)}>
          <div className="sheet__title">Editar observações</div>
          <div className="sheet__fields">
            <div className="field">
              <label className="field__label" htmlFor="extra-obs" style={{ display: "block" }}>Observações</label>
              <textarea
                id="extra-obs"
                className="field__textarea"
                style={{ minHeight: 130 }}
                placeholder="Preferências de contato, contexto da família, restrições…"
                maxLength={500}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <CharLimit value={value} max={500} />
            </div>
          </div>
          <div className="sheet__footer">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={saving} onClick={save}>Salvar</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ---------- Aba 10 · Notas ----------
const noteWhen = (at: string) => `${formatDate(at)} às ${new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;

function NoteSheet({ account, advisorCode, editing, onClose, onSaved }: { account: string; advisorCode: string; editing: TimelineNote | null; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState(editing?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      if (!navigator.onLine) throw new Error("offline");
      if (editing) await updateTimelineNote(editing.id, body.trim());
      else await addTimelineNote(account, advisorCode, body.trim());
      onSaved();
    } catch {
      // sem rede: nota NOVA entra na fila e sincroniza quando a rede voltar (tela 24)
      if (!editing) enqueueNote({ account, advisorCode, body: body.trim(), at: Date.now() });
    }
    setSaving(false);
    onClose();
  }

  const title = editing ? "Editar nota" : "Nova nota";
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="sheet__title">{title}</div>
      <div className="sheet__fields">
        <div className="field">
          <label className="field__label" htmlFor="nota-texto" style={{ display: "block" }}>Nota</label>
          <textarea
            id="nota-texto"
            className="field__textarea"
            style={{ minHeight: 130 }}
            placeholder="Pontos importantes da conversa, combinados, contexto do cliente…"
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <CharLimit value={body} max={500} />
        </div>
      </div>
      <div className="sheet__footer">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving || !body.trim()}>{editing ? "Salvar" : "Salvar nota"}</Button>
      </div>
    </Sheet>
  );
}

function NotesTab({ account, advisorCode }: { account: string; advisorCode: string }) {
  const { profile } = useAuth();
  const { data: notes, loading, reload } = useClientNotes(account);
  const [editor, setEditor] = useState<{ editing: TimelineNote | null } | null>(null);
  const [viewing, setViewing] = useState<TimelineNote | null>(null);
  const [removing, setRemoving] = useState<TimelineNote | null>(null);

  return (
    <div className="ficha-body" data-notes style={{ gap: 12, paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setEditor({ editing: null })}
        style={{ minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, border: "1.5px dashed var(--action)", color: "var(--action)", background: "transparent", font: "600 13px/1 var(--font-sans)" }}
      >
        <i className="icon-plus" style={{ fontSize: 16 }} aria-hidden /> Nova nota
      </button>

      {loading && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}

      {!loading && (notes ?? []).length === 0 && (
        <div className="empty-state" style={{ borderRadius: 14 }}>
          <span className="empty-state__icon"><i className="icon-square-pen" aria-hidden /></span>
          <span className="empty-state__title">Nenhuma nota ainda</span>
          <span className="empty-state__desc">Registre pontos importantes de conversas com o cliente — as notas ficam guardadas só nesta ficha.</span>
        </div>
      )}

      {!loading && (notes ?? []).map((n) => (
        <button
          key={n.id}
          type="button"
          className="card"
          data-note
          style={{ textAlign: "left", padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}
          onClick={() => setViewing(n)}
        >
          <span style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--text-1)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
            {n.body}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, font: "400 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>
            <i className="icon-clock" style={{ fontSize: 12 }} aria-hidden />
            {noteWhen(n.created_at)}
            {n.updated_at && " · editada"}
            {n.author !== profile?.id && n.author_name && ` · ${n.author_name.split(" ")[0]}`}
          </span>
        </button>
      ))}

      {viewing && (
        <DetailSheet
          label="Detalhes da nota"
          icon="icon-square-pen"
          title="Nota"
          rows={[
            { icon: "icon-calendar", label: "Criada", value: noteWhen(viewing.created_at) },
            ...(viewing.updated_at ? [{ icon: "icon-pencil", label: "Editada", value: noteWhen(viewing.updated_at) }] : []),
            { icon: "icon-user", label: "Autor", value: viewing.author_name || "—" },
          ]}
          description={viewing.body}
          actions={viewing.author === profile?.id ? [
            { icon: "icon-pencil", label: "Editar", onClick: () => { setEditor({ editing: viewing }); setViewing(null); } },
            { icon: "icon-trash", label: "Excluir", danger: true, onClick: () => { setRemoving(viewing); setViewing(null); } },
          ] : []}
          footnote={viewing.author !== profile?.id ? "Só quem escreveu a nota pode editar ou excluir." : undefined}
          onClose={() => setViewing(null)}
        />
      )}

      {editor && (
        <NoteSheet
          account={account}
          advisorCode={advisorCode}
          editing={editor.editing}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}

      {removing && (
        <Sheet label="Excluir nota" onClose={() => setRemoving(null)}>
          <div className="sheet__title">Excluir esta nota?</div>
          <div style={{ marginTop: 8, font: "400 12.5px/1.55 var(--font-sans)", color: "var(--text-2)", overflowWrap: "anywhere" }}>
            “{removing.body.length > 120 ? `${removing.body.slice(0, 120)}…` : removing.body}” será apagada de vez.
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => { await deleteTimelineNote(removing.id).catch(() => {}); setRemoving(null); reload(); }}
            >
              Excluir nota
            </Button>
          </div>
        </Sheet>
      )}
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
  useMemo(() => {
    if (client?.name) recordClientVisit(account, client.name);
  }, [client?.name, account]);

  return (
    <MobileShell active="clientes">
      <header className="ficha-header">
        <span className="ficha-header__lead">
          <button type="button" className="ficha-header__back" aria-label="Voltar" onClick={() => navigate("/clientes")}>
            <i className="icon-arrow-left" aria-hidden />
          </button>
          <span>
            <span className="ficha-header__name">{client?.name ?? maskAccount(account)}</span>
            <span className="ficha-header__account">{maskAccount(account)}</span>
          </span>
        </span>
      </header>

      <nav className="ficha-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            ref={t === tab ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest" }) : undefined}
            className={`ficha-tab${t === tab ? " ficha-tab--active" : ""}`}
            onClick={(e) => { e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); setParams({ aba: t }); }}
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
      {tab === "Notas" && <NotesTab account={account} advisorCode={advisorCode} />}
    </MobileShell>
  );
}
