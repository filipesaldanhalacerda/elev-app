/** Cards/CRM (E9) — consultas sob RLS: criador, responsável ou admin; cliente vinculado limita a visibilidade. */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CardStatus = "pendente" | "andamento" | "concluido";

export interface CardRow {
  id: string;
  title: string;
  description: string | null;
  account_code: string | null;
  due_at: string | null;
  priority: "baixa" | "media" | "alta";
  status: CardStatus;
  creator: string;
  assignee: string;
  daily_reminder: boolean;
  created_at: string;
  completed_at: string | null;
  client_name?: string | null;
  creator_name?: string | null;
  assignee_name?: string | null;
}

const SELECT = "*, clients(name), criador:profiles!cards_creator_fkey(name), responsavel:profiles!cards_assignee_fkey(name)";

function mapRow(r: Record<string, unknown>): CardRow {
  const one = (v: unknown): { name?: string } | null => (Array.isArray(v) ? (v[0] as { name?: string }) : (v as { name?: string } | null));
  return {
    ...(r as unknown as CardRow),
    client_name: one(r.clients)?.name ?? null,
    creator_name: one(r.criador)?.name ?? null,
    assignee_name: one(r.responsavel)?.name ?? null,
  };
}

export function useCards(scope: "meus" | "criados", userId: string | undefined) {
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const load = async () => {
    if (!userId) return;
    let q = supabase.from("cards").select(SELECT).order("due_at", { ascending: true, nullsFirst: false });
    q = scope === "meus" ? q.eq("assignee", userId) : q.eq("creator", userId);
    const { data } = await q;
    setRows((data ?? []).map(mapRow));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, userId]);
  return { rows, reload: load };
}

export function useAllCards() {
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const load = async () => {
    const { data } = await supabase.from("cards").select(SELECT).order("sort_order").order("created_at");
    setRows((data ?? []).map(mapRow));
  };
  useEffect(() => {
    void load();
  }, []);
  return { rows, reload: load };
}

export const NEXT_STATUS: Record<CardStatus, CardStatus | null> = { pendente: "andamento", andamento: "concluido", concluido: null };

export async function advanceCard(card: CardRow): Promise<void> {
  const next = NEXT_STATUS[card.status];
  if (!next) return;
  const { error } = await supabase
    .from("cards")
    .update({ status: next, completed_at: next === "concluido" ? new Date().toISOString() : null })
    .eq("id", card.id);
  if (error) throw new Error(error.message);
}

export async function setCardStatus(id: string, status: CardStatus): Promise<void> {
  const { error } = await supabase
    .from("cards")
    .update({ status, completed_at: status === "concluido" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface NewCard {
  title: string;
  account_code: string | null;
  assignee: string;
  due_at: string | null;
  priority: "baixa" | "media" | "alta";
  daily_reminder: boolean;
}

export async function createCard(creator: string, card: NewCard): Promise<void> {
  const { error } = await supabase.from("cards").insert({ ...card, creator, status: "pendente" });
  if (error) throw new Error(error.message);
}

export function isOverdue(card: CardRow): boolean {
  return card.status !== "concluido" && !!card.due_at && new Date(card.due_at).getTime() < Date.now();
}

export function useColleagues() {
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setRows((data ?? []) as { id: string; name: string }[]));
  }, []);
  return rows;
}
