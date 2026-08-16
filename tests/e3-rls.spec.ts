/**
 * E3 — testes de RLS contra o Supabase LOCAL (supabase start).
 * A regra de ouro validada NO BANCO: autenticado como assessor A, nenhuma
 * consulta retorna dado do assessor B — mesmo consultando direto a API.
 */
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

// Node 20 não tem WebSocket nativo — injeta o transporte do pacote ws no realtime.
const createClient = (url: string, key: string) =>
  createSupabase(url, key, { realtime: { transport: ws as unknown as new (...args: unknown[]) => WebSocket } });

function supabaseEnv() {
  const out = execSync("supabase status -o env", { encoding: "utf8" });
  const get = (key: string) => out.match(new RegExp(`${key}="([^"]+)"`))?.[1];
  return {
    url: get("API_URL")!,
    anon: get("ANON_KEY")!,
    service: get("SERVICE_ROLE_KEY")!,
  };
}

const RUN = `${Date.now()}`;
const EMAILS = {
  advA: `assessor.a.${RUN}@elev.test`,
  advB: `assessor.b.${RUN}@elev.test`,
  admin: `admin.${RUN}@elev.test`,
};
const SENHA = "Elev@2026!teste";
const CODE_A = "31342"; // regra de ouro: A31342 = 31342
const CODE_B = "31390";
const CLI_A = `900001-${RUN.slice(-4)}`;
const CLI_B = `900002-${RUN.slice(-4)}`;

let svc: SupabaseClient;
let asA: SupabaseClient;
let asB: SupabaseClient;
let asAdmin: SupabaseClient;
let env: ReturnType<typeof supabaseEnv>;
let importId: string;
let roomId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  env = supabaseEnv();
  svc = createClient(env.url, env.service);

  const mk = async (email: string, name: string, role: "admin" | "advisor", advisor: string | null) => {
    const { data, error } = await svc.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
    if (error) throw error;
    const { error: pErr } = await svc.from("profiles").insert({ id: data.user.id, name, email, role, advisor_code: advisor });
    if (pErr) throw pErr;
    return data.user.id;
  };

  const idA = await mk(EMAILS.advA, "Assessor A", "advisor", CODE_A);
  const idB = await mk(EMAILS.advB, "Assessor B", "advisor", CODE_B);
  await mk(EMAILS.admin, "Admin Elev", "admin", null);
  void idA;
  void idB;

  // fatos de importação (só o Worker/service_role escreve)
  const { data: imp, error: impErr } = await svc
    .from("imports")
    .insert({ kind: "positivador", variant: "mensal", file_name: "teste.xlsx", file_size: 1, file_hash: `h-${RUN}`, ref_date: "2026-08-15", status: "concluida", created_by: idA })
    .select("id")
    .single();
  if (impErr) throw impErr;
  importId = imp.id;

  const clients = [
    { account_code: CLI_A, advisor_code: CODE_A, name: "Cliente Do A", status: "ATIVO" },
    { account_code: CLI_B, advisor_code: CODE_B, name: "Cliente Do B", status: "ATIVO" },
  ];
  for (const c of clients) {
    const { error: cErr } = await svc.from("clients").insert(c);
    if (cErr) throw cErr;
  }
  const facts = (acc: string, adv: string) => ({ import_id: importId, account_code: acc, advisor_code: adv, ref_date: "2026-08-15" });
  const mustInsert = async (table: string, rows: Record<string, unknown>[]) => {
    const { error } = await svc.from(table).insert(rows);
    if (error) throw new Error(`seed ${table}: ${error.message}`);
  };
  await mustInsert("positivador_snapshots", [
    { ...facts(CLI_A, CODE_A), variant: "mensal", net_em_m: 1000000 },
    { ...facts(CLI_B, CODE_B), variant: "mensal", net_em_m: 2000000 },
  ]);
  await mustInsert("positions", [
    { ...facts(CLI_A, CODE_A), product: "Renda Fixa", asset: "CDB X", value: 100 },
    { ...facts(CLI_B, CODE_B), product: "Renda Fixa", asset: "CDB Y", value: 200 },
  ]);
  await mustInsert("movements", [
    { import_id: importId, account_code: CLI_A, advisor_code: CODE_A, mov_date: "2026-08-15", kind: "TED", flow: "C", amount: 1000 },
    { import_id: importId, account_code: CLI_B, advisor_code: CODE_B, mov_date: "2026-08-15", kind: "TED", flow: "D", amount: -500 },
  ]);
  await mustInsert("balances", [
    { ...facts(CLI_A, CODE_A), d0: 10, total: 10 },
    { ...facts(CLI_B, CODE_B), d0: 20, total: 20 },
  ]);

  const { data: room, error: rErr } = await svc.from("rooms").insert({ name: `Ipê ${RUN}`, capacity: 6 }).select("id").single();
  if (rErr) throw rErr;
  roomId = room.id;

  const login = async (email: string) => {
    const client = createClient(env.url, env.anon);
    const { error } = await client.auth.signInWithPassword({ email, password: SENHA });
    if (error) throw error;
    return client;
  };
  asA = await login(EMAILS.advA);
  asB = await login(EMAILS.advB);
  asAdmin = await login(EMAILS.admin);
});

