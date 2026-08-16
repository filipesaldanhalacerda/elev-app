/**
 * Tela 11 · Cotações — quadros "11 Cotacoes claro" e "11 Cotacoes escuro resultado" (#3e).
 * Tempo quase real; flash único de 400ms; favoritos por assessor; busca por ticker;
 * "quem tem este ativo" restrito à carteira (RLS).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Card } from "../components/cards";
import { LineChart, Sparkline } from "../components/charts";
import { MarketChip, Banner } from "../components/feedback";
import { Button } from "../components/Button";
import { Avatar } from "../components/Avatar";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import {
  useQuotes, useQuoteDetail, pushRecent, getRecents, isFuture, formatQuotePrice, formatQuoteChange, type Quote,
} from "../lib/quotes";
import { fakeSeriesLocal } from "../lib/sparkSeries";
import { formatBRL, formatTimeSeconds } from "../lib/format";

const DEFAULT_FAVORITES = ["WDOU26", "DI1F27", "PETR4", "VALE3"];

function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<string[] | null>(null);
  const load = async () => {
    if (!userId) return;
    const { data } = await supabase.from("quote_favorites").select("ticker").order("sort_order");
    setFavorites((data ?? []).map((r) => r.ticker));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return {
    favorites: favorites === null ? null : favorites.length > 0 ? favorites : DEFAULT_FAVORITES,
    isPinned: (t: string) => (favorites ?? []).includes(t),
    toggle: async (ticker: string) => {
      if (!userId) return;
      if ((favorites ?? []).includes(ticker)) await supabase.from("quote_favorites").delete().eq("ticker", ticker);
      else await supabase.from("quote_favorites").insert({ user_id: userId, ticker, sort_order: (favorites?.length ?? 0) + 1 });
      await load();
    },
  };
}

function Holders({ ticker }: { ticker: string }) {
  const [rows, setRows] = useState<{ account_code: string; name: string | null; value: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      // RLS: só posições da carteira do assessor voltam
      const { data } = await supabase
        .from("positions")
        .select("account_code, value, ref_date, clients!positions_account_code_fkey(name)")
        .ilike("asset", ticker)
        .order("ref_date", { ascending: false })
        .limit(20);
      if (!alive) return;
      const seen = new Map<string, { account_code: string; name: string | null; value: number }>();
      for (const r of data ?? []) {
        if (!seen.has(r.account_code)) {
          const client = (r as { clients?: { name?: string } | { name?: string }[] }).clients;
          const name = Array.isArray(client) ? client[0]?.name : client?.name;
          seen.set(r.account_code, { account_code: r.account_code, name: name ?? null, value: r.value });
        }
      }
      setRows([...seen.values()]);
    })();
    return () => {
      alive = false;
    };
  }, [ticker]);

  return (
    <Card style={{ padding: 14 }}>
      <div style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Quem tem este ativo</div>
      {rows === null ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 8, marginTop: 12 }} />
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 12, font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
          Nenhum cliente da sua carteira tem este ativo.
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.account_code} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Avatar name={r.name ?? "?"} size={26} />
              <span style={{ flex: 1, font: "500 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>{r.name ?? `Conta ${r.account_code}`}</span>
              <span style={{ font: "600 12.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>{formatBRL(r.value)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, font: "400 10.5px/1.5 var(--font-sans)", color: "var(--text-3)" }}>Só aparecem clientes da sua carteira.</div>
    </Card>
  );
}

const PERIODS = ["1D", "5D", "1M", "6M", "12M"] as const;

export default function Quotes() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("1D");
  const { favorites, isPinned, toggle } = useFavorites(profile?.id);
  const recents = getRecents();

  const listSymbols = useMemo(() => ["IBOV", ...(favorites ?? []), ...recents], [favorites, recents]);
  const { data, flashes } = useQuotes(listSymbols);
  const detail = useQuoteDetail(selected);

  const byTicker = useMemo(() => new Map((data?.quotes ?? []).map((q) => [q.symbol, q])), [data]);
  const ibov = byTicker.get("IBOV");
  const lastAt = data?.quotes[0]?.at;

  function submitSearch() {
    const t = search.trim().toUpperCase();
    if (!t) return;
    setSelected(t);
    pushRecent(t);
  }

  const favQuotes = (favorites ?? []).map((t) => byTicker.get(t)).filter(Boolean) as Quote[];
  const futures = favQuotes.filter((q) => isFuture(q.symbol));
  const stocks = favQuotes.filter((q) => !isFuture(q.symbol));

  const flashClass = (symbol: string) => {
    const f = flashes.get(symbol);
    return f ? (f === "up" ? " flash-up" : " flash-down") : "";
  };

  return (
    <MobileShell active="cotacoes">
      <header className="page-header">
        <span>
          <span className="page-header__title">Cotações</span>
          {data?.paused ? (
            <span className="quotes-live" data-live="paused">atualizado {data.last_quote_at ? formatTimeSeconds(data.last_quote_at) : "—"}</span>
          ) : (
            <span className="quotes-live" data-live="on">
              <span className="quotes-live__dot" aria-hidden />
              ao vivo · {lastAt ? formatTimeSeconds(lastAt) : "—"}
            </span>
          )}
        </span>
        <button type="button" className="page-header__action" aria-label="Atualizar" onClick={() => window.location.reload()}>
          <i className="icon-rotate-cw" aria-hidden />
        </button>
      </header>

      <div style={{ padding: "6px 16px 12px" }}>
        <div className="csearch quotes-search">
          <div className="csearch__box">
            <i className="icon-search csearch__icon" aria-hidden />
            <input
              className="csearch__input"
              type="search"
              placeholder="PETR4, WDOU26, IBOV…"
              value={search}
              aria-label="Buscar ativo"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            />
            {search && (
              <button
                type="button"
                className="csearch__clear"
                aria-label="Limpar busca"
                onClick={() => {
                  setSearch("");
                  setSelected(null);
                }}
              >
                <i className="icon-x" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      {data?.paused && (
        <div style={{ padding: "0 16px 12px" }}>
          <Banner kind="warning">
            Cotações pausadas — mostrando preços de {data.last_quote_at ? formatTimeSeconds(data.last_quote_at).slice(0, 5) : "—"}.
          </Banner>
        </div>
      )}

      {selected ? (
        // -------- resultado da busca (quadro escuro) --------
        <div style={{ flex: 1, padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {detail === null ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
          ) : detail.paused || !detail.quote ? (
            <Banner kind="warning">Cotações pausadas — não foi possível buscar {selected}.</Banner>
          ) : (
            <>
              <div className="quote-hero">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    <span className="quote-detail__ticker">{detail.quote.symbol}</span>
                    <span className="quote-detail__name">{detail.quote.name} · B3</span>
                  </span>
                  <MarketChip up={detail.quote.changePct >= 0}>{formatQuoteChange(detail.quote)}</MarketChip>
                </div>
                <div className="quote-detail__price-row">
                  <span className={`quote-detail__price${flashClass(detail.quote.symbol)}`}>
                    {detail.quote.unit === "preco" && detail.quote.price < 1000 ? formatBRL(detail.quote.price) : formatQuotePrice(detail.quote)}
                  </span>
                  <span className="quote-detail__at">às {formatTimeSeconds(detail.quote.at)}</span>
                </div>
                {detail.series && (
                  <div style={{ marginTop: 16 }}>
                    <LineChart
                      points={detail.series}
                      height={88}
                      stroke={`var(--market-${detail.quote.changePct >= 0 ? "up" : "down"})`}
                      dashedAt={(detail.quote.open - Math.min(...detail.series)) / (Math.max(...detail.series) - Math.min(...detail.series) || 1)}
                    />
                  </div>
                )}
                <div className="quote-hero__axis">
                  <span>abertura {detail.quote.open.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  <span>agora {formatQuotePrice(detail.quote)}</span>
                </div>
                <div className="quote-periods">
                  {PERIODS.map((p) => (
                    <button key={p} type="button" className={`quote-period${period === p ? " quote-period--active" : ""}`} onClick={() => setPeriod(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="quote-facts">
                  {([["Abertura", detail.quote.open], ["Máxima", detail.quote.high], ["Mínima", detail.quote.low], ["Fech. ant.", detail.quote.prevClose]] as const).map(([label, v]) => (
                    <span key={label} className="quote-facts__cell">
                      <span className="quote-facts__label">{label}</span>
                      <span className="quote-facts__value">{v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="quote-actions">
                <Button icon="icon-target" onClick={() => navigate(`/alertas?novo&ativo=${detail.quote!.symbol}`)}>Criar alerta</Button>
                <Button variant="secondary" icon="icon-pin" onClick={() => toggle(detail.quote!.symbol)}>
                  {isPinned(detail.quote.symbol) ? "Desafixar" : "Fixar"}
                </Button>
              </div>

              <Holders ticker={detail.quote.symbol} />
            </>
          )}
          <div style={{ height: 8 }} />
        </div>
      ) : (
        // -------- estado padrão (quadro claro) --------
        <>
          {ibov && (
            <div className="quote-hero" style={{ padding: "2px 18px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <span>
                  <span className="quote-hero__label">IBOV · IBOVESPA</span>
                  <span className={`quote-hero__value${flashClass("IBOV")}`}>{formatQuotePrice(ibov)}</span>
                </span>
                <MarketChip up={ibov.changePct >= 0}>{formatQuoteChange(ibov)}</MarketChip>
              </div>
              <div style={{ marginTop: 12 }}>
                <LineChart
                  points={fakeSeriesLocal("IBOV")}
                  height={60}
                  stroke={`var(--market-${ibov.changePct >= 0 ? "up" : "down"})`}
                  dashedAt={0.3}
                />
              </div>
              <div className="quote-hero__axis">
                <span>abertura {ibov.open.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                <span>máx {ibov.high.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}

          <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}>Favoritos</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, font: "500 12px/1 var(--font-sans)", color: "var(--ghost-text)" }}>
                  <i className="icon-sliders-horizontal" style={{ fontSize: 14 }} aria-hidden />
                  Editar
                </span>
              </div>
              <div className="client-list">
                {futures.length > 0 && <div className="fav-section">Futuros</div>}
                {futures.map((q) => (
                  <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                ))}
                {stocks.length > 0 && <div className="fav-section" style={{ borderTop: futures.length ? "1px solid var(--border)" : undefined }}>Ações</div>}
                {stocks.map((q) => (
                  <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                ))}
                {favQuotes.length === 0 && (
                  <div style={{ padding: "20px 14px", font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
                    {data?.paused ? "Sem cotações agora." : "Busque um ativo e toque em Fixar para acompanhar aqui."}
                  </div>
                )}
              </div>
            </div>

            {recents.length > 0 && (
              <div>
                <div style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)", marginBottom: 10 }}>
                  Buscados recentemente
                </div>
                <div className="client-list">
                  {recents.map((t) => {
                    const q = byTicker.get(t);
                    return (
                      <button key={t} type="button" className="recent-row" onClick={() => { setSelected(t); setSearch(t); }}>
                        <span className="recent-row__ticker">{t}</span>
                        {q && <span className={`recent-row__price${flashClass(t)}`}>{formatQuotePrice(q)}</span>}
                        {q && <span className={`recent-row__pct ${q.changePct >= 0 ? "market-up" : "market-down"}`}>{formatQuoteChange(q)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
              Preço que muda pisca uma vez em verde ou vermelho a 20% e volta ao neutro em 400ms.
            </div>
          </div>
        </>
      )}
    </MobileShell>
  );
}

function FavRow({ quote, flash, onOpen }: { quote: Quote; flash: string; onOpen: () => void }) {
  return (
    <button type="button" className="fav-row" onClick={onOpen}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="fav-row__ticker">{quote.symbol}</span>
        <span className="fav-row__name">{quote.name}</span>
      </span>
      <Sparkline points={fakeSeriesLocal(quote.symbol, 9)} up={quote.changePct >= 0} />
      <span className="fav-row__right">
        <span className={`fav-row__price${flash}`}>{formatQuotePrice(quote)}</span>
        <span className={`fav-row__pct ${quote.changePct >= 0 ? "market-up" : "market-down"}`}>{formatQuoteChange(quote)}</span>
      </span>
    </button>
  );
}
