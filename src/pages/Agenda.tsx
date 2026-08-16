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

function EventSheet({ editing, initialDay, initialStart, onClose, onSaved }: { editing?: GoogleEvent; initialDay?: string; initialStart?: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(editing ? spDay(editing.starts_at) : initialDay ?? todaySP());
  const [start, setStart] = useState(editing ? hm(editing.starts_at) : initialStart ?? "10:00");
  // início + DURAÇÃO no lugar de fim separado — o fim é calculado, nunca inverte
  const [duration, setDuration] = useState(() =>
    editing ? Math.max(5, Math.round((new Date(editing.ends_at).getTime() - new Date(editing.starts_at).getTime()) / 60000)) : 60
  );
  const durations = DURATIONS.includes(duration) ? DURATIONS : [duration, ...DURATIONS].sort((a, b) => a - b);
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
              {durations.map((d) => (
                <button key={d} type="button" className={`segmented__item${duration === d ? " segmented__item--active" : ""}`} onClick={() => setDuration(d)}>
                  {durationLabel(d)}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 7, font: "400 11px/1 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }} data-ends-at>
              termina às {end}
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

  // linha do tempo do dia: mesmo componente da agenda de salas (horas 08–19)
  const HOURS = Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`);
  const slots = HOURS.map((hour) => {
    const hourStart = new Date(`${selected}T${hour}:00-03:00`).getTime();
    const hourEnd = hourStart + 3600000;
    const overlapping = dayEvents
      .map((e) => ({ e, s: new Date(e.starts_at).getTime(), f: new Date(e.ends_at).getTime() }))
      .filter(({ s, f }) => s < hourEnd && f > hourStart);
    const startsHere = overlapping.filter(({ s }) => s >= hourStart || hour === HOURS[0]);
    const continuing = overlapping.filter((x) => !startsHere.includes(x));
    return {
      hour,
      contUntil: continuing.length > 0 ? hm(new Date(Math.max(...continuing.map(({ f }) => f))).toISOString()) : null,
      blocks: startsHere.map(({ e }) => e),
    };
  });

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

            {/* linha do tempo do dia — toque no horário livre agenda na hora */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {slots.map((slot) => (
                  <div key={slot.hour} className="agenda__row">
                    <span className="agenda__hour">{slot.hour}</span>
                    {slot.contUntil === null && slot.blocks.length === 0 ? (
                      <button
                        type="button"
                        className="agenda__free agenda__free--action"
                        aria-label={`Agendar às ${slot.hour}`}
                        onClick={() => { setNewDefaults({ day: selected, start: slot.hour }); setEditing(undefined); setSheet(true); }}
                      >
                        livre
                      </button>
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                        {slot.contUntil && <span className="agenda__cont">compromisso até {slot.contUntil}</span>}
                        {slot.blocks.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            className="agenda__block"
                            style={{ minHeight: 46, textAlign: "left", width: "100%" }}
                            aria-label={`Agendamento ${e.title}`}
                            onClick={() => setActions(e)}
                          >
                            <span className="agenda__block-title">
                              {e.reservation_id && <i className="ph ph-door-open" style={{ fontSize: 12, marginRight: 5 }} aria-hidden />}
                              {e.title}
                            </span>
                            <span className="agenda__block-meta">
                              {hm(e.starts_at)}–{hm(e.ends_at)}
                              {eventClientName(e) ? ` · ${eventClientName(e)}` : ""}
                            </span>
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
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
