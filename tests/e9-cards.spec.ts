/**
 * E9 — tela 13 (lista por status, próxima ação, dica dispensável, sheet com lembrete)
 * e tela 23 (kanban do admin com arrasto e filtro por assessor). Delegação com notificação.
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.e9.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Costa" };
const RAFA = { email: `rafael.e9.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `91${RUN.slice(-4)}` };
const BRUNO = { email: `bruno.e9.${RUN}@elev.test`, password: "Senha@2026!b", name: `Bruno${RUN.slice(-3)} Salles`, code: `92${RUN.slice(-4)}` };
const ANA = `93${RUN.slice(-5)}7`;

let rafaId: string;
let brunoId: string;

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  rafaId = await createUser(svc, { email: RAFA.email, password: RAFA.password, name: RAFA.name, role: "advisor", advisor_code: RAFA.code });
  brunoId = await createUser(svc, { email: BRUNO.email, password: BRUNO.password, name: BRUNO.name, role: "advisor", advisor_code: BRUNO.code });
  await svc.from("clients").insert({ account_code: ANA, advisor_code: RAFA.code, name: "Ana Bertoldi", status: "ATIVO" });
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

test.describe("tela 13 · lista por status (mobile)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => !isMobile, "tela 13 é mobile");

  test("criar no sheet → pendente → iniciar → concluir; dica dispensada não volta", async ({ page }) => {
    await login(page, RAFA.email, RAFA.password);
    await page.goto("/cards");
    await expect(page.locator(".tab-42--active")).toHaveText("Meus cards");

    // sheet com todos os campos do quadro
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Novo card" });
    await sheet.getByLabel("Título").fill("Ligar sobre vencimento do CDB");
    await sheet.getByLabel("Cliente").selectOption({ label: "Ana Bertoldi" });
    await expect(sheet.getByText("resumo dos cards do dia às 08:00")).toBeVisible();
    await expect(sheet.getByRole("switch", { name: "Lembrete diário" })).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "Criar card" }).click();

    // pendente com contador e próxima ação
    await expect(page.locator(".status-segment__item--active")).toContainText("Pendente");
    await expect(page.locator(".status-segment__item--active .status-segment__count")).toHaveText("1");
    const row = page.locator(".card-row", { hasText: "Ligar sobre vencimento do CDB" });
    await expect(row.locator(".card-row__meta")).toContainText("Ana Bertoldi");

    // dica do swipe visível; dispensa e não volta
    await expect(page.locator(".swipe-hint__text")).toHaveText("Dica: deslizar um card para a direita também avança o status.");
    await page.getByRole("button", { name: "Dispensar dica" }).click();
    await expect(page.locator(".swipe-hint")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".swipe-hint")).toHaveCount(0);

    // iniciar → aba Andamento com botão de concluir
    await row.getByRole("button", { name: "Iniciar Ligar sobre vencimento do CDB" }).click();
    await expect(page.locator(".status-segment__item", { hasText: "Andamento" }).locator(".status-segment__count")).toHaveText("1");
    await page.getByRole("tab", { name: "Andamento" }).click();
    const inProgress = page.locator(".card-row", { hasText: "Ligar sobre vencimento do CDB" });
    await inProgress.getByRole("button", { name: "Concluir Ligar sobre vencimento do CDB" }).click();
    await page.getByRole("tab", { name: "Concluído" }).click();
    await expect(page.locator(".card-row", { hasText: "Ligar sobre vencimento do CDB" })).toBeVisible();
  });

  test("delegação: aparece em 'Meus cards' do delegado com origem e notifica", async ({ page }) => {
    const svc = serviceClient();
    await svc.from("cards").insert({ title: `Ligar sobre COE ${RUN}`, creator: brunoId, assignee: rafaId, priority: "media", status: "pendente" });

    await login(page, RAFA.email, RAFA.password);
    await page.goto("/cards");
    const row = page.locator(".card-row", { hasText: `Ligar sobre COE ${RUN}` });
    await expect(row.locator(".card-row__meta")).toContainText(`delegado por Bruno${RUN.slice(-3)}`);

    // notificação de card delegado criada pelo trigger
    const { data: notif } = await svc.from("notifications").select("title, body").eq("user_id", rafaId).eq("kind", "card_delegado");
    expect((notif ?? []).some((n) => n.title === `Bruno${RUN.slice(-3)} delegou um card para você` && n.body.includes("Ligar sobre COE"))).toBe(true);

  });

  test("card vinculado a cliente do Rafael não aparece para Bruno mesmo delegado", async ({ page }) => {
    const svc = serviceClient();
    await svc.from("cards").insert({ title: `Sigiloso ${RUN}`, creator: rafaId, assignee: brunoId, account_code: ANA, priority: "alta", status: "pendente" });
    await login(page, BRUNO.email, BRUNO.password);
    await page.goto("/cards");
    await expect(page.locator(".card-row", { hasText: `Sigiloso ${RUN}` })).toHaveCount(0);
  });
});

test.describe("tela 23 · kanban geral (admin)", () => {
  test.skip(({ isMobile }) => isMobile, "tela 23 é desktop");

  test("colunas com contador, filtro por assessor e arrasto muda status", async ({ page }) => {
    const svc = serviceClient();
    await svc.from("cards").insert([
      { title: `Rebalancear ${RUN}`, creator: rafaId, assignee: rafaId, priority: "alta", status: "pendente", due_at: new Date(Date.now() - 86400000).toISOString() },
      { title: `Proposta ${RUN}`, creator: brunoId, assignee: brunoId, priority: "media", status: "andamento" },
    ]);

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/kanban");
    await expect(page.locator(".admin-header__title")).toHaveText("Kanban geral");
    await expect(page.locator(".kb-filter__label")).toHaveText("Assessor:");
    await expect(page.locator(".kb-chip--active")).toHaveText("Todos");

    const pendente = page.locator('[data-column="pendente"]');
    const rebalancear = pendente.locator(".kb-card", { hasText: `Rebalancear ${RUN}` });
    await expect(rebalancear).toBeVisible();
    await expect(rebalancear.locator(".card-row__late")).toHaveText("atrasado");

    // filtro por assessor
    await page.locator(".kb-chip", { hasText: `Bruno${RUN.slice(-3)}` }).click();
    await expect(pendente.locator(".kb-card", { hasText: `Rebalancear ${RUN}` })).toHaveCount(0);
    await expect(page.locator('[data-column="andamento"] .kb-card', { hasText: `Proposta ${RUN}` })).toBeVisible();
    await page.locator(".kb-chip", { hasText: "Todos" }).click();

    // arrasto: pendente → concluído
    await rebalancear.dragTo(page.locator('[data-column="concluido"]'));
    await expect(page.locator('[data-column="concluido"] .kb-card', { hasText: `Rebalancear ${RUN}` })).toBeVisible();
    const { data } = await svc.from("cards").select("status").eq("title", `Rebalancear ${RUN}`).single();
    expect(data!.status).toBe("concluido");
  });
});
