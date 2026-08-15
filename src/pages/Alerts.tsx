/**
 * Tela 12 · Central de alertas — quadros "12 Alertas claro" e "12 Novo alerta escuro" (#3e).
 * Alertas de preço com direção, progresso até o alvo, histórico e sheet de criação.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Button } from "../components/Button";
import { AlertCard } from "../components/cards";
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

function useAlerts() {
  const [rows, setRows] = useState<AlertRow[] | null>(null);
  const load = async () => {
    const { data } = await supabase
      .from("alerts")
      .select("*, clients(name)")
      .neq("status", "cancelado")
      .order("created_at", { ascending: false });
    setRows(
      (data ?? []).map((r) => ({
        ...(r as AlertRow),
        client_name: ((r as { clients?: { name?: string } | { name?: string }[] }).clients as { name?: string } | null)?.name ?? null,
      }))
    );
  };
  useEffect(() => {
    void load();
  }, []);
  return { rows, reload: load };
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

function NewAlertSheet({ initialTicker, onClose, onCreated }: { initialTicker: string; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [ticker, setTicker] = useState(initialTicker);
  const [direction, setDirection] = useState<"alta" | "baixa">("alta");
  const [target, setTarget] = useState("");
  const [dayPct, setDayPct] = useState("");
  const [client, setClient] = useState<string>("");
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

  async function create() {
    setSaving(true);
    const { error } = await supabase.from("alerts").insert({
      owner: profile!.id,
      ticker: ticker.trim().toUpperCase(),
      direction,
      target_price: target ? targetNum : null,
      target_day_pct: dayPct && !target ? dayPctNum : null,
      account_code: client || null,
      created_price: detail?.quote?.price ?? null,
    });
    setSaving(false);
    if (!error) {
      onCreated();
      onClose();
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Novo alerta de preço">
        <div className="sheet__handle"><span /></div>
        <div className="sheet__title">Novo alerta de preço</div>
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
                <i className="ph ph-arrow-up-right" aria-hidden />Acima de
              </button>
              <button type="button" className={`segmented__item${direction === "baixa" ? " segmented__item--active" : ""}`} onClick={() => setDirection("baixa")}>
                <i className="ph ph-arrow-down-right" aria-hidden />Abaixo de
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10 }}>
            <div className="field">
              <label className="field__label" htmlFor="alerta-alvo" style={{ display: "block" }}>Preço-alvo</label>
              <div className="field__box">
                <span className="field__prefix">R$</span>
                <input id="alerta-alvo" className="field__input field__money" inputMode="decimal" autoFocus value={target} onChange={(e) => { setTarget(e.target.value); if (e.target.value) setDayPct(""); }} />
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
              <i className="ph ph-caret-down field__caret" aria-hidden />
            </div>
          </div>
        </div>

        {valid && (
          <div className="alert-summary">
            <i className="ph ph-bell-ringing" aria-hidden />
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
          <Button disabled={!valid} loading={saving} onClick={create}>Criar alerta</Button>
        </div>
      </div>
    </>
  );
}

export default function Alerts() {
  const [params] = useSearchParams();
  const { rows, reload } = useAlerts();
  const [tab, setTab] = useState<"ativos" | "historico">("ativos");
  const [sheet, setSheet] = useState(params.get("novo") !== null);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());

  const active = useMemo(() => (rows ?? []).filter((r) => r.status === "ativo"), [rows]);
  const triggered = useMemo(() => (rows ?? []).filter((r) => r.status === "disparado"), [rows]);
  const recentTriggered = triggered.filter((t) => t.triggered_at && Date.now() - new Date(t.triggered_at).getTime() < 86400000);

  useEffect(() => {
    const symbols = [...new Set(active.map((a) => a.ticker))];
    if (symbols.length === 0) return;
    workerFetch(`/api/quotes?symbols=${symbols.join(",")}`)
      .then((body) => setQuotes(new Map(((body as { quotes: Quote[] }).quotes ?? []).map((q) => [q.symbol, q]))))
      .catch(() => {});
  }, [active.length]);

  async function cancel(id: string) {
    await supabase.from("alerts").update({ status: "cancelado" }).eq("id", id);
    await reload();
  }

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Alertas</span>
        <Button icon="ph-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => setSheet(true)}>
          Novo
        </Button>
      </header>
      <nav className="tabs-42" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "ativos"} className={`tab-42${tab === "ativos" ? " tab-42--active" : ""}`} onClick={() => setTab("ativos")}>
          Ativos<span className="tab-42__count">{active.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "historico"} className={`tab-42${tab === "historico" ? " tab-42--active" : ""}`} onClick={() => setTab("historico")}>
          Histórico
        </button>
      </nav>

      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows === null && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}

        {tab === "ativos" && rows !== null && (
          <>
            {active.map((a) => {
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
                        <button type="button" className="alert-foot__btn" aria-label={`Editar alerta de ${a.ticker}`}>
                          <i className="ph ph-pencil-simple" aria-hidden />
                        </button>
                        <button type="button" className="alert-foot__btn alert-foot__btn--danger" aria-label={`Cancelar alerta de ${a.ticker}`} onClick={() => cancel(a.id)}>
                          <i className="ph ph-prohibit" aria-hidden />
                        </button>
                      </span>
                    </div>
                  }
                />
              );
            })}
            {recentTriggered.map((t) => (
              <div key={t.id} className="card triggered-row">
                <span className="triggered-row__icon"><i className="ph ph-check" aria-hidden /></span>
                <span style={{ flex: 1 }}>
                  <span className="triggered-row__title">
                    {t.ticker} atingiu {t.target_price !== null ? formatBRL(t.target_price) : `${t.target_day_pct}%`}
                  </span>
                  <span className="triggered-row__meta">disparado {t.triggered_at ? formatDateAtTime(t.triggered_at) : ""} · movido ao histórico</span>
                </span>
              </div>
            ))}
            {active.length === 0 && recentTriggered.length === 0 && (
              <div className="empty-state" style={{ borderRadius: 14 }}>
                <span className="empty-state__icon"><i className="ph ph-target" aria-hidden /></span>
                <span className="empty-state__title">Nenhum alerta ativo</span>
                <span className="empty-state__desc">Crie um alerta de preço e receba push quando o alvo for atingido.</span>
                <span className="empty-state__action">
                  <Button icon="ph-plus" onClick={() => setSheet(true)}>Criar alerta</Button>
                </span>
              </div>
            )}
            {(active.length > 0 || recentTriggered.length > 0) && (
              <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "2px 2px 14px" }}>
                Alerta disparado sai da lista de ativos e vira registro no histórico, com o horário exato do disparo.
              </div>
            )}
          </>
        )}

        {tab === "historico" && rows !== null && (
          <>
            {triggered.length === 0 && (
              <div className="empty-state" style={{ borderRadius: 14 }}>
                <span className="empty-state__icon"><i className="ph ph-clock-counter-clockwise" aria-hidden /></span>
                <span className="empty-state__title">Histórico vazio</span>
                <span className="empty-state__desc">Alertas disparados aparecem aqui com o horário exato do disparo.</span>
              </div>
            )}
            {triggered.map((t) => (
              <div key={t.id} className="card triggered-row" style={{ opacity: 1 }}>
                <span className="triggered-row__icon"><i className="ph ph-check" aria-hidden /></span>
                <span style={{ flex: 1 }}>
                  <span className="triggered-row__title">
                    {t.ticker} atingiu {t.target_price !== null ? formatBRL(t.target_price) : `${t.target_day_pct}%`}
                  </span>
                  <span className="triggered-row__meta">disparado {t.triggered_at ? formatDateAtTime(t.triggered_at) : ""}</span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {sheet && <NewAlertSheet initialTicker={params.get("ativo") ?? ""} onClose={() => setSheet(false)} onCreated={reload} />}
    </MobileShell>
  );
}
