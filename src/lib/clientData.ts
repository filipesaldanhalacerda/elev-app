/** Consultas de clientes (E6) — todas passam pelo RLS: assessor só recebe a própria carteira. */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface ClientOverview {
  account_code: string;
  advisor_code: string;
  name: string | null;
  status: string | null;
  suitability: string | null;
  segment: string | null;
  profession: string | null;
  birth_date: string | null;
  xp_registered_at: string | null;
  missing_since: string | null;
  patrimony: number | null;
  month_pct: number | null;
  position_date: string | null;
  captacao_liquida_m: number | null;
}

export interface Position {
  product: string;
  sub_product: string | null;
  asset: string;
  issuer: string | null;
  maturity_date: string | null;
  quantity: number | null;
  value: number;
  ref_date: string;
}

export interface Movement {
  id: number;
  mov_date: string;
  kind: string;
  flow: "C" | "D";
  amount: number;
}

export interface TimelineNote {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, loading: false, error: null }),
      (e) => alive && setState({ data: null, loading: false, error: (e as Error).message })
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

const throwing = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

/** Lista da tela 05: carteira do assessor ordenável, com filtro por status. */
export function useClientList(filter: "todos" | "ativos" | "inativos", limit: number) {
  return useQuery(async () => {
    let q = supabase
      .from("client_overview")
      .select("*", { count: "exact" })
      .order("patrimony", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (filter === "ativos") q = q.eq("status", "ATIVO");
    if (filter === "inativos") q = q.neq("status", "ATIVO");
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as ClientOverview[], total: count ?? 0 };
  }, [filter, limit]);
}

export function useClient(account: string) {
  return useQuery(
    async () => throwing<ClientOverview[]>(await supabase.from("client_overview").select("*").eq("account_code", account)).at(0) ?? null,
    [account]
  );
}

/** Série patrimonial para o gráfico (12M por padrão). */
export function usePatrimonySeries(account: string, months: number) {
  return useQuery(async () => {
    const rows = throwing<{ ref_date: string; net_em_m: number | null }[]>(
      await supabase
        .from("positivador_snapshots")
        .select("ref_date, net_em_m")
        .eq("account_code", account)
        .order("ref_date", { ascending: true })
    );
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return rows.filter((r) => r.net_em_m !== null && new Date(r.ref_date) >= cutoff);
  }, [account, months]);
}

/** Posições da última fotografia da Diversificação, agrupadas por classe. */
export function usePortfolio(account: string) {
  return useQuery(async () => {
    const rows = throwing<Position[]>(
      await supabase
        .from("positions")
        .select("product, sub_product, asset, issuer, maturity_date, quantity, value, ref_date")
        .eq("account_code", account)
        .order("ref_date", { ascending: false })
        .order("value", { ascending: false })
        .limit(500)
    );
    if (rows.length === 0) return { refDate: null, groups: [] as { product: string; total: number; pct: number; items: Position[] }[], total: 0 };
    const latest = rows[0].ref_date;
    const current = rows.filter((r) => r.ref_date === latest);
    const total = current.reduce((acc, r) => acc + Math.max(r.value, 0), 0);
    const map = new Map<string, Position[]>();
    for (const r of current) {
      const key = r.product || "Outros";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    const groups = [...map.entries()]
      .map(([product, items]) => {
        const t = items.reduce((acc, r) => acc + r.value, 0);
        return { product, total: t, pct: total > 0 ? Math.round((Math.max(t, 0) / total) * 100) : 0, items };
      })
      .sort((a, b) => b.total - a.total);
    return { refDate: latest, groups, total };
  }, [account]);
}

/** Movimentações agrupadas por mês, com filtro e período. */
export function useMovements(account: string, filter: "tudo" | "aportes" | "resgates", days: number) {
  return useQuery(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    let q = supabase
      .from("movements")
      .select("id, mov_date, kind, flow, amount")
      .eq("account_code", account)
      .gte("mov_date", cutoff.toISOString().slice(0, 10))
      .order("mov_date", { ascending: false });
    if (filter === "aportes") q = q.gt("amount", 0);
    if (filter === "resgates") q = q.lt("amount", 0);
    const rows = throwing<Movement[]>(await q);
    // última movimentação fora do período (para o estado vazio do quadro)
    const { data: last } = await supabase
      .from("movements")
      .select("mov_date, amount")
      .eq("account_code", account)
      .order("mov_date", { ascending: false })
      .limit(1);
    return { rows, lastEver: last?.[0] ?? null };
  }, [account, filter, days]);
}

export interface ClientExtras {
  phone: string | null;
  email: string | null;
  notes: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

export function useClientExtras(account: string) {
  return useQuery(async () => {
    const { data } = await supabase
      .from("client_extras")
      .select("phone, email, notes, updated_at, profiles!client_extras_updated_by_fkey(name)")
      .eq("account_code", account)
      .maybeSingle();
    if (!data) return { phone: null, email: null, notes: null, updated_at: null, updated_by_name: null } as ClientExtras;
    return {
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      updated_at: data.updated_at,
      updated_by_name: (data as { profiles?: { name?: string } }).profiles?.name ?? null,
    } as ClientExtras;
  }, [account]);
}

/** Grava um campo do cadastro complementar e registra na auditoria. */
export async function saveClientExtra(account: string, _advisorCode: string, field: "phone" | "email" | "notes", value: string) {
  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("client_extras")
    .upsert({ account_code: account, [field]: value, updated_by: me.user?.id }, { onConflict: "account_code" });
  if (error) throw new Error(error.message);
  const label = field === "phone" ? "telefone" : field === "email" ? "e-mail" : "observações";
  await supabase.rpc("log_audit", { p_category: "cadastro", p_event: `Editou ${label}`, p_detail: `conta ${account}` });
}

export function useTimeline(account: string) {
  return useQuery(async () => {
    const notes = throwing<{ id: string; body: string; created_at: string; profiles: { name: string } | { name: string }[] | null }[]>(
      await supabase
        .from("timeline_notes")
        .select("id, body, created_at, profiles!timeline_notes_author_fkey(name)")
        .eq("account_code", account)
        .order("created_at", { ascending: false })
        .limit(30)
    );
    const movements = throwing<Movement[]>(
      await supabase
        .from("movements")
        .select("id, mov_date, kind, flow, amount")
        .eq("account_code", account)
        .order("mov_date", { ascending: false })
        .limit(10)
    );
    const alerts = throwing<{ id: string; ticker: string; target_price: number | null; triggered_at: string | null; status: string }[]>(
      await supabase.from("alerts").select("id, ticker, target_price, triggered_at, status").eq("account_code", account).limit(10)
    );
    const cards = throwing<{ id: string; title: string; status: string; completed_at: string | null; created_at: string }[]>(
      await supabase.from("cards").select("id, title, status, completed_at, created_at").eq("account_code", account).limit(10)
    );
    return {
      notes: notes.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author_name: (Array.isArray(n.profiles) ? n.profiles[0]?.name : n.profiles?.name) ?? "" }) as TimelineNote),
      movements,
      alerts,
      cards,
    };
  }, [account]);
}

export async function addTimelineNote(account: string, advisorCode: string, body: string) {
  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from("timeline_notes").insert({
    account_code: account,
    advisor_code: advisorCode,
    author: me.user!.id,
    body,
  });
  if (error) throw new Error(error.message);
}
