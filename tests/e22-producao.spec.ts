/**
 * Fumaça do app PUBLICADO — não faz parte da bateria (roda contra a internet).
 *
 *   npm run smoke:prod
 *
 * Entra com um usuário de cada perfil no endereço publicado e confere que as telas
 * abrem vivas, sem erro de console nem de rede, com o dado real no lugar.
 * Só LÊ: nada é criado, alterado ou apagado na base publicada.
 */
import { test, expect, type Page } from "@playwright/test";

const SENHA = process.env.ELEV_SENHA ?? "Elev@2026";
const ADMIN = process.env.ELEV_ADMIN ?? "admin.teste@elev.app";
const ASSESSOR = process.env.ELEV_ASSESSOR ?? "assessor.teste@elev.app";
const ASSESSOR_CARTEIRA = process.env.ELEV_ASSESSOR_CARTEIRA ?? "rafael.moura@elev.app";

const TELAS_ASSESSOR = ["/", "/clientes", "/cotacoes", "/alertas", "/cards", "/agenda", "/salas", "/notificacoes", "/perfil"];
const TELAS_ADMIN = ["/admin", "/admin/usuarios", "/admin/salas", "/admin/auditoria", "/admin/importacoes", "/admin/kanban", "/admin/metatrader"];

function vigia(page: Page) {
  const problemas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problemas.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    // 401 é resposta legítima do fluxo de login; o resto não pode falhar
    if (r.status() >= 400 && r.status() !== 401) problemas.push(`${r.status()} em ${r.url()}`);
  });
  return problemas;
}

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(email);
  await page.locator('input[type="password"]').fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 });
}

test.describe("app publicado", () => {
  test("admin: todas as telas administrativas abrem sem erro", async ({ page }) => {
    const problemas = vigia(page);
    await entrar(page, ADMIN);
    await expect(page.locator(".admin-shell")).toBeVisible({ timeout: 30_000 });
    for (const rota of TELAS_ADMIN) {
      await page.goto(rota);
      await expect(page.locator(".admin-header__title"), `tela ${rota}`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-skeleton]"), `${rota} ficou carregando`).toHaveCount(0, { timeout: 30_000 });
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("assessor com carteira: vê os clientes reais e as telas do celular", async ({ page }) => {
    const problemas = vigia(page);
    await entrar(page, ASSESSOR_CARTEIRA);
    for (const rota of TELAS_ASSESSOR) {
      await page.goto(rota);
      await expect(page.locator(".mobile-shell"), `tela ${rota}`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-skeleton]"), `${rota} ficou carregando`).toHaveCount(0, { timeout: 30_000 });
    }
    await page.goto("/clientes");
    await expect(page.locator(".client-row").first()).toBeVisible({ timeout: 30_000 });
    const nomes = await page.locator(".client-row__name").allInnerTexts();
    expect(nomes.length).toBeGreaterThan(0);
    console.log(`[produção] carteira do assessor: ${nomes.length}+ clientes — ex.: ${nomes.slice(0, 3).join(" · ")}`);

    // ficha do primeiro cliente, aba a aba
    await page.locator(".client-row").first().click();
    await expect(page.locator(".ficha-header__name")).toBeVisible({ timeout: 30_000 });
    for (const aba of ["Carteira", "Movimentações", "Cadastro", "Notas"]) {
      // a fita de abas rola na horizontal: traz a aba para dentro antes de tocar
      const tab = page.getByRole("tab", { name: aba });
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await expect(page.locator("[data-skeleton]"), `aba ${aba} ficou carregando`).toHaveCount(0, { timeout: 30_000 });
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  test("assessor sem carteira: entra e recebe o estado vazio, não um erro", async ({ page }) => {
    const problemas = vigia(page);
    await entrar(page, ASSESSOR);
    await expect(page.locator(".mobile-shell")).toBeVisible({ timeout: 30_000 });
    await page.goto("/clientes");
    await expect(page.locator("[data-skeleton]")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".empty-state, .client-row").first()).toBeVisible({ timeout: 30_000 });
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
