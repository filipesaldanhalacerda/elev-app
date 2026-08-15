/**
 * Tela 04 · Dashboard/home — quadros #1b/#1c (claro/escuro × com dados/vazio/carregando).
 * A busca de cliente é o centro e NUNCA entra em skeleton.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { ClientSearch, type ClientSearchResult } from "../components/ClientSearch";
import { AlertCard } from "../components/cards";
import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useQuotes, formatQuotePrice, formatQuoteChange, type Quote } from "../lib/quotes";
import { useOnline, lastDataAt } from "../lib/offline";
import { initials, formatInt, formatTime, formatDate } from "../lib/format";

const RECENT_CLIENTS_KEY = "elev.clientes.visitados";

const maskAccount = (acc: string) =>
  acc.length < 3 ? acc : `${acc.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${acc.slice(-1)}`;

function greeting(): string {
  const hour = Number(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}


interface HomeData {
  clientCount: number;
  unread: number;
  alerts: { id: string; ticker: string; direction: "alta" | "baixa"; target_price: number | null; created_price: number | null }[];
  activeAlerts: number;
  tasksToday: { id: string; title: string; meta: string; overdue: boolean }[];
  pendingCount: number;
  overdueCount: number;
  birthdays: { account_code: string; name: string; age: number | null; phone: string | null }[];
  notices: { id: string; kind: string; title: string; at: string }[];
}

function useHomeData(userId: string | undefined) {
  const [data, setData] = useState<HomeData | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [clients, notif, alerts, cards, birth, notices] = await Promise.all([
        supabase.from("client_overview").select("*", { count: "exact", head: true }),
        supabase.from("notifications").select("*", { count: "exact", head: true }).is("read_at", null),
        supabase.from("alerts").select("id, ticker, direction, target_price, created_price").eq("status", "ativo").order("created_at", { ascending: false }).limit(2),
        supabase.from("cards").select("id, title, due_at, priority, status, clients(name)").eq("assignee", userId).neq("status", "concluido").order("due_at", { ascending: true, nullsFirst: false }).limit(20),
        supabase.from("client_overview").select("account_code, name, birth_date").not("birth_date", "is", null).limit(2000),
        supabase.from("notifications").select("id, kind, title, created_at").order("created_at", { ascending: false }).limit(4),
      ]);
      if (!alive) return;

      const now = new Date();
      const todaySP = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const cardsAll = (cards.data ?? []).map((c) => {
        const one = (v: unknown): { name?: string } | null => (Array.isArray(v) ? (v[0] as { name?: string }) : (v as { name?: string } | null));
        const overdue = !!c.due_at && new Date(c.due_at).getTime() < now.getTime();
        const dueToday = !!c.due_at && new Date(c.due_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === todaySP;
        const parts: string[] = [];
        const clientName = one(c.clients)?.name;
        if (clientName) parts.push(clientName);
        if (c.due_at) parts.push(overdue && !dueToday ? `venceu ${formatDate(c.due_at).slice(0, 5)}` : `hoje ${formatTime(c.due_at)}`);
        parts.push(`prioridade ${c.priority === "media" ? "média" : c.priority}`);
        return { id: c.id, title: c.title, meta: parts.join(" · "), overdue, dueToday };
      });
      const todayCards = cardsAll.filter((c) => c.overdue || c.dueToday);

      const mmdd = todaySP.slice(5);
      const birthdays = (birth.data ?? [])
        .filter((b) => b.birth_date && String(b.birth_date).slice(5) === mmdd)
        .slice(0, 3)
        .map((b) => ({
          account_code: b.account_code,
          name: b.name ?? `Conta ${b.account_code}`,
          age: b.birth_date ? now.getFullYear() - new Date(b.birth_date).getFullYear() : null,
          phone: null as string | null,
        }));
      // telefone dos aniversariantes (cadastro complementar)
      if (birthdays.length > 0) {
        const { data: extras } = await supabase.from("client_extras").select("account_code, phone").in("account_code", birthdays.map((b) => b.account_code));
        for (const b of birthdays) b.phone = (extras ?? []).find((e) => e.account_code === b.account_code)?.phone ?? null;
      }

      setData({
        clientCount: clients.count ?? 0,
        unread: notif.count ?? 0,
        alerts: (alerts.data ?? []) as HomeData["alerts"],
        activeAlerts: (alerts.data ?? []).length,
        tasksToday: todayCards.slice(0, 2),
        pendingCount: cardsAll.length,
        overdueCount: cardsAll.filter((c) => c.overdue).length,
        birthdays,
        notices: ((notices.data ?? []) as { id: string; kind: string; title: string; created_at: string }[]).map((n) => ({
          id: n.id, kind: n.kind, title: n.title, at: n.created_at,
        })),
      });
    })();
    return () => {
      alive = false;
    };
  }, [userId]);
  return data;
}

const NOTICE_ICON: Record<string, { icon: string; tone: "brand" | "neutral" | "warning" }> = {
  alerta_atingido: { icon: "ph-target", tone: "brand" },
  card_delegado: { icon: "ph-kanban", tone: "neutral" },
  lembrete_diario: { icon: "ph-bell-ringing", tone: "neutral" },
  importacao: { icon: "ph-upload-simple", tone: "neutral" },
  reserva_confirmada: { icon: "ph-door-open", tone: "neutral" },
};

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}>{children}</span>
      {action}
    </div>
  );
}

function EmptyBlock({ icon, title, desc, onAdd }: { icon: string; title: string; desc: string; onAdd?: () => void }) {
  return (
    <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, border: "1px dashed var(--dashed)", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <i className={`ph ${icon}`} style={{ fontSize: 19 }} aria-hidden />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", font: "500 13.5px/1.35 var(--font-sans)", color: "var(--text-1)" }}>{title}</span>
        <span style={{ display: "block", marginTop: 3, font: "400 12px/1.4 var(--font-sans)", color: "var(--text-2)" }}>{desc}</span>
      </span>
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label="Adicionar" style={{ width: 44, height: 44, borderRadius: 10, border: "1px solid var(--border-strong)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <i className="ph ph-plus" style={{ fontSize: 19 }} aria-hidden />
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const data = useHomeData(profile?.id);
  const { data: quotesData, flashes } = useQuotes(["IBOV", "WDOU26", "PETR4", "VALE3"]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClientSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const online = useOnline();
  const loading = data === null && online;
  const empty = data !== null && data.clientCount === 0;

  const recents: { account: string; name: string }[] = useMemo(() => {
    try {
      return (JSON.parse(localStorage.getItem(RECENT_CLIENTS_KEY) ?? "[]") as { account: string; name: string }[]).slice(0, 2);
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const term = search.trim();
      const { data: found } = await supabase
        .from("client_overview")
        .select("account_code, name, patrimony, month_pct")
        .or(`name.ilike.%${term}%,account_code.ilike.%${term.replace(/\D/g, "") || term}%`)
        .order("patrimony", { ascending: false, nullsFirst: false })
        .limit(6);
      if (!alive) return;
      setResults(
        (found ?? []).map((r) => ({
          account: maskAccount(r.account_code),
          name: r.name ?? `Conta ${r.account_code}`,
          patrimony: r.patrimony ?? 0,
          monthPct: r.month_pct ?? 0,
          raw: r.account_code,
        })) as (ClientSearchResult & { raw: string })[]
      );
      setSearching(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  const today = new Date();
  const weekday = today.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" }).split("-")[0];
  const ticker = (quotesData?.quotes ?? []) as Quote[];

  const flashClass = (symbol: string) => {
    const f = flashes.get(symbol);
    return f ? (f === "up" ? " flash-up" : " flash-down") : "";
  };

  return (
    <MobileShell active="inicio">
      <div data-home style={{ display: "contents" }}>
        {/* saudação */}
        <div style={{ flex: "none", padding: "6px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ font: "600 19px/1.2 var(--font-sans)", letterSpacing: "-0.015em", color: "var(--text-1)" }}>
              {greeting()}, {profile?.name.split(" ")[0]}
            </div>
            {loading ? (
              <div className="skeleton" style={{ marginTop: 6, width: 150, height: 10 }} />
            ) : (
              <div style={{ marginTop: 3, font: "400 12px/1.35 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                {weekday}, {formatDate(today)} · {empty ? "nenhum cliente vinculado" : `${formatInt(data!.clientCount)} clientes`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" aria-label="Notificações" onClick={() => navigate("/notificacoes")} style={{ width: 44, height: 44, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-1)", position: "relative" }}>
              <i className="ph ph-bell" style={{ fontSize: 21 }} aria-hidden />
              {!loading && data!.unread > 0 && (
                <span data-badge style={{ position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 999, background: "var(--market-down)", border: "1.5px solid var(--bg)" }} />
              )}
            </button>
            <button type="button" aria-label="Perfil" onClick={() => navigate("/perfil")} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--brand-800)", color: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 12px/1 var(--font-sans)" }}>
                {profile ? initials(profile.name) : ""}
              </span>
            </button>
          </div>
        </div>

        {/* ticker de mercado */}
        {loading ? (
          <div style={{ flex: "none", height: 38, background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16, padding: "0 16px", overflow: "hidden" }}>
            <div className="skeleton" style={{ width: 92, height: 11 }} />
            <div className="skeleton" style={{ width: 108, height: 11 }} />
            <div className="skeleton" style={{ width: 86, height: 11 }} />
          </div>
        ) : quotesData && !quotesData.paused && ticker.length > 0 ? (
          <div style={{ flex: "none", height: 38, background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", overflow: "hidden", position: "relative" }}>
            <span style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "linear-gradient(90deg, transparent 0%, var(--surface) 72%)", pointerEvents: "none", zIndex: 1 }} aria-hidden />
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 16px", whiteSpace: "nowrap", overflowX: "auto", scrollbarWidth: "none" }}>
              {ticker.map((q, i) => (
                <span key={q.symbol} style={{ display: "contents" }}>
                  {i > 0 && <span style={{ width: 1, height: 14, background: "var(--border)", flex: "none" }} aria-hidden />}
                  <span className={`ticker-strip__item${flashClass(q.symbol)}`} style={{ borderRadius: 4, padding: "3px 4px" }}>
                    <span className="ticker-strip__code">{q.symbol}</span>
                    <span className="ticker-strip__price">{formatQuotePrice(q)}</span>
                    <span className={`ticker-strip__pct ${q.changePct >= 0 ? "market-up" : "market-down"}`}>{formatQuoteChange(q)}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, padding: "16px 16px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* busca central — NUNCA skeleton */}
          <div>
            <ClientSearch
              value={search}
              onChange={setSearch}
              onClear={() => setSearch("")}
              loading={searching && !!search}
              results={results ?? undefined}
              emptyTerm={!searching && search && results && results.length === 0 ? search : undefined}
              onSelect={(r) => navigate(`/clientes/${(r as ClientSearchResult & { raw: string }).raw}`)}
            />
            {loading && (
              <div style={{ marginTop: 8, font: "400 11px/1.4 var(--font-sans)", color: "var(--text-3)" }}>
                A busca já responde enquanto o resto da home carrega.
              </div>
            )}
            {!loading && !empty && recents.length > 0 && !search && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {recents.map((r) => (
                  <button key={r.account} type="button" onClick={() => navigate(`/clientes/${r.account}`)} style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 8.5px/1 var(--font-sans)" }}>
                      {initials(r.name)}
                    </span>
                    <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-1)" }}>{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* offline: estado central da tela 24 */}
          {!online && (
            <div className="empty-state" style={{ borderRadius: 14, padding: "26px 20px" }} data-offline-central>
              <span className="empty-state__icon" style={{ width: 46, height: 46, borderRadius: 12 }}>
                <i className="ph ph-cloud-slash" style={{ fontSize: 22 }} aria-hidden />
              </span>
              <span className="empty-state__title" style={{ fontSize: 15 }}>Sem conexão agora</span>
              <span className="empty-state__desc" style={{ maxWidth: 280 }}>
                Clientes, carteiras e tarefas seguem disponíveis como estavam às {lastDataAt() ? formatTime(lastDataAt()!) : "—"}. Criar e editar ficam guardados no aparelho e sincronizam quando a rede voltar.
              </span>
              <span className="empty-state__action">
                <Button variant="secondary" icon="ph-arrow-clockwise" onClick={() => window.location.reload()}>Tentar reconectar</Button>
              </span>
            </div>
          )}

          {/* vazio: assessor novo */}
          {empty && (
            <div className="empty-state" style={{ borderRadius: 14, padding: "26px 20px" }}>
              <span className="empty-state__icon" style={{ width: 46, height: 46, borderRadius: 12 }}>
                <i className="ph ph-users-three" style={{ fontSize: 22 }} aria-hidden />
              </span>
              <span className="empty-state__title" style={{ fontSize: 15 }}>Nenhum cliente na sua carteira</span>
              <span className="empty-state__desc" style={{ maxWidth: 270 }}>
                Seus clientes aparecem aqui depois da próxima importação do Positivador pelo administrador.
              </span>
              <span className="empty-state__action">
                <Button>Falar com o administrador</Button>
              </span>
            </div>
          )}

          {/* radar de alertas */}
          <div>
            <SectionTitle
              action={
                !loading && data!.activeAlerts > 0 ? (
                  <button type="button" onClick={() => navigate("/alertas")} style={{ display: "flex", alignItems: "center", gap: 2, font: "500 12.5px/1 var(--font-sans)", color: "var(--ghost-text)" }}>
                    {data!.activeAlerts} ativo{data!.activeAlerts > 1 ? "s" : ""}
                    <i className="ph ph-caret-right" style={{ fontSize: 13 }} aria-hidden />
                  </button>
                ) : undefined
              }
            >
              Radar de alertas
            </SectionTitle>
            {loading ? (
              <div className="card" style={{ padding: "13px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div className="skeleton" style={{ width: 150, height: 13 }} />
                  <div className="skeleton" style={{ width: 96, height: 13 }} />
                </div>
                <div style={{ marginTop: 14, height: 6, borderRadius: 999, background: "var(--border)" }} />
                <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div className="skeleton" style={{ width: 112, height: 10 }} />
                  <div className="skeleton" style={{ width: 76, height: 10 }} />
                </div>
              </div>
            ) : data!.alerts.length === 0 ? (
              <EmptyBlock icon="ph-target" title="Nenhum alerta ativo" desc="Monitore um preço-alvo e receba push." onAdd={() => navigate("/alertas?novo")} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data!.alerts.map((a) => {
                  const price = a.created_price ?? a.target_price ?? 0;
                  const target = a.target_price ?? 0;
                  const remaining = price > 0 ? Math.abs(((target - price) / price) * 100) : 0;
                  return (
                    <AlertCard
                      key={a.id}
                      ticker={a.ticker}
                      direction={a.direction}
                      currentPrice={price}
                      dayChangePct={0}
                      targetPrice={target}
                      progress={0.5}
                      remainingPct={Number(remaining.toFixed(1))}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* tarefas de hoje */}
          <div>
            <SectionTitle
              action={
                !loading && data!.pendingCount > 0 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ font: "500 11px/1 var(--font-sans)", color: "var(--field-label)", background: "var(--chip-pill-bg)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px" }}>
                      {data!.pendingCount} pendente{data!.pendingCount > 1 ? "s" : ""}
                    </span>
                    {data!.overdueCount > 0 && (
                      <span style={{ font: "500 11px/1 var(--font-sans)", color: "var(--warning)", background: "var(--warning-tint)", border: "1px solid var(--warning-border)", borderRadius: 999, padding: "4px 8px" }}>
                        {data!.overdueCount} atrasada{data!.overdueCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                ) : undefined
              }
            >
              Tarefas de hoje
            </SectionTitle>
            {loading ? (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {[74, 58].map((w, i) => (
                  <div key={i} style={{ height: 56, display: "flex", alignItems: "center", padding: "0 14px", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}>
                    <div style={{ flex: 1 }}>
                      <div className="skeleton" style={{ width: `${w}%`, height: 12 }} />
                      <div className="skeleton" style={{ width: `${w - 20}%`, height: 10, marginTop: 7 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : data!.tasksToday.length === 0 ? (
              <EmptyBlock icon="ph-check-square-offset" title="Nada para hoje" desc="Crie um card para não perder um retorno." onAdd={() => navigate("/cards")} />
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {data!.tasksToday.map((t, i) => (
                  <button key={t.id} type="button" onClick={() => navigate("/cards")} style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", textAlign: "left", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", font: "500 13.5px/1.35 var(--font-sans)", color: "var(--text-1)" }}>{t.title}</span>
                      <span style={{ display: "block", marginTop: 3, font: "400 11.5px/1.3 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{t.meta}</span>
                    </span>
                    <i className="ph ph-caret-right" style={{ fontSize: 16, color: "var(--text-3)" }} aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* aniversariantes (só quando há) */}
          {!loading && data!.birthdays.length > 0 && (
            <div>
              <SectionTitle>Aniversariantes</SectionTitle>
              {data!.birthdays.map((b) => (
                <div key={b.account_code} className="card" style={{ minHeight: 60, display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 14px" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 12px/1 var(--font-sans)", flex: "none" }}>
                    {initials(b.name)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "500 13.5px/1.35 var(--font-sans)", color: "var(--text-1)" }}>{b.name}</span>
                    <span style={{ display: "block", marginTop: 2, font: "400 11.5px/1.3 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                      conta {maskAccount(b.account_code)}
                      {b.age ? ` · ${b.age} anos` : ""}
                    </span>
                  </span>
                  {b.phone && (
                    <a href={`https://wa.me/55${b.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${b.name}`} style={{ width: 44, height: 44, borderRadius: 10, background: "var(--brand-tint)", color: "var(--ghost-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      <i className="ph ph-whatsapp-logo" style={{ fontSize: 21 }} aria-hidden />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* avisos recentes */}
          <div>
            <SectionTitle>Avisos recentes</SectionTitle>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[82, 68].map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 11, alignItems: "center" }}>
                    <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
                    <div className="skeleton" style={{ width: `${w}%`, height: 11 }} />
                  </div>
                ))}
              </div>
            ) : data!.notices.length === 0 ? (
              <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--text-2)", padding: "2px 2px 0" }}>
                Sem avisos nas últimas 24 horas.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {data!.notices.map((n) => {
                  const meta = NOTICE_ICON[n.kind] ?? { icon: "ph-bell", tone: "neutral" as const };
                  return (
                    <div key={n.id} style={{ minHeight: 52, display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 2px" }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8, flex: "none",
                        background: meta.tone === "brand" ? "var(--brand-tint)" : meta.tone === "warning" ? "var(--warning-tint)" : "var(--chip-pill-bg)",
                        color: meta.tone === "brand" ? "var(--ghost-text)" : meta.tone === "warning" ? "var(--warning)" : "var(--field-label)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <i className={`ph ${meta.icon}`} style={{ fontSize: 15 }} aria-hidden />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", font: "400 13px/1.4 var(--font-sans)", color: "var(--text-1)" }}>{n.title}</span>
                        <span style={{ display: "block", marginTop: 2, font: "400 11px/1.3 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>
                          {new Date(n.at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) ? "hoje" : "ontem"} {formatTime(n.at)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

/** Registra visita para os chips de recentes da home. */
export function recordClientVisit(account: string, name: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT_CLIENTS_KEY) ?? "[]") as { account: string; name: string }[]).filter((r) => r.account !== account);
    list.unshift({ account, name });
    localStorage.setItem(RECENT_CLIENTS_KEY, JSON.stringify(list.slice(0, 4)));
  } catch {
    /* ignore */
  }
}
