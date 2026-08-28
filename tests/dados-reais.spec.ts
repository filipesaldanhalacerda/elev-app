/**
 * Carga de dados REAIS para o PO testar — não faz parte da bateria.
 * Roda com: npm run dados:reais  (depois de `npx supabase db reset`, se quiser base limpa)
 *
 * Importa os 4 relatórios essenciais da XP pelo MESMO fluxo do app (tela 21, como o
 * administrador faz), na ordem que o modelo de dados espera. O admin NUNCA fica com
 * carteira (ele só gere o sistema); as duas maiores carteiras reais vão para os
 * assessores de desenvolvimento, para ver as telas do assessor com dado de verdade.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { serviceClient } from "./helpers/seed";

const PO = { email: process.env.PO_EMAIL ?? "lacerdafilipe@gmail.com", password: process.env.PO_SENHA ?? "Elev@2026" };
// numa base publicada os assessores têm outro domínio: ELEV_ASSESSORES="a@x,b@x"
const ASSESSORES = (process.env.ELEV_ASSESSORES ?? "rafael.moura@elev.test,bruno.salles@elev.test").split(",");
const DIR = path.resolve("Relatorios Zerva/Essenciais");
const ORDEM = [
  { arquivo: "Positivador - 50191 - Ref.17.03.26.xlsx", tipo: "Positivador mensal (cria a base de clientes)" },
  { arquivo: "Relatório Positivador - Semana 03 Março.xlsx", tipo: "Positivador semanal (fotografia da semana)" },
  { arquivo: "Codigo_CAIO.A73908_RelatorioSaldoConsolidado_202603.xlsx", tipo: "Saldo Consolidado (nomes e saldos)" },
  { arquivo: "Diversificacao - 50191 - Ref.17.03.26.xlsx", tipo: "Diversificação (carteira por ativo)" },
  { arquivo: "Captacao - 50191 - Ref.17.03.26.xlsx", tipo: "Captação (aportes e resgates)" },
];

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(PO.email);
  await page.locator('input[type="password"]').fill(PO.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector(".admin-shell");
  await page.goto("/admin/importacoes");
  await expect(page.locator(".admin-header__title")).toHaveText("Importar relatório");
}

test("importa os relatórios reais da XP pelo fluxo do app", async ({ page, browser }) => {
  const svc = serviceClient();
  await loginAdmin(page);

  // linhas REAIS do histórico (o estado vazio usa a mesma classe, com texto de aviso)
  const HIST = ".import-history__row:has(.import-history__dot)";
  const jaImportado = page.locator(".banner--danger", { hasText: "já foi importado" });

  for (const { arquivo, tipo } of ORDEM) {
    const antes = await page.locator(HIST).count();
    await page.locator('[data-testid="import-file"]').setInputFiles(path.join(DIR, arquivo));
    await expect(page.locator(".import-file__chip")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Confirmar e processar" }).click();
    // termina de um jeito ou de outro: linha nova no histórico, ou aviso de já importado
    // (o comando é repetível — reimportar o mesmo arquivo não duplica nada)
    await expect
      .poll(async () => ((await jaImportado.isVisible()) ? "duplicado" : (await page.locator(HIST).count()) > antes ? "novo" : "processando"), {
        timeout: 300_000,
        intervals: [1000],
      })
      .not.toBe("processando");
    if (await jaImportado.isVisible()) {
      console.log(`[dados-reais] ${tipo} — já estava importado, seguindo`);
      await page.reload();
      continue;
    }
    await expect(page.locator(HIST).first()).toContainText("concluída", { timeout: 60_000 });
    console.log(`[dados-reais] ${tipo} — importado`);
  }

  // números reais na base
  const conta = async (tabela: string) => (await svc.from(tabela).select("*", { count: "exact", head: true })).count ?? 0;
  const totais = {
    clientes: await conta("clients"),
    fotografias: await conta("positivador_snapshots"),
    posicoes: await conta("positions"),
    movimentacoes: await conta("movements"),
    saldos: await conta("balances"),
  };
  console.log("[dados-reais] totais:", JSON.stringify(totais));
  expect(totais.clientes).toBeGreaterThan(700);
  expect(totais.posicoes).toBeGreaterThan(7000);

  // o admin NÃO atende clientes: carteira zerada nele, e as duas maiores carteiras
  // reais vão para os assessores de desenvolvimento (telas do assessor com dado de verdade)
  const { data: clientes } = await svc.from("clients").select("advisor_code");
  const porAssessor = new Map<string, number>();
  for (const c of clientes ?? []) {
    const code = (c as { advisor_code: string | null }).advisor_code;
    if (code) porAssessor.set(code, (porAssessor.get(code) ?? 0) + 1);
  }
  const ranking = [...porAssessor.entries()].sort((a, b) => b[1] - a[1]);
  await svc.from("profiles").update({ advisor_code: null }).eq("email", PO.email);
  for (let i = 0; i < ASSESSORES.length && i < ranking.length; i++) {
    await svc.from("profiles").update({ advisor_code: ranking[i][0] }).eq("email", ASSESSORES[i]);
    console.log(`[dados-reais] ${ASSESSORES[i]} agora atende o código ${ranking[i][0]} (${ranking[i][1]} clientes)`);
  }
  console.log(`[dados-reais] carteiras: ${ranking.slice(0, 8).map(([c, n]) => `${c}:${n}`).join(" · ")}`);

  // prova em duas frentes: o admin cai no /admin (sem carteira) e o assessor vê a carteira real
  await page.goto("/clientes");
  await expect(page.locator(".admin-shell")).toBeVisible({ timeout: 15_000 });
  console.log("[dados-reais] admin em /clientes foi devolvido ao /admin — sem carteira, como deve ser");

  const ctx = await browser.newContext({ baseURL: "http://localhost:5173", viewport: { width: 390, height: 844 } });
  const assessor = await ctx.newPage();
  await assessor.goto("/login");
  await assessor.getByLabel("E-mail").fill(ASSESSORES[0]);
  await assessor.locator('input[type="password"]').fill(PO.password);
  await assessor.getByRole("button", { name: "Entrar", exact: true }).click();
  await assessor.waitForSelector("[data-home]");
  await assessor.goto("/clientes");
  // espera a LINHA do cliente (o contêiner .client-list existe vazio durante o carregamento)
  await expect(assessor.locator(".client-row").first()).toBeVisible({ timeout: 30_000 });
  const nomes = await assessor.locator(".client-row__name").allInnerTexts();
  console.log("[dados-reais] primeiros clientes na tela do assessor:", JSON.stringify(nomes.slice(0, 5)));
  expect(nomes.length).toBeGreaterThan(0);
  await ctx.close();
});
