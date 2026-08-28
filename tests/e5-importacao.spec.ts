/**
 * E5 — tela 21 com os ARQUIVOS REAIS de "Relatorios Zerva/Essenciais/":
 * detecção automática, contagens, nada gravado antes da confirmação,
 * processamento, histórico, reimportação sem duplicar, nomes pelo Saldo.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}`;
const ADMIN = { email: `marina.e5.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Importadora" };
const DIR = path.resolve("Relatorios Zerva/Essenciais");
const FILES = {
  positivadorMensal: path.join(DIR, "Positivador - 50191 - Ref.17.03.26.xlsx"),
  positivadorSemanal: path.join(DIR, "Relatório Positivador - Semana 03 Março.xlsx"),
  diversificacao: path.join(DIR, "Diversificacao - 50191 - Ref.17.03.26.xlsx"),
  captacao: path.join(DIR, "Captacao - 50191 - Ref.17.03.26.xlsx"),
  saldo: path.join(DIR, "Codigo_CAIO.A73908_RelatorioSaldoConsolidado_202603.xlsx"),
};

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.skip(({ isMobile }) => isMobile, "tela 21 é desktop");

test.beforeAll(async () => {
  const svc = serviceClient();
  // os arquivos reais podem já ter sido importados (demo/fluxo e16): limpa para medir do zero
  await svc.from("imports").delete().in("file_name", [
    "Positivador - 50191 - Ref.17.03.26.xlsx",
    "Relatório Positivador - Semana 03 Março.xlsx",
    "Diversificacao - 50191 - Ref.17.03.26.xlsx",
    "Captacao - 50191 - Ref.17.03.26.xlsx",
    "Codigo_CAIO.A73908_RelatorioSaldoConsolidado_202603.xlsx",
  ]);
  await createUser(svc, { ...ADMIN, role: "admin" });
  // um assessor conhecido do arquivo real, para o aviso de desconhecidos não cobrir todos
  await createUser(svc, { email: `a31392.${RUN}@elev.test`, password: "Temp@2026!x", name: "Assessor 31392", role: "advisor", advisor_code: "31392" });
});

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home], .admin-shell");
  await page.goto("/admin/importacoes");
  await expect(page.locator(".admin-header__title")).toHaveText("Importar relatório");
}

async function importar(page: import("@playwright/test").Page, file: string) {
  await page.getByRole("button", { name: "Escolher arquivo" }).click({ trial: true }).catch(() => {});
  await page.locator('[data-testid="import-file"]').setInputFiles(file);
  await expect(page.locator(".import-file__chip")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  // o toast se auto-dispensa; o sinal estável de conclusão é o histórico
  await expect(page.locator(".import-history__row").first()).toContainText("concluída", { timeout: 90_000 });
}

test("positivador mensal: detecção, contagens e NADA gravado antes da confirmação", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);

  // contagem ANTES de escolher o arquivo — o fluxo e16 (outro projeto) pode importar
  // os mesmos arquivos reais em paralelo, então a prova é o DELTA, não o zero absoluto
  const { count: antes } = await svc.from("positivador_snapshots").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-17");

  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.positivadorMensal);
  await expect(page.locator(".import-file__chip")).toContainText("Positivador mensal detectado");
  await expect(page.locator(".import-counts__cell").first()).toContainText("802");
  // aviso acionável de assessores desconhecidos (só 31392 é cadastrado)
  await expect(page.locator(".import-warning--warning").first()).toContainText("não existe");
  await expect(page.getByRole("button", { name: "Ver clientes" })).toBeVisible();
  await expect(page.locator(".import-footer__note")).toHaveText("Nada é gravado antes desta confirmação.");
  await expect(page.locator(".import-sample__count")).toContainText("mostrando 3 de 802");

  // a conferência é só leitura: nada novo foi gravado antes da confirmação
  const { count: durante } = await svc.from("positivador_snapshots").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-17");
  expect(durante).toBe(antes);

  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".import-history__row").first()).toContainText("802 registros", { timeout: 90_000 });

  const { count: after } = await svc.from("positivador_snapshots").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-17");
  expect(after).toBe(802);
  const { count: clients } = await svc.from("clients").select("*", { count: "exact", head: true });
  expect(clients).toBeGreaterThanOrEqual(802);

  // histórico mostra a importação concluída
  await expect(page.locator(".import-history__row").first()).toContainText("Positivador · 802 registros");
  await expect(page.locator(".import-history__row").first()).toContainText("concluída");

  // auditoria registrou
  const { data: audit } = await svc.from("audit_log").select("event").eq("category", "importacao");
  expect((audit ?? []).length).toBeGreaterThan(0);
});

test("reimportar o mesmo arquivo não duplica", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);
  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.positivadorMensal);
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".banner--danger")).toContainText("já foi importado", { timeout: 30_000 });
  const { count } = await svc.from("positivador_snapshots").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-17");
  expect(count).toBe(802);
});

test("positivador semanal (cabeçalho em português) é reconhecido e convive com o mensal", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);
  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.positivadorSemanal);
  await expect(page.locator(".import-file__chip")).toContainText("Positivador semanal detectado");
  await expect(page.locator(".import-counts__cell").first()).toContainText("803");
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".import-history__row").first()).toContainText("803 registros", { timeout: 90_000 });
  const { count } = await svc.from("positivador_snapshots").select("*", { count: "exact", head: true }).eq("variant", "semanal");
  expect(count).toBe(803);
});

test("diversificação alimenta as posições", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);
  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.diversificacao);
  await expect(page.locator(".import-file__chip")).toContainText("Diversificação detectado");
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".toast")).toContainText("Importação concluída", { timeout: 60_000 });
  const { count } = await svc.from("positions").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-17");
  expect(count).toBeGreaterThan(7000);
});

test("captação alimenta as movimentações com sinal", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);
  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.captacao);
  await expect(page.locator(".import-file__chip")).toContainText("Captação detectado");
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".toast")).toContainText("31 registros", { timeout: 60_000 });
  const { data } = await svc.from("movements").select("amount, flow").eq("mov_date", "2026-03-17");
  expect(data).toHaveLength(31);
  expect(data!.some((m) => m.amount < 0 && m.flow === "D")).toBe(true);
});

test("saldo consolidado preenche os NOMES da base e os saldos", async ({ page }) => {
  const svc = serviceClient();
  await loginAdmin(page);
  await page.locator('[data-testid="import-file"]').setInputFiles(FILES.saldo);
  await expect(page.locator(".import-file__chip")).toContainText("Saldo Consolidado detectado");
  // amostra do saldo tem NOME (único relatório com nome)
  await expect(page.locator(".import-sample__row").first()).not.toContainText("—");
  await page.getByRole("button", { name: "Confirmar e processar" }).click();
  await expect(page.locator(".toast")).toContainText("Importação concluída", { timeout: 60_000 });

  const { count } = await svc.from("balances").select("*", { count: "exact", head: true }).eq("ref_date", "2026-03-01");
  expect(count).toBeGreaterThanOrEqual(770);
  const { data: named } = await svc.from("clients").select("account_code, name").eq("account_code", "138990").single();
  expect(named!.name).toBe("FRANCO GOMES DE AMIGO");
  const { count: withName } = await svc.from("clients").select("*", { count: "exact", head: true }).not("name", "is", null);
  expect(withName).toBeGreaterThan(700);
});

test("RLS: fatos importados continuam isolados por assessor", async ({ page }) => {
  void page;
  const svc = serviceClient();
  const { makeClient, supabaseEnv } = await import("./helpers/seed");
  const env = supabaseEnv();
  // 31392 tem clientes no arquivo real; cria um assessor SEM clientes no arquivo
  await createUser(svc, { email: `a99999.${RUN}@elev.test`, password: "Temp@2026!x", name: "Assessor Sem Carteira", role: "advisor", advisor_code: "99999" });

  const a31392 = makeClient(env.url, env.anon);
  await a31392.auth.signInWithPassword({ email: `a31392.${RUN}@elev.test`, password: "Temp@2026!x" });
  const { data: own } = await a31392.from("clients").select("advisor_code");
  expect(own!.length).toBeGreaterThan(0);
  expect(own!.every((c) => c.advisor_code === "31392")).toBe(true);

  const semCarteira = makeClient(env.url, env.anon);
  await semCarteira.auth.signInWithPassword({ email: `a99999.${RUN}@elev.test`, password: "Temp@2026!x" });
  const { data: nada } = await semCarteira.from("clients").select("account_code");
  expect(nada).toHaveLength(0);
});
