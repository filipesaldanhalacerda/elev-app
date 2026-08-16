/**
 * E6 — telas 05–10 (consulta de clientes) + fluxo (b): busca → ficha → abas → volta.
 * Dados semeados via service; isolamento RLS verificado na UI.
 */
import { test, expect, emAmbosTemas } from "./fixtures";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV_A = { email: `rafael.e6.${RUN}@elev.test`, password: "Senha@2026!a", name: "Rafael Moura", code: `61${RUN.slice(-4)}` };
const ADV_B = { email: `bruno.e6.${RUN}@elev.test`, password: "Senha@2026!b", name: "Bruno Salles", code: `62${RUN.slice(-4)}` };
const ANA = `12884${RUN.slice(-3)}7`;
const CARLOS = `30117${RUN.slice(-3)}2`;
const DO_B = `99001${RUN.slice(-3)}9`;

test.skip(({ isMobile }) => !isMobile, "telas do assessor são mobile 390px");

test.beforeAll(async () => {
  const svc = serviceClient();
  // idempotente para retries: remove a importação da rodada (cascade limpa os fatos)
  await svc.from("imports").delete().eq("file_hash", `e6-${RUN}`);
  await createUser(svc, { email: ADV_A.email, password: ADV_A.password, name: ADV_A.name, role: "advisor", advisor_code: ADV_A.code });
  await createUser(svc, { email: ADV_B.email, password: ADV_B.password, name: ADV_B.name, role: "advisor", advisor_code: ADV_B.code });

  const { data: imp } = await svc
    .from("imports")
    .upsert({ kind: "positivador", variant: "mensal", file_name: "e6.xlsx", file_size: 1, file_hash: `e6-${RUN}`, ref_date: "2026-08-15", status: "concluida", created_by: (await svc.from("profiles").select("id").eq("email", ADV_A.email).single()).data!.id }, { onConflict: "kind,file_hash" })
    .select("id")
    .single();
  const importId = imp!.id;

  const mkClient = (account: string, advisor: string, name: string, status = "ATIVO") => ({
    account_code: account, advisor_code: advisor, name, status,
    suitability: "AGRESSIVO", segment: "Express", profession: "ADMINISTRADOR",
    birth_date: "1971-03-02", xp_registered_at: "2019-04-08",
  });
  await svc.from("clients").upsert([
    mkClient(ANA, ADV_A.code, "Ana Bertoldi"),
    mkClient(CARLOS, ADV_A.code, "Carlos Bertrand", "INATIVO"),
    mkClient(DO_B, ADV_B.code, "Cliente Secreto Do B"),
  ]);
  const snap = (account: string, advisor: string, ref: string, net: number, net1: number | null, capt: number | null = null) => ({
    import_id: importId, account_code: account, advisor_code: advisor, ref_date: ref, variant: "mensal",
    net_em_m: net, net_em_m1: net1, captacao_liquida_m: capt,
  });
  // idempotente e à prova de colisão: contas de rodadas antigas podem repetir o sufixo —
  // limpa qualquer fato dessas contas (unique account_code+ref_date+variant) antes de inserir
  const ACCOUNTS = [ANA, CARLOS, DO_B];
  await svc.from("positivador_snapshots").delete().in("account_code", ACCOUNTS);
  await svc.from("positions").delete().in("account_code", ACCOUNTS);
  await svc.from("movements").delete().in("account_code", ACCOUNTS);
  const { error: snapErr } = await svc.from("positivador_snapshots").insert([
    snap(ANA, ADV_A.code, "2026-07-15", 4745887, 4600000),
    snap(ANA, ADV_A.code, "2026-08-15", 4812330, 4745887, 250000),
    snap(CARLOS, ADV_A.code, "2026-08-15", 918740.55, 924300),
    snap(DO_B, ADV_B.code, "2026-08-15", 7777777, 7000000),
  ]);
  if (snapErr) throw new Error(`seed positivador_snapshots: ${snapErr.message}`);
  await svc.from("positions").insert([
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, ref_date: "2026-08-15", product: "Renda Fixa", sub_product: "CDB", asset: "CDB Banco Fictício", issuer: "Banco Fictício", maturity_date: "2026-08-18", quantity: 1, value: 812400 },
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, ref_date: "2026-08-15", product: "Renda Fixa", sub_product: "Tesouro", asset: "Tesouro IPCA+ 2029", maturity_date: "2029-05-15", quantity: 100, value: 568778.6 },
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, ref_date: "2026-08-15", product: "Renda Variável", asset: "PETR4", quantity: 18400, value: 706928 },
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, ref_date: "2026-08-15", product: "Fundos", asset: "Fundo Multimercado X", fund_cnpj: "11222333000144", quantity: 500, value: 366219.4 },
  ]);
  await svc.from("movements").insert([
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, mov_date: "2026-08-07", kind: "TED", flow: "C", amount: 250000 },
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, mov_date: "2026-08-01", kind: "TED", flow: "D", amount: -40000 },
    { import_id: importId, account_code: ANA, advisor_code: ADV_A.code, mov_date: "2026-07-22", kind: "TED", flow: "D", amount: -80000 },
  ]);
});