test("normalize_advisor_code: A31342 = 31342 no banco", async () => {
  const { data } = await svc.rpc("normalize_advisor_code", { raw: "A31342" });
  expect(data).toBe("31342");
  const { data: d2 } = await svc.rpc("normalize_advisor_code", { raw: " a-31342 " });
  expect(d2).toBe("31342");
});

test("assessor A enxerga SÓ os próprios clientes — em todas as tabelas de fato", async () => {
  for (const table of ["clients", "positivador_snapshots", "positions", "movements", "balances"]) {
    // consultas pontuais: a listagem sem filtro é paginada pelo PostgREST (1000 linhas)
    // e a linha desta execução poderia cair fora da página — o que importa é o RLS.
    const { data: mine, error } = await asA.from(table).select("account_code").eq("account_code", CLI_A);
    expect(error).toBeNull();
    expect(mine!.length, `${table} não devolveu o próprio cliente`).toBeGreaterThan(0);
    const { data: theirs } = await asA.from(table).select("account_code").eq("account_code", CLI_B);
    expect(theirs, `${table} vazou dado do assessor B`).toHaveLength(0);
  }
});

test("consulta direta à conta do outro assessor retorna zero linhas", async () => {
  const { data } = await asA.from("clients").select("*").eq("account_code", CLI_B);
  expect(data).toHaveLength(0);
  const { data: pos } = await asB.from("positions").select("*").eq("account_code", CLI_A);
  expect(pos).toHaveLength(0);
});

test("admin enxerga a operação inteira", async () => {
  const { data } = await asAdmin.from("clients").select("account_code").in("account_code", [CLI_A, CLI_B]);
  expect(data).toHaveLength(2);
});

test("fatos de importação não aceitam escrita do app (só Worker)", async () => {
  const { error } = await asA.from("positions").insert({ import_id: importId, account_code: CLI_A, advisor_code: CODE_A, ref_date: "2026-08-15", product: "X", asset: "Y", value: 1 });
  expect(error).not.toBeNull();
});

test("cadastro complementar: A edita o próprio cliente, nunca o do B — e fica na auditoria", async () => {
  const { error } = await asA.from("client_extras").insert({ account_code: CLI_A, phone: "(31) 99999-0000" });
  expect(error).toBeNull();
  const { error: cross } = await asA.from("client_extras").insert({ account_code: CLI_B, phone: "(31) 98888-0000" });
  expect(cross).not.toBeNull();
  await asA.rpc("log_audit", { p_category: "cadastro", p_event: "Editou telefone", p_detail: `conta ${CLI_A}` });
});

