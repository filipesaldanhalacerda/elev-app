/** Tela 20 · Gestão de salas — quadro "20-22 Salas e auditoria escuro" (#4f). */
import { useEffect, useState } from "react";
import { AdminShell } from "./AdminShell";
import { Button } from "../../components/Button";
import { SkeletonRoomCards } from "../../components/states";
import { StatusChip, Modal, Banner } from "../../components/feedback";
import { TextField } from "../../components/Field";
import { supabase } from "../../lib/supabase";
import { useRooms, parsePeriod, type Room } from "../../lib/rooms";
import { formatInt } from "../../lib/format";

function RoomFormModal({ room, onClose, onSaved }: { room: Room | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : "");
  const [resources, setResources] = useState(room?.resources.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      capacity: Number(capacity),
      resources: resources.split(",").map((r) => r.trim()).filter(Boolean),
    };
    const q = room ? supabase.from("rooms").update(payload).eq("id", room.id) : supabase.from("rooms").insert(payload);
    const { error: err } = await q;
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await supabase.rpc("log_audit", { p_category: "usuario", p_event: room ? "Sala editada" : "Sala criada", p_detail: payload.name });
    onSaved();
    onClose();
  }

  return (
    <Modal
      title={room ? `Editar ${room.name}` : "Nova sala"}
      onClose={onClose}
      note={room ? "Alterações valem para novas reservas." : "A sala nasce ativa e disponível para reservas."}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} disabled={!name.trim() || !Number(capacity)} onClick={save}>
            {room ? "Salvar" : "Criar sala"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <Banner kind="danger">{error}</Banner>}
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Capacidade (lugares)" tabular inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))} />
        <TextField label="Recursos (separados por vírgula)" placeholder="TV, Videoconferência, Quadro" value={resources} onChange={(e) => setResources(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function RoomsAdmin() {
  const { rooms, reload } = useRooms();
  const [form, setForm] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null });
  const [todayCount, setTodayCount] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    (async () => {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const { data } = await supabase.from("reservations").select("room_id, period").is("cancelled_at", null);
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        if (parsePeriod(r.period as string).start.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === today) {
          map.set(r.room_id as string, (map.get(r.room_id as string) ?? 0) + 1);
        }
      }
      setTodayCount(map);
    })();
  }, [rooms]);

  async function setActive(room: Room, active: boolean) {
    await supabase.from("rooms").update({ is_active: active, inactive_reason: active ? null : "em manutenção" }).eq("id", room.id);
    await supabase.rpc("log_audit", { p_category: "usuario", p_event: active ? "Sala reativada" : "Sala desativada", p_detail: room.name });
    await reload();
  }

  return (
    <AdminShell
      title="Salas"
      actions={
        <Button size={36} icon="icon-plus" onClick={() => setForm({ open: true, room: null })}>
          Nova sala
        </Button>
      }
    >
      <div className="rooms-page" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="rooms-grid">
          {rooms === null && <SkeletonRoomCards count={2} />}
          {(rooms ?? []).map((room) => (
            <div key={room.id} className="room-card" data-room={room.name}>
              <div className="room-card__head">
                <span className="room-card__name-wrap">
                  <span className="room-card__name">{room.name}</span>
                  {room.is_active ? <StatusChip kind="success">Ativa</StatusChip> : <StatusChip kind="neutral">Inativa</StatusChip>}
                </span>
                <span className="room-card__actions">
                  <button type="button" className="row-btn row-btn--icon" aria-label={`Editar ${room.name}`} onClick={() => setForm({ open: true, room })}>
                    <i className="icon-pencil" aria-hidden />
                  </button>
                  {room.is_active ? (
                    <button type="button" className="row-btn row-btn--icon row-btn--danger" aria-label={`Desativar ${room.name}`} onClick={() => setActive(room, false)}>
                      <i className="icon-ban" aria-hidden />
                    </button>
                  ) : (
                    <button type="button" className="row-btn" onClick={() => setActive(room, true)}>
                      Reativar
                    </button>
                  )}
                </span>
              </div>
              <div className="room-card__facts">
                <span className="room-card__fact">
                  <i className="icon-users" aria-hidden />
                  {formatInt(room.capacity)} lugares
                </span>
                {room.is_active ? (
                  <span className="room-card__fact">
                    <i className="icon-calendar" aria-hidden />
                    {formatInt(todayCount.get(room.id) ?? 0)} reserva{(todayCount.get(room.id) ?? 0) !== 1 ? "s" : ""} hoje
                  </span>
                ) : (
                  <span className="room-card__fact">
                    <i className="icon-wrench" aria-hidden />
                    {room.inactive_reason ?? "inativa"}
                  </span>
                )}
              </div>
              {room.resources.length > 0 && (
                <div className="room-card__resources">
                  {room.resources.map((r) => (
                    <span key={r} className="resource-chip">{r}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {rooms !== null && rooms.length === 0 && (
            <div className="empty-state" style={{ borderRadius: 14, gridColumn: "1 / -1" }}>
              <span className="empty-state__icon"><i className="icon-door-open" aria-hidden /></span>
              <span className="empty-state__title">Nenhuma sala ainda</span>
              <span className="empty-state__desc">Cadastre a primeira sala para liberar as reservas aos assessores.</span>
              <span className="empty-state__action">
                <Button icon="icon-plus" onClick={() => setForm({ open: true, room: null })}>Nova sala</Button>
              </span>
            </div>
          )}
        </div>
      </div>
      {form.open && <RoomFormModal room={form.room} onClose={() => setForm({ open: false, room: null })} onSaved={reload} />}
    </AdminShell>
  );
}
