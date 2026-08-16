/**
 * Tela 12 · Central de alertas — quadros "12 Alertas claro" e "12 Novo alerta escuro" (#3e).
 * Alertas de preço com direção, progresso até o alvo, histórico e sheet de criação/edição.
 * Listas paginadas com rolagem infinita (components/infinite) e busca rápida por ativo.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { Button } from "../components/Button";
import { AlertCard } from "../components/cards";
import { usePagedList, InfiniteSentinel } from "../components/infinite";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useQuoteDetail, formatQuotePrice, type Quote } from "../lib/quotes";
import { workerFetch } from "../lib/auth";
import { formatBRL, formatDate, formatDateAtTime } from "../lib/format";

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

function useAlertList(status: "ativo" | "disparado", search: string) {
  return usePagedList<AlertRow>(
    async (from, to) => {
      let q = supabase.from("alerts").select("*, clients(name)", { count: "exact" }).eq("status", status);
      if (search.trim()) q = q.ilike("ticker", `%${search.trim()}%`);
      q = status === "ativo" ? q.order("created_at", { ascending: false }) : q.order("triggered_at", { ascending: false, nullsFirst: false });
      const { data, count } = await q.range(from, to);
      return { rows: mapRows(data), total: count };
    },
    [status, search]
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

function moneyText(n: number | null): string {
  return n === null ? "" : n.toFixed(2).replace(".", ",");
}

function AlertSheet({ initialTicker, initialClient = "", editing, onClose, onSaved }: { initialTicker: string; initialClient?: string; editing?: AlertRow; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [ticker, setTicker] = useState(editing?.ticker ?? initialTicker);
  const [direction, setDirection] = useState<"alta" | "baixa">(editing?.direction ?? "alta");
  const [target, setTarget] = useState(editing ? moneyText(editing.target_price) : "");
  const [dayPct, setDayPct] = useState(editing?.target_day_pct != null ? String(editing.target_day_pct).replace(".", ",") : "");
  const [client, setClient] = useState<string>(editing?.account_code ?? initialClient);
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const detail = useQuoteDetail(ticker.length >= 4 ? ticker.toUpperCase() : null);

  useEffect(() => {
    supabase
      .from("client_overview")
      .select("account_code, name")
      .order("patrimony", { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => setClients(data ?? []));
  }, []);

  const targetNum = Number(target.replace(/\./g, "").replace(",", "."));
  const dayPctNum = Number(dayPct.replace(",", "."));
  const valid = ticker.trim().length >= 4 && ((target && targetNum > 0) || (dayPct && dayPctNum > 0));

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
      onSaved();
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
              {detail?.quote && <span style={{ font: "400 11.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{formatQuotePrice(detail.quote)} agora</span>}
            </div>
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
                <input id="alerta-alvo" className="field__input field__money" inputMode="decimal" autoFocus={!editing} value={target} onChange={(e) => { setTarget(e.target.value); if (e.target.value) setDayPct(""); }} />
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
  const [tab, setTab] = useState<"ativos" | "historico">("ativos");
  const [sheet, setSheet] = useState(params.get("novo") !== null);
  const [editing, setEditing] = useState<AlertRow | undefined>(undefined);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());

  // busca rápida por ativo, com debounce, vale para as duas abas
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activeList = useAlertList("ativo", search);
  const historyList = useAlertList("disparado", search);
  const active = activeList.items;
  const triggered = historyList.items;

  const activeSymbols = useMemo(() => [...new Set((active ?? []).map((a) => a.ticker))], [active]);
  useEffect(() => {
    if (activeSymbols.length === 0) return;
    workerFetch(`/api/quotes?symbols=${activeSymbols.join(",")}`)
      .then((body) => setQuotes(new Map(((body as { quotes: Quote[] }).quotes ?? []).map((q) => [q.symbol, q]))))
      .catch(() => {});
  }, [activeSymbols.join(",")]);

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

        {tab === "ativos" && (
          <>
            {active === null && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}
            {(active ?? []).map((a) => {
              const q = quotes.get(a.ticker);
              const info = progressInfo(a, q);
              return (
                <AlertCard
                  key={a.id}
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
                      <span className="alert-foot__actions">
                        <button type="button" className="alert-foot__btn" aria-label={`Editar alerta de ${a.ticker}`} onClick={() => { setEditing(a); setSheet(true); }}>
                          <i className="icon-pencil" aria-hidden />
                        </button>
                        <button type="button" className="alert-foot__btn alert-foot__btn--danger" aria-label={`Cancelar alerta de ${a.ticker}`} onClick={() => cancel(a.id)}>
                          <i className="icon-ban" aria-hidden />
                        </button>
                      </span>
                    </div>
                  }
                />
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
            {triggered === null && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}
            {triggered !== null && triggered.length === 0 && (
              <div className="empty-state" style={{ borderRadius: 14 }}>
                <span className="empty-state__icon"><i className="icon-history" aria-hidden /></span>
                <span className="empty-state__title">{search ? "Nenhum alerta encontrado" : "Histórico vazio"}</span>
                <span className="empty-state__desc">
                  {search ? `Nenhum disparo corresponde a "${search.trim().toUpperCase()}".` : "Alertas disparados aparecem aqui com o horário exato do disparo."}
                </span>
              </div>
            )}
            {(triggered ?? []).map((t) => (
              <div key={t.id} className="card triggered-row" style={{ opacity: 1 }}>
                <span className="triggered-row__icon"><i className="icon-check" aria-hidden /></span>
                <span style={{ flex: 1 }}>
                  <span className="triggered-row__title">
                    {t.ticker} atingiu {t.target_price !== null ? formatBRL(t.target_price) : `${t.target_day_pct}%`}
                  </span>
                  <span className="triggered-row__meta">disparado {t.triggered_at ? formatDateAtTime(t.triggered_at) : ""}</span>
                </span>
              </div>
            ))}
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
    </MobileShell>
  );
}
