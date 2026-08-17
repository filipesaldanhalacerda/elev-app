/**
 * Tela 11 · Cotações — quadros "11 Cotacoes claro" e "11 Cotacoes escuro resultado" (#3e).
 * Tempo quase real; flash único de 400ms; favoritos por assessor; busca por ticker;
 * "quem tem este ativo" restrito à carteira (RLS).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Card } from "../components/cards";
import { LineChart, Sparkline } from "../components/charts";
import { MarketChip, Banner } from "../components/feedback";
import { Button } from "../components/Button";
import { Avatar } from "../components/Avatar";
import { supabase } from "../lib/supabase";
import { useAuth, workerFetch } from "../lib/auth";
import {
  useQuotes, useQuoteDetail, pushRecent, getRecents, clearRecents, isFuture, formatQuotePrice, formatQuoteChange, type Quote,
} from "../lib/quotes";
import { QuoteSource } from "../components/QuoteSource";
import { formatBRL, formatTimeSeconds } from "../lib/format";

const DEFAULT_FAVORITES = ["DOLAR", "PETR4", "VALE3", "ITUB4"];

function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<string[] | null>(null);
  const [customized, setCustomized] = useState(false);
  const load = async () => {
    if (!userId) return;
    const [{ data }, { data: prof }] = await Promise.all([
      supabase.from("quote_favorites").select("ticker").order("sort_order"),
      supabase.from("profiles").select("quotes_customized").eq("id", userId).single(),
    ]);
    // dedupe defensivo (limpa restos de versões antigas)
    setFavorites([...new Set((data ?? []).map((r) => r.ticker))]);
    setCustomized(!!prof?.quotes_customized);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // lista EFETIVA: o que o usuário vê — padrões só enquanto ele NUNCA personalizou
  const effective = favorites === null ? null : favorites.length > 0 ? favorites : customized ? [] : DEFAULT_FAVORITES;
  return {
    favorites: effective,
    isPinned: (t: string) => (effective ?? []).includes(t),
    toggle: async (ticker: string) => {
      if (!userId || effective === null) return;
      // reescreve a lista inteira: simples, idempotente e imune a duplicatas
      const next = effective.includes(ticker) ? effective.filter((t) => t !== ticker) : [...effective, ticker];
      setFavorites(next); // otimista — a tela responde na hora
      setCustomized(true);
      await supabase.from("quote_favorites").delete().eq("user_id", userId);
      if (next.length > 0) {
        await supabase.from("quote_favorites").insert(next.map((t, i) => ({ user_id: userId, ticker: t, sort_order: i + 1 })));
      }
      await supabase.from("profiles").update({ quotes_customized: true }).eq("id", userId);
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
  const [params] = useSearchParams();
  const { profile } = useAuth();
  // vindo da home com ?ativo=X, o detalhe já abre no ativo tocado
  const initialAtivo = params.get("ativo")?.toUpperCase() ?? null;
  const [search, setSearch] = useState(initialAtivo ?? "");
  const [selected, setSelected] = useState<string | null>(initialAtivo);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("1D");
  const [editingFavs, setEditingFavs] = useState(false);
  const { favorites, isPinned, toggle } = useFavorites(profile?.id);
  const [, recentsBump] = useState(0);
  const recents = getRecents(); // relido a cada render — pushRecent reflete na hora
  // busca enquanto digita: sugestões da fonte com debounce
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    const term = search.trim().toUpperCase();
    if (term.length < 2 || term === selected) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const body = (await workerFetch(`/api/quotes/search?q=${encodeURIComponent(term)}`)) as { tickers: string[] };
        if (alive) setSuggestions(body.tickers ?? []);
      } catch {
        if (alive) setSuggestions([]);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, selected]);

  function openSymbol(t: string) {
    setSelected(t);
    setSearch(t);
    setSuggestions([]);
    pushRecent(t);
  }

  const listSymbols = useMemo(() => ["IBOV", ...(favorites ?? []), ...recents], [favorites, recents]);
  const { data, flashes } = useQuotes(listSymbols);
  const detail = useQuoteDetail(selected);

  const byTicker = useMemo(() => new Map((data?.quotes ?? []).map((q) => [q.symbol, q])), [data]);
  const ibov = byTicker.get("IBOV");
  const lastAt = data?.quotes[0]?.at;

  function submitSearch() {
    const t = search.trim().toUpperCase();
    if (!t) return;
    openSymbol(suggestions.length > 0 && !suggestions.includes(t) ? suggestions[0] : t);
  }

  const favQuotes = (favorites ?? []).map((t) => byTicker.get(t)).filter(Boolean) as Quote[];
  const currencies = favQuotes.filter((q) => q.symbol === "DOLAR");
  const futures = favQuotes.filter((q) => q.symbol !== "DOLAR" && isFuture(q.symbol));
  const stocks = favQuotes.filter((q) => q.symbol !== "DOLAR" && !isFuture(q.symbol));

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
      </header>

      <div style={{ padding: "6px 16px 12px" }}>
        <div className="csearch quotes-search">
          <div className="csearch__box">
            <i className="icon-search csearch__icon" aria-hidden />
            <input
              className="csearch__input"
              type="search"
              placeholder="PETR4, VALE3, DOLAR…"
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
          {suggestions.length > 0 && (
            <div className="csearch__results" data-quote-suggestions>
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", textAlign: "left", borderTop: t !== suggestions[0] ? "1px solid var(--divider)" : undefined }}
                  onClick={() => openSymbol(t)}
                >
                  <i className="icon-search" style={{ fontSize: 14, color: "var(--icon-decor)", flex: "none" }} aria-hidden />
                  <span style={{ flex: 1, font: "600 13px/1 var(--font-mono)", color: "var(--text-1)" }}>{t}</span>
                  <i className="icon-chevron-right" style={{ fontSize: 15, color: "var(--icon-decor)" }} aria-hidden />
                </button>
              ))}
            </div>
          )}
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
          ) : detail.unavailable ? (
            <Banner kind="warning">Não encontramos {selected} na fonte de dados atual. Confira o código do ativo — derivativos (WDO, WIN, DI) entram quando houver provedor contratado.</Banner>
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
                {detail.series && detail.series.length >= 8 && (
                  <div style={{ marginTop: 16 }}>
                    <LineChart
                      points={detail.series}
                      height={88}
                      stroke={`var(--market-${detail.quote.changePct >= 0 ? "up" : "down"})`}
                      dashedAt={(detail.quote.prevClose - Math.min(...detail.series)) / (Math.max(...detail.series) - Math.min(...detail.series) || 1)}
                    />
                  </div>
                )}
                {detail.source === "brapi" ? (
                  <div className="quote-hero__axis">
                    <span>um mês atrás {detail.series?.[0]?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>
                    <span>agora {formatQuotePrice(detail.quote)}</span>
                  </div>
                ) : (
                  <div className="quote-hero__axis">
                    <span>abertura {detail.quote.open.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span>agora {formatQuotePrice(detail.quote)}</span>
                  </div>
                )}
                {detail.source === "brapi" ? (
                  <div style={{ marginTop: 10, font: "400 10.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>
                    fechamentos diários do último mês · intraday disponível no plano pago da fonte
                  </div>
                ) : (
                  <div className="quote-periods">
                    {PERIODS.map((p) => (
                      <button key={p} type="button" className={`quote-period${period === p ? " quote-period--active" : ""}`} onClick={() => setPeriod(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
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
                {detail.quote.symbol !== "IBOV" && (
                  <Button variant="secondary" icon="icon-pin" onClick={() => toggle(detail.quote!.symbol)}>
                    {isPinned(detail.quote.symbol) ? "Desafixar" : "Fixar"}
                  </Button>
                )}
              </div>
              <div style={{ marginTop: 8, font: "400 11px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
                {detail.quote.symbol === "IBOV"
                  ? "O IBOV é o índice de referência — está sempre presente nas Cotações e na home."
                  : "Ativos fixados ficam na sua lista de Cotações e aparecem no bloco Cotações da home (os 4 primeiros)."}
              </div>

              <Holders ticker={detail.quote.symbol} />
              <QuoteSource quotes={detail.quote ? [detail.quote] : []} source={data?.source} />
            </>
          )}
          <div style={{ height: 8 }} />
        </div>
      ) : (
        // -------- estado padrão (quadro claro) --------
        <>
          <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}>Fixados</span>
                {favQuotes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditingFavs((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 13px", borderRadius: 10,
                      background: editingFavs ? "var(--action)" : "var(--surface)",
                      border: editingFavs ? "1px solid var(--action)" : "1px solid var(--border)",
                      color: editingFavs ? "var(--on-action)" : "var(--text-1)",
                      font: "600 12.5px/1 var(--font-sans)", boxShadow: "var(--elev-1)",
                    }}
                  >
                    <i className={editingFavs ? "icon-check" : "icon-list-checks"} style={{ fontSize: 15 }} aria-hidden />
                    {editingFavs ? "Concluir" : "Editar lista"}
                  </button>
                )}
              </div>
              {editingFavs && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 10, borderRadius: 10, background: "var(--brand-tint)", font: "400 12px/1.45 var(--font-sans)", color: "var(--ghost-text)" }}>
                  <i className="icon-pin-off" style={{ fontSize: 15, flex: "none" }} aria-hidden />
                  Toque em “Desafixar” para tirar o ativo da sua lista e da home.
                </div>
              )}
              <div className="client-list" data-fixados>
                {ibov && <div className="fav-section">Índice</div>}
                {ibov && (
                  <FavRow quote={ibov} flash={flashClass("IBOV")} onOpen={() => { setSelected("IBOV"); setSearch("IBOV"); pushRecent("IBOV"); }} />
                )}
                {currencies.length > 0 && <div className="fav-section" style={{ borderTop: ibov ? "1px solid var(--border)" : undefined }}>Moeda</div>}
                {currencies.map((q) => (
                  <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} editing={editingFavs} onRemove={() => void toggle(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                ))}
                {futures.length > 0 && <div className="fav-section" style={{ borderTop: "1px solid var(--border)" }}>Futuros</div>}
                {futures.map((q) => (
                  <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} editing={editingFavs} onRemove={() => void toggle(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                ))}
                {stocks.length > 0 && <div className="fav-section" style={{ borderTop: futures.length ? "1px solid var(--border)" : undefined }}>Ações</div>}
                {stocks.map((q) => (
                  <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} editing={editingFavs} onRemove={() => void toggle(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                ))}
                {favQuotes.length === 0 && (
                  <div style={{ padding: "20px 14px", font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
                    {data?.paused ? "Sem cotações agora." : "Busque um ativo e toque em Fixar para acompanhar aqui."}
                  </div>
                )}
              </div>
            </div>

            {(() => {
              // sem duplicar o que já está fixado (nem o IBOV, sempre presente)
              const recentQuotes = recents.filter((t) => t !== "IBOV" && !(favorites ?? []).includes(t)).map((t) => byTicker.get(t)).filter(Boolean) as Quote[];
              if (recentQuotes.length === 0) return null;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}>Buscados recentemente</span>
                    <button
                      type="button"
                      onClick={() => { clearRecents(); recentsBump((n) => n + 1); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, height: 40, padding: "0 10px", marginRight: -10, borderRadius: 10, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)" }}
                    >
                      <i className="icon-eraser" style={{ fontSize: 14 }} aria-hidden />
                      Limpar
                    </button>
                  </div>
                  <div className="client-list">
                    {recentQuotes.map((q) => (
                      <FavRow key={q.symbol} quote={q} flash={flashClass(q.symbol)} onOpen={() => { setSelected(q.symbol); setSearch(q.symbol); pushRecent(q.symbol); }} />
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 2px" }}>
              Toque num ativo para ver o detalhe. Fixados aparecem também na home (os 4 primeiros).
            </div>
            <div style={{ paddingBottom: 14 }}>
              <QuoteSource quotes={data?.quotes ?? []} source={data?.source} />
            </div>
          </div>
        </>
      )}
    </MobileShell>
  );
}

function FavRow({ quote, flash, onOpen, editing, onRemove }: { quote: Quote; flash: string; onOpen: () => void; editing?: boolean; onRemove?: () => void }) {
  const up = quote.changePct >= 0;
  if (editing && onRemove) {
    // modo edição: a linha inteira vira "ativo + botão Desafixar" explícito
    return (
      <div className="fav-row" style={{ cursor: "default" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="fav-row__ticker">{quote.symbol}</span>
          <span className="fav-row__name">{quote.name}</span>
        </span>
        <button
          type="button"
          aria-label={`Desafixar ${quote.symbol}`}
          onClick={onRemove}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 13px", borderRadius: 10,
            background: "var(--danger-action-hover-bg)", color: "var(--danger-action-text)",
            font: "600 12.5px/1 var(--font-sans)", flex: "none",
          }}
        >
          <i className="icon-pin-off" style={{ fontSize: 14 }} aria-hidden />
          Desafixar
        </button>
      </div>
    );
  }
  return (
    <button type="button" className="fav-row" onClick={onOpen}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="fav-row__ticker">{quote.symbol}</span>
        <span className="fav-row__name">{quote.name}</span>
      </span>
      {quote.series && quote.series.length >= 8 && <Sparkline points={quote.series.slice(-10)} up={up} />}
      <span className="fav-row__right">
        <span className={`fav-row__price${flash}`}>{formatQuotePrice(quote)}</span>
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 64, height: 22,
            padding: "0 8px", borderRadius: 7,
            background: `color-mix(in srgb, ${up ? "var(--market-up)" : "var(--market-down)"} 12%, transparent)`,
            color: up ? "var(--market-up)" : "var(--market-down)",
            font: "600 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatQuoteChange(quote)}
        </span>
      </span>
    </button>
  );
}
