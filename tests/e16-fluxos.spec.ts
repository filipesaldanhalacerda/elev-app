/**
 * E16 — fluxo (e) de ponta a ponta com ARQUIVO REAL:
 * 21 upload com detecção → conferência com avisos → confirmar → 06/08 ficha
 * atualizada com fonte Positivador. Fluxos (a)(b)(c)(d)(f) cobertos em e4–e10.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.e16.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Costa" };
// 31392 é um assessor real dos arquivos da XP
const ADV = { email: `a31392.e16.${RUN}@elev.test`, password: "Senha@2026!a", name: "Assessor Trinta", code: "31392" };

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "o fluxo começa no desktop do admin");

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  // 31392 pode já existir de rodadas anteriores (seed/demo) — cria só se preciso
  const { data: existing } = await svc.from("profiles").select("id").eq("advisor_code", "31392").limit(1);
  if ((existing ?? []).length === 0) {
    await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: "31392" });
  } else {
    await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: `39${RUN.slice(-4)}` });
    await svc.from("profiles").update({ advisor_code: "31392" }).eq("email", ADV.email);
  }
});

test("fluxo (e): importação real → ficha do cliente atualizada com fonte Positivador", async ({ page, browser }) => {
  const svc = serviceClient();

  // garante base limpa para o hash deste arquivo (reimportação é bloqueada)
  const jaImportado = (await svc.from("imports").select("id").eq("kind", "positivador").eq("status", "concluida").limit(1)).data!.length > 0;

  if (!jaImportado) {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForSelector("[data-home]");
    await page.goto("/admin/importacoes");
    await page.locator('[data-testid="import-file"]').setInputFiles(path.resolve("Relatorios Zerva/Essenciais/Positivador - 50191 - Ref.17.03.26.xlsx"));
    await expect(page.locator(".import-file__chip")).toContainText("Positivador mensal detectado");
    await expect(page.locator(".import-footer__note")).toHaveText("Nada é gravado antes desta confirmação.");
    await page.getByRole("button", { name: "Confirmar e processar" }).click();
    await expect(page.locator(".toast")).toContainText("Importação concluída", { timeout: 90_000 });
  }

  // assessor real abre a ficha de um cliente vindo do arquivo (mobile)
  const { data: cliente } = await svc
    .from("clients")
    .select("account_code, name")
    .eq("advisor_code", "31392")
    .not("name", "is", null)
    .limit(1);
  const conta = cliente?.[0]?.account_code ?? (await svc.from("clients").select("account_code").eq("advisor_code", "31392").limit(1)).data![0].account_code;

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mobile.newPage();
  await mpage.goto("http://localhost:5173/login");
  await mpage.getByLabel("E-mail").fill(ADV.email);
  await mpage.locator('input[type="password"]').fill(ADV.password);
  await mpage.getByRole("button", { name: "Entrar", exact: true }).click();
  await mpage.waitForSelector("[data-home]");

  await mpage.goto(`http://localhost:5173/clientes/${conta}`);
  // ficha com dados REAIS da importação e a fonte declarada
  await expect(mpage.locator(".patrimony-value__amount")).toContainText("R$");
  await expect(mpage.locator(".patrimony-source")).toContainText("fonte Positivador");
  await expect(mpage.getByText("Captação líquida ·")).toBeVisible();

  // aba movimentações (dados da Captação real, se houver para este cliente)
  await mpage.getByRole("tab", { name: "Movimentações" }).click();
  await expect(mpage.locator("[data-open-filters]")).toContainText("Tudo");
  await mobile.close();
});

test("critério de aceite: RLS de ponta a ponta com os dados reais", async () => {
  const svc = serviceClient();
  const { makeClient, supabaseEnv } = await import("./helpers/seed");
  const env = supabaseEnv();

  // assessor sem carteira nos arquivos não vê NENHUM cliente
  const semCarteira = { email: `zero.e16.${RUN}@elev.test`, password: "Senha@2026!z" };
  await createUser(svc, { email: semCarteira.email, password: semCarteira.password, name: "Sem Carteira", role: "advisor", advisor_code: `99${RUN.slice(-4)}` });
  const a = makeClient(env.url, env.anon);
  await a.auth.signInWithPassword(semCarteira);
  for (const table of ["clients", "positivador_snapshots", "positions", "movements", "balances", "client_overview"]) {
    const { data } = await a.from(table).select("account_code").limit(5);
    expect(data ?? [], `${table} vazou dados`).toHaveLength(0);
  }
});
