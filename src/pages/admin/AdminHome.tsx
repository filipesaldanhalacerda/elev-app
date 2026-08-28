/** Tela 17 · Home administrativa — quadro "17 Home admin claro" (#4a). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminShell } from "./AdminShell";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/feedback";
import { SkeletonCardRows, SkeletonKpiCard } from "../../components/states";
import { supabase } from "../../lib/supabase";
import { workerFetch } from "../../lib/auth";
import { formatInt, formatTime, formatTimeSeconds, formatDate } from "../../lib/format";
import { parsePeriod } from "../../lib/rooms";

interface HomeAdminData {
  mt: { status: string; last_quote_at: string | null };
  lastImport: { kind: string; status: string; created_at: string; counts: { validos?: number } | null; author: string } | null;
  users: { total: number; active: number; pendingCodes: number };
  activity: { id: number; category: string; event: string; detail: string | null; at: string }[];
  roomsToday: { hour: string; room: string; owner: string; title: string; mine: boolean }[];
}

const KIND_TITLES: Record<string, string> = {
  positivador: "Positivador", diversificacao: "Diversificação", captacao: "Captação", saldo_consolidado: "Saldo Consolidado",
};
const CATEGORY_ICON: Record<string, { icon: string; warn?: boolean }> = {
  importacao: { icon: "icon-upload" },
  codigo: { icon: "icon-key-round" },
  metatrader: { icon: "icon-unplug", warn: true },
  usuario: { icon: "icon-user-plus" },
  login: { icon: "icon-log-in" },
  cadastro: { icon: "icon-pencil" },
};

export default function AdminHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<HomeAdminData | null>(null);
  const [now] = useState(new Date());

  useEffect(() => {
    (async () => {
      const [mt, imports, users, codes, audit, reservations] = await Promise.all([
        workerFetch("/api/admin/mt") as Promise<{ connection: { status: string; last_quote_at: string | null } }>,
        supabase.from("imports").select("kind, status, created_at, counts, profiles!imports_created_by_fkey(name)").order("created_at", { ascending: false }).limit(1),
        supabase.from("profiles").select("is_active"),
        supabase.from("access_codes").select("id").is("used_at", null).gt("expires_at", new Date().toISOString()),
        supabase.from("audit_log").select("id, category, event, detail, at").order("at", { ascending: false }).limit(4),
        supabase.from("reservations").select("period, title, rooms(name), profiles!reservations_owner_fkey(name)").is("cancelled_at", null),
      ]);
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const one = (v: unknown): { name?: string } | null => (Array.isArray(v) ? (v[0] as { name?: string }) : (v as { name?: string } | null));
      const li = imports.data?.[0];
      setData({
        mt: mt.connection,
        lastImport: li
          ? { kind: li.kind, status: li.status, created_at: li.created_at, counts: li.counts as { validos?: number }, author: (one((li as Record<string, unknown>).profiles)?.name ?? "").split(" ")[0] }
          : null,
        users: {
          total: (users.data ?? []).length,
          active: (users.data ?? []).filter((u) => u.is_active).length,
          pendingCodes: (codes.data ?? []).length,
        },
        activity: (audit.data ?? []) as HomeAdminData["activity"],
        roomsToday: (reservations.data ?? [])
          .map((r) => {
            const p = parsePeriod(r.period as string);
            return {
              day: p.start.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
              hour: p.start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
              room: one((r as Record<string, unknown>).rooms)?.name ?? "",
              owner: one((r as Record<string, unknown>).profiles)?.name ?? "",
              title: r.title as string,
              mine: false,
              startMs: p.start.getTime(),
            };
          })
          .filter((r) => r.day === today)
          .sort((a, b) => a.startMs - b.startMs)
          .slice(0, 3),
      });
    })();
  }, []);

  const mtChip = (status: string) =>
    status === "ativa" ? <StatusChip kind="success">Ativa</StatusChip>
    : status === "instavel" ? <StatusChip kind="warning" dot={false}>Instável</StatusChip>
    : status === "caida" ? <StatusChip kind="danger" dot={false}>Caída</StatusChip>
    : <StatusChip kind="neutral">Desconectada</StatusChip>;

  return (
    <AdminShell
      title="Visão geral"
      actions={
        <>
          <Button variant="secondary" size={36} icon="icon-upload" onClick={() => navigate("/admin/importacoes")}>
            Importar relatório
          </Button>
          <Button size={36} icon="icon-plus" onClick={() => navigate("/admin/usuarios")}>
            Novo usuário
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ font: "400 10.5px/1 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)", marginTop: -12 }}>
          {now.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" }).split("-")[0]}, {formatDate(now)} · {formatTime(now)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {data === null && (
            <>
              <SkeletonKpiCard label="Carregando conexão MetaTrader" />
              <SkeletonKpiCard label="Carregando última importação" />
              <SkeletonKpiCard label="Carregando usuários" />
            </>
          )}
          {data !== null && (<><div className="card" style={{ padding: 18 }} data-card-status="mt">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-2)" }}>Conexão MetaTrader</span>
              {data && mtChip(data.mt.status)}
            </div>
            <div style={{ marginTop: 12, font: "600 22px/1.1 var(--font-sans)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em", color: "var(--text-1)" }}>
              {data?.mt.last_quote_at ? formatTimeSeconds(data.mt.last_quote_at) : "—"}
            </div>
            <div style={{ marginTop: 4, font: "400 11.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>última atualização de cotações</div>
            <button type="button" onClick={() => navigate("/admin/metatrader")} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 5, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)", width: "100%" }}>
              Ver conexão<i className="icon-chevron-right" style={{ fontSize: 13 }} aria-hidden />
            </button>
          </div>

          <div className="card" style={{ padding: 18 }} data-card-status="import">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-2)" }}>Última importação</span>
              {data?.lastImport && (data.lastImport.status === "concluida" ? <StatusChip kind="success" dot={false}>Concluída</StatusChip> : <StatusChip kind="danger" dot={false}>Falhou</StatusChip>)}
            </div>
            <div style={{ marginTop: 12, font: "600 22px/1.1 var(--font-sans)", letterSpacing: "-0.015em", color: "var(--text-1)" }}>
              {data?.lastImport ? KIND_TITLES[data.lastImport.kind] : "—"}
            </div>
            <div style={{ marginTop: 4, font: "400 11.5px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>
              {data?.lastImport
                ? `${formatDate(data.lastImport.created_at).slice(0, 5)} ${formatTime(data.lastImport.created_at)} · ${formatInt(data.lastImport.counts?.validos ?? 0)} registros · por ${data.lastImport.author}`
                : "nenhuma importação ainda"}
            </div>
            <button type="button" onClick={() => navigate("/admin/importacoes")} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 5, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)", width: "100%" }}>
              Ver histórico<i className="icon-chevron-right" style={{ fontSize: 13 }} aria-hidden />
            </button>
          </div>

          <div className="card" style={{ padding: 18 }} data-card-status="users">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--text-2)" }}>Usuários</span>
              {data && data.users.pendingCodes > 0 && <StatusChip kind="warning" dot={false}>{data.users.pendingCodes} aguardando</StatusChip>}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "600 22px/1.1 var(--font-sans)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em", color: "var(--text-1)" }}>
                {data ? formatInt(data.users.active) : "—"}
              </span>
              <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-2)" }}>ativos de {data ? formatInt(data.users.total) : "—"}</span>
            </div>
            <div style={{ marginTop: 4, font: "400 11.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>
              {data ? `${formatInt(data.users.pendingCodes)} código${data.users.pendingCodes !== 1 ? "s" : ""} de acesso ainda não usado${data.users.pendingCodes !== 1 ? "s" : ""}` : ""}
            </div>
            <button type="button" onClick={() => navigate("/admin/usuarios")} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 5, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)", width: "100%" }}>
              Gerenciar usuários<i className="icon-chevron-right" style={{ fontSize: 13 }} aria-hidden />
            </button>
          </div>
          </>)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "flex-start" }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "600 13.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Atividade recente</span>
              <button type="button" onClick={() => navigate("/admin/auditoria")} style={{ display: "flex", alignItems: "center", gap: 5, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)" }}>
                Auditoria completa<i className="icon-chevron-right" style={{ fontSize: 13 }} aria-hidden />
              </button>
            </div>
            {data === null && <SkeletonCardRows rows={4} height={56} icon={30} radius={0} className="" trailing={44} label="Carregando atividade recente" />}
            {(data?.activity ?? []).map((a, i) => {
              const meta = CATEGORY_ICON[a.category] ?? { icon: "icon-info" };
              return (
                <div key={a.id} style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderTop: i > 0 ? "1px solid var(--divider)" : undefined }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: meta.warn ? "var(--warning-tint)" : "var(--chip-pill-bg)", color: meta.warn ? "var(--warning)" : "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <i className={`${meta.icon}`} style={{ fontSize: 15 }} aria-hidden />
                  </span>
                  <span style={{ flex: 1, font: "400 12.5px/1.4 var(--font-sans)", color: "var(--field-label)" }}>
                    {a.event}
                    {a.detail ? ` — ${a.detail}` : ""}
                  </span>
                  <span style={{ font: "400 11px/1 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>{formatTime(a.at)}</span>
                </div>
              );
            })}
            {data !== null && data.activity.length === 0 && (
              <div style={{ padding: "18px", font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>Nenhum evento ainda.</div>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ font: "600 13.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Salas hoje</span>
              <span style={{ font: "400 11px/1 var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}>{formatDate(now).slice(0, 5)}</span>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {data === null && <SkeletonCardRows rows={3} height={44} radius={8} className="" lead={44} label="Carregando salas de hoje" />}
              {(data?.roomsToday ?? []).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 44, flex: "none", font: "500 10.5px/1 var(--font-mono)", color: "var(--text-3)" }}>{r.hour}</span>
                  <span style={{ flex: 1, background: i === 0 ? "var(--brand-tint)" : "var(--chip-pill-bg)", borderRadius: 8, padding: "8px 11px" }}>
                    <span style={{ display: "block", font: "600 11.5px/1.3 var(--font-sans)", color: i === 0 ? "var(--agenda-title)" : "var(--field-label)" }}>
                      {r.room} · {r.owner}
                    </span>
                    <span style={{ display: "block", marginTop: 2, font: "400 10.5px/1.3 var(--font-sans)", color: i === 0 ? "var(--agenda-meta)" : "var(--text-2)" }}>{r.title}</span>
                  </span>
                </div>
              ))}
              {data !== null && data.roomsToday.length === 0 && (
                <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>Nenhuma reserva para hoje.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
