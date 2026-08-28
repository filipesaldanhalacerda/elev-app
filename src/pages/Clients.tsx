/**
 * Tela 05 · Lista/busca de clientes — quadros "05 Clientes claro/escuro/claro erro" (#3b).
 * Busca restrita à carteira (RLS); paginação por rolagem; erro com última lista salva.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { SkeletonList } from "../components/states";
import { Filters } from "../components/Filters";
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
          <Filters
            label="Filtros de clientes"
            style={{ marginTop: 10 }}
            sections={[
              { key: "status", label: "Status", options: [{ value: "todos", label: "Todos" }, { value: "ativos", label: "Ativos" }, { value: "inativos", label: "Inativos" }] },
              { key: "by", label: "Ordenar por", options: [{ value: "patrimony", label: "Patrimônio" }, { value: "name", label: "Nome" }, { value: "month_pct", label: "Variação" }] },
              { key: "dir", label: "Direção", options: [{ value: "desc", label: "Maior primeiro", icon: "icon-arrow-down" }, { value: "asc", label: "Menor primeiro", icon: "icon-arrow-up" }] },
            ]}
            values={{ status: filter, by: sort.by, dir: sort.asc ? "asc" : "desc" }}
            onChange={(key, value) => {
              if (key === "status") setFilter(value as typeof filter);
              else if (key === "by") setSort((s) => ({ ...s, by: value as ClientSort["by"] }));
              else setSort((s) => ({ ...s, asc: value === "asc" }));
            }}
            onClear={() => { setFilter("todos"); setSort({ by: "patrimony", asc: false }); }}
            trailing={data && (
              <span className="page-header__count" style={{ flex: "none", display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: "var(--chip-pill-bg)", font: "600 12px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-body)" }}>{formatInt(data.total)}</span>
            )}
          />
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
                <i className="icon-cloud-alert" aria-hidden />
              </span>
              <span className="empty-state__title" style={{ fontSize: 15 }}>Lista desatualizada</span>
              <span className="empty-state__desc" style={{ maxWidth: 280 }}>
                Valores de patrimônio podem ter mudado. Tente de novo em alguns segundos ou siga com os dados salvos.
              </span>
              <span style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <Button icon="icon-rotate-cw" onClick={reload}>Tentar de novo</Button>
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

        {/* linhas de 68px com valor à direita: a mesma geometria da lista real */}
        {!error && loading && !data && <SkeletonList rows={5} label="Carregando clientes" />}

        {!error && data && data.rows.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon">
              <i className="icon-users-round" aria-hidden />
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

    </MobileShell>
  );
}
