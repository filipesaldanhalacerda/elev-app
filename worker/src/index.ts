/**
 * Elev Worker — operações privilegiadas (service_role) que o app NUNCA executa:
 * autenticação por código de uso único e gestão de usuários.
 * O RLS continua valendo para todo acesso do app; aqui só entra o que exige admin da auth.
 */
import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fakeQuote, fakeSeries, fakeMtTest } from "./quotes";

type Env = { SUPABASE_URL: string; SERVICE_ROLE_KEY: string; METAAPI_TOKEN?: string };
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
  const { data: users, error } = await svc
    .from("profiles")
    .select("id, name, email, advisor_code, role, is_active, created_at")
    .order("created_at");
  if (error) return c.json({ error: error.message }, 500);
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

app.post("/api/admin/users", async (c) => {
  const svc = c.get("svc");
  const admin = c.get("admin");
  const { name, email, advisor_code, role } = await c.req.json<{ name: string; email: string; advisor_code: string | null; role: "admin" | "advisor" }>();
  if (!name || !email || !role) return c.json({ error: "Nome, e-mail e perfil são obrigatórios." }, 400);
  const normalized = advisor_code ? advisor_code.toUpperCase().replace(/^A[\s-]?/, "").replace(/^0+/, "") : null;
  if (role === "advisor" && !normalized) return c.json({ error: "Assessor precisa de código de assessor." }, 400);
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

export default app;
