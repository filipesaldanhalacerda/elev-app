/** Utilitários de seed via service_role (Supabase local) para os specs de tela. */
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

let cached: { url: string; anon: string; service: string } | null = null;

export function supabaseEnv() {
  if (cached) return cached;
  const out = execSync("supabase status -o env", { encoding: "utf8" });
  const get = (key: string) => out.match(new RegExp(`${key}="([^"]+)"`))?.[1];
  cached = { url: get("API_URL")!, anon: get("ANON_KEY")!, service: get("SERVICE_ROLE_KEY")! };
  return cached;
}

export const makeClient = (url: string, key: string) =>
  createClient(url, key, { realtime: { transport: ws as unknown as new (...args: unknown[]) => WebSocket } });

export function serviceClient(): SupabaseClient {
  const env = supabaseEnv();
  return makeClient(env.url, env.service);
}

export async function createUser(
  svc: SupabaseClient,
  opts: { email: string; password: string; name: string; role: "admin" | "advisor"; advisor_code?: string | null }
) {
  // o GoTrue local ocasionalmente falha com erro transitório sob carga — 3 tentativas
  let data, error;
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ data, error } = await svc.auth.admin.createUser({ email: opts.email, password: opts.password, email_confirm: true }));
    if (!error) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (error || !data?.user) throw error ?? new Error("createUser falhou");
  const { error: pErr } = await svc.from("profiles").insert({
    id: data.user.id,
    name: opts.name,
    email: opts.email,
    role: opts.role,
    advisor_code: opts.advisor_code ?? null,
  });
  if (pErr) throw pErr;
  return data.user.id;
}
