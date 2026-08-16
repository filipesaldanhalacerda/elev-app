/**
 * Elev Worker — operações privilegiadas (service_role) que o app NUNCA executa:
 * autenticação por código de uso único e gestão de usuários.
 * O RLS continua valendo para todo acesso do app; aqui só entra o que exige admin da auth.
 */
import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fakeQuote, fakeSeries, fakeMtTest } from "./quotes";
import { sendWebPush, type PushSubscriptionRecord, type PushEnv } from "./webpush";
import { googleMode, signedState, verifyState, authUrl, exchangeCode, userEmail, pushToGoogle, listFromGoogle, type GoogleEnv } from "./google";

type Env = { SUPABASE_URL: string; SERVICE_ROLE_KEY: string; METAAPI_TOKEN?: string } & PushEnv & GoogleEnv;
type Ctx = { Bindings: Env; Variables: { svc: SupabaseClient; admin: { id: string; name: string } } };

const app = new Hono<Ctx>();

const svcOf = (env: Env) => createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY);

/** Código de 6 caracteres sem ambíguos (sem 0/O/1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

const maskEmail = (email: string) => `${email.split("@")[0]}@…`;

async function audit(svc: SupabaseClient, category: string, event: string, detail: string | null, actor?: { id: string; name: string }) {
  await svc.from("audit_log").insert({ category, event, detail, actor: actor?.id ?? null, actor_name: actor?.name ?? null });
}

/** Localiza um código válido (não usado, não expirado) pelo hash. */
async function findValidCode(svc: SupabaseClient, code: string) {
  const hash = await sha256(code.toUpperCase());
  const { data } = await svc
    .from("access_codes")
    .select("id, user_id, expires_at, used_at, profiles!access_codes_user_id_fkey(id, name, email, advisor_code, role, is_active)")
    .eq("code_hash", hash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data;
}

app.get("/health", (c) => c.json({ ok: true }));

// ---------- Fluxo de código (telas 02/03) — sem autenticação prévia ----------

app.post("/api/auth/code/validate", async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  if (!code || code.length !== 6) return c.json({ error: "Código deve ter 6 caracteres." }, 400);
  const svc = svcOf(c.env);
  const found = await findValidCode(svc, code);
  const profile = (found as { profiles?: { email: string; is_active: boolean } } | null)?.profiles;
  if (!found || !profile || !profile.is_active) {
    return c.json({ error: "Código inválido ou expirado. Peça um novo ao administrador." }, 404);
  }
  return c.json({ ok: true, email_masked: maskEmail(profile.email), expires_at: found.expires_at });
});

app.post("/api/auth/code/set-password", async (c) => {
  const { code, password } = await c.req.json<{ code: string; password: string }>();
  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return c.json({ error: "A senha não cumpre os três requisitos." }, 400);
  }
  const svc = svcOf(c.env);
  const found = await findValidCode(svc, code ?? "");
  const profile = (found as { profiles?: { id: string; name: string; email: string; is_active: boolean } } | null)?.profiles;
  if (!found || !profile || !profile.is_active) {
    return c.json({ error: "Código inválido ou expirado. Peça um novo ao administrador." }, 404);
  }
  const { error } = await svc.auth.admin.updateUserById(found.user_id, { password });
  if (error) return c.json({ error: "Não foi possível definir a senha." }, 500);
  await svc.from("access_codes").update({ used_at: new Date().toISOString() }).eq("id", found.id);
  await audit(svc, "codigo", "Código de acesso utilizado", `${profile.name} definiu a própria senha`, { id: profile.id, name: profile.name });
  return c.json({ ok: true, email: profile.email });
});

// ---------- Cotações (tela 11) — qualquer usuário autenticado ----------

async function requireUser(c: { req: { header: (h: string) => string | undefined }; env: Env }) {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const svc = svcOf(c.env);
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return null;
  return { svc, userId: data.user.id };
}

async function mtStatus(svc: SupabaseClient) {
  const { data } = await svc.from("mt_connection").select("status, last_quote_at, connected_at, health_events, login, server").eq("id", 1).single();
  return data;
}

app.get("/api/quotes", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const mt = await mtStatus(auth.svc);
  const symbols = (c.req.query("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!mt || mt.status === "desconectada" || mt.status === "caida") {
    return c.json({ paused: true, last_quote_at: mt?.last_quote_at ?? null, quotes: [] }, 200);
  }
  const now = new Date();
  await auth.svc.from("mt_connection").update({ last_quote_at: now.toISOString() }).eq("id", 1);
  return c.json({ paused: false, quotes: symbols.map((s) => fakeQuote(s, now)) });
});

app.get("/api/quotes/detail", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const symbol = (c.req.query("symbol") ?? "").toUpperCase();
  if (!symbol) return c.json({ error: "Informe o símbolo." }, 400);
  const mt = await mtStatus(auth.svc);
  if (!mt || mt.status === "desconectada" || mt.status === "caida") {
    return c.json({ paused: true, last_quote_at: mt?.last_quote_at ?? null }, 200);
  }
  return c.json({ paused: false, quote: fakeQuote(symbol), series: fakeSeries(symbol) });
});

