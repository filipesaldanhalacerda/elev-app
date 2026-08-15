/** Tela 15 · Central de notificações — quadro "15 Notificacoes claro" (#3g). */
import { useEffect, useMemo, useState } from "react";
import { MobileShell } from "../components/MobileShell";
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
  alerta_atingido: { icon: "ph-target", brand: true },
  card_delegado: { icon: "ph-kanban" },
  lembrete_diario: { icon: "ph-bell-ringing" },
  importacao: { icon: "ph-upload-simple" },
  reserva_confirmada: { icon: "ph-door-open" },
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
      label: day === today ? `Hoje · ${formatDate(day).slice(0, 5)}` : day === yesterday ? `Ontem · ${formatDate(day).slice(0, 5)}` : formatDate(day),
      items,
    }));
  }, [rows]);

  async function markAllRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", profile!.id);
    await load();
  }

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)", paddingRight: 16 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="page-header__title">Notificações</span>
          {unreadCount > 0 && <span className="tab-42__count">{unreadCount} nova{unreadCount > 1 ? "s" : ""}</span>}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            style={{ height: 44, display: "flex", alignItems: "center", padding: "0 10px", marginRight: -10, borderRadius: 10, font: "600 12px/1 var(--font-sans)", color: "var(--ghost-text)" }}
            onClick={markAllRead}
          >
            Marcar lidas
          </button>
        )}
      </header>

      <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {rows === null && <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />}

        {rows !== null && rows.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="ph ph-bell" aria-hidden /></span>
            <span className="empty-state__title">Sem notificações</span>
            <span className="empty-state__desc">Alertas atingidos, cards delegados, reservas e importações chegam aqui.</span>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.day} className="notif-list" style={{ borderRadius: 14, boxShadow: "var(--elev-1)" }}>
            <div className="notif-group__day" style={{ borderTop: "none" }}>{g.label}</div>
            {g.items.map((n) => {
              const meta = KIND_ICON[n.kind] ?? { icon: "ph-bell" };
              const unread = !n.read_at;
              return (
                <div key={n.id} className={`notif${unread ? " notif--unread" : ""}`} style={{ minHeight: 66 }}>
                  <span className="notif__dot" aria-hidden />
                  <span
                    style={{
                      width: 30, height: 30, borderRadius: 9, flex: "none",
                      background: meta.brand ? "var(--brand-tint)" : "var(--chip-pill-bg)",
                      color: meta.brand ? "var(--ghost-text)" : "var(--field-label)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <i className={`ph ${meta.icon}`} style={{ fontSize: 15 }} aria-hidden />
                  </span>
                  <span className="notif__main">
                    <span className="notif__title">{n.title}</span>
                    <span className="notif__time">
                      {n.body ? `${n.body} · ` : ""}
                      {formatTime(n.created_at)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {rows !== null && rows.length > 0 && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
            Não lida: fundo destacado, ponto brand e título em peso 600. Lida: fundo normal, ponto neutro.
          </div>
        )}
      </div>
    </MobileShell>
  );
}
