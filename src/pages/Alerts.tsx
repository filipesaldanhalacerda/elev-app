/**
 * Tela 12 · Central de alertas — quadros "12 Alertas claro" e "12 Novo alerta escuro" (#3e).
 * Alertas de preço com direção, progresso até o alvo, histórico e sheet de criação/edição.
 * Listas paginadas com rolagem infinita (components/infinite) e busca rápida por ativo.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { DetailSheet } from "../components/DetailSheet";
import { Button } from "../components/Button";
import { Filters } from "../components/Filters";
import { AlertCard } from "../components/cards";
import { usePagedList, InfiniteSentinel } from "../components/infinite";
import { SkeletonAlertCards, SkeletonCardRows } from "../components/states";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useQuoteDetail, formatQuotePrice, formatQuoteChange, type Quote } from "../lib/quotes";
import { workerFetch } from "../lib/auth";
import { formatBRL, formatDate, formatDateAtTime, maskMoneyBR, parseMoneyBR } from "../lib/format";

interface AlertRow {
  id: string;
  ticker: string;
  direction: "alta" | "baixa";
  target_price: number | null;
  target_day_pct: number | null;
  account_code: string | null;
  status: "ativo" | "disparado" | "cancelado";
  created_at: string;
  created_price: number | null;
  triggered_at: string | null;
  triggered_price: number | null;
  client_name?: string | null;
}

function mapRows(data: unknown[] | null): AlertRow[] {
  return (data ?? []).map((r) => ({
    ...(r as AlertRow),
    client_name: ((r as { clients?: { name?: string } | { name?: string }[] }).clients as { name?: string } | null)?.name ?? null,
  }));
}

function useAlertList(status: "ativo" | "disparado", search: string, ownerId?: string) {
  return usePagedList<AlertRow>(
    async (from, to) => {
      // tela PESSOAL: mesmo o admin vê só os próprios alertas aqui
      let q = supabase.from("alerts").select("*, clients(name)", { count: "exact" }).eq("status", status);
      if (ownerId) q = q.eq("owner", ownerId);
      if (search.trim()) q = q.ilike("ticker", `%${search.trim()}%`);
      q = status === "ativo" ? q.order("created_at", { ascending: false }) : q.order("triggered_at", { ascending: false, nullsFirst: false });
      const { data, count } = await q.range(from, to);
      return { rows: mapRows(data), total: count };
    },
    [status, search, ownerId]
  );
}

function progressInfo(a: AlertRow, quote: Quote | undefined) {
  const price = quote?.price ?? a.created_price ?? a.target_price ?? 0;
  const target = a.target_price ?? 0;
  const created = a.created_price ?? price;
  const remainingPct = price > 0 ? Math.abs(((target - price) / price) * 100) : 0;
  const totalGap = Math.abs(target - created);
  const done = totalGap > 0 ? Math.min(Math.abs(price - created) / totalGap, 1) : 0;
  return { price, remainingPct: Number(remainingPct.toFixed(1)), progress: Math.max(0.04, done) };
}

export function AlertSheet({ initialTicker, initialClient = "", editing, onClose, onSaved }: { initialTicker: string; initialClient?: string; editing?: AlertRow; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { profile } = useAuth();
  const [ticker, setTicker] = useState(editing?.ticker ?? initialTicker);
  const [direction, setDirection] = useState<"alta" | "baixa">(editing?.direction ?? "alta");
  const [target, setTarget] = useState(editing && editing.target_price !== null ? maskMoneyBR(editing.target_price.toFixed(2)) : "");
  const [dayPct, setDayPct] = useState(editing?.target_day_pct != null ? String(editing.target_day_pct).replace(".", ",") : "");
  const [client, setClient] = useState<string>(editing?.account_code ?? initialClient);
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const detail = useQuoteDetail(ticker.length >= 4 ? ticker.toUpperCase() : null);
  // sugestões da fonte enquanto digita — alerta só nasce de ativo que EXISTE
  const [tickerSugs, setTickerSugs] = useState<string[]>([]);
  useEffect(() => {
    const term = ticker.trim().toUpperCase();
    if (term.length < 2 || term === editing?.ticker || detail?.quote?.symbol === term) {
      setTickerSugs([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const body = (await workerFetch(`/api/quotes/search?q=${encodeURIComponent(term)}`)) as { tickers: string[] };
        if (alive) setTickerSugs((body.tickers ?? []).filter((s) => s !== term));
      } catch {
        if (alive) setTickerSugs([]);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ticker, detail?.quote?.symbol, editing?.ticker]);

  useEffect(() => {
    supabase
      .from("client_overview")
      .select("account_code, name")
      .order("patrimony", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => setClients(data ?? []));
  }, []);

  const targetNum = parseMoneyBR(target);
  const dayPctNum = Number(dayPct.replace(",", "."));
  const tickerOk = !!detail?.quote && detail.quote.symbol === ticker.trim().toUpperCase();
  const valid = tickerOk && ((target && targetNum > 0) || (dayPct && dayPctNum > 0));

  async function save() {
    setSaving(true);
    const values = {
      ticker: ticker.trim().toUpperCase(),
      direction,
      target_price: target ? targetNum : null,
      target_day_pct: dayPct && !target ? dayPctNum : null,
      account_code: client || null,
    };
    const { error } = editing
      ? await supabase
          .from("alerts")
          .update(
            editing.ticker === values.ticker
              ? values
              : { ...values, created_price: detail?.quote?.price ?? null }
          )
          .eq("id", editing.id)
      : await supabase.from("alerts").insert({ ...values, owner: profile!.id, created_price: detail?.quote?.price ?? null });
    setSaving(false);
    if (!error) {
      await onSaved();
      onClose();
    }
  }

  const title = editing ? "Editar alerta de preço" : "Novo alerta de preço";
  return (
    <Sheet label={title} onClose={onClose}>
        <div className="sheet__title">{title}</div>
        <div className="sheet__fields">
          <div className="field">
            <label className="field__label" htmlFor="alerta-ativo" style={{ display: "block" }}>Ativo</label>
            <div className="field__box">
              <input id="alerta-ativo" className="field__input field__input--mono" style={{ fontWeight: 600, textTransform: "uppercase" }} placeholder="PETR4" value={ticker} onChange={(e) => setTicker(e.target.value)} />
              {detail?.quote && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <span style={{ font: "600 13px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>{formatQuotePrice(detail.quote)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, padding: "0 7px", borderRadius: 6, background: `color-mix(in srgb, ${detail.quote.changePct >= 0 ? "var(--market-up)" : "var(--market-down)"} 12%, transparent)`, color: detail.quote.changePct >= 0 ? "var(--market-up)" : "var(--market-down)", font: "600 10.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
                    {formatQuoteChange(detail.quote)}
                  </span>
                </span>
              )}
            </div>
            {tickerSugs.length > 0 && (
              <div className="card" style={{ marginTop: 8, padding: 0, overflow: "hidden" }} data-alert-sugs>
                {tickerSugs.map((t, i) => (
                  <button key={t} type="button" style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 13px", textAlign: "left", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }} onClick={() => { setTicker(t); setTickerSugs([]); }}>
                    <i className="icon-search" style={{ fontSize: 13, color: "var(--icon-decor)", flex: "none" }} aria-hidden />
                    <span style={{ flex: 1, font: "600 12.5px/1 var(--font-mono)", color: "var(--text-1)" }}>{t}</span>
                  </button>
                ))}
              </div>
            )}
            {ticker.trim().length >= 4 && !tickerOk && detail !== null && tickerSugs.length === 0 && (
              <div className="field__help" style={{ marginTop: 6 }}>
                <i className="icon-circle-alert" aria-hidden />
                Ativo não encontrado na fonte — o alerta só pode ser criado para ativos que existem.
              </div>
            )}
          </div>
          <div className="field">
            <span className="field__label" style={{ display: "block" }}>Direção</span>
            <div className="segmented">
              <button type="button" className={`segmented__item${direction === "alta" ? " segmented__item--active" : ""}`} onClick={() => setDirection("alta")}>
                <i className="icon-arrow-up-right" aria-hidden />Acima de
              </button>
              <button type="button" className={`segmented__item${direction === "baixa" ? " segmented__item--active" : ""}`} onClick={() => setDirection("baixa")}>
                <i className="icon-arrow-down-right" aria-hidden />Abaixo de
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 10 }}>
            <div className="field">
              <label className="field__label" htmlFor="alerta-alvo" style={{ display: "block" }}>Preço-alvo</label>
              <div className="field__box">
                <span className="field__prefix">R$</span>
                <input id="alerta-alvo" className="field__input field__money" inputMode="decimal" value={target} onChange={(e) => { setTarget(maskMoneyBR(e.target.value)); if (e.target.value) setDayPct(""); }} />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="alerta-pct" style={{ display: "block" }}>ou variação</label>
              <div className="field__box">
                <input id="alerta-pct" className="field__input field__money" inputMode="decimal" value={dayPct} onChange={(e) => { setDayPct(e.target.value); if (e.target.value) setTarget(""); }} />
                <span className="field__prefix">%</span>
              </div>
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="alerta-cliente" style={{ display: "block" }}>Cliente vinculado · opcional</label>
            <div className="field__box">
              <select id="alerta-cliente" className="field__input" style={{ appearance: "none", width: "100%" }} value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.account_code} value={c.account_code}>{c.name ?? `Conta ${c.account_code}`}</option>
                ))}
              </select>
              <i className="icon-chevron-down field__caret" aria-hidden />
            </div>
          </div>
        </div>

        {valid && (
          <div className="alert-summary">
            <i className="icon-bell-ring" aria-hidden />
            <span className="alert-summary__text">
              Você recebe push quando <code>{ticker.toUpperCase()}</code> {direction === "alta" ? "passar de" : "cair abaixo de"}{" "}
              <strong style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                {target ? formatBRL(targetNum) : `${dayPct}% no dia`}
              </strong>
              . O alerta dispara uma vez e vai para o histórico.
            </span>
          </div>
        )}

        <div className="sheet__footer">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid} loading={saving} onClick={save}>{editing ? "Salvar alterações" : "Criar alerta"}</Button>
        </div>
    </Sheet>
  );
}

export default function Alerts() {
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const [tab, setTab] = useState<"ativos" | "historico">(params.get("aba") === "historico" ? "historico" : "ativos");
  const [sheet, setSheet] = useState(params.get("novo") !== null);
  const [editing, setEditing] = useState<AlertRow | undefined>(undefined);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());

  // busca rápida por ativo, com debounce, vale para as duas abas
  const [searchInput, setSearchInput] = useState(params.get("busca")?.toUpperCase() ?? "");
  const [search, setSearch] = useState(params.get("busca")?.toUpperCase() ?? "");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [dir, setDir] = useState<"todas" | "alta" | "baixa">("todas");
  const [vinculo, setVinculo] = useState<"todos" | "com" | "sem">("todos");
  const matches = (a: AlertRow) =>
    (dir === "todas" || a.direction === dir) &&
    (vinculo === "todos" || (vinculo === "com" ? !!a.account_code : !a.account_code));

  const activeList = useAlertList("ativo", search, profile?.id);
  const historyList = useAlertList("disparado", search, profile?.id);
  const active = activeList.items === null ? null : activeList.items.filter(matches);
  const triggered = historyList.items === null ? null : historyList.items.filter(matches);

  const activeSymbols = useMemo(() => [...new Set((active ?? []).map((a) => a.ticker))], [active]);
  useEffect(() => {
    if (activeSymbols.length === 0) return;
    workerFetch(`/api/quotes?symbols=${activeSymbols.join(",")}`)
      .then((body) => setQuotes(new Map(((body as { quotes: Quote[] }).quotes ?? []).map((q) => [q.symbol, q]))))
      .catch(() => {});
  }, [activeSymbols.join(",")]);

  const [cancelling, setCancelling] = useState<AlertRow | null>(null);
  const [viewing, setViewing] = useState<AlertRow | null>(null);
  const [removingHist, setRemovingHist] = useState<AlertRow | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState(false);
  useEffect(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, [tab]);
  const toggleSel = (id: string) =>
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  async function batchApply() {
    const ids = [...selectedIds];
    if (tab === "ativos") await supabase.from("alerts").update({ status: "cancelado" }).in("id", ids);
    else await supabase.from("alerts").delete().in("id", ids);
    setBatchConfirm(false);
    setSelecting(false);
    setSelectedIds(new Set());
    reloadAll();
  }
  async function deleteFromHistory(id: string) {
    await supabase.from("alerts").delete().eq("id", id);
    reloadAll();
  }
  async function cancel(id: string) {
    await supabase.from("alerts").update({ status: "cancelado" }).eq("id", id);
    await activeList.reload();
  }

  function reloadAll() {
    void activeList.reload();
    void historyList.reload();
  }

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Alertas</span>
        <Button icon="icon-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => { setEditing(undefined); setSheet(true); }}>
          Novo
        </Button>
      </header>
      <nav className="tabs-42" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "ativos"} className={`tab-42${tab === "ativos" ? " tab-42--active" : ""}`} onClick={() => setTab("ativos")}>
          Ativos{activeList.total !== null && activeList.total > 0 && <span className="tab-42__count">{activeList.total}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "historico"} className={`tab-42${tab === "historico" ? " tab-42--active" : ""}`} onClick={() => setTab("historico")}>
          Histórico
        </button>
      </nav>

      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="csearch__box" style={{ height: 48 }}>
          <i className="icon-search csearch__icon" aria-hidden style={{ fontSize: 18 }} />
          <input
            className="csearch__input"
            style={{ fontSize: 14 }}
            placeholder="Buscar alerta por ativo"
            aria-label="Buscar alerta por ativo"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" className="csearch__clear" aria-label="Limpar busca" onClick={() => setSearchInput("")}>
              <i className="icon-x" aria-hidden />
            </button>
          )}
        </div>

        <Filters
          label="Filtros de alertas"
          sections={[
            { key: "dir", label: "Direção", options: [{ value: "todas", label: "Todas" }, { value: "alta", label: "Alta" }, { value: "baixa", label: "Baixa" }] },
            { key: "vinculo", label: "Cliente", options: [{ value: "todos", label: "Todos" }, { value: "com", label: "Com cliente" }, { value: "sem", label: "Sem cliente" }] },
          ]}
          values={{ dir, vinculo }}
          onChange={(key, value) => {
            if (key === "dir") setDir(value as typeof dir);
            else setVinculo(value as typeof vinculo);
          }}
          onClear={() => { setDir("todas"); setVinculo("todos"); }}
        />

        {((tab === "ativos" && (active ?? []).length > 0) || (tab === "historico" && (triggered ?? []).length > 0)) && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { setSelecting((v) => !v); setSelectedIds(new Set()); }}
              style={{
                display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 13px", borderRadius: 10,
                background: selecting ? "var(--action)" : "var(--surface)",
                border: selecting ? "1px solid var(--action)" : "1px solid var(--border)",
                color: selecting ? "var(--on-action)" : "var(--text-1)",
                font: "600 12.5px/1 var(--font-sans)", boxShadow: "var(--elev-1)",
              }}
            >
              <i className={selecting ? "icon-x" : "icon-list-checks"} style={{ fontSize: 15 }} aria-hidden />
              {selecting ? "Sair da seleção" : "Selecionar"}
            </button>
          </div>
        )}

        {tab === "ativos" && (
          <>
            {active === null && <SkeletonAlertCards count={3} label="Carregando alertas ativos" />}
            {(active ?? []).map((a) => {
              const q = quotes.get(a.ticker);
              const info = progressInfo(a, q);
              const sel = selectedIds.has(a.id);
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                  {selecting && (
                    <button
                      type="button"
                      aria-label={`Selecionar alerta de ${a.ticker}`}
                      onClick={() => toggleSel(a.id)}
                      style={{ width: 34, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 999, border: sel ? "none" : "2px solid var(--border-strong)", background: sel ? "var(--action)" : "transparent", color: "var(--on-action)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {sel && <i className="icon-check" style={{ fontSize: 13 }} aria-hidden />}
                      </span>
                    </button>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Detalhes do alerta de ${a.ticker}`}
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    onClick={() => (selecting ? toggleSel(a.id) : setViewing(a))}
                    onKeyDown={(e) => e.key === "Enter" && (selecting ? toggleSel(a.id) : setViewing(a))}
                  >
                    <AlertCard
                      ticker={a.ticker}
                      direction={a.direction}
                      currentPrice={info.price}
                      dayChangePct={q?.changePct ?? 0}
                      targetPrice={a.target_price ?? 0}
                      progress={info.progress}
                      remainingPct={info.remainingPct}
                      footer={
                        <div className="alert-foot">
                          <span className="alert-foot__meta">
                            criado {formatDate(a.created_at).slice(0, 5)} · {a.client_name ? `vinculado a ${a.client_name}` : "sem cliente vinculado"}
                          </span>
                          <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
                        </div>
                      }
                    />
                  </div>
                </div>
              );
            })}
            <InfiniteSentinel hasMore={activeList.hasMore} loading={activeList.loadingMore} onMore={activeList.loadMore} />
            {active !== null && active.length === 0 && (
              <div className="empty-state" style={{ borderRadius: 14 }}>
                <span className="empty-state__icon"><i className="icon-target" aria-hidden /></span>
                <span className="empty-state__title">{search ? "Nenhum alerta encontrado" : "Nenhum alerta ativo"}</span>
                <span className="empty-state__desc">
                  {search ? `Nenhum alerta ativo corresponde a "${search.trim().toUpperCase()}".` : "Crie um alerta de preço e receba push quando o alvo for atingido."}
                </span>
                {!search && (
                  <span className="empty-state__action">
                    <Button icon="icon-plus" onClick={() => { setEditing(undefined); setSheet(true); }}>Criar alerta</Button>
                  </span>
                )}
              </div>
            )}
            {active !== null && active.length > 0 && !activeList.hasMore && (
              <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "2px 2px 14px" }}>
                Alerta disparado sai da lista de ativos e vira registro no histórico, com o horário exato do disparo.
              </div>
            )}
          </>
        )}

        {tab === "historico" && (
          <>
            {triggered === null && <SkeletonCardRows rows={4} height={64} label="Carregando histórico de alertas" trailing={64} />}
            {triggered !== null && triggered.length === 0 && (
              <div className="empty-state" style={{ borderRadius: 14 }}>
                <span className="empty-state__icon"><i className="icon-history" aria-hidden /></span>
                <span className="empty-state__title">{search ? "Nenhum alerta encontrado" : "Histórico vazio"}</span>
                <span className="empty-state__desc">
                  {search ? `Nenhum disparo corresponde a "${search.trim().toUpperCase()}".` : "Alertas disparados aparecem aqui com o horário exato do disparo."}
                </span>
              </div>
            )}
            {(triggered ?? []).map((t) => {
              const sel = selectedIds.has(t.id);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                  {selecting && (
                    <button
                      type="button"
                      aria-label={`Selecionar disparo de ${t.ticker}`}
                      onClick={() => toggleSel(t.id)}
                      style={{ width: 34, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 999, border: sel ? "none" : "2px solid var(--border-strong)", background: sel ? "var(--action)" : "transparent", color: "var(--on-action)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {sel && <i className="icon-check" style={{ fontSize: 13 }} aria-hidden />}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="card triggered-row"
                    style={{ opacity: 1, flex: 1, minWidth: 0, textAlign: "left" }}
                    aria-label={`Detalhes do disparo de ${t.ticker}`}
                    onClick={() => (selecting ? toggleSel(t.id) : setViewing(t))}
                  >
                    <span className="triggered-row__icon"><i className="icon-check" aria-hidden /></span>
                    <span style={{ flex: 1 }}>
                      <span className="triggered-row__title">
                        {t.ticker} atingiu {t.target_price !== null ? formatBRL(t.target_price) : `${t.target_day_pct}%`}
                      </span>
                      <span className="triggered-row__meta">disparado {t.triggered_at ? formatDateAtTime(t.triggered_at) : ""}</span>
                    </span>
                    <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)", flex: "none" }} aria-hidden />
                  </button>
                </div>
              );
            })}
            <InfiniteSentinel hasMore={historyList.hasMore} loading={historyList.loadingMore} onMore={historyList.loadMore} />
          </>
        )}
      </div>

      {sheet && (
        <AlertSheet
          initialTicker={params.get("ativo") ?? ""}
          initialClient={params.get("cliente") ?? ""}
          editing={editing}
          onClose={() => { setSheet(false); setEditing(undefined); }}
          onSaved={reloadAll}
        />
      )}

      {viewing && (
        <DetailSheet
          label="Detalhes do alerta"
          icon="icon-radar"
          title={viewing.ticker}
          chip={viewing.status === "ativo" ? "Ativo" : "Disparado"}
          chipKind={viewing.status === "ativo" ? "success" : "neutral"}
          rows={[
            { icon: viewing.direction === "alta" ? "icon-arrow-up-right" : "icon-arrow-down-right", label: "Direção", value: viewing.direction === "alta" ? "Alvo de alta" : "Alvo de baixa" },
            { icon: "icon-target", label: "Alvo", value: viewing.target_price !== null ? formatBRL(viewing.target_price) : `${viewing.target_day_pct}% no dia` },
            { icon: "icon-calendar", label: "Criado", value: formatDate(viewing.created_at) },
            { icon: "icon-user", label: "Cliente", value: viewing.client_name ?? "sem vínculo" },
            ...(viewing.status === "disparado" && viewing.triggered_at ? [
              { icon: "icon-bell-ring", label: "Disparado", value: formatDateAtTime(viewing.triggered_at) },
              { icon: "icon-banknote", label: "Preço no disparo", value: viewing.triggered_price !== null ? formatBRL(viewing.triggered_price) : "—" },
            ] : []),
          ]}
          actions={viewing.status === "ativo" ? [
            { icon: "icon-pencil", label: "Editar", onClick: () => { setEditing(viewing); setSheet(true); setViewing(null); } },
            { icon: "icon-ban", label: "Cancelar alerta", danger: true, onClick: () => { setCancelling(viewing); setViewing(null); } },
          ] : [
            { icon: "icon-trash", label: "Apagar do histórico", danger: true, onClick: () => { setRemovingHist(viewing); setViewing(null); } },
          ]}
          onClose={() => setViewing(null)}
        />
      )}

      {removingHist && (
        <Sheet label="Apagar do histórico" onClose={() => setRemovingHist(null)}>
          <div className="sheet__title">Apagar este registro?</div>
          <div style={{ marginTop: 8, font: "400 12.5px/1.55 var(--font-sans)", color: "var(--text-2)" }}>
            O disparo de <strong style={{ font: "600 12.5px var(--font-mono)", color: "var(--text-1)" }}>{removingHist.ticker}</strong> sai do histórico de vez.
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setRemovingHist(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { await deleteFromHistory(removingHist.id); setRemovingHist(null); }}>
              Apagar
            </Button>
          </div>
        </Sheet>
      )}

      {selecting && selectedIds.size > 0 && (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: 96, zIndex: 60, maxWidth: 488, margin: "0 auto" }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 14px", boxShadow: "var(--elev-2)" }}>
            <span style={{ flex: 1, font: "600 12.5px/1.35 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>
              {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button variant="destructive" style={{ height: 44, fontSize: 12.5 }} onClick={() => setBatchConfirm(true)}>
              {tab === "ativos" ? "Cancelar alertas" : "Apagar do histórico"}
            </Button>
          </div>
        </div>
      )}

      {batchConfirm && (
        <Sheet label={tab === "ativos" ? "Cancelar alertas" : "Apagar do histórico"} onClose={() => setBatchConfirm(false)}>
          <div className="sheet__title">{tab === "ativos" ? `Cancelar ${selectedIds.size} alerta${selectedIds.size > 1 ? "s" : ""}?` : `Apagar ${selectedIds.size} registro${selectedIds.size > 1 ? "s" : ""}?`}</div>
          <div style={{ marginTop: 8, font: "400 12.5px/1.55 var(--font-sans)", color: "var(--text-2)" }}>
            {tab === "ativos" ? "Os alertas selecionados saem dos ativos e não disparam mais." : "Os registros selecionados saem do histórico de vez."}
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setBatchConfirm(false)}>Voltar</Button>
            <Button variant="destructive" onClick={batchApply}>{tab === "ativos" ? "Cancelar alertas" : "Apagar"}</Button>
          </div>
        </Sheet>
      )}

      {cancelling && (
        <Sheet label="Cancelar alerta" onClose={() => setCancelling(null)}>
          <div className="sheet__title">Cancelar este alerta?</div>
          <div style={{ marginTop: 8, font: "400 12.5px/1.55 var(--font-sans)", color: "var(--text-2)" }}>
            O alerta de <strong style={{ font: "600 12.5px var(--font-mono)", color: "var(--text-1)" }}>{cancelling.ticker}</strong>
            {cancelling.target_price !== null ? ` em ${formatBRL(cancelling.target_price)}` : cancelling.target_day_pct !== null ? ` em ${cancelling.target_day_pct}% no dia` : ""} sai dos ativos e não dispara mais.
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setCancelling(null)}>Voltar</Button>
            <Button variant="destructive" onClick={async () => { await cancel(cancelling.id); setCancelling(null); }}>
              Cancelar alerta
            </Button>
          </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
