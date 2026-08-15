/**
 * Tela 14 · Sala de reunião — quadros "14 Sala de reuniao claro" e
 * "14 Reserva conflito escuro" (#3f). Conflito impedido com alternativas em um toque.
 */
import { useMemo, useState } from "react";
import { MobileShell } from "../components/MobileShell";
import { Button } from "../components/Button";
import { Banner } from "../components/feedback";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  useRooms, useDayReservations, useMyReservations, createReservation, findAlternatives, cancelReservation,
  parsePeriod, type ConflictInfo, type Alternative, type Room,
} from "../lib/rooms";
import { formatDate } from "../lib/format";

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const fmtHM = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function NewReservation({ rooms, defaults, onClose, onCreated }: {
  rooms: Room[];
  defaults: { roomId: string; day: string; start: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [roomId, setRoomId] = useState(defaults.roomId);
  const [day, setDay] = useState(defaults.day);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(() => `${String(Number(defaults.start.slice(0, 2)) + 1).padStart(2, "0")}:00`);
  const [title, setTitle] = useState("");
  const [account, setAccount] = useState("");
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
  }, []);

  const roomName = rooms.find((r) => r.id === roomId)?.name ?? "";
  const canConfirm = title.trim().length > 0 && (!conflict || chosen !== null);

  async function confirm() {
    setSaving(true);
    let rid = roomId, d = day, s = start, e = end;
    if (conflict && chosen !== null) {
      const alt = alternatives[chosen];
      rid = alt.roomId;
      s = alt.start;
      e = alt.end;
    }
    const result = await createReservation(profile!.id, rid, d, s, e, title.trim(), account || null);
    setSaving(false);
    if (result.ok) {
      onCreated();
      onClose();
      return;
    }
    setConflict(result.conflict ?? { title: "Reserva existente", owner_name: null, start: s, end: e });
    setChosen(null);
    setAlternatives(await findAlternatives(rooms, rid, d, s, e));
  }

  return (
    <div className="mobile-shell" style={{ position: "fixed", inset: 0, zIndex: 80, overflowY: "auto" }}>
      <header className="ficha-header" style={{ background: "var(--surface)" }}>
        <span className="ficha-header__lead">
          <button type="button" className="ficha-header__back" aria-label="Voltar" onClick={onClose}>
            <i className="ph ph-arrow-left" aria-hidden />
          </button>
          <span className="mheader__title">Nova reserva</span>
        </span>
      </header>
      <div style={{ flex: 1, padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 13, background: "var(--bg)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field">
            <label className="field__label" htmlFor="res-sala" style={{ display: "block" }}>Sala</label>
            <div className="field__box" style={{ height: 46 }}>
              <select id="res-sala" className="field__input" style={{ appearance: "none", width: "100%" }} value={roomId} onChange={(e) => { setRoomId(e.target.value); setConflict(null); }}>
                {rooms.filter((r) => r.is_active).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <i className="ph ph-caret-down field__caret" aria-hidden />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="res-data" style={{ display: "block" }}>Data</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="res-data" className="field__input" type="date" value={day} onChange={(e) => { setDay(e.target.value); setConflict(null); }} style={{ fontVariantNumeric: "tabular-nums" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field">
            <label className="field__label" htmlFor="res-inicio" style={{ display: "block" }}>Início</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="res-inicio" className="field__input" type="time" value={start} onChange={(e) => { setStart(e.target.value); setConflict(null); }} style={{ fontVariantNumeric: "tabular-nums" }} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="res-fim" style={{ display: "block" }}>Fim</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="res-fim" className="field__input" type="time" value={end} onChange={(e) => { setEnd(e.target.value); setConflict(null); }} style={{ fontVariantNumeric: "tabular-nums" }} />
            </div>
          </div>
        </div>

        {conflict && (
          <Banner kind="danger" title={`A ${roomName} já está reservada das ${conflict.start} às ${conflict.end}`}>
            {conflict.title}
            {conflict.owner_name ? ` — ${conflict.owner_name}` : ""}. Escolha um horário livre ou outra sala.
          </Banner>
        )}

        {conflict && alternatives.length > 0 && (
          <div>
            <span className="field__label" style={{ display: "block", marginBottom: 8 }}>Alternativas livres</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {alternatives.map((alt, i) => (
                <button key={i} type="button" className={`alt-chip${chosen === i ? " alt-chip--active" : ""}`} onClick={() => setChosen(i)}>
                  <i className={`ph ${alt.sameRoom ? "ph-clock" : "ph-door-open"}`} aria-hidden />
                  {alt.roomName} · {alt.start}–{alt.end}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="res-titulo" style={{ display: "block" }}>Título</label>
          <div className="field__box" style={{ height: 46 }}>
            <input id="res-titulo" className="field__input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="res-cliente" style={{ display: "block" }}>Cliente · opcional</label>
          <div className="field__box" style={{ height: 46 }}>
            <select id="res-cliente" className="field__input" style={{ appearance: "none", width: "100%" }} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Vincular cliente</option>
              {clients.map((c) => (
                <option key={c.account_code} value={c.account_code}>{c.name ?? `Conta ${c.account_code}`}</option>
              ))}
            </select>
            <i className="ph ph-caret-down field__caret" aria-hidden />
          </div>
        </div>

        <div style={{ marginTop: 4 }}>
          <Button block disabled={!canConfirm} loading={saving} onClick={confirm}>
            Confirmar reserva
          </Button>
        </div>
        {conflict && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", textAlign: "center", paddingBottom: 16 }}>
            Escolha uma alternativa livre para liberar a confirmação.
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

export default function Rooms() {
  const { profile } = useAuth();
  const { rooms } = useRooms();
  const [day] = useState(todayISO());
  const [roomId, setRoomId] = useState<string | null>(null);
  const activeRoom = roomId ?? rooms?.find((r) => r.is_active)?.id ?? null;
  const { rows: reservations, reload: reloadDay } = useDayReservations(activeRoom, day);
  const { rows: mine, reload: reloadMine } = useMyReservations(profile?.id);
  const [creating, setCreating] = useState<{ start: string } | null>(null);

  const slots = useMemo(() => {
    const list = reservations ?? [];
    return HOURS.slice(0, 5).map((hour) => {
      const hourStart = new Date(`${day}T${hour}:00-03:00`).getTime();
      const hourEnd = hourStart + 3600000;
      const hit = list.find((r) => {
        const p = parsePeriod(r.period);
        return p.start.getTime() < hourEnd && p.end.getTime() > hourStart;
      });
      if (!hit) return { hour, kind: "free" as const };
      const p = parsePeriod(hit.period);
      const mineFlag = hit.owner === profile?.id;
      return {
        hour,
        kind: "busy" as const,
        mine: mineFlag,
        title: `${hit.title}${hit.owner_name && !mineFlag ? ` — ${hit.owner_name}` : ""}`,
        meta: `${fmtHM(p.start)}–${fmtHM(p.end)}${mineFlag ? " · sua reserva" : ""}`,
      };
    });
  }, [reservations, day, profile?.id]);

  const reloadAll = () => {
    void reloadDay();
    void reloadMine();
  };

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Sala de reunião</span>
        <Button icon="ph-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => setCreating({ start: "10:00" })}>
          Reservar
        </Button>
      </header>

      <div className="room-toolbar">
        <div className="room-toolbar__row">
          <span className="date-chip">
            <i className="ph ph-calendar-blank" aria-hidden />
            hoje, {formatDate(day).slice(0, 5)}
            <i className="ph ph-caret-down" aria-hidden />
          </span>
          {(rooms ?? []).map((r) => (
            <button key={r.id} type="button" className={`room-chip${activeRoom === r.id ? " room-chip--active" : ""}`} onClick={() => setRoomId(r.id)}>
              {r.name} · {r.capacity} lug.
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        {rooms !== null && rooms.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="ph ph-door-open" aria-hidden /></span>
            <span className="empty-state__title">Nenhuma sala cadastrada</span>
            <span className="empty-state__desc">O administrador cadastra as salas na área administrativa.</span>
          </div>
        )}

        {activeRoom && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {slots.map((slot) =>
                slot.kind === "free" ? (
                  <div key={slot.hour} className="agenda__row">
                    <span className="agenda__hour">{slot.hour}</span>
                    <button type="button" className="agenda__free agenda__free--action" onClick={() => setCreating({ start: slot.hour })}>
                      livre
                    </button>
                  </div>
                ) : (
                  <div key={slot.hour} className="agenda__row">
                    <span className="agenda__hour">{slot.hour}</span>
                    <span className={`agenda__block${slot.mine ? "" : " agenda__block--other"}`} style={{ minHeight: 44 }}>
                      <span className="agenda__block-title">{slot.title}</span>
                      <span className="agenda__block-meta">{slot.meta}</span>
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div>
          <div style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)", marginBottom: 10 }}>Minhas reservas</div>
          <div className="client-list">
            {(mine ?? []).length === 0 && (
              <div style={{ padding: "18px 14px", font: "400 12px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
                Nenhuma reserva sua. Toque em um horário livre para reservar.
              </div>
            )}
            {(mine ?? []).map((r) => {
              const p = parsePeriod(r.period);
              const isToday = p.start.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === todayISO();
              return (
                <div key={r.id} className="reservation-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="reservation-row__title">{r.title}</span>
                    <span className="reservation-row__meta">
                      {isToday ? "hoje" : formatDate(p.start).slice(0, 5)} · {r.room_name} · {fmtHM(p.start)}–{fmtHM(p.end)}
                    </span>
                  </span>
                  <Button
                    variant="destructive"
                    icon="ph-prohibit"
                    onClick={async () => {
                      await cancelReservation(r.id);
                      reloadAll();
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ height: 8 }} />
      </div>

      {creating && rooms && activeRoom && (
        <NewReservation
          rooms={rooms}
          defaults={{ roomId: activeRoom, day, start: creating.start }}
          onClose={() => setCreating(null)}
          onCreated={reloadAll}
        />
      )}
    </MobileShell>
  );
}
