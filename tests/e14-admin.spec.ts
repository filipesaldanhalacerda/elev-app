/**
 * E14 — tela 17 (home admin com status reais) e tela 22 (auditoria filtrável + CSV).
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.e14.${RUN}@elev.test`, password: "Admin@2026!x", name: `Marina${RUN.slice(-3)} Costa` };

test.skip(({ isMobile }) => isMobile, "telas 17/22 são desktop");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  await svc.from("mt_connection").update({ status: "ativa", last_quote_at: new Date().toISOString() }).eq("id", 1);
  await svc.from("audit_log").insert([
    { category: "importacao", event: `Importação de positivador concluída ${RUN}`, detail: "802 registros", actor_name: ADMIN.name },
    { category: "metatrader", event: `Teste de conexão falhou ${RUN}`, detail: "o servidor recusou a senha", actor_name: ADMIN.name },
    { category: "codigo", event: `Código de acesso gerado ${RUN}`, detail: "para Bruno — senha anterior invalidada", actor_name: ADMIN.name },
  ]);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home], .admin-shell");
}

test("tela 17: cartões de status reais, atividade recente e salas hoje", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await expect(page.locator(".admin-header__title")).toHaveText("Visão geral");
  await expect(page.getByRole("button", { name: "Importar relatório" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo usuário" })).toBeVisible();

  // cartão MetaTrader com chip e última cotação
  const mt = page.locator('[data-card-status="mt"]');
  await expect(mt.getByText("Conexão MetaTrader")).toBeVisible();
  await expect(mt.locator(".chip--success")).toHaveText("Ativa");
  await expect(mt.getByText("última atualização de cotações")).toBeVisible();
  await expect(mt.getByRole("button", { name: "Ver conexão" })).toBeVisible();

  // cartão de importação com dados reais
  const imp = page.locator('[data-card-status="import"]');
  await expect(imp.getByText("Última importação")).toBeVisible();
  await expect(imp.getByRole("button", { name: "Ver histórico" })).toBeVisible();

  // cartão de usuários com contagem
  const users = page.locator('[data-card-status="users"]');
  await expect(users.getByText(/ativos de/)).toBeVisible();
  await expect(users.getByRole("button", { name: "Gerenciar usuários" })).toBeVisible();

  // atividade recente ligada à auditoria
  await expect(page.getByText("Atividade recente")).toBeVisible();
  await expect(page.getByRole("button", { name: "Auditoria completa" })).toBeVisible();
  await expect(page.getByText("Salas hoje")).toBeVisible();

  // navegação dos cartões
  await mt.getByRole("button", { name: "Ver conexão" }).click();
  await expect(page.locator(".admin-header__title")).toHaveText("Conexão MetaTrader");
});

test("tela 22: tabela com chips por categoria, filtros e exportar CSV", async ({ page }) => {
  await login(page);
  await page.goto("/admin/auditoria");
  await expect(page.locator(".admin-header__title")).toHaveText("Auditoria");

  // colunas e chips
  await expect(page.locator(".users-table__head")).toContainText("Quando");
  await expect(page.locator(".users-table__head")).toContainText("Evento");
  const impRow = page.locator(".users-table__row", { hasText: `Importação de positivador concluída ${RUN}` });
  await expect(impRow.locator(".chip--success")).toHaveText("Importação");
  const mtRow = page.locator(".users-table__row", { hasText: `Teste de conexão falhou ${RUN}` });
  await expect(mtRow.locator(".chip--danger")).toHaveText("MetaTrader");
  const codeRow = page.locator(".users-table__row", { hasText: `Código de acesso gerado ${RUN}` });
  await expect(codeRow.locator(".chip--warning")).toHaveText("Usuário");
  await expect(codeRow).toContainText("senha anterior invalidada");

  // filtro por categoria
  await page.getByLabel("Filtrar eventos").selectOption("metatrader");
  await expect(page.locator(".users-table__row", { hasText: `Importação de positivador concluída ${RUN}` })).toHaveCount(0);
  await expect(page.locator(".users-table__row", { hasText: `Teste de conexão falhou ${RUN}` })).toBeVisible();
  await page.getByLabel("Filtrar eventos").selectOption("todos");

  // exportar CSV baixa arquivo
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/auditoria-elev-.*\.csv/);
});
