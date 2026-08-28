/**
 * E21 — estado de CARREGANDO em toda tela (#2i).
 * Segura as respostas de dados e cobra: (a) toda tela mostra o skeleton do padrão
 * dela, (b) nenhuma tela afirma "vazio" antes de saber, (c) a busca nunca vira
 * skeleton (nota dos quadros 04/05/11).
 */
import { test, expect, type Page } from "@playwright/test";
import { serviceClient, supabaseEnv, createUser } from "./helpers/seed";

const RUN = String(Date.now()).slice(-6);
const ADV = { email: `carreg.adv.${RUN}@elev.test`, password: "Senha@2026!c", name: "Carrega Assessor", code: `CG${RUN.slice(-4)}` };
const ADM = { email: `carreg.adm.${RUN}@elev.test`, password: "Senha@2026!d", name: "Carrega Admin" };

test.beforeAll(async () => {
  supabaseEnv();
  const svc = serviceClient();
  await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await createUser(svc, { email: ADM.email, password: ADM.password, name: ADM.name, role: "admin" });
});

/** Segura os dados por 6s; a consulta do perfil passa (senão o app fica no splash). */
async function segurarDados(page: Page) {
  await page.route(/(rest\/v1|\/api\/)/, async (route) => {
    if (route.request().url().includes("push_prefs")) return route.continue();
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
}

const TELAS_ASSESSOR = ["/", "/clientes", "/cotacoes", "/alertas", "/cards", "/agenda", "/salas", "/notificacoes"];
const TELAS_ADMIN = ["/admin", "/admin/usuarios", "/admin/salas", "/admin/auditoria", "/admin/kanban", "/admin/metatrader"];

test.describe("E21 · carregando", () => {
  test("assessor: toda tela mostra skeleton enquanto os dados não chegam", async ({ page }) => {
    test.skip(test.info().project.name !== "assessor", "viewport do assessor");
    await login(page, ADV.email, ADV.password);
    await segurarDados(page);
    for (const rota of TELAS_ASSESSOR) {
      await page.goto(rota);
      await expect(page.locator(".skeleton").first(), `sem skeleton em ${rota}`).toBeVisible({ timeout: 8000 });
    }
  });

  test("admin: toda tela mostra skeleton enquanto os dados não chegam", async ({ page }) => {
    test.skip(test.info().project.name !== "admin", "viewport do admin");
    await login(page, ADM.email, ADM.password);
    await segurarDados(page);
    for (const rota of TELAS_ADMIN) {
      await page.goto(rota);
      await expect(page.locator(".skeleton").first(), `sem skeleton em ${rota}`).toBeVisible({ timeout: 8000 });
    }
  });

  test("a busca nunca vira skeleton — responde enquanto o resto carrega", async ({ page }) => {
    test.skip(test.info().project.name !== "assessor", "viewport do assessor");
    await login(page, ADV.email, ADV.password);
    await segurarDados(page);

    await page.goto("/clientes");
    await expect(page.getByPlaceholder(/Buscar cliente/i)).toBeEditable();
    await expect(page.locator(".skeleton").first()).toBeVisible();

    await page.goto("/cotacoes");
    await expect(page.getByLabel("Buscar ativo")).toBeEditable();
    await expect(page.locator(".skeleton").first()).toBeVisible();
  });

  test("nenhuma tela afirma 'vazio' antes de saber", async ({ page }) => {
    test.skip(test.info().project.name !== "assessor", "viewport do assessor");
    await login(page, ADV.email, ADV.password);
    await segurarDados(page);

    await page.goto("/cotacoes");
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await expect(page.getByText("Busque um ativo e toque em Fixar")).toHaveCount(0);

    await page.goto("/salas");
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await expect(page.getByText("Nenhuma reserva sua")).toHaveCount(0);
    await expect(page.getByText("Nenhuma sala cadastrada")).toHaveCount(0);

    await page.goto("/notificacoes");
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await expect(page.getByText("Sem notificações")).toHaveCount(0);
  });

  test("o skeleton anuncia o carregamento e some quando o dado chega", async ({ page }) => {
    test.skip(test.info().project.name !== "assessor", "viewport do assessor");
    await login(page, ADV.email, ADV.password);
    await segurarDados(page);
    await page.goto("/notificacoes");

    const regiao = page.locator("[data-skeleton]").first();
    await expect(regiao).toBeVisible();
    await expect(regiao).toHaveAttribute("aria-busy", "true");
    await expect(regiao.getByText(/^Carregando/)).toHaveCount(1);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("/notificacoes");
    await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: 15000 });
  });
});