// ---------- Rotas administrativas (JWT de admin obrigatório) ----------

app.use("/api/admin/*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ error: "Não autenticado." }, 401);
  const svc = svcOf(c.env);
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return c.json({ error: "Não autenticado." }, 401);
  const { data: profile } = await svc.from("profiles").select("id, name, role, is_active").eq("id", data.user.id).single();
  if (!profile || profile.role !== "admin" || !profile.is_active) return c.json({ error: "Acesso restrito ao administrador." }, 403);
  c.set("svc", svc);
  c.set("admin", { id: profile.id, name: profile.name });
  await next();
});

app.get("/api/admin/users", async (c) => {
  const svc = c.get("svc");
  // varredura paginada: o PostgREST corta em 1000 linhas e o usuário mais novo sumiria
  const users = await fetchAll<{ id: string; name: string; email: string; advisor_code: string | null; role: string; is_active: boolean; created_at: string }>((from, to) =>
    svc
      .from("profiles")
      .select("id, name, email, advisor_code, role, is_active, created_at")
      .order("created_at")
      .range(from, to)
  );
  const { data: codes } = await svc
    .from("access_codes")
    .select("user_id, expires_at")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  const pending = new Map((codes ?? []).map((k) => [k.user_id, k.expires_at]));
  return c.json({
    users: (users ?? []).map((u) => ({ ...u, pending_code_expires_at: pending.get(u.id) ?? null })),
  });
});

// F2-02: os códigos de assessor que EXISTEM na base importada, com contagem de clientes.
app.get("/api/admin/advisor-codes", async (c) => {
  const svc = c.get("svc");
  const rows = await fetchAll<{ advisor_code: string }>((from, to) =>
    svc.from("clients").select("advisor_code").order("advisor_code").range(from, to)
  );
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.advisor_code, (counts.get(r.advisor_code) ?? 0) + 1);
  const used = await fetchAll<{ advisor_code: string }>((from, to) =>
    svc.from("profiles").select("advisor_code").not("advisor_code", "is", null).order("advisor_code").range(from, to)
  );
  const taken = new Set(used.map((u) => String(u.advisor_code)));
  return c.json({
    codes: [...counts.entries()].map(([code, clients]) => ({ code, clients, taken: taken.has(code) })),
  });
});

app.post("/api/admin/users", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const { name, email, advisor_code, role } = await c.req.json<{ name: string; email: string; advisor_code: string | null; role: "admin" | "advisor" }>();
  if (!name || !email || !role) return c.json({ error: "Nome, e-mail e perfil são obrigatórios." }, 400);
  const normalized = advisor_code ? advisor_code.toUpperCase().replace(/^A[\s-]?/, "").replace(/^0+/, "") : null;
  // F2-02: todo novo acesso nasce vinculado a um assessor QUE EXISTE na base importada.
  if (role !== "advisor") return c.json({ error: "Todo novo acesso nasce vinculado a um assessor da base importada." }, 400);
  if (!normalized) return c.json({ error: "Assessor precisa de código de assessor." }, 400);
  const { count: baseCount } = await svc.from("clients").select("account_code", { count: "exact", head: true });
  if (!baseCount) return c.json({ error: "Importe uma base (Positivador) antes de criar acessos." }, 400);
  const { count: codeCount } = await svc.from("clients").select("account_code", { count: "exact", head: true }).eq("advisor_code", normalized);
  if (!codeCount) return c.json({ error: `O código A-${normalized} não existe na base importada.` }, 400);
  const { data: created, error } = await svc.auth.admin.createUser({ email, password: randomPassword(), email_confirm: true });
  if (error) return c.json({ error: error.message }, 400);
  const { error: pErr } = await svc.from("profiles").insert({ id: created.user.id, name, email, advisor_code: normalized, role });
  if (pErr) {
    await svc.auth.admin.deleteUser(created.user.id);
    return c.json({ error: pErr.message }, 400);
  }
  await audit(svc, "usuario", "Usuário criado", `${name} (${role}${normalized ? ` A-${normalized}` : ""})`, admin);
  return c.json({ id: created.user.id });
});

app.post("/api/admin/users/:id/code", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const userId = c.req.param("id");
  const { data: target } = await svc.from("profiles").select("id, name, email, advisor_code, role").eq("id", userId).single();
  if (!target) return c.json({ error: "Usuário não encontrado." }, 404);

  // gerar código INVALIDA a senha atual na hora + expira códigos anteriores
  await svc.from("access_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  await svc.auth.admin.updateUserById(userId, { password: randomPassword() });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await svc.from("access_codes").insert({
    user_id: userId,
    code_hash: await sha256(code),
    expires_at: expiresAt,
    created_by: admin.id,
  });
  if (error) return c.json({ error: error.message }, 500);
  await audit(svc, "codigo", "Código de acesso gerado", `para ${target.name} — senha anterior invalidada`, admin);
  return c.json({ code, expires_at: expiresAt }); // exibido UMA única vez
});

