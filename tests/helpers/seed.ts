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
  // o GoTrue local falha com erros transitórios sob carga — tentativas com backoff,
  // recuperando o usuário se uma tentativa anterior tiver criado antes de responder erro.
  const findExisting = async () => {
    const { data: prof } = await svc.from("profiles").select("id").eq("email", opts.email).maybeSingle();
    if (prof) return prof.id as string;
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return list?.users.find((u) => u.email === opts.email)?.id ?? null;
  };
  let data, error;
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ data, error } = await svc.auth.admin.createUser({ email: opts.email, password: opts.password, email_confirm: true }));
    if (!error) break;
    const existingId = await findExisting();
    if (existingId) {
      data = { user: { id: existingId } } as typeof data;
      error = null;
      break;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  if (error || !data?.user) throw error ?? new Error("createUser falhou");
  // idempotente: retries do Playwright reexecutam o beforeAll
  const { error: pErr } = await svc.from("profiles").upsert(
    {
      id: data.user.id,
      name: opts.name,
      email: opts.email,
      role: opts.role,
      advisor_code: opts.advisor_code ?? null,
    },
    { onConflict: "id" }
  );
  if (pErr) throw pErr;
  return data.user.id;
}
