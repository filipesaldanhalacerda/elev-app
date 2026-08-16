/**
 * Tela 05 · Lista/busca de clientes — quadros "05 Clientes claro/escuro/claro erro" (#3b).
 * Busca restrita à carteira (RLS); paginação por rolagem; erro com última lista salva.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { ClientSearch, type ClientSearchResult } from "../components/ClientSearch";
import { Avatar } from "../components/Avatar";
import { Banner } from "../components/feedback";
import { Button } from "../components/Button";
import { useClientList, type ClientOverview, type ClientSort } from "../lib/clientData";
import { supabase } from "../lib/supabase";
import { formatBRL, formatInt, formatDateAtTime, formatPct } from "../lib/format";

const CACHE_KEY = "elev.clientes.cache";
const PAGE = 20;

function maskAccount(acc: string) {
  // exibição no padrão dos quadros: 12.884-7
  if (acc.length < 3) return acc;
  const body = acc.slice(0, -1);
  const dv = acc.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export default function Clients() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [limit, setLimit] = useState(PAGE);
  // F2-08: o funil abre o sheet de filtros (status + ordenação)
  const [sort, setSort] = useState<ClientSort>({ by: "patrimony", asc: false });
  const [filterSheet, setFilterSheet] = useState(false);
  const { data, loading, error, reload } = useClientList(filter, limit, sort);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClientSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // cache local para o estado de erro (quadro "05 Clientes claro erro")
  useEffect(() => {
    if (data && data.rows.length > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows: data.rows.slice(0, 10) }));
    }
  }, [data]);
  const cached = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { at: number; rows: ClientOverview[] } | null;
    } catch {
      return null;
    }
  }, [error]);

  // busca (a RLS garante que só a carteira do assessor volta)
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

  // rolagem infinita ("5 de 42 · role para carregar mais")
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !data) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && data.rows.length < data.total) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [data]);

  const openClient = (account: string) => navigate(`/clientes/${account}`);

  return (
    <MobileShell active="clientes">
      <header className="page-header">
        <span className="page-header__title">Clientes</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {data && <span className="page-header__count">{formatInt(data.total)}</span>}
          <button type="button" className="page-header__action" aria-label="Filtrar" onClick={() => setFilterSheet(true)}>
            <i className="ph ph-funnel" aria-hidden />
          </button>
        </span>
      </header>

      <div style={{ padding: "4px 16px 12px" }}>
        <ClientSearch
          value={search}
          onChange={setSearch}
          onClear={() => setSearch("")}
          loading={searching && !!search}
          results={results ?? undefined}
          emptyTerm={!searching && search && results && results.length === 0 ? search : undefined}
          onSelect={(r) => openClient((r as ClientSearchResult & { raw: string }).raw)}
        />
        {!error && (
          <div className="filter-row" style={{ marginTop: 10 }}>
            {(["todos", "ativos", "inativos"] as const).map((f) => (
              <button key={f} type="button" className={`filter-chip${filter === f ? " filter-chip--active" : ""}`} onClick={() => setFilter(f)}>
                {f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Inativos"}
              </button>
            ))}
            <button type="button" className="filter-sort" onClick={() => setFilterSheet(true)}>
              <i className={`ph ${sort.asc ? "ph-arrow-up" : "ph-arrow-down"}`} aria-hidden />
              {sort.by === "patrimony" ? "Patrimônio" : sort.by === "name" ? "Nome" : "Variação"}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "0 16px", display: "flex", flexDirection: "column", gap: error ? 14 : 8 }}>
        {error && (
          <>
            <Banner kind="danger" title="Não conseguimos carregar sua carteira">
              {cached ? `Mostrando a última lista salva no aparelho, de ${formatDateAtTime(cached.at)}.` : "Verifique sua conexão e tente de novo."}
            </Banner>
            <div className="empty-state empty-state--error" style={{ borderRadius: 14, padding: "24px 20px" }}>
              <span className="empty-state__icon">
                <i className="ph ph-cloud-warning" aria-hidden />
              </span>
              <span className="empty-state__title" style={{ fontSize: 15 }}>Lista desatualizada</span>
              <span className="empty-state__desc" style={{ maxWidth: 280 }}>
                Valores de patrimônio podem ter mudado. Tente de novo em alguns segundos ou siga com os dados salvos.
              </span>
              <span style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Button icon="ph-arrow-clockwise" onClick={reload}>Tentar de novo</Button>
                <Button variant="secondary" onClick={() => setShowSaved(true)}>Ver salvos</Button>
              </span>
            </div>
            {cached && showSaved && (
              <div className="client-list" style={{ opacity: 0.62 }}>
                {cached.rows.map((c) => (
                  <div key={c.account_code} className="client-row" style={{ minHeight: 64 }}>
                    <Avatar name={c.name ?? "?"} size={34} neutral />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="client-row__name" style={{ fontSize: 13.5, color: "var(--field-label)" }}>{c.name ?? `Conta ${c.account_code}`}</span>
                      <span className="client-row__meta">{maskAccount(c.account_code)} · valor de {formatDateAtTime(cached.at).slice(0, 5)}</span>
                    </span>
                    <span className="client-row__value" style={{ fontSize: 13.5, color: "var(--field-label)" }}>{c.patrimony !== null ? formatBRL(c.patrimony) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!error && loading && !data && (
          <div className="client-list" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 999 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ width: "60%", height: 11 }} />
                  <div className="skeleton" style={{ width: "35%", height: 9, marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && data && data.rows.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon">
              <i className="ph ph-users-three" aria-hidden />
            </span>
            <span className="empty-state__title">Nenhum cliente {filter !== "todos" ? "neste filtro" : "na sua carteira ainda"}</span>
            <span className="empty-state__desc">
              {filter !== "todos" ? "Troque o filtro para ver os demais clientes." : "Os clientes chegam pela importação de relatórios feita pelo administrador."}
            </span>
          </div>
        )}

        {!error && data && data.rows.length > 0 && (
          <>
            <div className="client-list">
              {data.rows.map((c) => {
                const inactive = c.status !== null && c.status !== "ATIVO";
                return (
                  <button key={c.account_code} type="button" className="client-row" onClick={() => openClient(c.account_code)}>
                    <Avatar name={c.name ?? "?"} size={36} neutral={inactive} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="client-row__name">{c.name ?? `Conta ${c.account_code}`}</span>
                      <span className="client-row__meta">
                        {maskAccount(c.account_code)}
                        {inactive && <span className="client-row__inactive-chip">inativo</span>}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="client-row__value">{c.patrimony !== null ? formatBRL(c.patrimony) : "—"}</span>
                      {c.month_pct !== null && !inactive ? (
                        <span className={`client-row__pct ${c.month_pct >= 0 ? "market-up" : "market-down"}`}>
                          {formatPct(c.month_pct, 1).replace("−", "-")} mês
                        </span>
                      ) : (
                        <span className="client-row__pct client-row__pct--none">sem movimento</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div ref={sentinel} className="list-footnote">
              {data.rows.length < data.total ? `${formatInt(data.rows.length)} de ${formatInt(data.total)} · role para carregar mais` : `${formatInt(data.total)} clientes`}
            </div>
          </>
        )}
      </div>

      {filterSheet && (
        <Sheet label="Filtros de clientes" onClose={() => setFilterSheet(false)}>
            <div className="sheet__title">Filtros</div>
            <div className="sheet__fields" style={{ gap: 14 }}>
              <div className="field">
                <span className="field__label" style={{ display: "block" }}>Status</span>
                <div className="segmented" style={{ height: 44 }}>
                  {(["todos", "ativos", "inativos"] as const).map((f) => (
                    <button key={f} type="button" className={`segmented__item${filter === f ? " segmented__item--active" : ""}`} onClick={() => setFilter(f)}>
                      {f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Inativos"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field__label" style={{ display: "block" }}>Ordenar por</span>
                <div className="segmented" style={{ height: 44 }}>
                  {([["patrimony", "Patrimônio"], ["name", "Nome"], ["month_pct", "Variação"]] as const).map(([by, label]) => (
                    <button key={by} type="button" className={`segmented__item${sort.by === by ? " segmented__item--active" : ""}`} onClick={() => setSort((s) => ({ ...s, by }))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field__label" style={{ display: "block" }}>Direção</span>
                <div className="segmented" style={{ height: 44 }}>
                  <button type="button" className={`segmented__item${!sort.asc ? " segmented__item--active" : ""}`} onClick={() => setSort((s) => ({ ...s, asc: false }))}>
                    <i className="ph ph-arrow-down" aria-hidden />Maior primeiro
                  </button>
                  <button type="button" className={`segmented__item${sort.asc ? " segmented__item--active" : ""}`} onClick={() => setSort((s) => ({ ...s, asc: true }))}>
                    <i className="ph ph-arrow-up" aria-hidden />Menor primeiro
                  </button>
                </div>
              </div>
            </div>
            <div className="sheet__footer" style={{ marginTop: 14 }}>
              <Button variant="secondary" onClick={() => { setFilter("todos"); setSort({ by: "patrimony", asc: false }); }}>Limpar</Button>
              <Button onClick={() => setFilterSheet(false)}>Aplicar</Button>
            </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
