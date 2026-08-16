/**
 * F2-03 · Agenda (Google) — composta SÓ de componentes desenhados
 * (page-header, sheet, campos #2c, linhas de reserva, estados vazios).
 * Criar, editar e cancelar agendamentos sincronizados com a conta Google conectada.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { Button } from "../components/Button";
import { GoogleLogo } from "../components/GoogleLogo";
import { addMinutes, durationLabel } from "../lib/format";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/format";
import {
  useGoogleStatus, listEvents, createEvent, updateEvent, cancelEvent,
  eventClientName, type GoogleEvent,
} from "../lib/google";

const todaySP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const spDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const DURATIONS = [30, 60, 90, 120];
// Períodos prontos (F2: "manhã / tarde / dia todo" sem encher a tela — ficam atrás do "Mais")
const PERIODS = [
  { label: "Manhã", start: "08:00", end: "12:00" },
  { label: "Tarde", start: "13:00", end: "18:00" },
  { label: "Dia todo", start: "08:00", end: "18:00" },
];
const minutesOf = (hmStr: string) => Number(hmStr.slice(0, 2)) * 60 + Number(hmStr.slice(3));

function EventSheet({ editing, initialDay, initialStart, onClose, onSaved }: { editing?: GoogleEvent; initialDay?: string; initialStart?: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(editing ? spDay(editing.starts_at) : initialDay ?? todaySP());
  const [start, setStart] = useState(editing ? hm(editing.starts_at) : initialStart ?? "10:00");
  // início + DURAÇÃO no lugar de fim separado — o fim é calculado, nunca inverte
  const [duration, setDuration] = useState(() =>
    editing ? Math.max(5, Math.round((new Date(editing.ends_at).getTime() - new Date(editing.starts_at).getTime()) / 60000)) : 60
  );
  const [more, setMore] = useState(() => !!editing && !DURATIONS.includes(duration));
  const end = addMinutes(start, duration);
  const [account, setAccount] = useState(editing?.account_code ?? "");
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
  }, []);

  // F2-10: agendamento não pode ficar no passado.
  const past = new Date(`${day}T${start}:00-03:00`).getTime() < Date.now() - 60000;
  const valid = title.trim().length > 0 && !past;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const starts_at = `${day}T${start}:00-03:00`;
      const ends_at = `${day}T${end}:00-03:00`;
      if (editing) await updateEvent(editing.id, { title: title.trim(), starts_at, ends_at, account_code: account || null });
      else await createEvent({ title: title.trim(), starts_at, ends_at, account_code: account || null });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet label={editing ? "Editar agendamento" : "Novo agendamento"} onClose={onClose}>
        <div className="sheet__title">{editing ? "Editar agendamento" : "Novo agendamento"}</div>
        <div className="sheet__fields" style={{ gap: 13 }}>
          <div className="field">
            <label className="field__label" htmlFor="ag-titulo" style={{ display: "block" }}>Título</label>
            <div className="field__box" style={{ height: 46 }}>
              <input id="ag-titulo" className="field__input" autoFocus={!editing} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div className={`field${past ? " field--error" : ""}`}>
              <label className="field__label" htmlFor="ag-data" style={{ display: "block" }}>Data</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="ag-data" className="field__input" type="date" min={todaySP()} value={day} onChange={(e) => setDay(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ag-inicio" style={{ display: "block" }}>Início</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="ag-inicio" className="field__input" type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
          </div>
          <div className="field">
            <span className="field__label" style={{ display: "block" }}>Duração</span>
            <div className="segmented" style={{ height: 46 }}>
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`segmented__item${!more && duration === d ? " segmented__item--active" : ""}`}
                  onClick={() => { setDuration(d); setMore(false); }}
                >
                  {durationLabel(d)}
                </button>
              ))}
              <button type="button" className={`segmented__item${more ? " segmented__item--active" : ""}`} onClick={() => setMore(true)}>
                Mais
              </button>
            </div>
            {more && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {PERIODS.map((p) => {
                    const active = start === p.start && end === p.end;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        className={`alt-chip${active ? " alt-chip--active" : ""}`}
                        style={{ flex: 1, justifyContent: "center" }}
                        onClick={() => { setStart(p.start); setDuration(minutesOf(p.end) - minutesOf(p.start)); }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="ag-termina" style={{ display: "block" }}>ou termina às</label>
                  <div className="field__box" style={{ height: 46 }}>
                    <input
                      id="ag-termina"
                      className="field__input"
                      type="time"
                      value={end}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && minutesOf(v) > minutesOf(start)) setDuration(minutesOf(v) - minutesOf(start));
                      }}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 7, font: "400 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }} data-ends-at>
              termina às {end} · {durationLabel(duration)}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ag-cliente" style={{ display: "block" }}>Cliente · opcional</label>
            <div className="field__box" style={{ height: 46 }}>
              <select id="ag-cliente" className="field__input" style={{ appearance: "none", width: "100%" }} value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.account_code} value={c.account_code}>{c.name ?? `Conta ${c.account_code}`}</option>
                ))}
              </select>
              <i className="ph ph-caret-down field__caret" aria-hidden />
            </div>
          </div>
          {(past || error) && (
            <div className="field--error">
              <div className="field__help">
                <i className="ph ph-warning-circle" aria-hidden />
                {error ?? "Não é possível agendar no passado."}
              </div>
            </div>
          )}
        </div>
        <div className="sheet__footer" style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid} loading={saving} onClick={save}>{editing ? "Salvar alterações" : "Agendar"}</Button>
        </div>
    </Sheet>
  );
}

export default function Agenda() {
  const navigate = useNavigate();
  const { status } = useGoogleStatus();
  const [events, setEvents] = useState<GoogleEvent[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<GoogleEvent | undefined>(undefined);
  const [cancelling, setCancelling] = useState<GoogleEvent | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actions, setActions] = useState<GoogleEvent | null>(null);
  const [selected, setSelected] = useState(todaySP());
  const [newDefaults, setNewDefaults] = useState<{ day: string; start: string } | null>(null);

  const load = async () => {
    try {
      setEvents(await listEvents());
    } catch {
      setEvents([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  // faixa de 14 dias (padrão dos calendários de mercado), com marcador nos dias com compromisso
  const eventsByDay = (() => {
    const map = new Map<string, GoogleEvent[]>();
    for (const e of events ?? []) {
      const d = spDay(e.starts_at);
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  })();
  const strip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    const iso = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return {
      iso,
      dow: d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", ""),
      num: Number(iso.slice(8)),
      has: (eventsByDay.get(iso) ?? []).length > 0,
    };
  });
  const monthRaw = new Date(`${selected}T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const monthLabel = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1); // "Agosto de 2026"
  const dayEvents = (eventsByDay.get(selected) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // grade do dia PROPORCIONAL: um bloco por compromisso, com a altura da duração
  // (30 min ocupa meia linha; 2h atravessa duas linhas em um bloco só).
  const HOUR_H = 48;
  const DAY_START = 8;
  const DAY_END = 20;
  const gridHours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const dayZero = new Date(`${selected}T00:00:00-03:00`).getTime();
  const positioned = (() => {
    const items = dayEvents
      .map((e) => {
        const s = Math.max((new Date(e.starts_at).getTime() - dayZero) / 60000, DAY_START * 60);
        const f = Math.min((new Date(e.ends_at).getTime() - dayZero) / 60000, DAY_END * 60);
        return { e, s, f };
      })
      .filter(({ s, f }) => f > s)
      .sort((a, b) => a.s - b.s);
    // pistas para sobreposição: eventos simultâneos dividem a largura
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

  return (
    <MobileShell active="inicio">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Agenda</span>
        <Button icon="ph-plus" style={{ height: 40, fontSize: 12.5 }} disabled={!status?.connected} onClick={() => { setEditing(undefined); setSheet(true); }}>
          Novo
        </Button>
      </header>

      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {status && !status.connected && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><GoogleLogo size={20} /></span>
            <span className="empty-state__title">Conta Google desconectada</span>
            <span className="empty-state__desc">Conecte a sua conta no Perfil para agendar e sincronizar compromissos.</span>
            <span className="empty-state__action">
              <Button onClick={() => navigate("/perfil")}>Ir ao Perfil</Button>
            </span>
          </div>
        )}

        {status?.connected && events === null && <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />}

        {status?.connected && events !== null && (
          <>
            {/* mês + faixa de dias */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 2px 10px" }}>
                <span style={{ font: "600 15px/1.2 var(--font-sans)", letterSpacing: "-0.01em", color: "var(--text-1)" }}>{monthLabel}</span>
                <span style={{ font: "400 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                  {dayEvents.length === 0 ? "dia livre" : `${dayEvents.length} compromisso${dayEvents.length > 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="cal-strip">
                {strip.map((d) => (
                  <button
                    key={d.iso}
                    type="button"
                    data-agenda-day={d.iso}
                    className={`cal-day${d.iso === selected ? " cal-day--active" : ""}${d.iso === todaySP() ? " cal-day--today" : ""}${d.has ? " cal-day--has" : ""}`}
                    aria-label={`Dia ${formatDate(d.iso)}`}
                    onClick={() => setSelected(d.iso)}
                  >
                    <span className="cal-day__dow">{d.dow}</span>
                    <span className="cal-day__num">{d.num}</span>
                    <span className="cal-day__dot" style={{ opacity: d.has ? 1 : 0 }} aria-hidden />
                  </button>
                ))}
              </div>
            </div>

            {/* grade do dia — o bloco tem a altura da duração; toque no vazio agenda naquela hora */}
            <div className="card" style={{ padding: "16px 14px" }}>
              <div className="cal-grid" style={{ height: (DAY_END - DAY_START) * HOUR_H + 1 }}>
                {gridHours.map((h) => (
                  <div key={h} className="cal-grid__row" style={{ top: (h - DAY_START) * HOUR_H, height: HOUR_H }}>
                    <span className="cal-grid__hour">{String(h).padStart(2, "0")}:00</span>
                    <button
                      type="button"
                      className="cal-grid__cell"
                      aria-label={`Agendar às ${String(h).padStart(2, "0")}:00`}
                      onClick={() => { setNewDefaults({ day: selected, start: `${String(h).padStart(2, "0")}:00` }); setEditing(undefined); setSheet(true); }}
                    />
                  </div>
                ))}
                <div className="cal-grid__row" style={{ top: (DAY_END - DAY_START) * HOUR_H, height: 0 }}>
                  <span className="cal-grid__hour">{DAY_END}:00</span>
                  <span className="cal-grid__cell" style={{ borderTopStyle: "solid" }} />
                </div>
                {positioned.map(({ e, lane, lanes, top, height }) => {
                  const compact = height < 40;
                  const laneWidth = lanes > 1 ? `calc((100% - 62px) / ${lanes})` : undefined;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`cal-event${compact ? " cal-event--compact" : ""}`}
                      style={{
                        top,
                        height,
                        ...(lanes > 1
                          ? { left: `calc(58px + (100% - 62px) / ${lanes} * ${lane})`, width: laneWidth, right: "auto" }
                          : {}),
                      }}
                      aria-label={`Agendamento ${e.title}`}
                      onClick={() => setActions(e)}
                    >
                      <span className="cal-event__title">
                        {e.reservation_id && <i className="ph ph-door-open" style={{ fontSize: 11, marginRight: 4 }} aria-hidden />}
                        {e.title}
                      </span>
                      <span className="cal-event__meta">
                        {hm(e.starts_at)}–{hm(e.ends_at)}
                        {!compact && eventClientName(e) ? ` · ${eventClientName(e)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {dayEvents.length === 0 && (
              <div style={{ font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-2)", textAlign: "center", padding: "0 2px" }}>
                Dia livre. Toque em um horário para agendar — vai direto para a sua agenda Google.
              </div>
            )}

            <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
              Compromissos sincronizados com {status.email}.
            </div>
          </>
        )}
        <div style={{ height: 8 }} />
      </div>

      {sheet && (
        <EventSheet
          editing={editing}
          initialDay={newDefaults?.day ?? selected}
          initialStart={newDefaults?.start}
          onClose={() => { setSheet(false); setEditing(undefined); setNewDefaults(null); }}
          onSaved={load}
        />
      )}

      {actions && (
        <Sheet label="Ações do agendamento" onClose={() => setActions(null)}>
          <div className="sheet__title">{actions.title}</div>
          <div style={{ marginTop: 6, font: "400 12px/1.5 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
            {formatDate(actions.starts_at)} · {hm(actions.starts_at)}–{hm(actions.ends_at)}
            {eventClientName(actions) ? ` · ${eventClientName(actions)}` : ""}
            {actions.reservation_id ? " · reserva de sala" : ""}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 14 }}>
            <button
              type="button"
              style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left" }}
              onClick={() => { setEditing(actions); setActions(null); setSheet(true); }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chip-pill-bg)", color: "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <i className="ph ph-pencil-simple" style={{ fontSize: 15 }} aria-hidden />
              </span>
              <span style={{ flex: 1, font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Editar agendamento</span>
              <i className="ph ph-caret-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
            </button>
            <button
              type="button"
              style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left", borderTop: "1px solid var(--divider)" }}
              onClick={() => { setCancelling(actions); setActions(null); }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--danger-action-hover-bg)", color: "var(--danger-action-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <i className="ph ph-prohibit" style={{ fontSize: 15 }} aria-hidden />
              </span>
              <span style={{ flex: 1, font: "600 13px/1.35 var(--font-sans)", color: "var(--danger-action-text)" }}>Cancelar agendamento</span>
            </button>
          </div>
          <div className="sheet__footer" style={{ marginTop: 14 }}>
            <Button variant="secondary" block onClick={() => setActions(null)}>Fechar</Button>
          </div>
        </Sheet>
      )}

      {cancelling && (
        <Sheet label="Cancelar agendamento" onClose={() => setCancelling(null)}>
          <div className="sheet__title">Cancelar este agendamento?</div>
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <span className="reservation-row__title">{cancelling.title}</span>
            <span className="reservation-row__meta">
              {formatDate(cancelling.starts_at)} · {hm(cancelling.starts_at)}–{hm(cancelling.ends_at)}
              {eventClientName(cancelling) ? ` · ${eventClientName(cancelling)}` : ""}
            </span>
          </div>
          <div style={{ marginTop: 12, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-2)" }}>
            O compromisso também sai da sua agenda Google.
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setCancelling(null)}>Voltar</Button>
            <Button
              variant="destructive"
              icon="ph-prohibit"
              loading={cancelBusy}
              onClick={async () => {
                setCancelBusy(true);
                await cancelEvent(cancelling.id);
                setCancelBusy(false);
                setCancelling(null);
                void load();
              }}
            >
              Cancelar agendamento
            </Button>
          </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