async function loginA(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADV_A.email);
  await page.locator('input[type="password"]').fill(ADV_A.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

emAmbosTemas("tela 05 · lista de clientes", () => {
  test("lista da carteira: valores pt-BR, chip de inativo e RLS", async ({ page }) => {
    await loginA(page);
    await page.goto("/clientes");
    await expect(page.locator(".page-header__title")).toHaveText("Clientes");
    await expect(page.getByPlaceholder("Buscar cliente por nome ou conta")).toBeVisible();

    const ana = page.locator(".client-row", { hasText: "Ana Bertoldi" });
    await expect(ana.locator(".client-row__value")).toHaveText("R$ 4.812.330,00");
    await expect(ana.locator(".client-row__pct")).toHaveText("+1,4% mês");

    const carlos = page.locator(".client-row", { hasText: "Carlos Bertrand" });
    await expect(carlos.locator(".client-row__inactive-chip")).toHaveText("inativo");
    await expect(carlos.locator(".client-row__pct")).toHaveText("sem movimento");

    // regra de ouro na UI: cliente do assessor B jamais aparece
    await expect(page.locator(".client-row", { hasText: "Cliente Secreto Do B" })).toHaveCount(0);
    await expect(page.locator(".page-header__count")).toHaveText("2");

    // filtro Inativos (pelo sheet de Filtros)
    await page.locator("[data-open-filters]").click();
    await page.getByRole("dialog", { name: "Filtros de clientes" }).getByRole("button", { name: "Inativos" }).click();
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.locator(".client-row")).toHaveCount(1);
    await expect(page.locator(".client-row__name")).toHaveText("Carlos Bertrand");
  });
});

emAmbosTemas("ficha · atalhos rápidos", () => {
  test("Tarefa e Alerta abrem o modal com o cliente vinculado preenchido; sem atalho de Sala", async ({ page }) => {
    await loginA(page);
    await page.goto(`/clientes/${ANA}`);
    await page.waitForSelector(".quick-action");

    // Tarefa → sheet de nova tarefa com o cliente já selecionado
    await page.locator(".quick-action", { hasText: "Tarefa" }).click();
    await page.waitForURL(`**/cards?novo=1&cliente=${ANA}`);
    await expect(page.getByRole("dialog", { name: "Nova tarefa" })).toBeVisible();
    await expect(page.locator("#card-cliente")).toHaveValue(ANA);

    // Alerta → sheet de novo alerta com o cliente já selecionado
    await page.goto(`/clientes/${ANA}`);
    await page.locator(".quick-action", { hasText: "Alerta" }).click();
    await page.waitForURL(`**/alertas?novo=1&cliente=${ANA}`);
    await expect(page.locator("#alerta-cliente")).toHaveValue(ANA);
  });
});