app.patch("/api/admin/users/:id", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const userId = c.req.param("id");
  const body = await c.req.json<{ name?: string; advisor_code?: string | null; role?: "admin" | "advisor"; is_active?: boolean }>();
  const { data: target } = await svc.from("profiles").select("id, name").eq("id", userId).single();
  if (!target) return c.json({ error: "Usuário não encontrado." }, 404);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.role !== undefined) patch.role = body.role;
  if (body.advisor_code !== undefined) {
    patch.advisor_code = body.advisor_code ? body.advisor_code.toUpperCase().replace(/^A[\s-]?/, "").replace(/^0+/, "") : null;
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  const { error } = await svc.from("profiles").update(patch).eq("id", userId);
  if (error) return c.json({ error: error.message }, 400);

  if (body.is_active === false) {
    await svc.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); // desativado: não entra
    await audit(svc, "usuario", "Usuário desativado", target.name, admin);
  } else if (body.is_active === true) {
    await svc.auth.admin.updateUserById(userId, { ban_duration: "none" });
    await audit(svc, "usuario", "Usuário reativado", target.name, admin);
  } else {
    await audit(svc, "usuario", "Usuário editado", target.name, admin);
  }
  return c.json({ ok: true });
});

// ---------- MetaTrader (tela 18) — admin ----------

async function cipherKey(env: Env): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SERVICE_ROLE_KEY));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cipherKey(env);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv);
  buf.set(ct, iv.length);
  return btoa(String.fromCharCode(...buf));
}

app.get("/api/admin/mt", async (c) => {
  const svc = c.get("svc");
  const { data } = await svc
    .from("mt_connection")
    .select("status, login, server, last_quote_at, connected_at, health_events, updated_at")
    .eq("id", 1)
    .single();
  return c.json({ connection: data }); // a senha (cifrada) NUNCA sai daqui
});

app.post("/api/admin/mt/test", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const { login, password, server } = await c.req.json<{ login: string; password: string; server: string }>();
  // modo dev: simulador determinístico; com METAAPI_TOKEN o adaptador real assume
  const result = fakeMtTest(login ?? "", password ?? "", server ?? "");
  const now = new Date().toISOString();
  const { data: current } = await svc.from("mt_connection").select("health_events, connected_at").eq("id", 1).single();
  const events = ((current?.health_events as { at: string; level: string; text: string }[]) ?? []).slice(-19);

  if (!result.ok) {
    const motivo = result.code === "AUTH_FAILED" ? "o servidor recusou a senha" : "não encontramos esse servidor";
    events.push({ at: now, level: "danger", text: `Teste falhou — ${motivo}` });
    await svc.from("mt_connection").update({ status: "caida", health_events: events, updated_by: admin.id, updated_at: now }).eq("id", 1);
    await audit(svc, "metatrader", "Teste de conexão falhou", motivo, admin);
    return c.json({ ok: false, code: result.code, motivo }, 200);
  }

  events.push({ at: now, level: "success", text: "Teste de conexão bem-sucedido" });
  await svc
    .from("mt_connection")
    .update({
      status: "ativa",
      login,
      server,
      password_ciphertext: await encryptSecret(c.env, password),
      last_quote_at: now,
      connected_at: current?.connected_at ?? now,
      health_events: events,
      updated_by: admin.id,
      updated_at: now,
    })
    .eq("id", 1);
  await audit(svc, "metatrader", "Credenciais testadas e salvas", `login ${login} · servidor ${server}`, admin);
  return c.json({ ok: true, tested_at: now, response_seconds: result.responseSeconds });
});

app.post("/api/admin/mt/disconnect", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const now = new Date().toISOString();
  const { data: current } = await svc.from("mt_connection").select("health_events").eq("id", 1).single();
  const events = ((current?.health_events as { at: string; level: string; text: string }[]) ?? []).slice(-19);
  events.push({ at: now, level: "warning", text: "Conexão desfeita pelo administrador" });
  await svc
    .from("mt_connection")
    .update({ status: "desconectada", login: null, server: null, password_ciphertext: null, connected_at: null, health_events: events, updated_by: admin.id, updated_at: now })
    .eq("id", 1);
  await audit(svc, "metatrader", "Conexão desfeita", null, admin);
  return c.json({ ok: true });
});

// ---------- Importação (tela 21): nada é gravado antes desta chamada ----------

