/**
 * Carga de dados REAIS para o PO testar — não faz parte da bateria.
 * Roda com: npm run dados:reais  (depois de `npx supabase db reset`, se quiser base limpa)
 *
 * Importa os 4 relatórios essenciais da XP pelo MESMO fluxo do app (tela 21, como o
 * administrador faz), na ordem que o modelo de dados espera, e deixa o PO com a maior
 * carteira real ligada ao próprio login para ver as telas do assessor com dado de verdade.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { serviceClient } from "./helpers/seed";

const PO = { email: "lacerdafilipe@gmail.com", password: "Elev@2026" };
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
  await page.waitForSelector("[data-home]");
  await page.goto("/admin/importacoes");
  await expect(page.locator(".admin-header__title")).toHaveText("Importar relatório");
}

test("importa os relatórios reais da XP pelo fluxo do app", async ({ page }) => {
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

  // o PO passa a atender a MAIOR carteira real: as telas do assessor ganham dado de verdade
  const { data: clientes } = await svc.from("clients").select("advisor_code");
  const porAssessor = new Map<string, number>();
  for (const c of clientes ?? []) {
    const code = (c as { advisor_code: string | null }).advisor_code;
    if (code) porAssessor.set(code, (porAssessor.get(code) ?? 0) + 1);
  }
  const [maiorCodigo, quantos] = [...porAssessor.entries()].sort((a, b) => b[1] - a[1])[0];
  await svc.from("profiles").update({ advisor_code: maiorCodigo }).eq("email", PO.email);
  console.log(`[dados-reais] ${PO.email} agora atende o código ${maiorCodigo} (${quantos} clientes)`);
  console.log(`[dados-reais] carteiras: ${[...porAssessor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${c}:${n}`).join(" · ")}`);

  // prova de que o app mostra a carteira real: lista de clientes do PO com nomes do Saldo
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clientes");
  // espera a LINHA do cliente (o contêiner .client-list existe vazio durante o carregamento)
  await expect(page.locator(".client-row").first()).toBeVisible({ timeout: 30_000 });
  const nomes = await page.locator(".client-row__name").allInnerTexts();
  console.log("[dados-reais] primeiros clientes na tela:", JSON.stringify(nomes.slice(0, 5)));
  expect(nomes.length).toBeGreaterThan(0);
});
