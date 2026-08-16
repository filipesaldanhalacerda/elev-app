/**
 * Elev Worker — operações privilegiadas (service_role) que o app NUNCA executa:
 * autenticação por código de uso único e gestão de usuários.
 * O RLS continua valendo para todo acesso do app; aqui só entra o que exige admin da auth.
 */
import { Hono } from "hono";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type PushEnv } from "./webpush";
import { type GoogleEnv } from "./google";
type Env = {
    SUPABASE_URL: string;
    SERVICE_ROLE_KEY: string;
    METAAPI_TOKEN?: string;
} & PushEnv & GoogleEnv;
type Ctx = {
    Bindings: Env;
    Variables: {
        svc: SupabaseClient;
        admin: {
            id: string;
            name: string;
        };
    };
};
declare const app: Hono<Ctx, import("hono/types").BlankSchema, "/">;
export default app;
