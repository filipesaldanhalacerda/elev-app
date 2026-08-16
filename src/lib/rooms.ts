/** Salas e reservas (E10). Conflito é impedido PELO BANCO (EXCLUDE); aqui só a conversa com ele. */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  resources: string[];
  is_active: boolean;
  inactive_reason: string | null;
}

export interface Reservation {
  id: string;
  room_id: string;
  period: string; // tstzrange textual
  title: string;
  account_code: string | null;
  owner: string;
  cancelled_at: string | null;
  owner_name?: string | null;
  room_name?: string | null;
}

export function parsePeriod(period: string): { start: Date; end: Date } {
  const m = period.match(/[\[\(]"?([^",]+)"?\s*,\s*"?([^"\)\]]+)"?[\)\]]/);
  return { start: new Date(m![1]), end: new Date(m![2]) };
}

export function makePeriod(day: string, start: string, end: string): string {
  return `[${day}T${start}:00-03:00,${day}T${end}:00-03:00)`;
}

export function useRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const load = async () => {
    const { data } = await supabase.from("rooms").select("*").order("name");
    setRooms((data ?? []) as Room[]);
  };
  useEffect(() => {
    void load();
  }, []);
  return { rooms, reload: load };
}

export function useDayReservations(roomId: string | null, day: string) {
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const load = async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from("reservations")
      .select("*, profiles!reservations_owner_fkey(name)")
      .eq("room_id", roomId)
      .is("cancelled_at", null)
      .order("period");
    const dayRows = (data ?? [])
      .map((r) => ({ ...(r as Reservation), owner_name: ((r as { profiles?: { name?: string } }).profiles)?.name ?? null }))
      .filter((r) => parsePeriod(r.period).start.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) === day);
    setRows(dayRows);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, day]);
  return { rows, reload: load };
}

export function useMyReservations(userId: string | undefined) {
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const load = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("reservations")
      .select("*, rooms(name)")
      .eq("owner", userId)
      .is("cancelled_at", null)
      .order("period");
    setRows(
      (data ?? [])
        .map((r) => ({ ...(r as Reservation), room_name: ((r as { rooms?: { name?: string } }).rooms)?.name ?? null }))
        .filter((r) => parsePeriod(r.period).end.getTime() > Date.now() - 86400000)
    );
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return { rows, reload: load };
}

export interface ConflictInfo {
  title: string;
  owner_name: string | null;
  start: string;
  end: string;
}

export type CreateResult = { ok: true; id: string } | { ok: false; conflict: ConflictInfo | null };

/** Cria a reserva; o EXCLUDE do banco devolve 23P01 em conflito. */
export async function createReservation(owner: string, roomId: string, day: string, start: string, end: string, title: string, account: string | null): Promise<CreateResult> {
  const { data: created, error } = await supabase.from("reservations").insert({
    owner,
    room_id: roomId,
    period: makePeriod(day, start, end),
    title,
    account_code: account,
  }).select("id").single();
  if (!error) return { ok: true, id: created.id };
  if (error.code !== "23P01") throw new Error(error.message);
  // busca quem ocupa para a mensagem do quadro
  const { data } = await supabase
    .from("reservations")
    .select("title, period, profiles!reservations_owner_fkey(name)")
    .eq("room_id", roomId)
    .is("cancelled_at", null);
  const wanted = { start: new Date(`${day}T${start}:00-03:00`).getTime(), end: new Date(`${day}T${end}:00-03:00`).getTime() };
  const hit = (data ?? []).find((r) => {
    const p = parsePeriod(r.period as string);
    return p.start.getTime() < wanted.end && p.end.getTime() > wanted.start;
  });
  if (!hit) return { ok: false, conflict: null };
  const p = parsePeriod(hit.period as string);
  const fmt = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const prof = (hit as { profiles?: { name?: string } | { name?: string }[] }).profiles;
  return {
    ok: false,
    conflict: {
      title: hit.title as string,
      owner_name: (Array.isArray(prof) ? prof[0]?.name : prof?.name) ?? null,
      start: fmt(p.start),
      end: fmt(p.end),
    },
  };
}

export interface Alternative {
  roomId: string;
  roomName: string;
  start: string;
  end: string;
  sameRoom: boolean;
}

/** Alternativas livres em um toque: mesma sala em outro horário + outras salas no mesmo horário. */
export async function findAlternatives(rooms: Room[], roomId: string, day: string, start: string, end: string): Promise<Alternative[]> {
  const { data } = await supabase.from("reservations").select("room_id, period").is("cancelled_at", null);
  const all = (data ?? []).map((r) => ({ room_id: r.room_id as string, ...parsePeriod(r.period as string) }));
  const durationMs = new Date(`${day}T${end}:00-03:00`).getTime() - new Date(`${day}T${start}:00-03:00`).getTime();
  const free = (rid: string, s: number, e: number) => !all.some((r) => r.room_id === rid && r.start.getTime() < e && r.end.getTime() > s);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const out: Alternative[] = [];

  // mesma sala: próximo horário livre depois do fim pedido (varre de hora em hora até 19h)
  const room = rooms.find((r) => r.id === roomId);
  for (let h = 8; h <= 18 && out.length < 1; h++) {
    const s = new Date(`${day}T${String(h).padStart(2, "0")}:00:00-03:00`).getTime();
    const e = s + durationMs;
    if (s <= new Date(`${day}T${start}:00-03:00`).getTime()) continue;
    if (room && free(roomId, s, e)) out.push({ roomId, roomName: room.name, start: fmt(s), end: fmt(e), sameRoom: true });
  }
  // outras salas ativas no MESMO horário
  const s0 = new Date(`${day}T${start}:00-03:00`).getTime();
  for (const r of rooms.filter((r) => r.id !== roomId && r.is_active)) {
    if (free(r.id, s0, s0 + durationMs)) {
      out.push({ roomId: r.id, roomName: r.name, start, end, sameRoom: false });
      if (out.length >= 2) break;
    }
  }
  return out;
}

export async function cancelReservation(id: string): Promise<void> {
  const { error } = await supabase.from("reservations").update({ cancelled_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