interface CommitPayload {
  kind: "positivador" | "diversificacao" | "captacao" | "saldo_consolidado";
  variant: "mensal" | "semanal" | null;
  file_name: string;
  file_size: number;
  file_hash: string;
  ref_date: string;
  counts: Record<string, number>;
  warnings: unknown[];
  rows: Record<string, unknown>[];
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

app.post("/api/admin/imports/commit", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const p = await c.req.json<CommitPayload>();

  // reimportar o MESMO arquivo não duplica: hash único por tipo
  const { data: existing } = await svc.from("imports").select("id, status").eq("kind", p.kind).eq("file_hash", p.file_hash).maybeSingle();
  if (existing?.status === "concluida") {
    return c.json({ error: "Este arquivo já foi importado — reimportar não duplica dados." }, 409);
  }

  const { data: imp, error: impErr } = await svc
    .from("imports")
    .upsert(
      {
        kind: p.kind, variant: p.variant, file_name: p.file_name, file_size: p.file_size,
        file_hash: p.file_hash, ref_date: p.ref_date, status: "processando",
        counts: p.counts, warnings: p.warnings, created_by: admin.id,
      },
      { onConflict: "kind,file_hash" }
    )
    .select("id")
    .single();
  if (impErr || !imp) return c.json({ error: impErr?.message ?? "Falha ao registrar a importação." }, 500);
  const importId = imp.id;

  const fail = async (msg: string) => {
    await svc.from("imports").update({ status: "falhou", error: msg, finished_at: new Date().toISOString() }).eq("id", importId);
    return c.json({ error: msg }, 500);
  };

  try {
    // garante que todo account_code exista em clients (cliente novo é criado e vinculado)
    const accounts = new Map<string, string | null>();
    for (const r of p.rows) accounts.set(String(r.account_code), (r.advisor_code as string | null) ?? null);
    const accountList = [...accounts.keys()];
    const known = new Set<string>();
    for (const part of chunk(accountList, 200)) {
      const { data: existingClients, error } = await svc.from("clients").select("account_code").in("account_code", part);
      if (error) throw new Error(`clientes: ${error.message}`);
      for (const r of existingClients ?? []) known.add(r.account_code);
    }
    const newClients = [...accounts.entries()]
      .filter(([acc]) => !known.has(acc))
      .map(([account_code, advisor_code]) => ({ account_code, advisor_code: advisor_code ?? "0", first_seen_import: importId, last_seen_import: importId }));
    for (const part of chunk(newClients, 500)) {
      const { error } = await svc.from("clients").insert(part);
      if (error) throw new Error(`clientes: ${error.message}`);
    }

    if (p.kind === "positivador") {
      // atualiza cadastro do cliente (sem tocar no nome — só o Saldo tem nome)
      for (const part of chunk(p.rows, 300)) {
        const updates = part.map((r) => ({
          account_code: String(r.account_code),
          advisor_code: (r.advisor_code as string) ?? "0",
          profession: r.profession, sex: r.sex, segment: r.segment, segmentation: r.segmentation,
          suitability: r.suitability, status: r.status, person_type: r.person_type,
          birth_date: r.birth_date, xp_registered_at: r.xp_registered_at,
          last_seen_import: importId, missing_since: null,
        }));
        const { error } = await svc.from("clients").upsert(updates, { onConflict: "account_code" });
        if (error) throw new Error(`cadastro: ${error.message}`);
      }
      // fotografia datada (upsert por conta × data × variante — período não duplica)
      for (const part of chunk(p.rows, 300)) {
        const snaps = part.map((r) => ({
          import_id: importId, account_code: String(r.account_code), advisor_code: (r.advisor_code as string) ?? "0",
          ref_date: p.ref_date, variant: p.variant,
          aplicacao_financeira: r.aplicacao_financeira, receita_mes: r.receita_mes,
          captacao_bruta_m: r.captacao_bruta_m, resgates_m: r.resgates_m, captacao_liquida_m: r.captacao_liquida_m,
          net_em_m1: r.net_em_m1, net_em_m: r.net_em_m, net_renda_fixa: r.net_renda_fixa,
          net_fundos_imobiliarios: r.net_fundos_imobiliarios, net_renda_variavel: r.net_renda_variavel,
          net_fundos: r.net_fundos, net_financeiro: r.net_financeiro, net_previdencia: r.net_previdencia,
          net_outros: r.net_outros,
        }));
        const { error } = await svc.from("positivador_snapshots").upsert(snaps, { onConflict: "account_code,ref_date,variant" });
        if (error) throw new Error(`fotografia: ${error.message}`);
      }
      // quem sumiu do Positivador é sinalizado, nunca apagado
      // (quem está no arquivo acabou de receber last_seen_import = importId)
      const { error: missErr } = await svc
        .from("clients")
        .update({ missing_since: p.ref_date })
        .is("missing_since", null)
        .or(`last_seen_import.is.null,last_seen_import.neq.${importId}`);
      if (missErr) throw new Error(`sinalização: ${missErr.message}`);
    } else if (p.kind === "diversificacao") {
      // fotografia por data: substitui as posições da MESMA data (período não duplica)
      const { error: delErr } = await svc.from("positions").delete().eq("ref_date", p.ref_date);
      if (delErr) throw new Error(`posições: ${delErr.message}`);
      for (const part of chunk(p.rows, 500)) {
        const { error } = await svc.from("positions").insert(
          part.map((r) => ({
            import_id: importId, account_code: String(r.account_code), advisor_code: (r.advisor_code as string) ?? "0",
            ref_date: p.ref_date, product: r.product, sub_product: r.sub_product, fund_cnpj: r.fund_cnpj,
            asset: r.asset, issuer: r.issuer, maturity_date: r.maturity_date, quantity: r.quantity, value: r.value,
          }))
        );
        if (error) throw new Error(`posições: ${error.message}`);
      }
    } else if (p.kind === "captacao") {
      // substitui movimentações das datas presentes no arquivo (período não duplica)
      const dates = [...new Set(p.rows.map((r) => String(r.mov_date)))];
      const { error: delErr } = await svc.from("movements").delete().in("mov_date", dates);
      if (delErr) throw new Error(`movimentações: ${delErr.message}`);
      for (const part of chunk(p.rows, 500)) {
        const { error } = await svc.from("movements").insert(
          part.map((r) => ({
            import_id: importId, account_code: String(r.account_code), advisor_code: (r.advisor_code as string) ?? "0",
            mov_date: r.mov_date, kind: r.kind, flow: r.flow, amount: r.amount, segment: r.segment,
          }))
        );
        if (error) throw new Error(`movimentações: ${error.message}`);
      }
    } else {
      // saldo consolidado: preenche os NOMES de toda a base + saldos por data
      for (const part of chunk(p.rows, 300)) {
        const { error } = await svc.from("balances").upsert(
          part.map((r) => ({
            import_id: importId, account_code: String(r.account_code), advisor_code: (r.advisor_code as string) ?? "0",
            ref_date: p.ref_date, d0: r.d0, d1: r.d1, d2: r.d2, d3: r.d3, total: r.total,
          })),
          { onConflict: "account_code,ref_date" }
        );
        if (error) throw new Error(`saldos: ${error.message}`);
      }
      for (const r of p.rows) {
        if (r.name) {
          await svc.from("clients").update({ name: r.name }).eq("account_code", String(r.account_code));
        }
      }
    }

    const { error: doneErr } = await svc
      .from("imports")
      .update({ status: "concluida", finished_at: new Date().toISOString() })
      .eq("id", importId);
    if (doneErr) throw new Error(doneErr.message);
    await audit(svc, "importacao", `Importação de ${p.kind} concluída`, `${p.file_name} — ${p.rows.length} registros`, admin);
    return c.json({ ok: true, id: importId, records: p.rows.length });
  } catch (e) {
    return fail((e as Error).message);
  }
});

