/** Tela 22 · Auditoria — quadro "20-22 Salas e auditoria escuro" (#4f). Filtrável e exportável em CSV. */
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "./AdminShell";
import { supabase } from "../../lib/supabase";
import { formatDate, formatTime } from "../../lib/format";

interface AuditRow {
  id: number;
  at: string;
  category: string;
  event: string;
  detail: string | null;
  actor_name: string | null;
}

const CATEGORY_META: Record<string, { label: string; chip: string }> = {
  login: { label: "Login", chip: "chip--info" },
  importacao: { label: "Importação", chip: "chip--success" },
  usuario: { label: "Usuário", chip: "chip--warning" },
  codigo: { label: "Usuário", chip: "chip--warning" },
  metatrader: { label: "MetaTrader", chip: "chip--danger" },
  cadastro: { label: "Cadastro", chip: "chip--info" },
};

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [category, setCategory] = useState("todos");
  const [actor, setActor] = useState("todos");
  const [days, setDays] = useState(7);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      let q = supabase.from("audit_log").select("*").gte("at", since).order("at", { ascending: false }).limit(200);
      if (category !== "todos") q = category === "usuario" ? q.in("category", ["usuario", "codigo"]) : q.eq("category", category);
      const { data } = await q;
      setRows(((data ?? []) as AuditRow[]).filter((r) => actor === "todos" || r.actor_name === actor));
    })();
  }, [category, actor, days]);

  const actors = useMemo(() => [...new Set((rows ?? []).map((r) => r.actor_name).filter(Boolean))] as string[], [rows]);

  function exportCsv() {
    const lines = [["quando", "categoria", "evento", "detalhe", "usuario"], ...(rows ?? []).map((r) => [
      `${formatDate(r.at)} ${formatTime(r.at)}`, CATEGORY_META[r.category]?.label ?? r.category, r.event, r.detail ?? "", r.actor_name ?? "",
    ])];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `auditoria-elev-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const whenLabel = (at: string) => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const day = new Date(at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const prefix = day === today ? "hoje" : day === yesterday ? "ontem" : formatDate(at).slice(0, 5);
    return `${prefix} ${formatTime(at)}`;
  };

  return (
    <AdminShell
      title="Auditoria"
      actions={
        <>
          <span className="admin-search" style={{ width: "auto", paddingRight: 8 }}>
            <select aria-label="Filtrar eventos" value={category} onChange={(e) => setCategory(e.target.value)} style={{ border: "none", outline: "none", background: "none", font: "500 11.5px/1 var(--font-sans)", color: "var(--text-body)" }}>
              <option value="todos">Todos os eventos</option>
              <option value="login">Login</option>
              <option value="importacao">Importação</option>
              <option value="usuario">Usuário</option>
              <option value="metatrader">MetaTrader</option>
              <option value="cadastro">Cadastro</option>
            </select>
          </span>
          <span className="admin-search" style={{ width: "auto", paddingRight: 8 }}>
            <select aria-label="Filtrar usuários" value={actor} onChange={(e) => setActor(e.target.value)} style={{ border: "none", outline: "none", background: "none", font: "500 11.5px/1 var(--font-sans)", color: "var(--text-body)" }}>
              <option value="todos">Todos os usuários</option>
              {actors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </span>
          <span className="admin-search" style={{ width: "auto", paddingRight: 8 }}>
            <select aria-label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ border: "none", outline: "none", background: "none", font: "500 11.5px/1 var(--font-sans)", color: "var(--text-body)", fontVariantNumeric: "tabular-nums" }}>
              <option value={7}>últimos 7 dias</option>
              <option value={30}>últimos 30 dias</option>
              <option value={90}>últimos 90 dias</option>
            </select>
          </span>
          <button type="button" className="row-btn" onClick={exportCsv}>
            <i className="icon-download" aria-hidden />
            Exportar CSV
          </button>
        </>
      }
    >
      <div className="users-table" style={{ borderRadius: 14 }}>
        <div className="users-table__head" style={{ gridTemplateColumns: "0.8fr 0.9fr 1.9fr 0.9fr" }}>
          <span>Quando</span>
          <span>Evento</span>
          <span>Detalhe</span>
          <span>Usuário</span>
        </div>
        {(rows ?? []).map((r) => {
          const meta = CATEGORY_META[r.category] ?? { label: r.category, chip: "chip--neutral" };
          return (
            <div key={r.id} className="users-table__row" style={{ gridTemplateColumns: "0.8fr 0.9fr 1.9fr 0.9fr" }}>
              <span style={{ font: "400 11px var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{whenLabel(r.at)}</span>
              <span>
                <span className={`chip ${meta.chip}`} style={{ height: 24, padding: "0 8px", fontSize: 10.5 }}>{meta.label}</span>
              </span>
              <span style={{ color: "var(--text-body)" }}>
                {r.event}
                {r.detail ? ` · ${r.detail}` : ""}
              </span>
              <span style={{ color: "var(--text-body)" }}>{r.actor_name ?? "sistema"}</span>
            </div>
          );
        })}
        {rows !== null && rows.length === 0 && (
          <div style={{ padding: 18, font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>Nenhum evento no período.</div>
        )}
      </div>
    </AdminShell>
  );
}