test("alerta vinculado a cliente de outro assessor é recusado", async () => {
  const { data: me } = await asA.auth.getUser();
  const ok = await asA.from("alerts").insert({ owner: me.user!.id, ticker: "PETR4", direction: "alta", target_price: 41, account_code: CLI_A });
  expect(ok.error).toBeNull();
  const cross = await asA.from("alerts").insert({ owner: me.user!.id, ticker: "PETR4", direction: "alta", target_price: 41, account_code: CLI_B });
  expect(cross.error).not.toBeNull();
});

test("card vinculado a cliente só é visível para quem acessa o cliente", async () => {
  const { data: meA } = await asA.auth.getUser();
  const { data: meB } = await asB.auth.getUser();
  const { data: meAdm } = await asAdmin.auth.getUser();

  // F2-09: assessor NÃO delega card a outro assessor — o banco barra
  const cross = await asA
    .from("cards")
    .insert({ title: "Ligar sobre COE", creator: meA.user!.id, assignee: meB.user!.id, account_code: CLI_A });
  expect(cross.error, "assessor delegando a outro assessor deveria ser barrado").not.toBeNull();

  // delegar é papel do ADMIN; ainda assim, card de cliente do A não abre o cliente para B
  const { data: card, error } = await asAdmin
    .from("cards")
    .insert({ title: "Ligar sobre COE", creator: meAdm.user!.id, assignee: meB.user!.id, account_code: CLI_A })
    .select("id")
    .single();
  expect(error).toBeNull();
  const { data: vistoPorB } = await asB.from("cards").select("id").eq("id", card!.id);
  expect(vistoPorB, "card de cliente do A visível para B").toHaveLength(0);

  // sem cliente vinculado, o delegado enxerga o card
  const { data: livre } = await asAdmin
    .from("cards")
    .insert({ title: "Tarefa geral", creator: meAdm.user!.id, assignee: meB.user!.id })
    .select("id")
    .single();
  const { data: visto } = await asB.from("cards").select("id").eq("id", livre!.id);
  expect(visto).toHaveLength(1);
});

test("conflito de reserva é impedido pelo banco", async () => {
  const { data: meA } = await asA.auth.getUser();
  const ok = await asA.from("reservations").insert({ room_id: roomId, period: "[2026-08-17 10:00-03,2026-08-17 11:00-03)", title: "Onboarding", owner: meA.user!.id });
  expect(ok.error).toBeNull();
  const { data: meB } = await asB.auth.getUser();
  const conflito = await asB.from("reservations").insert({ room_id: roomId, period: "[2026-08-17 10:30-03,2026-08-17 11:30-03)", title: "Choque", owner: meB.user!.id });
  expect(conflito.error).not.toBeNull();
  expect(conflito.error!.code).toBe("23P01"); // exclusion_violation
  // horário livre passa
  const livre = await asB.from("reservations").insert({ room_id: roomId, period: "[2026-08-17 11:00-03,2026-08-17 12:00-03)", title: "Livre", owner: meB.user!.id });
  expect(livre.error).toBeNull();
});

test("assessor não escala privilégio nem lê auditoria/importações/MetaTrader", async () => {
  const { data: me } = await asA.auth.getUser();
  const { error: roleErr } = await asA.from("profiles").update({ role: "admin" }).eq("id", me.user!.id);
  expect(roleErr).not.toBeNull();

  const { data: audit } = await asA.from("audit_log").select("*");
  expect(audit).toHaveLength(0);
  const { data: imports } = await asA.from("imports").select("*");
  expect(imports).toHaveLength(0);
  const { data: mt } = await asA.from("mt_connection").select("*");
  expect(mt).toHaveLength(0);

  // admin lê a auditoria — inclusive o evento gravado pelo A
  const { data: adminAudit } = await asAdmin.from("audit_log").select("event").eq("category", "cadastro");
  expect(adminAudit!.length).toBeGreaterThan(0);
});

test("anon não alcança nada", async () => {
  const anon = createClient(env.url, env.anon);
  const { data, error } = await anon.from("clients").select("*");
  // permissão revogada (erro) ou, no mínimo, zero linhas
  if (error === null) expect(data).toHaveLength(0);
  else expect(error).not.toBeNull();
});
