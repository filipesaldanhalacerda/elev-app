/**
 * F2-03 · Google Agenda. Dois modos, decididos pelo ambiente:
 *  - real: GOOGLE_CLIENT_ID/SECRET presentes → OAuth de verdade + Google Calendar API.
 *  - simulado: sem credenciais (dev/testes) → conexão imediata e agenda na tabela
 *    google_events, mesmo contrato de resposta (padrão já usado no MetaTrader).
 * Em AMBOS os modos a tabela google_events é o espelho local que o app lê;
 * no modo real cada operação também é replicada no calendário primário do Google.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type GoogleEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URL?: string;
  SERVICE_ROLE_KEY: string;
};

export const googleMode = (env: GoogleEnv): "real" | "simulado" =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "real" : "simulado";

const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

async function hmac(env: GoogleEnv, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** state assinado: user_id.assinatura — impede callback forjado. */
export async function signedState(env: GoogleEnv, userId: string): Promise<string> {
  return `${userId}.${await hmac(env, userId)}`;
}
export async function verifyState(env: GoogleEnv, state: string): Promise<string | null> {
  const [userId, sig] = state.split(".");
  if (!userId || !sig) return null;
  return (await hmac(env, userId)) === sig ? userId : null;
}

export function authUrl(env: GoogleEnv, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URL!,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number }

export async function exchangeCode(env: GoogleEnv, code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URL!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Troca de código falhou (${res.status})`);
  return res.json();
}

export async function userEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("Não foi possível ler o e-mail da conta Google.");
  return ((await res.json()) as { email: string }).email;
}

/** Access token válido para o usuário, renovando pelo refresh_token quando vencido. */
export async function freshToken(env: GoogleEnv, svc: SupabaseClient, userId: string): Promise<string | null> {
  const { data: acc } = await svc.from("google_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!acc || acc.mode !== "real") return null;
  if (acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now() + 60000) return acc.access_token;
  if (!acc.refresh_token) return acc.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: acc.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return acc.access_token;
  const tok = (await res.json()) as TokenResponse;
  await svc.from("google_accounts").update({
    access_token: tok.access_token,
    token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
  }).eq("user_id", userId);
  return tok.access_token;
}

interface CalendarEventBody { summary: string; start: { dateTime: string }; end: { dateTime: string } }
const calBody = (title: string, startsAt: string, endsAt: string): CalendarEventBody => ({
  summary: title,
  start: { dateTime: startsAt },
  end: { dateTime: endsAt },
});

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface RemoteEvent {
  googleId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

/** Lê os próximos compromissos do calendário primário (modo real). */
export async function listFromGoogle(env: GoogleEnv, svc: SupabaseClient, userId: string, timeMin: string, timeMax: string): Promise<RemoteEvent[] | null> {
  if (googleMode(env) === "simulado") return null;
  const token = await freshToken(env, svc, userId);
  if (!token) return null;
  const p = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const res = await fetch(`${CAL}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as { items?: { id: string; summary?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] };
  return (body.items ?? [])
    .filter((i) => i.status !== "cancelled")
    .map((i) => ({
      googleId: i.id,
      title: i.summary?.trim() || "(sem título)",
      // evento de dia inteiro vem só com "date": vira 08:00–18:00 no fuso do produto
      startsAt: i.start?.dateTime ?? (i.start?.date ? `${i.start.date}T08:00:00-03:00` : ""),
      endsAt: i.end?.dateTime ?? (i.end?.date ? `${i.start?.date}T18:00:00-03:00` : ""),
    }))
    .filter((i) => i.startsAt && i.endsAt);
}

/** Replica a operação no Google (modo real); no simulado devolve um id determinístico. */
export async function pushToGoogle(
  env: GoogleEnv, svc: SupabaseClient, userId: string,
  op: { kind: "create"; title: string; startsAt: string; endsAt: string } |
      { kind: "update"; googleId: string; title: string; startsAt: string; endsAt: string } |
      { kind: "delete"; googleId: string }
): Promise<string | null> {
  if (googleMode(env) === "simulado") {
    return op.kind === "create" ? `sim-${crypto.randomUUID()}` : op.kind === "update" ? op.googleId : null;
  }
  const token = await freshToken(env, svc, userId);
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    if (op.kind === "create") {
      const res = await fetch(CAL, { method: "POST", headers, body: JSON.stringify(calBody(op.title, op.startsAt, op.endsAt)) });
      return res.ok ? ((await res.json()) as { id: string }).id : null;
    }
    if (op.kind === "update") {
      await fetch(`${CAL}/${op.googleId}`, { method: "PATCH", headers, body: JSON.stringify(calBody(op.title, op.startsAt, op.endsAt)) });
      return op.googleId;
    }
    await fetch(`${CAL}/${op.googleId}`, { method: "DELETE", headers });
    return null;
  } catch {
    return op.kind === "create" ? null : op.kind === "update" ? op.googleId : null;
  }
}