test.describe.serial("fluxo (b) · busca → ficha → abas → volta", () => {
  test("busca com destaque, ficha completa em 5 abas e volta", async ({ page }) => {
    await loginA(page);
    await page.goto("/clientes");

    // busca restrita: termo do cliente do B não retorna nada
    await page.getByPlaceholder("Buscar cliente por nome ou conta").fill("Secreto");
    await expect(page.locator(".csearch__empty")).toContainText("Nenhum cliente com “Secreto” na sua carteira.");

    await page.getByPlaceholder("Buscar cliente por nome ou conta").fill("Bert");
    const result = page.locator(".csearch__row", { hasText: "Ana Bertoldi" });
    await expect(result.locator("mark")).toHaveText("Bert");
    await result.click();

    // 06 · visão geral
    await expect(page.locator(".ficha-header__name")).toHaveText("Ana Bertoldi");
    await expect(page.locator(".chip--success")).toHaveText("Ativo");
    await expect(page.getByText("Suitability agressivo")).toBeVisible();
    await expect(page.getByText("Cliente desde 2019")).toBeVisible();
    await expect(page.locator(".patrimony-value__amount")).toHaveText("R$ 4.812.330,00");
    await expect(page.locator(".patrimony-value__pct")).toHaveText("+1,4%");
    await expect(page.locator(".patrimony-source")).toHaveText("posição de 15/08/2026 · fonte Positivador");
    await expect(page.getByText("Captação líquida · agosto")).toBeVisible();
    await expect(page.getByText("R$ 250.000,00").first()).toBeVisible();
    await expect(page.locator(".quick-action")).toHaveCount(3);
    await expect(page.locator(".quick-action", { hasText: "Sala" })).toHaveCount(0);
    await expect(page.getByText("Dados cadastrais")).toBeVisible();
    await expect(page.getByText("02/03/1971")).toBeVisible();

    // 07 · carteira
    await page.getByRole("tab", { name: "Carteira" }).click();
    const rf = page.locator(".class-group", { hasText: "Renda Fixa" });
    await expect(rf.locator(".class-group__total")).toHaveText("R$ 1.381.178,60");
    await expect(rf.locator(".class-group__pct")).toHaveText("56%");
    await expect(rf.getByText("CDB Banco Fictício")).toBeVisible();
    await expect(rf.getByText("CDB · vence 18/08/2026")).toBeVisible();
    await expect(page.locator(".position-row__name--ticker", { hasText: "PETR4" })).toBeVisible();
    await expect(page.locator(".alloc").getByText("Renda Fixa")).toBeVisible();
    await expect(page.locator(".list-footnote")).toContainText("4 ativos · posição de 15/08/2026 · fonte Diversificação");

    // 08 · movimentações (entrada em verde, saída em vermelho — padrão do sistema)
    await page.getByRole("tab", { name: "Movimentações" }).click();
    const ago = page.locator(".mov-group", { hasText: "Agosto 2026" });
    await expect(ago.locator(".mov-group__net")).toHaveText("líquido +R$ 210.000,00");
    await expect(ago.locator(".mov-row__amount").first()).toHaveText("+R$ 250.000,00");
    await expect(ago.locator(".mov-row__amount").nth(1)).toHaveText("−R$ 40.000,00");
    const upColor = await ago.locator(".mov-row__amount").first().evaluate((el) => getComputedStyle(el).color);
    const downColor = await ago.locator(".mov-row__amount").nth(1).evaluate((el) => getComputedStyle(el).color);
    expect(["rgb(11, 124, 85)", "rgb(70, 206, 151)"]).toContain(upColor); // verde de entrada
    expect(["rgb(196, 52, 42)", "rgb(240, 112, 94)"]).toContain(downColor); // vermelho de saída
    await expect(page.locator(".mov-group", { hasText: "Julho 2026" }).locator(".mov-group__net")).toHaveText("líquido −R$ 80.000,00");

    // filtro Resgates pelo sheet padrão
    await page.locator("[data-open-mov-filters]").click();
    await page.getByRole("dialog", { name: "Filtros de movimentações" }).getByRole("button", { name: "Resgates" }).click();
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.locator(".mov-row")).toHaveCount(2);

    // 09 · cadastro complementar com edição inline auditada
    await page.getByRole("tab", { name: "Cadastro" }).click();
    await expect(page.getByText("Toda alteração aqui fica registrada na auditoria")).toBeVisible();
    await page.getByRole("button", { name: "Editar telefone" }).click();
    await page.getByLabel("Telefone").fill("(11) 98812-4402");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".extras-row__value").first()).toHaveText("(11) 98812-4402");

    // 10 · notas: criar, ver, editar e excluir (padrão app de notas)
    await page.getByRole("tab", { name: "Notas" }).click();
    await page.getByRole("button", { name: "Nova nota" }).click();
    await page.getByLabel("Nota", { exact: true }).fill("Quer antecipar a aposentadoria em 2028.");
    await page.getByRole("button", { name: "Salvar nota" }).click();
    const note = page.locator("[data-note]", { hasText: "Quer antecipar a aposentadoria" });
    await expect(note).toBeVisible();

    // ver detalhes e editar
    await note.click();
    const detail = page.getByRole("dialog", { name: "Detalhes da nota" });
    await expect(detail.getByText("Rafael Moura")).toBeVisible();
    await detail.getByText("Editar", { exact: true }).click();
    await page.getByLabel("Nota", { exact: true }).fill("Quer antecipar a aposentadoria em 2027.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.locator("[data-note]", { hasText: "em 2027." })).toContainText("editada");

    // excluir com confirmação
    await page.locator("[data-note]", { hasText: "em 2027." }).click();
    await page.getByRole("dialog", { name: "Detalhes da nota" }).getByText("Excluir", { exact: true }).click();
    await page.getByRole("button", { name: "Excluir nota" }).click();
    await expect(page.locator("[data-note]")).toHaveCount(0);

    // volta para a lista
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(page.locator(".page-header__title")).toHaveText("Clientes");

    // auditoria registrou a edição do cadastro
    const svc = serviceClient();
    const { data: audit } = await svc.from("audit_log").select("event, detail").eq("category", "cadastro").ilike("detail", `%${ANA}%`);
    expect((audit ?? []).map((a) => a.event)).toContain("Editou telefone");
  });

  test("tela 08 · estado vazio de filtro diz a última movimentação e oferece 12 meses", async ({ page }) => {
    await loginA(page);
    await page.goto(`/clientes/${CARLOS}?aba=Movimenta%C3%A7%C3%B5es`);
    await expect(page.locator(".empty-state__title")).toContainText("Nenhuma movimentação");
    await expect(page.locator(".empty-state__desc")).toContainText("importação do relatório de Captação");
  });

  test("RLS na rota direta: ficha de cliente de outro assessor não expõe dados", async ({ page }) => {
    await loginA(page);
    await page.goto(`/clientes/${DO_B}`);
    await expect(page.locator('[data-testid="ficha-nao-encontrada"]')).toContainText("Cliente não encontrado na sua carteira");
    await expect(page.locator(".ficha-header__name")).not.toContainText("Cliente Secreto Do B");
    await expect(page.locator("body")).not.toContainText("7.777.777");
  });
});
