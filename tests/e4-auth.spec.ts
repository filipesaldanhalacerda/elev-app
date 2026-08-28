/**
 * E4 — telas 01/02/03 (autenticação por código) e 19 (usuários + modal),
 * mais o fluxo (a) de ponta a ponta: admin gera código → primeiro acesso → home.
 */
import { test, expect, emAmbosTemas } from "./fixtures";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Costa" };
const BASE_CODE = `88${RUN.slice(-4)}`; // código único por execução, presente na base

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { ...ADMIN, role: "admin" });
  // F2-02: novo acesso exige código de assessor QUE EXISTE na base importada
  await svc.from("clients").upsert({ account_code: `40${RUN.slice(-5)}1`, advisor_code: BASE_CODE, name: "Cliente da Base", status: "ATIVO" });
});

emAmbosTemas("tela 01 · Login", () => {
  test("estrutura do quadro: logo, título, campos, botão, link e rodapé", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".auth-logo__word")).toHaveText("elev");
    await expect(page.locator(".auth-title")).toHaveText("Entrar na plataforma");
    await expect(page.locator(".auth-sub")).toHaveText("Use o e-mail cadastrado pela sua assessoria.");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByText("Primeiro acesso ou perdi a senha")).toBeVisible();
    await expect(page.locator(".auth-screen__footer")).toHaveText("Elev Investimentos · assessoria vinculada à XP");
    // campos de 52px
    expect((await page.locator(".auth-field .field__box").first().boundingBox())!.height).toBe(52);
  });

  test("erro de credencial: banner exato do quadro + campo senha em erro", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("nao.existe@elev.test");
    await page.locator('input[type="password"]').fill("errada123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".banner--danger .banner__title")).toHaveText("E-mail ou senha incorretos");
    await expect(page.locator(".banner--danger .banner__text")).toHaveText("Restam 3 tentativas antes do bloqueio temporário.");
    await expect(page.locator(".field--error")).toBeVisible();
  });
});

emAmbosTemas("tela 02 · Primeiro acesso", () => {
  test("passo 1: indicador, 6 casas, expiração, colar e botão travado", async ({ page }) => {
    await page.goto("/primeiro-acesso");
    await expect(page.locator(".auth-header__title")).toHaveText("Primeiro acesso");
    await expect(page.locator(".step-indicator")).toContainText("passo 1 de 2");
    await expect(page.locator(".auth-title")).toHaveText("Código de acesso");
    await expect(page.locator(".auth-sub")).toContainText("vale 24 horas e serve uma única vez");
    await expect(page.locator(".code-boxes__cell")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Colar código" })).toBeVisible();
    const validar = page.getByRole("button", { name: "Validar código" });
    await expect(validar).toBeDisabled();
    await page.getByLabel("Código de acesso").fill("K7R2P9");
    await expect(validar).toBeEnabled();
    await expect(page.locator(".contact-card__title")).toContainText("Sem código?");
  });
});

emAmbosTemas("tela 03 · Perdi minha senha", () => {
  test("banner, passos 1-2-3, contato e entrada por código", async ({ page }) => {
    await page.goto("/perdi-a-senha");
    await expect(page.locator(".auth-header__title")).toHaveText("Perdi minha senha");
    await expect(page.locator(".banner--info")).toContainText("A Elev não envia e-mail.");
    await expect(page.locator(".howto__step")).toHaveCount(3);
    await expect(page.locator(".howto__step").nth(1)).toContainText("sua senha atual deixa de valer");
    await expect(page.getByText("Já recebeu o código?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar com código" })).toBeDisabled();
    await expect(page.locator(".auth-fineprint")).toContainText("apenas o responsável pelo sistema pode redefinir, direto no banco de dados");
  });
});

