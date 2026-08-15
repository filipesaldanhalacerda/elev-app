/**
 * E13 — tela 04 (home): com dados, vazio e carregando; busca nunca em skeleton.
 */
import { test, expect, emAmbosTemas } from "./fixtures";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV = { email: `rafael.e13.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `13${RUN.slice(-4)}` };
const NOVO = { email: `novo.e13.${RUN}@elev.test`, password: "Senha@2026!n", name: "Assessor Novo", code: `14${RUN.slice(-4)}` };
const ANA = `41${RUN.slice(-5)}7`;

test.skip(({ isMobile }) => !isMobile, "tela 04 é mobile");

let advId: string;

test.beforeAll(async () => {
  const svc = serviceClient();
  advId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await createUser(svc, { email: NOVO.email, password: NOVO.password, name: NOVO.name, role: "advisor", advisor_code: NOVO.code });
  await svc.from("mt_connection").update({ status: "ativa", last_quote_at: new Date().toISOString() }).eq("id", 1);

  const today = new Date();
  const birth = `1968-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await svc.from("cards").delete().ilike("title", `%${RUN}%`);
  await svc.from("clients").upsert([
    { account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO" },
    { account_code: ANA.replace("7", "9"), advisor_code: ADV.code, name: "Helena Prado", status: "ATIVO", birth_date: birth },
  ]);
  await svc.from("client_extras").upsert({ account_code: ANA.replace("7", "9"), phone: "(11) 97744-2010" });
  await svc.from("alerts").delete().eq("owner", advId);
  await svc.from("alerts").insert({ owner: advId, ticker: "PETR4", direction: "alta", target_price: 41, created_price: 38.42 });
  await svc.from("cards").insert({ title: `Rebalancear carteira ${RUN}`, creator: advId, assignee: advId, account_code: ANA, priority: "alta", status: "pendente", due_at: new Date(Date.now() - 86400000).toISOString() });
  await svc.from("notifications").insert({ user_id: advId, kind: "alerta_atingido", title: "Alerta disparado — PETR4 atingiu R$ 41,00" });
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

emAmbosTemas("tela 04 · com dados", () => {
  test("saudação, ticker, busca central, radar, tarefas, aniversariantes e avisos", async ({ page }) => {
    await login(page, ADV.email, ADV.password);

    // saudação + contagem de clientes + sino com badge + avatar
    await expect(page.getByText(new RegExp(`^(Bom dia|Boa tarde|Boa noite), Rafa${RUN.slice(-3)}$`))).toBeVisible();
    await expect(page.getByText("2 clientes")).toBeVisible();
    await expect(page.locator("[data-badge]")).toBeVisible();

    // ticker de mercado com IBOV
    await expect(page.locator(".ticker-strip__code", { hasText: "IBOV" })).toBeVisible();

    // busca central presente e funcional
    const busca = page.getByPlaceholder("Buscar cliente por nome ou conta");
    await expect(busca).toBeVisible();
    await busca.fill("Ana");
    await expect(page.locator(".csearch__row", { hasText: "Ana Bertoldi" })).toBeVisible();
    await page.locator(".csearch__row", { hasText: "Ana Bertoldi" }).click();
    await expect(page.locator(".ficha-header__name")).toHaveText("Ana Bertoldi");
    await page.goBack();

    // radar de alertas com card e atalho
    await expect(page.getByText("Radar de alertas")).toBeVisible();
    await expect(page.locator(".alert-card__ticker", { hasText: "PETR4" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1 ativo" })).toBeVisible();

    // tarefas de hoje com chips contadores
    await expect(page.getByText("Tarefas de hoje")).toBeVisible();
    await expect(page.getByText("1 pendente")).toBeVisible();
    await expect(page.getByText("1 atrasada")).toBeVisible();
    await expect(page.getByText(`Rebalancear carteira ${RUN}`)).toBeVisible();

    // aniversariante do dia com WhatsApp
    await expect(page.getByText("Aniversariantes")).toBeVisible();
    await expect(page.getByText("Helena Prado")).toBeVisible();
    await expect(page.getByText("58 anos")).toBeVisible();
    await expect(page.getByLabel("WhatsApp de Helena Prado")).toBeVisible();

    // avisos recentes
    await expect(page.getByText("Avisos recentes")).toBeVisible();
    await expect(page.getByText("Alerta disparado — PETR4 atingiu R$ 41,00")).toBeVisible();
  });
});

test.describe("tela 04 · vazio (assessor novo)", () => {
  test("estado vazio com ações e avisos vazios", async ({ page }) => {
    await login(page, NOVO.email, NOVO.password);
    await expect(page.getByText("nenhum cliente vinculado")).toBeVisible();
    await expect(page.getByText("Nenhum cliente na sua carteira")).toBeVisible();
    await expect(page.getByText("Seus clientes aparecem aqui depois da próxima importação do Positivador pelo administrador.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Falar com o administrador" })).toBeVisible();
    await expect(page.getByText("Nenhum alerta ativo")).toBeVisible();
    await expect(page.getByText("Monitore um preço-alvo e receba push.")).toBeVisible();
    await expect(page.getByText("Nada para hoje")).toBeVisible();
    await expect(page.getByText("Sem avisos nas últimas 24 horas.")).toBeVisible();
    // busca continua presente (inerte, não some)
    await expect(page.getByPlaceholder("Buscar cliente por nome ou conta")).toBeVisible();
  });
});

test.describe("tela 04 · carregando", () => {
  test("tudo em skeleton EXCETO a busca", async ({ page }) => {
    // atrasa as respostas do banco para congelar o estado carregando
    await page.route("**/rest/v1/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await login(page, ADV.email, ADV.password);
    // no primeiro instante: skeletons visíveis + busca interativa + nota do quadro
    await expect(page.locator(".skeleton").first()).toBeVisible();
    const busca = page.getByPlaceholder("Buscar cliente por nome ou conta");
    await expect(busca).toBeVisible();
    await expect(busca).toBeEnabled();
    await expect(page.getByText("A busca já responde enquanto o resto da home carrega.")).toBeVisible();
    // a busca NÃO é um skeleton
    const buscaBox = page.locator(".csearch__box");
    await expect(buscaBox).not.toHaveClass(/skeleton/);
  });
});
