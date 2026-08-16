/**
 * F2-03 · Agenda (Google) — composta SÓ de componentes desenhados
 * (page-header, sheet, campos #2c, linhas de reserva, estados vazios).
 * Criar, editar e cancelar agendamentos sincronizados com a conta Google conectada.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Button } from "../components/Button";
import { GoogleLogo } from "../components/GoogleLogo";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/format";
import {
  useGoogleStatus, listEvents, createEvent, updateEvent, cancelEvent,
  eventClientName, type GoogleEvent,
} from "../lib/google";

const todaySP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const spDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function EventSheet({ editing, onClose, onSaved }: { editing?: GoogleEvent; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [day, setDay] = useState(editing ? spDay(editing.starts_at) : todaySP());
  const [start, setStart] = useState(editing ? hm(editing.starts_at) : "10:00");
  const [end, setEnd] = useState(editing ? hm(editing.ends_at) : "11:00");
  const [account, setAccount] = useState(editing?.account_code ?? "");
  const [clients, setClients] = useState<{ account_code: string; name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("client_overview").select("account_code, name").order("patrimony", { ascending: false, nullsFirst: false }).limit(50).then(({ data }) => setClients(data ?? []));
  }, []);

  // F2-10: agendamento não pode ficar no passado.
  const past = new Date(`${day}T${start}:00-03:00`).getTime() < Date.now() - 60000;
  const badRange = end <= start;
  const valid = title.trim().length > 0 && !past && !badRange;

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
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={editing ? "Editar agendamento" : "Novo agendamento"}>
        <div className="sheet__handle"><span /></div>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div className={`field${badRange ? " field--error" : ""}`}>
              <label className="field__label" htmlFor="ag-fim" style={{ display: "block" }}>Fim</label>
              <div className="field__box" style={{ height: 46 }}>
                <input id="ag-fim" className="field__input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ fontVariantNumeric: "tabular-nums" }} />
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
          </div>
          {(past || badRange || error) && (
            <div className="field--error">
              <div className="field__help">
                <i className="ph ph-warning-circle" aria-hidden />
                {error ?? (past ? "Não é possível agendar no passado." : "O fim precisa ser depois do início.")}
              </div>
            </div>
          )}
        </div>
        <div className="sheet__footer" style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid} loading={saving} onClick={save}>{editing ? "Salvar alterações" : "Agendar"}</Button>
        </div>
      </div>
    </>
  );
}

export default function Agenda() {
  const navigate = useNavigate();
  const { status } = useGoogleStatus();
  const [events, setEvents] = useState<GoogleEvent[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<GoogleEvent | undefined>(undefined);

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

  const days = (() => {
    const map = new Map<string, GoogleEvent[]>();
    for (const e of events ?? []) {
      const d = spDay(e.starts_at);
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    const today = todaySP();
    return [...map.entries()].map(([day, items]) => ({
      day,
      label: day === today ? `Hoje · ${formatDate(day).slice(0, 5)}` : formatDate(day),
      items,
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

        {status?.connected && events !== null && events.length === 0 && (
          <div className="empty-state" style={{ borderRadius: 14 }}>
            <span className="empty-state__icon"><i className="ph ph-calendar-blank" aria-hidden /></span>
            <span className="empty-state__title">Nenhum compromisso</span>
            <span className="empty-state__desc">Agende reuniões e compromissos — eles vão direto para a sua agenda Google.</span>
            <span className="empty-state__action">
              <Button icon="ph-plus" onClick={() => { setEditing(undefined); setSheet(true); }}>Novo agendamento</Button>
            </span>
          </div>
        )}

        {days.map((g) => (
          <div key={g.day}>
            <div style={{ font: "600 11px/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-2)", padding: "0 2px 8px" }}>
              {g.label}
            </div>
            <div className="client-list">
              {g.items.map((e) => (
                <div key={e.id} className="reservation-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="reservation-row__title">{e.title}</span>
                    <span className="reservation-row__meta">
                      {hm(e.starts_at)}–{hm(e.ends_at)}
                      {eventClientName(e) ? ` · ${eventClientName(e)}` : ""}
                      {e.reservation_id ? " · reserva de sala" : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="alert-foot__btn" aria-label={`Editar ${e.title}`} onClick={() => { setEditing(e); setSheet(true); }}>
                      <i className="ph ph-pencil-simple" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="alert-foot__btn alert-foot__btn--danger"
                      aria-label={`Cancelar ${e.title}`}
                      onClick={async () => {
                        await cancelEvent(e.id);
                        void load();
                      }}
                    >
                      <i className="ph ph-prohibit" aria-hidden />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {status?.connected && (events ?? []).length > 0 && (
          <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)", padding: "0 2px 14px" }}>
            Compromissos sincronizados com {status.email}.
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      {sheet && <EventSheet editing={editing} onClose={() => { setSheet(false); setEditing(undefined); }} onSaved={load} />}
    </MobileShell>
  );
}
