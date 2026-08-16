/**
 * Tela 14 · Sala de reunião — quadros "14 Sala de reuniao claro" e
 * "14 Reserva conflito escuro" (#3f). Conflito impedido com alternativas em um toque.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { DetailSheet } from "../components/DetailSheet";
import { Button } from "../components/Button";
import { CharLimit } from "../components/Field";
import { Banner } from "../components/feedback";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  useRooms, useRoomReservations, useMyReservations, createReservation, findAlternatives, cancelReservation,
  parsePeriod, type ConflictInfo, type Alternative, type Room, type Reservation,
} from "../lib/rooms";
import { formatDate, addMinutes, durationLabel, nextSlotSP } from "../lib/format";


const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const fmtHM = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const DURATIONS = [30, 60, 90, 120];

/** Início sugerido para HOJE: sempre um horário à frente (limitado à janela das salas). */
export function suggestedStart(day: string): string {
  const next = nextSlotSP();
  if (day !== next.day) return day > next.day ? "10:00" : next.start;
  return next.start > "17:00" ? "17:00" : next.start;
}

export function NewReservation({ rooms, defaults, onClose, onCreated }: {
  rooms: Room[];
  defaults: { roomId: string; day: string; start: string; account?: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [roomId, setRoomId] = useState(defaults.roomId);
  const [day, setDay] = useState(defaults.day);
  const [start, setStart] = useState(defaults.start);
  // início + DURAÇÃO no lugar de fim separado — o fim é calculado, nunca inverte
  const [duration, setDuration] = useState(60);
  const end = addMinutes(start, duration);
  const [title, setTitle] = useState("");
  const [account, setAccount] = useState(defaults.account ?? "");
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
  }, []);

  const roomName = rooms.find((r) => r.id === roomId)?.name ?? "";
  // F2-10: reserva não pode ficar no passado.
  const past = new Date(`${day}T${start}:00-03:00`).getTime() < Date.now() - 60000;
  const canConfirm = title.trim().length > 0 && !past && (!conflict || chosen !== null);

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
    <Sheet label="Nova reserva" onClose={onClose}>
        <div className="sheet__title">Nova reserva</div>
        <div className="sheet__fields" style={{ gap: 13 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div className="field">
            <label className="field__label" htmlFor="res-sala" style={{ display: "block" }}>Sala</label>
            <div className="field__box" style={{ height: 46 }}>
              <select id="res-sala" className="field__input" style={{ appearance: "none", width: "100%" }} value={roomId} onChange={(e) => { setRoomId(e.target.value); setConflict(null); }}>
                {rooms.filter((r) => r.is_active).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <i className="icon-chevron-down field__caret" aria-hidden />
            </div>
          </div>
          <div className={`field${past ? " field--error" : ""}`}>
            <label className="field__label" htmlFor="res-data" style={{ display: "block" }}>Data</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="res-data" className="field__input" type="date" min={todayISO()} value={day} onChange={(e) => { setDay(e.target.value); setConflict(null); }} style={{ fontVariantNumeric: "tabular-nums" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div className="field">
            <label className="field__label" htmlFor="res-inicio" style={{ display: "block" }}>Início</label>
            <div className="field__box" style={{ height: 46 }}>
              <input
                id="res-inicio"
                className="field__input"
                type="time"
                value={start}
                onChange={(e) => { setStart(e.target.value); setConflict(null); }}
                style={{ fontVariantNumeric: "tabular-nums" }}
              />
            </div>
          </div>
          <div className="field">
            <span className="field__label" style={{ display: "block" }}>Termina</span>
            <div className="field__box field__box--tabular" style={{ height: 46 }}>
              <input className="field__input" value={end} disabled readOnly aria-label="Fim calculado" />
            </div>
          </div>
        </div>
        <div className="field">
          <span className="field__label" style={{ display: "block" }}>Duração</span>
          <div className="segmented" style={{ height: 46 }}>
            {DURATIONS.map((d) => (
              <button key={d} type="button" className={`segmented__item${duration === d ? " segmented__item--active" : ""}`} onClick={() => { setDuration(d); setConflict(null); }}>
                {durationLabel(d)}
              </button>
            ))}
          </div>
        </div>

        {conflict && (
          <Banner kind="danger" title={`A ${roomName} já está reservada das ${conflict.start} às ${conflict.end}`}>
            {conflict.title}
            {conflict.owner_name ? ` — ${conflict.owner_name}` : ""}.
          </Banner>
        )}

        {conflict && alternatives.length > 0 && (
          <div>
            <span className="field__label" style={{ display: "block", marginBottom: 8 }}>Alternativas livres</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alternatives.map((alt, i) => (
                <button key={i} type="button" className={`alt-chip alt-chip--row${chosen === i ? " alt-chip--active" : ""}`} onClick={() => setChosen(i)}>
                  <i className={`${alt.sameRoom ? "icon-clock" : "icon-door-open"}`} aria-hidden />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {alt.roomName}
                    <span className="alt-chip__meta">{alt.sameRoom ? "mesma sala, outro horário" : "outra sala, mesmo horário"}</span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{alt.start}–{alt.end}</span>
                  <i className={`${chosen === i ? "icon-circle-check" : "icon-circle"} alt-chip__check`} aria-hidden />
                </button>
              ))}
            </div>
            {chosen === null && (
              <div style={{ marginTop: 8, font: "400 11px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
                Escolha uma alternativa livre para liberar a confirmação.
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="res-titulo" style={{ display: "block" }}>Título</label>
          <div className="field__box" style={{ height: 46 }}>
            <input id="res-titulo" className="field__input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <CharLimit value={title} max={60} />
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
            <i className="icon-chevron-down field__caret" aria-hidden />
          </div>
        </div>

        {past && (
          <div className="field--error">
            <div className="field__help">
              <i className="icon-circle-alert" aria-hidden />
              Não é possível reservar um horário no passado.
            </div>
          </div>
        )}
        </div>

        <div className="sheet__footer" style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canConfirm} loading={saving} onClick={confirm}>
            Confirmar reserva
          </Button>
        </div>
    </Sheet>
  );
}

const spDayOf = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export default function Rooms() {
  const { profile } = useAuth();
  const { rooms } = useRooms();
  const [params] = useSearchParams();
  const [day, setDay] = useState(todayISO());
  const [stripStart, setStripStart] = useState(todayISO());
  const [roomId, setRoomId] = useState<string | null>(null);
  const activeRoom = roomId ?? rooms?.find((r) => r.is_active)?.id ?? null;
  const activeRoomName = rooms?.find((r) => r.id === activeRoom)?.name ?? "";
  const { rows: allReservations, reload: reloadDay } = useRoomReservations(activeRoom);
  const { rows: mine, reload: reloadMine } = useMyReservations(profile?.id);
  const [creating, setCreating] = useState<{ start: string; account?: string } | null>(
    params.get("novo") !== null ? { start: suggestedStart(todayISO()), account: params.get("cliente") ?? undefined } : null
  );
  // cancelar exige confirmação — e só as PRÓPRIAS reservas aparecem aqui (RLS impede as dos colegas)
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [details, setDetails] = useState<Reservation | null>(null);

  function jumpTo(iso: string) {
    setDay(iso);
    setStripStart(iso);
  }

  // mesmo padrão da Agenda: faixa de 14 dias com marcador nos dias que têm reserva na sala ativa
  const daysWithReservation = useMemo(() => {
    const set = new Set<string>();
    for (const r of allReservations ?? []) set.add(spDayOf(parsePeriod(r.period).start));
    return set;
  }, [allReservations]);
  const stripZero = new Date(`${stripStart}T12:00:00-03:00`).getTime();
  const strip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(stripZero + i * 86400000);
    const iso = spDayOf(d);
    return {
      iso,
      dow: d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", ""),
      num: Number(iso.slice(8)),
      has: daysWithReservation.has(iso),
    };
  });
  const monthRaw = new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const monthLabel = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);

  // grade PROPORCIONAL (padrão da Agenda): bloco com a altura da duração; janela 08–18 elástica
  const HOUR_H = 48;
  const dayZero = new Date(`${day}T00:00:00-03:00`).getTime();
  const dayReservations = useMemo(
    () => (allReservations ?? []).filter((r) => spDayOf(parsePeriod(r.period).start) === day),
    [allReservations, day]
  );
  const [DAY_START, DAY_END] = (() => {
    let s = 8;
    let e = 18;
    for (const r of dayReservations) {
      const p = parsePeriod(r.period);
      s = Math.min(s, Math.floor((p.start.getTime() - dayZero) / 3600000));
      e = Math.max(e, Math.ceil((p.end.getTime() - dayZero) / 3600000));
    }
    return [Math.max(0, s), Math.min(24, e)];
  })();
  const gridHours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const positioned = (() => {
    const items = dayReservations
      .map((r) => {
        const p = parsePeriod(r.period);
        const s = Math.max((p.start.getTime() - dayZero) / 60000, DAY_START * 60);
        const f = Math.min((p.end.getTime() - dayZero) / 60000, DAY_END * 60);
        return { r, p, s, f };
      })
      .filter(({ s, f }) => f > s)
      .sort((a, b) => a.s - b.s);
    const laneEnds: number[] = [];
    const withLane = items.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.f);
      } else {
        laneEnds[lane] = it.f;
      }
      return { ...it, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    return withLane.map((it) => ({
      ...it,
      lanes,
      top: ((it.s - DAY_START * 60) / 60) * HOUR_H + 1,
      height: Math.max(22, ((it.f - it.s) / 60) * HOUR_H - 3),
    }));
  })();

  const reloadAll = () => {
    void reloadDay();
    void reloadMine();
  };

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Sala de reunião</span>
        <Button icon="icon-plus" style={{ height: 40, fontSize: 12.5 }} onClick={() => setCreating({ start: suggestedStart(day) })}>
          Reservar
        </Button>
      </header>

      <div style={{ flex: 1, padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* mês + hoje + contagem (padrão da Agenda) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 2px 10px" }}>
            {/* iOS/Android: input de data invisível por cima — abre o seletor nativo do aparelho */}
            <span
              data-salas-month
              style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}
            >
              {monthLabel}
              <i className="icon-chevron-down" style={{ fontSize: 13, color: "var(--text-2)" }} aria-hidden />
              <input
                type="date"
                aria-label="Escolher data da agenda"
                value={day}
                onChange={(e) => e.target.value && jumpTo(e.target.value)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              />
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {day !== todayISO() && (
                <button type="button" className="filter-chip" style={{ height: 26, fontSize: 11 }} onClick={() => jumpTo(todayISO())}>
                  hoje
                </button>
              )}
              <span style={{ font: "400 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                {dayReservations.length === 0 ? "sala livre" : `${dayReservations.length} reserva${dayReservations.length > 1 ? "s" : ""}`}
              </span>
            </span>
          </div>
          <div className="cal-strip">
            {strip.map((d) => (
              <button
                key={d.iso}
                type="button"
                data-salas-day={d.iso}
                className={`cal-day${d.iso === day ? " cal-day--active" : ""}${d.iso === todayISO() ? " cal-day--today" : ""}${d.has ? " cal-day--has" : ""}`}
                aria-label={`Dia ${formatDate(d.iso)}`}
                onClick={() => setDay(d.iso)}
              >
                <span className="cal-day__dow">{d.dow}</span>
                <span className="cal-day__num">{d.num}</span>
                <span className="cal-day__dot" style={{ opacity: d.has ? 1 : 0 }} aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <div className="room-toolbar" style={{ padding: 0 }}>
          <div className="room-toolbar__row">
            {(rooms ?? []).map((r) => (
              <button key={r.id} type="button" className={`room-chip${activeRoom === r.id ? " room-chip--active" : ""}`} onClick={() => setRoomId(r.id)}>
                {r.name} · {r.capacity} lug.
              </button>
            ))}
          </div>
        </div>

        {rooms !== null && rooms.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="icon-door-open" aria-hidden /></span>
            <span className="empty-state__title">Nenhuma sala cadastrada</span>
            <span className="empty-state__desc">O administrador cadastra as salas na área administrativa.</span>
          </div>
        )}

        {/* grade proporcional da sala — toque no vazio reserva naquela hora */}
        {activeRoom && (
          <div className="card" style={{ padding: "16px 14px" }}>
            <div className="cal-grid" style={{ height: (DAY_END - DAY_START) * HOUR_H + 1 }}>
              {gridHours.map((h) => (
                <div key={h} className="cal-grid__row" style={{ top: (h - DAY_START) * HOUR_H, height: HOUR_H }}>
                  <span className="cal-grid__hour">{String(h).padStart(2, "0")}:00</span>
                  <button
                    type="button"
                    className="cal-grid__cell"
                    aria-label={`Reservar às ${String(h).padStart(2, "0")}:00`}
                    onClick={() => {
                      const wanted = `${String(h).padStart(2, "0")}:00`;
                      const ahead = suggestedStart(day);
                      setCreating({ start: day === todayISO() && wanted < ahead ? ahead : wanted });
                    }}
                  />
                </div>
              ))}
              <div className="cal-grid__row" style={{ top: (DAY_END - DAY_START) * HOUR_H, height: 0 }}>
                <span className="cal-grid__hour">{DAY_END === 24 ? "00:00" : `${String(DAY_END).padStart(2, "0")}:00`}</span>
                <span className="cal-grid__cell" style={{ borderTopStyle: "solid" }} />
              </div>
              {positioned.map(({ r, p, lane, lanes, top, height }) => {
                const mineFlag = r.owner === profile?.id;
                const compact = height < 40;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`cal-event${mineFlag ? "" : " cal-event--other"}${compact ? " cal-event--compact" : ""}`}
                    style={{
                      top,
                      height,
                      ...(lanes > 1 ? { left: `calc(58px + (100% - 62px) / ${lanes} * ${lane})`, width: `calc((100% - 62px) / ${lanes})`, right: "auto" } : {}),
                    }}
                    aria-label={`Reserva ${r.title}`}
                    onClick={() => setDetails(r)}
                  >
                    <span className="cal-event__title">{r.title}{r.owner_name && !mineFlag ? ` — ${r.owner_name}` : ""}</span>
                    <span className="cal-event__meta">
                      {fmtHM(p.start)}–{fmtHM(p.end)}
                      {!compact && mineFlag ? " · sua reserva" : ""}
                    </span>
                  </button>
                );
              })}
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
                  <Button variant="destructive" icon="icon-ban" onClick={() => setCancelling(r)}>
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
          defaults={{ roomId: activeRoom, day, start: creating.start, account: creating.account }}
          onClose={() => setCreating(null)}
          onCreated={reloadAll}
        />
      )}

      {details && (() => {
        const p = parsePeriod(details.period);
        const mineFlag = details.owner === profile?.id;
        return (
          <DetailSheet
            label="Detalhes da reserva"
            icon="icon-presentation"
            title={details.title}
            chip={mineFlag ? "Sua reserva" : "Reserva de colega"}
            chipKind={mineFlag ? "success" : "neutral"}
            rows={[
              { icon: "icon-presentation", label: "Sala", value: activeRoomName },
              { icon: "icon-calendar", label: "Data", value: formatDate(p.start) },
              { icon: "icon-clock", label: "Horário", value: `${fmtHM(p.start)}–${fmtHM(p.end)}` },
              { icon: "icon-user", label: "Reservada por", value: mineFlag ? "Você" : details.owner_name ?? "colega" },
            ]}
            actions={mineFlag ? [{ icon: "icon-ban", label: "Cancelar reserva", danger: true, onClick: () => { setCancelling(details); setDetails(null); } }] : []}
            footnote={mineFlag ? undefined : "Só quem criou a reserva pode cancelá-la."}
            onClose={() => setDetails(null)}
          />
        );
      })()}

      {cancelling && (
        <Sheet label="Cancelar reserva" onClose={() => setCancelling(null)}>
            <div className="sheet__title">Cancelar esta reserva?</div>
            {(() => {
              const p = parsePeriod(cancelling.period);
              return (
                <div className="card" style={{ marginTop: 14, padding: 14 }}>
                  <span className="reservation-row__title">{cancelling.title}</span>
                  <span className="reservation-row__meta">
                    {formatDate(p.start)} · {cancelling.room_name ?? ""} · {fmtHM(p.start)}–{fmtHM(p.end)}
                  </span>
                </div>
              );
            })()}
            <div style={{ marginTop: 12, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
              O horário volta a ficar livre para os colegas. Só quem criou a reserva pode cancelá-la.
            </div>
            <div className="sheet__footer" style={{ marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setCancelling(null)}>Voltar</Button>
              <Button
                variant="destructive"
                icon="icon-ban"
                loading={cancelBusy}
                onClick={async () => {
                  setCancelBusy(true);
                  await cancelReservation(cancelling.id);
                  setCancelBusy(false);
                  setCancelling(null);
                  reloadAll();
                }}
              >
                Cancelar reserva
              </Button>
            </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
