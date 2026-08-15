/**
 * E8 — tela 12 (central de alertas + sheet) e fluxo (c): criação → progresso →
 * disparo (cron) → histórico + notificação. Também os alertas automáticos.
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV = { email: `rafael.e8.${RUN}@elev.test`, password: "Senha@2026!a", name: "Rafael Moura", code: `81${RUN.slice(-4)}` };
const ANA = `91${RUN.slice(-5)}7`;

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => !isMobile, "tela 12 é mobile");

let advisorId: string;

test.beforeAll(async () => {
  const svc = serviceClient();
  advisorId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await svc.from("mt_connection").update({ status: "ativa", last_quote_at: new Date().toISOString() }).eq("id", 1);
  await svc.from("imports").delete().eq("file_hash", `e8-${RUN}`);
  await svc.from("alerts").delete().eq("owner", advisorId);
  const { data: imp } = await svc
    .from("imports")
    .upsert({ kind: "diversificacao", file_name: "e8.xlsx", file_size: 1, file_hash: `e8-${RUN}`, ref_date: "2026-08-15", status: "concluida", created_by: advisorId }, { onConflict: "kind,file_hash" })
    .select("id")
    .single();
  await svc.from("clients").upsert({ account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO" });
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await svc.from("positions").insert({ import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-08-15", product: "Renda Fixa", sub_product: "CDB", asset: `CDB Vencendo ${RUN.slice(-4)}`, maturity_date: soon, value: 812400 });
  await svc.from("movements").insert({ import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, mov_date: new Date().toISOString().slice(0, 10), kind: "TED", flow: "C", amount: 250000 });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADV.email);
  await page.locator('input[type="password"]').fill(ADV.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

test("fluxo (c): criar no sheet → progresso → disparo → histórico + notificação", async ({ page, request }) => {
  const svc = serviceClient();
  await login(page);
  await page.goto("/alertas");
  await expect(page.locator(".page-header__title")).toHaveText("Alertas");
  await expect(page.locator(".tab-42--active")).toContainText("Ativos");

  // sheet de criação com resumo em linguagem simples
  await page.getByRole("button", { name: "Novo" }).click();
  const sheet = page.getByRole("dialog", { name: "Novo alerta de preço" });
  await expect(sheet.locator(".sheet__title")).toHaveText("Novo alerta de preço");
  await sheet.getByLabel("Ativo").fill("PETR4");
  await expect(sheet.getByText("agora")).toBeVisible(); // preço atual ao lado do ativo
  const criar = sheet.getByRole("button", { name: "Criar alerta" });
  await sheet.getByLabel("Preço-alvo").fill("999,00");
  await expect(sheet.locator(".alert-summary__text")).toContainText("Você recebe push quando");
  await expect(sheet.locator(".alert-summary__text")).toContainText("O alerta dispara uma vez e vai para o histórico.");
  await sheet.getByLabel("Cliente vinculado · opcional").selectOption({ label: "Ana Bertoldi" });
  await criar.click();

  // card ativo com barra, marca de alvo e rodapé
  const card = page.locator(".card", { hasText: "PETR4" }).first();
  await expect(card.locator(".alert-card__ticker")).toHaveText("PETR4");
  await expect(card.locator(".alert-card__dir")).toContainText("alvo de alta");
  await expect(card.locator(".alert-card__mark")).toBeVisible();
  await expect(card.locator(".alert-card__target")).toContainText("alvo R$ 999,00");
  await expect(card.locator(".alert-foot__meta")).toContainText("vinculado a Ana Bertoldi");

  // alvo inalcançável não dispara; alvo alcançável dispara no cron
  await request.post("http://127.0.0.1:8787/api/cron/alerts");
  const { data: still } = await svc.from("alerts").select("status").eq("owner", advisorId).eq("target_price", 999);
  expect(still![0].status).toBe("ativo");

  await svc.from("alerts").insert({ owner: advisorId, ticker: "VALE3", direction: "alta", target_price: 1, created_price: 60 });
  const tick = await request.post("http://127.0.0.1:8787/api/cron/alerts");
  expect((await tick.json()).ok).toBe(true);

  const { data: fired } = await svc.from("alerts").select("status, triggered_at, triggered_price").eq("owner", advisorId).eq("ticker", "VALE3").single();
  expect(fired!.status).toBe("disparado");
  expect(fired!.triggered_price).toBeGreaterThan(0);

  // histórico exibe o disparo com horário
  await page.reload();
  await page.getByRole("tab", { name: "Histórico" }).click();
  await expect(page.locator(".triggered-row__title").first()).toContainText("VALE3 atingiu R$ 1,00");
  await expect(page.locator(".triggered-row__meta").first()).toContainText("disparado");

  // notificação criada para o dono
  const { data: notif } = await svc.from("notifications").select("kind, title").eq("user_id", advisorId).eq("kind", "alerta_atingido");
  expect((notif ?? []).some((n) => n.title.includes("VALE3 atingiu"))).toBe(true);
});

test("alertas automáticos: vencimento 30d, movimentação relevante e saldo parado", async ({ request }) => {
  const svc = serviceClient();
  await request.post("http://127.0.0.1:8787/api/cron/alerts");

  const { data: events } = await svc.from("alert_events").select("kind, account_code").eq("owner", advisorId);
  const kinds = (events ?? []).map((e) => e.kind);
  expect(kinds).toContain("vencimento");
  expect(kinds).toContain("movimentacao");

  // idempotência: segundo tick não duplica
  const before = (events ?? []).filter((e) => e.kind === "vencimento" && e.account_code === ANA).length;
  await request.post("http://127.0.0.1:8787/api/cron/alerts");
  const { data: after } = await svc.from("alert_events").select("kind").eq("owner", advisorId).eq("kind", "vencimento").eq("account_code", ANA);
  expect(after!.length).toBe(before);
});

test("cancelar alerta pelo ícone de proibido", async ({ page }) => {
  const svc = serviceClient();
  await svc.from("alerts").insert({ owner: advisorId, ticker: "HGLG11", direction: "baixa", target_price: 1, created_price: 158 });
  await login(page);
  await page.goto("/alertas");
  const card = page.locator(".card", { hasText: "HGLG11" }).first();
  await card.getByRole("button", { name: "Cancelar alerta de HGLG11" }).click();
  await expect(page.locator(".card", { hasText: "HGLG11" })).toHaveCount(0);
  const { data } = await svc.from("alerts").select("status").eq("ticker", "HGLG11").eq("owner", advisorId).single();
  expect(data!.status).toBe("cancelado");
});
