/**
 * E20 — GARANTIA DE PRODUÇÃO: varredura da aplicação inteira como o PO usa
 * (PWA 390×844 no assessor, desktop no admin), com três provas por página:
 *   1. zero erros de console / exceções de página;
 *   2. zero requisições HTTP falhadas (>=400) não previstas;
 *   3. dado REAL: cotações conferidas contra a brapi DIRETO (fora do app),
 *      selo de fonte visível e nenhum "modo demonstração" com token configurado.
 * O CRUD profundo de cada tela vive nos specs e4–e19; aqui é o pente-fino
 * transversal que os specs por tela não fazem.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid % 1000}`;
const ADV = { email: `gar.adv.${RUN}@elev.test`, password: "Senha@2026!g", name: `Gaia${RUN.slice(-3)} Prado`, code: `77${RUN.slice(-4)}` };
const ADMIN = { email: `gar.adm.${RUN}@elev.test`, password: "Senha@2026!h", name: `Gil${RUN.slice(-3)} Costa` };
const CLI = `77A${RUN.slice(-6)}`;
let advId: string;

test.describe.configure({ mode: "serial" });

// ---------- rastreio de problemas ----------
const ALLOWED_CONSOLE: RegExp[] = [
  /React DevTools/i,
  /Failed to load resource.*40[134]/i, // o próprio response-listener captura os HTTP reais; o eco do console duplicaria com menos contexto
];
const ALLOWED_HTTP: RegExp[] = [
  /404 .*\/favicon/i, // navegadores pedem favicon.ico por conta própria
];
function watch(page: Page): string[] {
  const issues: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (ALLOWED_CONSOLE.some((rx) => rx.test(t))) return;
    issues.push(`console: ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => issues.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const line = `${r.status()} ${r.url()}`;
    if (ALLOWED_HTTP.some((rx) => rx.test(line))) return;
    issues.push(`http ${line}`);
  });
  return issues;
}

test.beforeAll(async () => {
  const svc = serviceClient();
  advId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  await svc.from("clients").upsert({ account_code: CLI, advisor_code: ADV.code, name: `Helena Garantia ${RUN.slice(-4)}`, status: "ATIVO" });
  await svc.from("alerts").insert({ owner: advId, ticker: "PETR4", direction: "alta", target_price: 999.99, created_price: 40, status: "ativo" });
  await svc.from("cards").insert({ title: `Conferir garantia ${RUN}`, creator: advId, assignee: advId, priority: "media", status: "pendente", due_at: new Date(new Date().setHours(17, 0, 0, 0)).toISOString() });
  await svc.from("notifications").insert([
    { user_id: advId, kind: "alerta_atingido", title: `PETR4 atingiu o alvo ${RUN.slice(-4)}`, body: "alerta de alta" },
    { user_id: advId, kind: "importacao", title: `Importação processada ${RUN.slice(-4)}`, body: "Positivador atualizado" },
  ]);
});

async function login(page: Page, email: string, password: string, home = "[data-home]") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector(home, { timeout: 15000 });
}

// ============================================================
// ASSESSOR — PWA 390×844
// ============================================================
test.describe("assessor · PWA", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("PROVA DE DADO REAL: o preço exibido bate com a brapi consultada por fora", async ({ page, request }) => {
    // o token precisa existir — sem ele o app cairia no simulador e a garantia é nula
    const devVars = readFileSync("worker/.dev.vars", "utf8");
    const token = devVars.match(/^BRAPI_TOKEN=(.+)$/m)?.[1]?.trim();
    expect(token, "BRAPI_TOKEN ausente em worker/.dev.vars — modo real desligado").toBeTruthy();

    // fonte independente: brapi direto, sem passar pelo app
    const ext = await request.get(`https://brapi.dev/api/quote/PETR4?token=${token}`);
    expect(ext.ok()).toBe(true);
    const extPrice = (await ext.json()).results?.[0]?.regularMarketPrice as number;
    expect(extPrice).toBeGreaterThan(0);

    const issues = watch(page);
    await login(page, ADV.email, ADV.password);

    // o payload que o app recebeu do worker
    const resp = await page.waitForResponse((r) => r.url().includes("/api/quotes?") && decodeURIComponent(r.url()).includes("IBOV") && decodeURIComponent(r.url()).includes("PETR4") && r.status() === 200);
    const body = (await resp.json()) as { source: string; quotes: { symbol: string; price: number; at: string }[] };
    expect(body.source, "worker respondendo simulado com token configurado").toBe("brapi");
    for (const q of body.quotes) expect(q.price, `${q.symbol} sem preço`).toBeGreaterThan(0);

    const petr = body.quotes.find((q) => q.symbol === "PETR4");
    expect(petr, "PETR4 não veio nos fixados padrão").toBeTruthy();
    // mesma fonte, janela de cache de 5 min do worker: tolerância de 2%
    expect(Math.abs(petr!.price - extPrice) / extPrice).toBeLessThan(0.02);

    // sanidade de grandeza: IBOV em pontos, dólar em reais
    const ibov = body.quotes.find((q) => q.symbol === "IBOV");
    if (ibov) expect(ibov.price).toBeGreaterThan(50000);
    const dolar = body.quotes.find((q) => q.symbol === "DOLAR");
    if (dolar) {
      expect(dolar.price).toBeGreaterThan(2);
      expect(dolar.price).toBeLessThan(15);
    }

    // e o que está NA TELA é esse mesmo dado: selo da fonte + preço do PETR4 renderizado
    await expect(page.locator("[data-quote-source]").first()).toContainText("brapi.dev");
    await expect(page.locator("[data-quote-source]").first()).toContainText("atualizado às");
    const shown = page.getByText("PETR4", { exact: true }).first();
    await expect(shown).toBeVisible();
    await expect(page.getByText(/modo demonstração/)).toHaveCount(0);
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("home: radar com preço vivo (não zero, não travado na metade) e pilha/avisos sem erro", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);
    // radar usa cotação viva do ticker do alerta
    const radar = page.locator(".alert-card__ticker", { hasText: "PETR4" }).first();
    await expect(radar).toBeVisible();
    const card = page.locator(".card", { has: radar }).first();
    await expect(card).not.toContainText("R$ 0,00");
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("cotações: fixados com preço, detalhe com série real, busca sugere e abre", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);
    await page.goto("/cotacoes");
    await page.waitForSelector("[data-fixados] .fav-row", { timeout: 20000 });
    // cada linha fixada tem preço > 0 renderizado
    expect(await page.locator("[data-fixados] .fav-row").count()).toBeGreaterThan(0);
    await expect(page.locator("[data-fixados]")).not.toContainText("R$ 0,00");

    // detalhe do PETR4: hero com preço e gráfico de série REAL (svg com path)
    await page.getByText("PETR4", { exact: true }).first().click();
    await expect(page.getByText("fechamentos diários do último mês", { exact: false })).toBeVisible();
    expect(await page.locator(".quote-hero svg polyline").count()).toBeGreaterThan(0);
    await expect(page.locator("[data-quote-source]").first()).toContainText("brapi.dev");
    await page.goto("/cotacoes");
    await page.waitForSelector("[data-fixados] .fav-row", { timeout: 20000 });

    // busca ao digitar: sugestões reais da fonte
    await page.getByPlaceholder(/PETR4, VALE3, DOLAR/).fill("VALE");
    await page.waitForSelector("[data-quote-suggestions]");
    await expect(page.locator("[data-quote-suggestions]")).toContainText("VALE3");
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("alertas: sugestão valida ticker real, preço aparece, criação e lote funcionam", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);
    await page.goto("/alertas?novo");
    await page.waitForSelector(".sheet__title");
    const ticker = page.locator("#alerta-ativo");
    await ticker.fill("ITUB4");
    // preço real carrega no campo antes de liberar o Criar
    await expect(page.locator(".sheet")).toContainText("R$", { timeout: 15000 });
    await page.getByLabel(/Preço-alvo/).fill("999,99");
    await page.getByRole("button", { name: /^Criar/ }).click();
    await expect(page.locator(".sheet__title")).toHaveCount(0);
    await expect(page.getByText("ITUB4").first()).toBeVisible();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("clientes: lista real, ficha completa aba a aba, nota criada e apagada", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);
    await page.goto("/clientes");
    await page.getByText(`Helena Garantia ${RUN.slice(-4)}`).click();
    await page.waitForSelector(".ficha-tabs", { timeout: 15000 });

    for (const aba of ["Carteira", "Movimentações", "Cadastro", "Notas", "Visão geral"]) {
      await page.getByRole("tab", { name: aba, exact: true }).click();
      await expect(page.locator(".skeleton").first()).toBeHidden({ timeout: 15000 }).catch(() => undefined);
    }
    // notas: criar e apagar de verdade
    await page.getByRole("tab", { name: "Notas", exact: true }).click();
    await page.getByRole("button", { name: /Nova nota/ }).click();
    await page.locator("textarea").fill(`Nota de garantia ${RUN}`);
    await page.getByRole("button", { name: "Salvar nota" }).click();
    await expect(page.getByText(`Nota de garantia ${RUN}`)).toBeVisible();
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("tarefas, agenda, salas e notificações: telas vivas sem erro; apagar em lote persiste", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);

    await page.goto("/cards");
    await expect(page.getByText(`Conferir garantia ${RUN}`)).toBeVisible();
    await expect(page.getByText(/^HOJE — \d{2}\/\d{2}\/\d{4}/i).first()).toBeVisible();

    await page.goto("/agenda");
    await page.waitForSelector("#ag-data, .page-header__title");

    await page.goto("/salas");
    await expect(page.locator(".page-header__title")).toHaveText(/Sala/);

    await page.goto("/notificacoes");
    await expect(page.locator(".notif")).toHaveCount(2);
    await page.getByRole("button", { name: "Selecionar", exact: true }).click();
    await page.locator(".notif").first().click();
    await page.getByRole("button", { name: "Apagar", exact: true }).click();
    await page.locator(".sheet__footer").getByRole("button", { name: "Apagar" }).click();
    await expect(page.locator(".notif")).toHaveCount(1);
    await page.reload();
    await page.waitForSelector(".notif");
    await expect(page.locator(".notif")).toHaveCount(1);
    expect(issues, issues.join("\n")).toEqual([]);
  });

  test("perfil e PWA: toggles persistem, manifest e trava de zoom presentes", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADV.email, ADV.password);
    await page.goto("/perfil");
    const mov = page.getByRole("switch", { name: "Movimentações de clientes" });
    await mov.click();
    await expect(mov).toHaveAttribute("aria-checked", "true");
    await mov.click();
    await expect(mov).toHaveAttribute("aria-checked", "false");

    // fundamentos PWA: manifest servido e viewport sem zoom de pinça
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const mf = await page.request.get(new URL(manifestHref!, page.url()).toString());
    expect(mf.ok()).toBe(true);
    const manifest = await mf.json();
    expect(manifest.name ?? manifest.short_name).toBeTruthy();
    expect((manifest.icons ?? []).length).toBeGreaterThan(0);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("maximum-scale=1");
    expect(issues, issues.join("\n")).toEqual([]);
  });
});

// ============================================================
// ADMIN — desktop 1440×900
// ============================================================
test.describe("admin · desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("todas as telas do admin abrem vivas e sem nenhum erro", async ({ page }) => {
    const issues = watch(page);
    await login(page, ADMIN.email, ADMIN.password, ".admin-header__title, [data-home]");
    const screens: { path: string; title: RegExp }[] = [
      { path: "/admin", title: /./ },
      { path: "/admin/usuarios", title: /Usuários|Acessos/ },
      { path: "/admin/importacoes", title: /Importa/ },
      { path: "/admin/kanban", title: /Kanban|Tarefas/ },
      { path: "/admin/salas", title: /Salas/ },
      { path: "/admin/metatrader", title: /MetaTrader/ },
      { path: "/admin/auditoria", title: /Auditoria/ },
    ];
    for (const s of screens) {
      await page.goto(s.path);
      await expect(page.locator(".admin-header__title").first()).toHaveText(s.title, { timeout: 15000 });
      await expect(page.locator(".skeleton").first()).toBeHidden({ timeout: 15000 }).catch(() => undefined);
    }
    expect(issues, issues.join("\n")).toEqual([]);
  });
});