test.describe("fluxo (a) · admin cria código → primeiro acesso → home", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "tela 19 é desktop (1440px)");

  test("de ponta a ponta, com auditoria", async ({ page }) => {
    const svc = serviceClient();
    const bruno = { email: `bruno.${RUN}@elev.test`, password: "Temp@2026!x", name: "Bruno Salles" };
    await createUser(svc, { ...bruno, role: "advisor", advisor_code: "1042" });

    // admin entra e abre a tela 19
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector("[data-home], .admin-shell");
    await page.goto("/admin/usuarios");
    await expect(page.locator(".admin-header__title")).toHaveText("Usuários");
    await expect(page.locator(".admin-sidebar__name")).toHaveText("elev Admin");

    // linha do Bruno: gerar código abre o modal exibido uma vez
    const row = page.locator(".users-table__row", { hasText: bruno.email });
    await expect(row.locator(".users-table__code")).toHaveText("A-1042");
    await row.getByRole("button", { name: "Gerar código" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.locator(".modal__title")).toHaveText("Código de acesso gerado");
    await expect(modal.locator(".modal__id")).toContainText("Bruno Salles · assessor A-1042");
    await expect(modal.locator(".code-modal__body")).toContainText("só esta vez");
    await expect(modal.locator(".modal__note")).toContainText("registrado na auditoria");
    const code = (await modal.locator(".code-modal__code").innerText()).trim();
    expect(code).toHaveLength(6);
    await modal.getByRole("button", { name: "Concluir" }).click();

    // linha mudou para "Aguardando 1º acesso" e a senha antiga foi invalidada
    await expect(row.locator(".chip--warning")).toHaveText("Aguardando 1º acesso");
    await expect(row.getByRole("button", { name: "Ver código ativo" })).toBeVisible();

    // sai e faz o primeiro acesso com o código
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await page.waitForURL("**/login");
    await page.goto("/primeiro-acesso");
    await page.getByLabel("Código de acesso").fill(code);
    await page.getByRole("button", { name: "Validar código" }).click();

    // passo 2: confirmação do código + e-mail mascarado + checklist
    await expect(page.locator(".step-indicator")).toContainText("passo 2 de 2");
    await expect(page.locator(".code-confirm__code")).toHaveText(code);
    await expect(page.locator(".code-confirm__email")).toHaveText(`bruno.${RUN}@…`);
    const definir = page.getByRole("button", { name: "Definir senha e entrar" });
    await expect(definir).toBeDisabled();

    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill("NovaSenha1");
    await expect(page.locator(".pw-req--ok")).toHaveCount(3);
    await expect(definir).toBeDisabled(); // ainda falta repetir
    await inputs.nth(1).fill("NovaSenha1");
    await expect(definir).toBeEnabled();
    await definir.click();
    await page.waitForSelector("[data-home], .admin-shell");

    // senha antiga não vale mais; a nova vale
    const { makeClient, supabaseEnv } = await import("./helpers/seed");
    const env = supabaseEnv();
    const check = makeClient(env.url, env.anon);
    const old = await check.auth.signInWithPassword({ email: bruno.email, password: bruno.password });
    expect(old.error).not.toBeNull();
    const nova = await check.auth.signInWithPassword({ email: bruno.email, password: "NovaSenha1" });
    expect(nova.error).toBeNull();

    // auditoria registrou geração e uso do código
    const { data: audit } = await svc.from("audit_log").select("event, detail").eq("category", "codigo").ilike("detail", "%Bruno Salles%");
    const events = (audit ?? []).map((a) => a.event);
    expect(events).toContain("Código de acesso gerado");
    expect(events).toContain("Código de acesso utilizado");
  });

  test("novo usuário pela UI: form composto → código exibido uma vez", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector("[data-home], .admin-shell");
    await page.goto("/admin/usuarios");

    await page.getByRole("button", { name: "Novo usuário" }).click();
    const form = page.getByRole("dialog");
    await expect(form.locator(".modal__title")).toHaveText("Novo usuário");
    const criar = form.getByRole("button", { name: "Criar e gerar código" });
    await expect(criar).toBeDisabled();
    await form.getByLabel("Nome completo").fill("Helena Prado");
    await form.getByLabel("E-mail").fill(`helena.${RUN}@elev.test`);
    // F2-02: o código agora é escolhido da base importada (select com contagem de clientes)
    await form.getByLabel("Código de assessor").selectOption(BASE_CODE);
    await expect(criar).toBeEnabled();
    await criar.click();

    // emenda no fluxo do código: modal exibido uma vez, com o código normalizado
    const codeModal = page.getByRole("dialog");
    await expect(codeModal.locator(".modal__title")).toHaveText("Código de acesso gerado");
    await expect(codeModal.locator(".modal__id")).toContainText(`Helena Prado · assessor A-${BASE_CODE}`);
    expect((await codeModal.locator(".code-modal__code").innerText()).trim()).toHaveLength(6);
    await codeModal.getByRole("button", { name: "Concluir" }).click();

    const row = page.locator(".users-table__row", { hasText: `helena.${RUN}@elev.test` });
    await expect(row.locator(".chip--warning")).toHaveText("Aguardando 1º acesso");

    // editar pelo lápis
    await row.getByRole("button", { name: "Editar Helena Prado" }).click();
    const edit = page.getByRole("dialog");
    await expect(edit.locator(".modal__title")).toHaveText("Editar Helena Prado");
    await expect(edit.getByLabel("E-mail")).toBeDisabled();
    await edit.getByLabel("Nome completo").fill("Helena Prado Souza");
    await edit.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".users-table__row", { hasText: `helena.${RUN}@elev.test` }).locator(".users-table__name")).toHaveText("Helena Prado Souza");
  });

  test("desativar usuário: modal destrutivo + Reativar + auditoria", async ({ page }) => {
    const svc = serviceClient();
    const alvo = { email: `paula.${RUN}@elev.test`, password: "Temp@2026!x", name: "Paula Freitas" };
    await createUser(svc, { ...alvo, role: "advisor", advisor_code: "1103" });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector("[data-home], .admin-shell");
    await page.goto("/admin/usuarios");

    const row = page.locator(".users-table__row", { hasText: alvo.email });
    await row.getByRole("button", { name: "Desativar Paula Freitas" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.locator(".modal__title")).toHaveText("Desativar Paula Freitas?");
    await expect(modal.locator(".modal__note")).toHaveText("Reversível — dá para reativar depois.");
    await modal.getByRole("button", { name: "Desativar" }).click();

    await expect(row.locator(".chip--neutral")).toHaveText("Inativo");
    await expect(row.getByRole("button", { name: "Reativar" })).toBeVisible();

    // desativada não entra
    const { makeClient, supabaseEnv } = await import("./helpers/seed");
    const env = supabaseEnv();
    const check = makeClient(env.url, env.anon);
    const tent = await check.auth.signInWithPassword({ email: alvo.email, password: alvo.password });
    expect(tent.error).not.toBeNull();

    const { data: audit } = await svc.from("audit_log").select("event").eq("category", "usuario").ilike("detail", "%Paula Freitas%");
    expect((audit ?? []).map((a) => a.event)).toContain("Usuário desativado");
  });
});
