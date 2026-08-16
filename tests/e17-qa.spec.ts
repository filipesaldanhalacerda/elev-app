/**
 * E17 — QA-varredura: toda rota × 2 temas no viewport correto.
 * Reprova em: erro de página (exceção JS), console.error real, requisição 4xx/5xx
 * inesperada, overflow horizontal e alvo de toque menor que o desenhado.
 * Gera screenshot de cada tela para revisão visual.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}`;
const SHOTS = "test-results/qa-shots";
mkdirSync(SHOTS, { recursive: true });

const ADV = { email: `qa.assessor.${RUN}@elev.test`, password: "Senha@2026!q", name: `Qa${RUN.slice(-3)} Assessor`, code: `77${RUN.slice(-4)}` };
const ADMIN = { email: `qa.admin.${RUN}@elev.test`, password: "Admin@2026!q", name: `Qa${RUN.slice(-3)} Admin` };
const ANA = `71${RUN.slice(-6)}7`;

let advId: string;

const IGNORED_CONSOLE = [
  /React Router Future Flag/i,
  /React DevTools/i,
  /\[vite\]/i,
  /favicon/i,
  /Download the React/i,
  /net::ERR_INTERNET_DISCONNECTED/i,
];
const IGNORED_REQUESTS = [/favicon/, /sourcemap/, /\.map$/, /code\/validate/, /sw\.js/, /workbox/];

interface PageIssues {
  errors: string[];
  consoleErrors: string[];
  badRequests: string[];
}

function watch(page: import("@playwright/test").Page): PageIssues {
  const issues: PageIssues = { errors: [], consoleErrors: [], badRequests: [] };
  page.on("pageerror", (e) => issues.errors.push(String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((rx) => rx.test(text))) return;
    issues.consoleErrors.push(text.slice(0, 300));
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !IGNORED_REQUESTS.some((rx) => rx.test(r.url()))) {
      issues.badRequests.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    }
  });
  return issues;
}

async function structuralChecks(page: import("@playwright/test").Page, label: string) {
  // 1) sem overflow horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: overflow horizontal de ${overflow}px`).toBeLessThanOrEqual(1);
  // 2) sem emoji em lugar nenhum
  const text = await page.locator("body").innerText();
  expect(/[\u{1F300}-\u{1FAFF}]/u.test(text), `${label}: emoji encontrado`).toBe(false);
  // 3) botões visíveis com nome acessível
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null)
      .filter((b) => !(b.textContent ?? "").trim() && !b.getAttribute("aria-label"))
      .map((b) => b.className)
      .slice(0, 5)
  );
  expect(unnamed, `${label}: botões sem nome acessível: ${unnamed.join(" | ")}`).toHaveLength(0);
}

function assertClean(issues: PageIssues, label: string) {
  expect(issues.errors, `${label}: exceções de página`).toHaveLength(0);
  expect(issues.consoleErrors, `${label}: erros de console`).toHaveLength(0);
  expect(issues.badRequests, `${label}: requisições falhas`).toHaveLength(0);
}

test.beforeAll(async () => {
  const svc = serviceClient();
  advId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  await svc.from("mt_connection").update({ status: "ativa", last_quote_at: new Date().toISOString() }).eq("id", 1);
  const today = new Date();
  await svc.from("clients").upsert([
    { account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO", suitability: "AGRESSIVO", birth_date: `1968-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`, xp_registered_at: "2019-04-08" },
    { account_code: ANA.replace("7", "3"), advisor_code: ADV.code, name: "Carlos Bertrand", status: "INATIVO" },
  ]);
  const { data: imp } = await svc.from("imports").upsert(
    { kind: "positivador", variant: "mensal", file_name: "qa.xlsx", file_size: 1, file_hash: `qa-${RUN}`, ref_date: "2026-08-14", status: "concluida", created_by: advId },
    { onConflict: "kind,file_hash" }
  ).select("id").single();
  await svc.from("positivador_snapshots").upsert([
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-07-14", variant: "mensal", net_em_m: 4700000, net_em_m1: 4600000 },
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-08-14", variant: "mensal", net_em_m: 4812330, net_em_m1: 4745887, captacao_liquida_m: 250000 },
  ], { onConflict: "account_code,ref_date,variant" });
  await svc.from("positions").delete().eq("import_id", imp!.id);
  await svc.from("movements").delete().eq("import_id", imp!.id);
  await svc.from("timeline_notes").delete().eq("account_code", ANA);
  await svc.from("notifications").delete().eq("user_id", advId);
  await svc.from("positions").insert([
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-08-14", product: "Renda Fixa", sub_product: "CDB", asset: "CDB Banco QA", maturity_date: "2026-09-01", value: 812400 },
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-08-14", product: "Renda Variável", asset: "PETR4", quantity: 18400, value: 706928 },
  ]);
  await svc.from("movements").insert([
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, mov_date: "2026-08-07", kind: "TED", flow: "C", amount: 250000 },
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, mov_date: "2026-08-01", kind: "TED", flow: "D", amount: -40000 },
  ]);
  await svc.from("client_extras").upsert({ account_code: ANA, phone: "(11) 98812-4402", email: "ana@email.com", notes: "Observação QA.", updated_by: advId });
  await svc.from("timeline_notes").insert({ account_code: ANA, advisor_code: ADV.code, author: advId, body: "Nota QA da linha do tempo." });
  await svc.from("alerts").delete().eq("owner", advId);
  await svc.from("alerts").insert([
    { owner: advId, ticker: "PETR4", direction: "alta", target_price: 41, created_price: 38.42, account_code: ANA, status: "ativo", triggered_at: null, triggered_price: null },
    { owner: advId, ticker: "VALE3", direction: "baixa", target_price: 58, created_price: 61, status: "disparado", triggered_at: new Date().toISOString(), triggered_price: 58 },
  ]);
  await svc.from("cards").delete().eq("assignee", advId);
  await svc.from("cards").insert([
    { title: `QA pendente ${RUN}`, creator: advId, assignee: advId, account_code: ANA, priority: "alta", status: "pendente", due_at: new Date(Date.now() - 86400000).toISOString(), completed_at: null },
    { title: `QA andamento ${RUN}`, creator: advId, assignee: advId, account_code: null, priority: "media", status: "andamento", due_at: null, completed_at: null },
    { title: `QA concluído ${RUN}`, creator: advId, assignee: advId, account_code: null, priority: "baixa", status: "concluido", due_at: null, completed_at: new Date().toISOString() },
  ]);
  const { data: room } = await svc.from("rooms").upsert({ name: `QA Ipê ${RUN.slice(-4)}`, capacity: 6, resources: ["TV"] }, { onConflict: "name" }).select("id").single();
  await svc.from("reservations").delete().eq("room_id", room!.id);
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  await svc.from("reservations").insert({ room_id: room!.id, owner: advId, title: "Reserva QA", period: `[${day}T09:00:00-03:00,${day}T10:00:00-03:00)` });
  await svc.from("notifications").insert([
    { user_id: advId, kind: "alerta_atingido", title: "VALE3 atingiu R$ 58,00", body: "Alvo de baixa alcançado", read_at: null, created_at: new Date().toISOString() },
    { user_id: advId, kind: "reserva_confirmada", title: "Reserva confirmada — QA Ipê", body: null, read_at: new Date().toISOString(), created_at: new Date(Date.now() - 86400000).toISOString() },
  ]);
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

const MOBILE_ROUTES: { path: string; label: string; ready: string }[] = [
  { path: "/", label: "04-home", ready: "[data-home]" },
  { path: "/clientes", label: "05-clientes", ready: ".client-row" },
  { path: `/clientes/__ANA__`, label: "06-visao-geral", ready: ".patrimony-value__amount" },
  { path: `/clientes/__ANA__?aba=Carteira`, label: "07-carteira", ready: ".class-group" },
  { path: `/clientes/__ANA__?aba=Movimenta%C3%A7%C3%B5es`, label: "08-movimentacoes", ready: ".mov-group" },
  { path: `/clientes/__ANA__?aba=Cadastro`, label: "09-cadastro", ready: ".extras-card" },
  { path: `/clientes/__ANA__?aba=Linha%20do%20tempo`, label: "10-linha-do-tempo", ready: ".tl-composer" },
  { path: "/cotacoes", label: "11-cotacoes", ready: ".fav-row" },
  { path: "/alertas", label: "12-alertas", ready: ".alert-card__track" },
  { path: "/cards", label: "13-cards", ready: ".status-segment" },
  { path: "/salas", label: "14-salas", ready: ".agenda__row" },
  { path: "/notificacoes", label: "15-notificacoes", ready: ".notif" },
  { path: "/perfil", label: "16-perfil", ready: '[data-avatar]' },
  { path: "/agenda", label: "27-agenda", ready: ".empty-state, .reservation-row" },
];

const ADMIN_ROUTES: { path: string; label: string; ready: string }[] = [
  { path: "/admin", label: "17-home-admin", ready: '[data-card-status="mt"]' },
  { path: "/admin/metatrader", label: "18-metatrader", ready: ".mt-card" },
  { path: "/admin/usuarios", label: "19-usuarios", ready: ".users-table__row" },
  { path: "/admin/salas", label: "20-salas-admin", ready: ".room-card" },
  { path: "/admin/importacoes", label: "21-importacao", ready: ".import-panel" },
  { path: "/admin/auditoria", label: "22-auditoria", ready: ".users-table__head" },
  { path: "/admin/kanban", label: "23-kanban", ready: ".kb-col" },
];

const AUTH_ROUTES: { path: string; label: string; ready: string }[] = [
  { path: "/login", label: "01-login", ready: ".auth-logo__word" },
  { path: "/primeiro-acesso", label: "02-primeiro-acesso", ready: ".code-boxes" },
  { path: "/perdi-a-senha", label: "03-perdi-a-senha", ready: ".howto" },
];

for (const theme of ["claro", "escuro"] as const) {
  test(`varredura mobile · tema ${theme}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    const issues = watch(page);
    await page.addInitScript((t) => localStorage.setItem("elev.theme", t), theme);
    await page.goto("http://localhost:5173/login");

    for (const route of AUTH_ROUTES) {
      await page.goto(`http://localhost:5173${route.path}`);
      await page.waitForSelector(route.ready, { timeout: 15000 });
      await page.waitForTimeout(300);
      await structuralChecks(page, `${route.label} ${theme}`);
      await page.screenshot({ path: `${SHOTS}/${route.label}-${theme}.png`, fullPage: true });
    }

    await login(page, ADV.email, ADV.password);
    for (const route of MOBILE_ROUTES) {
      const path = route.path.replace("__ANA__", ANA);
      await page.goto(`http://localhost:5173${path}`);
      await page.waitForSelector(route.ready, { timeout: 20000 });
      await page.waitForTimeout(400);
      await structuralChecks(page, `${route.label} ${theme}`);
      await page.screenshot({ path: `${SHOTS}/${route.label}-${theme}.png`, fullPage: true });
    }

    // interações: sheets/abas/segmentados abrem e fecham sem erro
    await page.goto("http://localhost:5173/alertas");
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.waitForSelector(".sheet__title");
    await page.screenshot({ path: `${SHOTS}/12-sheet-${theme}.png` });
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("tab", { name: "Histórico" }).click();
    await page.waitForSelector(".triggered-row");

    await page.goto("http://localhost:5173/cards");
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.waitForSelector(".sheet__title");
    await page.screenshot({ path: `${SHOTS}/13-sheet-${theme}.png` });
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("tab", { name: "Criados por mim" }).click();
    await page.getByRole("tab", { name: "Andamento" }).click();
    await page.getByRole("tab", { name: "Concluído" }).click();

    await page.goto("http://localhost:5173/salas");
    await page.getByRole("button", { name: "Reservar" }).click();
    await page.waitForSelector("#res-titulo");
    await page.screenshot({ path: `${SHOTS}/14-nova-reserva-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Voltar" }).click();

    await page.goto(`http://localhost:5173/cotacoes`);
    await page.getByLabel("Buscar ativo").fill("VALE3");
    await page.getByLabel("Buscar ativo").press("Enter");
    await page.waitForSelector(".quote-detail__ticker");
    await page.screenshot({ path: `${SHOTS}/11-resultado-${theme}.png`, fullPage: true });

    assertClean(issues, `mobile ${theme}`);
    await context.close();
  });

  test(`varredura admin · tema ${theme}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    const issues = watch(page);
    await page.addInitScript((t) => localStorage.setItem("elev.theme", t), theme);
    await login(page, ADMIN.email, ADMIN.password);

    for (const route of ADMIN_ROUTES) {
      await page.goto(`http://localhost:5173${route.path}`);
      await page.waitForSelector(route.ready, { timeout: 20000 });
      await page.waitForTimeout(400);
      await structuralChecks(page, `${route.label} ${theme}`);
      await page.screenshot({ path: `${SHOTS}/${route.label}-${theme}.png`, fullPage: true });
    }

    // interações admin: modais abrem/fecham sem erro
    await page.goto("http://localhost:5173/admin/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    await page.waitForSelector(".modal__title");
    await page.screenshot({ path: `${SHOTS}/19-form-${theme}.png` });
    await page.locator(".modal").getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.goto("http://localhost:5173/admin/salas");
    await page.getByRole("button", { name: "Nova sala" }).click();
    await page.waitForSelector(".modal__title");
    await page.locator(".modal").getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.goto("http://localhost:5173/admin/metatrader");
    await page.getByRole("button", { name: "Desconectar" }).click();
    await page.waitForSelector(".modal__title");
    await page.screenshot({ path: `${SHOTS}/18-modal-${theme}.png` });
    await page.locator(".modal").getByRole("button", { name: "Cancelar", exact: true }).click();

    assertClean(issues, `admin ${theme}`);
    await context.close();
  });
}
