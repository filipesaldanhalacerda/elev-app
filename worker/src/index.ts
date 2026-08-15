/**
 * Elev Worker — operações privilegiadas (service_role) que o app NUNCA executa:
 * autenticação por código de uso único e gestão de usuários.
 * O RLS continua valendo para todo acesso do app; aqui só entra o que exige admin da auth.
 */
import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Env = { SUPABASE_URL: string; SERVICE_ROLE_KEY: string };
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

export default app;
