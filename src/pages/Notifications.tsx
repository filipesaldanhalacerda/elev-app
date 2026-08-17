/** Tela 15 · Central de notificações — quadro "15 Notificacoes claro" (#3g). */
import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { formatDate, formatTime } from "../lib/format";

interface NotifRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}

const KIND_ICON: Record<string, { icon: string; brand?: boolean }> = {
  alerta_atingido: { icon: "icon-radar", brand: true },
  card_delegado: { icon: "icon-square-check" },
  lembrete_diario: { icon: "icon-bell-ring" },
  importacao: { icon: "icon-upload" },
  reserva_confirmada: { icon: "icon-presentation" },
  movimentacao: { icon: "icon-arrow-down-up", brand: true },
};

export default function Notifications() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<NotifRow[] | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as NotifRow[]);
  };
  useEffect(() => {
    if (profile) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const unreadCount = (rows ?? []).filter((r) => !r.read_at).length;

  const groups = useMemo(() => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const map = new Map<string, NotifRow[]>();
    for (const r of rows ?? []) {
      const day = new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      map.set(day, [...(map.get(day) ?? []), r]);
    }
    return [...map.entries()].map(([day, items]) => ({
      day,
      // padrão de data do sistema (igual à tela de Tarefas)
      label: day === today ? `Hoje — ${formatDate(day)}` : day === yesterday ? `Ontem — ${formatDate(day)}` : formatDate(day),
      items,
    }));
  }, [rows]);

  async function markAllRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", profile!.id);
    await load();
  }

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState(false);
  const toggleSel = (id: string) =>
    setSelectedIds((s) => {
      const nx = new Set(s);
      if (nx.has(id)) nx.delete(id);
      else nx.add(id);
      return nx;
    });
  async function batchDelete() {
    await supabase.from("notifications").delete().in("id", [...selectedIds]);
    setBatchConfirm(false);
    setSelecting(false);
    setSelectedIds(new Set());
    await load();
  }

  async function markRead(n: NotifRow) {
    if (n.read_at) return;
    setRows((r) => (r ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
  }

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)", paddingRight: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="page-header__title">Notificações</span>
          {unreadCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: "var(--brand-tint)", font: "600 11.5px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--ghost-text)" }}>
              {unreadCount} nova{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            style={{ height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", marginRight: -10, borderRadius: 10, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)" }}
            onClick={markAllRead}
          >
            <i className="icon-check-check" style={{ fontSize: 15 }} aria-hidden />
            Marcar lidas
          </button>
        )}
      </header>

      <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {rows !== null && rows.length > 0 && (
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

        {rows === null && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}

        {rows !== null && rows.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="icon-bell" aria-hidden /></span>
            <span className="empty-state__title">Sem notificações</span>
            <span className="empty-state__desc">Alertas atingidos, cards delegados, reservas e importações chegam aqui.</span>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.day}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, font: "600 11px/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", fontVariantNumeric: "tabular-nums", color: "var(--text-2)", padding: "0 2px 8px" }}>
              {g.label}
              <span style={{ color: "var(--text-3)", fontWeight: 400 }}>· {g.items.length}</span>
            </div>
            <div className="notif-list" style={{ borderRadius: 14, boxShadow: "var(--elev-1)" }}>
              {g.items.map((n) => {
                const meta = KIND_ICON[n.kind] ?? { icon: "icon-bell" };
                const unread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif${unread ? " notif--unread" : ""}`}
                    style={{ minHeight: 66, width: "100%", textAlign: "left" }}
                    aria-label={selecting ? `Selecionar notificação ${n.title}` : undefined}
                    onClick={() => (selecting ? toggleSel(n.id) : void markRead(n))}
                  >
                    {selecting && (
                      <span aria-hidden style={{ width: 24, height: 24, flex: "none", borderRadius: 999, border: selectedIds.has(n.id) ? "none" : "2px solid var(--border-strong)", background: selectedIds.has(n.id) ? "var(--action)" : "transparent", color: "var(--on-action)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {selectedIds.has(n.id) && <i className="icon-check" style={{ fontSize: 13 }} />}
                      </span>
                    )}
                    <span className="notif__dot" aria-hidden />
                    <span
                      style={{
                        width: 32, height: 32, borderRadius: 10, flex: "none",
                        background: meta.brand ? "var(--brand-tint)" : "var(--chip-pill-bg)",
                        color: meta.brand ? "var(--ghost-text)" : "var(--field-label)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <i className={`${meta.icon}`} style={{ fontSize: 16 }} aria-hidden />
                    </span>
                    <span className="notif__main">
                      <span className="notif__title">{n.title}</span>
                      <span className="notif__time">
                        {n.body ? `${n.body} · ` : ""}
                        {formatTime(n.created_at)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {rows !== null && rows.length > 0 && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
            Toque numa notificação para marcá-la como lida.
          </div>
        )}
      </div>

      {selecting && selectedIds.size > 0 && (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: 96, zIndex: 60, maxWidth: 488, margin: "0 auto" }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 14px", boxShadow: "var(--elev-2)" }}>
            <span style={{ flex: 1, font: "600 12.5px/1.35 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-1)" }}>
              {selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button variant="destructive" style={{ height: 44, fontSize: 12.5 }} onClick={() => setBatchConfirm(true)}>
              Apagar
            </Button>
          </div>
        </div>
      )}

      {batchConfirm && (
        <Sheet label="Apagar notificações" onClose={() => setBatchConfirm(false)}>
          <div className="sheet__title">Apagar {selectedIds.size} notificaç{selectedIds.size > 1 ? "ões" : "ão"}?</div>
          <div style={{ marginTop: 8, font: "400 12.5px/1.55 var(--font-sans)", color: "var(--text-2)" }}>
            Elas saem da central de vez. Alertas e histórico de disparos não são afetados.
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setBatchConfirm(false)}>Voltar</Button>
            <Button variant="destructive" onClick={batchDelete}>Apagar</Button>
          </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