// ---------- Rotina de alertas (E8): preço + automáticos ----------
// Em produção roda como scheduled worker; em dev/testes é chamada via POST /api/cron/alerts.

const PREF_BY_KIND: Record<string, string> = {
  alerta_atingido: "alerta_preco",
  lembrete_diario: "lembrete_diario",
  card_delegado: "card_delegado",
};

/** Cria a notificação no sino e tenta o push (tela 25) respeitando as preferências da tela 16. */
async function notifyUser(svc: SupabaseClient, userId: string, kind: string, title: string, body: string, ref: Record<string, unknown> = {}, env?: Env) {
  await svc.from("notifications").insert({ user_id: userId, kind, title, body, ref });
  if (!env) return;
  const prefKey = PREF_BY_KIND[kind];
  if (prefKey) {
    const { data: prof } = await svc.from("profiles").select("push_prefs").eq("id", userId).single();
    if (prof && (prof.push_prefs as Record<string, boolean>)[prefKey] === false) return;
  }
  const { data: subs } = await svc.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", userId);
  for (const s of subs ?? []) {
    const result = await sendWebPush(env, { endpoint: s.endpoint, keys: s.keys } as PushSubscriptionRecord, { title, body, kind, ref });
    if (result === "gone") await svc.from("push_subscriptions").delete().eq("id", s.id);
  }
}

async function advisorUsers(svc: SupabaseClient): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; advisor_code: string }>((from, to) =>
    svc.from("profiles").select("id, advisor_code").not("advisor_code", "is", null).eq("is_active", true).order("id").range(from, to)
  );
  return new Map(rows.map((p) => [String(p.advisor_code), p.id]));
}

// Varre a tabela inteira em blocos: um limite fixo silencioso deixaria
// vencimentos/movimentações de fora conforme a base cresce.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, chunk = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const { data } = await build(from, from + chunk - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < chunk) return out;
  }
}

