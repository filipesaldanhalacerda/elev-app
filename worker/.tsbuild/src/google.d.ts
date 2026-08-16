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
export declare const googleMode: (env: GoogleEnv) => "real" | "simulado";
/** state assinado: user_id.assinatura — impede callback forjado. */
export declare function signedState(env: GoogleEnv, userId: string): Promise<string>;
export declare function verifyState(env: GoogleEnv, state: string): Promise<string | null>;
export declare function authUrl(env: GoogleEnv, state: string): string;
interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
}
export declare function exchangeCode(env: GoogleEnv, code: string): Promise<TokenResponse>;
export declare function userEmail(accessToken: string): Promise<string>;
/** Access token válido para o usuário, renovando pelo refresh_token quando vencido. */
export declare function freshToken(env: GoogleEnv, svc: SupabaseClient, userId: string): Promise<string | null>;
export interface RemoteEvent {
    googleId: string;
    title: string;
    startsAt: string;
    endsAt: string;
}
/** Lê os próximos compromissos do calendário primário (modo real). */
export declare function listFromGoogle(env: GoogleEnv, svc: SupabaseClient, userId: string, timeMin: string, timeMax: string): Promise<RemoteEvent[] | null>;
/** Replica a operação no Google (modo real); no simulado devolve um id determinístico. */
export declare function pushToGoogle(env: GoogleEnv, svc: SupabaseClient, userId: string, op: {
    kind: "create";
    title: string;
    startsAt: string;
    endsAt: string;
} | {
    kind: "update";
    googleId: string;
    title: string;
    startsAt: string;
    endsAt: string;
} | {
    kind: "delete";
    googleId: string;
}): Promise<string | null>;
export {};