app.post("/api/cron/alerts", async (c) => {
  const svc = svcOf(c.env);
  const now = new Date();
  const results = { price: 0, vencimento: 0, movimentacao: 0, saldo: 0 };

  // 1) alertas de preço ativos
  const { data: alerts } = await svc.from("alerts").select("*").eq("status", "ativo");
  for (const a of alerts ?? []) {
    const q = fakeQuote(a.ticker, now);
    let hit = false;
    if (a.target_price !== null) {
      hit = a.direction === "alta" ? q.price >= a.target_price : q.price <= a.target_price;
    } else if (a.target_day_pct !== null) {
      hit = a.direction === "alta" ? q.changePct >= a.target_day_pct : q.changePct <= -Math.abs(a.target_day_pct);
    }
    if (!hit) continue;
    await svc.from("alerts").update({ status: "disparado", triggered_at: now.toISOString(), triggered_price: q.price }).eq("id", a.id);
    await svc.from("alert_events").insert({
      alert_id: a.id, owner: a.owner, kind: "preco", account_code: a.account_code,
      detail: { ticker: a.ticker, target: a.target_price, price: q.price, direction: a.direction },
    });
    const alvo = a.target_price !== null
      ? `R$ ${a.target_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : `${a.target_day_pct}% no dia`;
    await notifyUser(svc, a.owner, "alerta_atingido", `${a.ticker} atingiu ${alvo}`,
      `Alvo de ${a.direction} alcançado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(now)}. O alerta foi para o histórico.`,
      { ticker: a.ticker }, c.env);
    results.price++;
  }

  const advisors = await advisorUsers(svc);
  const { data: settings } = await svc.from("auto_alert_settings").select("*").eq("id", 1).single();
  const dedupe = async (kind: string, account: string, refKey: string) => {
    const { data } = await svc.from("alert_events").select("id").eq("kind", kind).eq("account_code", account).eq("detail->>ref", refKey).limit(1);
    return (data ?? []).length > 0;
  };

  // 2) vencimento de renda fixa nos próximos N dias
  const horizon = new Date(now.getTime() + (settings?.maturity_window_days ?? 30) * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const maturing = await fetchAll<{ account_code: string; advisor_code: string; asset: string; maturity_date: string | null; value: number }>((from, to) =>
    svc
      .from("positions")
      .select("account_code, advisor_code, asset, maturity_date, value")
      .gte("maturity_date", today)
      .lte("maturity_date", horizon)
      .order("maturity_date", { ascending: true })
      .range(from, to)
  );
  for (const p of maturing) {
    const owner = advisors.get(String(p.advisor_code));
    if (!owner) continue;
    const refKey = `${p.asset}:${p.maturity_date}`;
    if (await dedupe("vencimento", p.account_code, refKey)) continue;
    await svc.from("alert_events").insert({
      owner, kind: "vencimento", account_code: p.account_code,
      detail: { ref: refKey, asset: p.asset, maturity: p.maturity_date, value: p.value },
    });
    await notifyUser(svc, owner, "alerta_atingido", `${p.asset} vence em breve`,
      `Vencimento em ${p.maturity_date!.split("-").reverse().join("/")} — cliente ${p.account_code}.`, { account: p.account_code }, c.env);
    results.vencimento++;
  }

  // 3) movimentação relevante (valor configurável)
  const since = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const threshold = settings?.relevant_movement_threshold ?? 50000;
  const bigMoves = await fetchAll<{ id: string; account_code: string; advisor_code: string; amount: number; mov_date: string; kind: string }>((from, to) =>
    svc
      .from("movements")
      .select("id, account_code, advisor_code, amount, mov_date, kind")
      .gte("mov_date", since)
      .or(`amount.gte.${threshold},amount.lte.${-threshold}`)
      .order("mov_date", { ascending: false })
      .range(from, to)
  );
  for (const m of bigMoves) {
    if (Math.abs(m.amount) < threshold) continue;
    const owner = advisors.get(String(m.advisor_code));
    if (!owner) continue;
    const refKey = `mov:${m.id}`;
    if (await dedupe("movimentacao", m.account_code, refKey)) continue;
    await svc.from("alert_events").insert({
      owner, kind: "movimentacao", account_code: m.account_code,
      detail: { ref: refKey, amount: m.amount, date: m.mov_date, tipo: m.kind },
    });
    await notifyUser(svc, owner, "alerta_atingido",
      `${m.amount >= 0 ? "Aporte" : "Resgate"} relevante — cliente ${m.account_code}`,
      `${m.amount >= 0 ? "+" : "−"}R$ ${Math.abs(m.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${m.mov_date.split("-").reverse().join("/")}.`,
      { account: m.account_code }, c.env);
    results.movimentacao++;
  }

  // 4) saldo parado em conta
  const latestBal = await fetchAll<{ account_code: string; advisor_code: string; total: number; ref_date: string }>((from, to) =>
    svc
      .from("balances")
      .select("account_code, advisor_code, total, ref_date")
      .gte("total", settings?.idle_cash_threshold ?? 10000)
      .order("ref_date", { ascending: false })
      .range(from, to)
  );
  for (const b of latestBal) {
    const owner = advisors.get(String(b.advisor_code));
    if (!owner) continue;
    const refKey = `saldo:${b.ref_date}`;
    if (await dedupe("saldo_parado", b.account_code, refKey)) continue;
    await svc.from("alert_events").insert({
      owner, kind: "saldo_parado", account_code: b.account_code,
      detail: { ref: refKey, total: b.total, date: b.ref_date },
    });
    await notifyUser(svc, owner, "alerta_atingido", `Dinheiro parado — cliente ${b.account_code}`,
      `R$ ${b.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em conta sem aplicação.`, { account: b.account_code }, c.env);
    results.saldo++;
  }

  return c.json({ ok: true, results });
});

// ---------- Push (telas 25/16) ----------

app.get("/api/push/key", (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? null }));

app.post("/api/push/subscribe", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const sub = await c.req.json<{ endpoint: string; keys: { p256dh: string; auth: string } }>();
  if (!sub?.endpoint) return c.json({ error: "Assinatura inválida." }, 400);
  const { error } = await auth.svc
    .from("push_subscriptions")
    .upsert({ user_id: auth.userId, endpoint: sub.endpoint, keys: sub.keys }, { onConflict: "endpoint" });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

// Lembrete diário 08:00 (tela 25 modelo 2): resumo dos cards do dia
app.post("/api/cron/daily-reminder", async (c) => {
  const svc = svcOf(c.env);
  const users = await fetchAll<{ id: string; push_prefs: Record<string, boolean> }>((from, to) =>
    svc.from("profiles").select("id, push_prefs").eq("is_active", true).order("id").range(from, to)
  );
  // UMA varredura de cards para todos (agrupada em memória) — nunca uma consulta por usuário
  const allCards = await fetchAll<{ assignee: string; title: string; due_at: string | null }>((from, to) =>
    svc
      .from("cards")
      .select("assignee, title, due_at")
      .neq("status", "concluido")
      .eq("daily_reminder", true)
      .order("due_at", { ascending: true, nullsFirst: false })
      .range(from, to)
  );
  const byAssignee = new Map<string, { title: string; due_at: string | null }[]>();
  for (const k of allCards) byAssignee.set(k.assignee, [...(byAssignee.get(k.assignee) ?? []), k]);

  let sent = 0;
  for (const u of users) {
    if ((u.push_prefs as Record<string, boolean>).lembrete_diario === false) continue;
    const withReminder = byAssignee.get(u.id) ?? [];
    if (withReminder.length === 0) continue;
    const overdue = withReminder.filter((k) => k.due_at && new Date(k.due_at).getTime() < Date.now());
    const first = overdue[0] ?? withReminder[0];
    const plural = withReminder.length > 1 ? "s" : "";
    const title = `Seu dia: ${withReminder.length} tarefa${plural} pendente${plural}${overdue.length > 0 ? `, ${overdue.length} atrasada${overdue.length > 1 ? "s" : ""}` : ""}`;
    const body = overdue.length > 0 ? `${first.title} venceu.` : `Próximo: ${first.title}.`;
    await notifyUser(svc, u.id, "lembrete_diario", title, body, {}, c.env);
    sent++;
  }
  return c.json({ ok: true, sent });
});

// ---------- Google Agenda (F2-03) — usuário autenticado ----------

app.get("/api/google/status", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const { data } = await auth.svc.from("google_accounts").select("email, mode, connected_at").eq("user_id", auth.userId).maybeSingle();
  return c.json({ connected: !!data, email: data?.email ?? null, mode: data?.mode ?? googleMode(c.env) });
});

app.post("/api/google/connect", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  if (googleMode(c.env) === "real") {
    return c.json({ url: authUrl(c.env, await signedState(c.env, auth.userId)) });
  }
  // simulado: conexão imediata, e-mail derivado do usuário (mesmo padrão do MetaTrader fake)
  const { data: prof } = await auth.svc.from("profiles").select("email").eq("id", auth.userId).single();
  const email = `agenda.${(prof?.email ?? "assessor@elev").split("@")[0]}@gmail.com`;
  const { error } = await auth.svc.from("google_accounts").upsert({ user_id: auth.userId, email, mode: "simulado" });
  if (error) return c.json({ error: error.message }, 500);
  await audit(auth.svc, "usuario", "Conta Google conectada", email);
  return c.json({ connected: true, email });
});

app.get("/api/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Parâmetros ausentes.", 400);
  const userId = await verifyState(c.env, state);
  if (!userId) return c.text("Estado inválido.", 400);
  const svc = svcOf(c.env);
  try {
    const tok = await exchangeCode(c.env, code);
    const email = await userEmail(tok.access_token);
    await svc.from("google_accounts").upsert({
      user_id: userId,
      email,
      mode: "real",
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    });
    await audit(svc, "usuario", "Conta Google conectada", email);
  } catch (e) {
    return c.text(`A conexão com o Google falhou: ${(e as Error).message}`, 500);
  }
  return c.redirect("/perfil?google=ok");
});

app.post("/api/google/disconnect", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  await auth.svc.from("google_accounts").delete().eq("user_id", auth.userId);
  await audit(auth.svc, "usuario", "Conta Google desconectada", null);
  return c.json({ ok: true });
});

/** Quem conectou DEPOIS de já usar a agenda local: compromissos futuros ainda não
 *  enviados (google_id nulo) sobem para o Google automaticamente — padrão de mercado,
 *  sem botão manual. Idempotente: cada evento sobe uma única vez. */
async function pushLocalToGoogle(env: Env, svc: SupabaseClient, userId: string) {
  const { data: acc } = await svc.from("google_accounts").select("mode").eq("user_id", userId).maybeSingle();
  if (!acc || acc.mode !== "real") return;
  const { data: pending } = await svc
    .from("google_events")
    .select("id, title, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "confirmado")
    .is("google_id", null)
    .gte("ends_at", new Date().toISOString());
  for (const ev of pending ?? []) {
    const googleId = await pushToGoogle(env, svc, userId, { kind: "create", title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at });
    if (googleId) await svc.from("google_events").update({ google_id: googleId }).eq("id", ev.id);
  }
}

/** Espelha a agenda REAL do Google para dentro do Elev (importação de mão dupla). */
async function importFromGoogle(env: Env, svc: SupabaseClient, userId: string) {
  const timeMin = new Date(Date.now() - 86400000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 86400000).toISOString();
  const remote = await listFromGoogle(env, svc, userId, timeMin, timeMax);
  if (remote === null) return; // simulado ou sem token: nada a importar
  const { data: locals } = await svc
    .from("google_events")
    .select("id, google_id, title, starts_at, ends_at, status")
    .eq("user_id", userId)
    .gte("starts_at", timeMin)
    .lte("starts_at", timeMax);
  const byGoogleId = new Map((locals ?? []).filter((l) => l.google_id).map((l) => [String(l.google_id), l]));
  const remoteIds = new Set(remote.map((r) => r.googleId));
  for (const r of remote) {
    const local = byGoogleId.get(r.googleId);
    if (!local) {
      await svc.from("google_events").insert({
        user_id: userId, google_id: r.googleId, title: r.title,
        starts_at: r.startsAt, ends_at: r.endsAt, origin: "google",
      });
    } else if (
      local.title !== r.title ||
      new Date(local.starts_at).getTime() !== new Date(r.startsAt).getTime() ||
      new Date(local.ends_at).getTime() !== new Date(r.endsAt).getTime() ||
      local.status !== "confirmado"
    ) {
      await svc.from("google_events").update({ title: r.title, starts_at: r.startsAt, ends_at: r.endsAt, status: "confirmado" }).eq("id", local.id);
    }
  }
  // sumiu do Google dentro da janela → cancelado também aqui
  for (const l of locals ?? []) {
    if (l.google_id && l.status === "confirmado" && !remoteIds.has(String(l.google_id))) {
      await svc.from("google_events").update({ status: "cancelado" }).eq("id", l.id);
    }
  }
}

app.get("/api/google/events", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  // melhor esforço: primeiro empurra o que ainda não subiu (conexão tardia),
  // depois espelha a agenda real do Google (quando conectada)
  try {
    await pushLocalToGoogle(c.env, auth.svc, auth.userId);
    await importFromGoogle(c.env, auth.svc, auth.userId);
  } catch {
    // sem rede/token: a lista local continua respondendo
  }
  const { data } = await auth.svc
    .from("google_events")
    .select("*, clients(name)")
    .eq("user_id", auth.userId)
    .eq("status", "confirmado")
    .gte("ends_at", new Date(Date.now() - 86400000).toISOString())
    .order("starts_at");
  return c.json({ events: data ?? [] });
});

app.post("/api/google/events", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const b = await c.req.json<{ title: string; starts_at: string; ends_at: string; account_code?: string | null }>();
  if (!b.title?.trim() || !b.starts_at || !b.ends_at) return c.json({ error: "Título, início e fim são obrigatórios." }, 400);
  if (new Date(b.ends_at) <= new Date(b.starts_at)) return c.json({ error: "O fim precisa ser depois do início." }, 400);
  if (new Date(b.starts_at).getTime() < Date.now() - 60000) {
    return c.json({ error: "Não é possível agendar no passado." }, 400);
  }
  const googleId = await pushToGoogle(c.env, auth.svc, auth.userId, { kind: "create", title: b.title.trim(), startsAt: b.starts_at, endsAt: b.ends_at });
  const { data, error } = await auth.svc
    .from("google_events")
    .insert({
      user_id: auth.userId,
      google_id: googleId,
      title: b.title.trim(),
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      account_code: b.account_code ?? null,
    })
    .select("id")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ id: data.id });
});

app.patch("/api/google/events/:id", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const id = c.req.param("id");
  const b = await c.req.json<{ title?: string; starts_at?: string; ends_at?: string; account_code?: string | null }>();
  const { data: ev } = await auth.svc.from("google_events").select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (!ev) return c.json({ error: "Agendamento não encontrado." }, 404);
  const next = { title: b.title ?? ev.title, starts_at: b.starts_at ?? ev.starts_at, ends_at: b.ends_at ?? ev.ends_at };
  if (new Date(next.ends_at) <= new Date(next.starts_at)) return c.json({ error: "O fim precisa ser depois do início." }, 400);
  if (b.starts_at && new Date(b.starts_at).getTime() < Date.now() - 60000) {
    return c.json({ error: "Não é possível agendar no passado." }, 400);
  }
  if (ev.google_id) {
    await pushToGoogle(c.env, auth.svc, auth.userId, { kind: "update", googleId: ev.google_id, title: next.title, startsAt: next.starts_at, endsAt: next.ends_at });
  }
  const { error } = await auth.svc
    .from("google_events")
    .update({ ...next, account_code: b.account_code === undefined ? ev.account_code : b.account_code })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

app.delete("/api/google/events/:id", async (c) => {
  const auth = await requireUser(c);
  if (!auth) return c.json({ error: "Não autenticado." }, 401);
  const id = c.req.param("id");
  const { data: ev } = await auth.svc.from("google_events").select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (!ev) return c.json({ error: "Agendamento não encontrado." }, 404);
  if (ev.google_id) await pushToGoogle(c.env, auth.svc, auth.userId, { kind: "delete", googleId: ev.google_id });
  const { error } = await auth.svc.from("google_events").update({ status: "cancelado" }).eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});


export default app;
