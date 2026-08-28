/**
 * E7 — tela 18 (MetaTrader, fluxo d: falha clara → correção → sucesso)
 * e tela 11 (cotações ao vivo, favoritos, resultado, "quem tem este ativo" sob RLS).
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.e7.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Costa" };
const ADV = { email: `rafael.e7.${RUN}@elev.test`, password: "Senha@2026!a", name: "Rafael Moura", code: `71${RUN.slice(-4)}` };
const ADV2 = { email: `bruno.e7.${RUN}@elev.test`, password: "Senha@2026!b", name: "Bruno Salles", code: `72${RUN.slice(-4)}` };
const ANA = `81${RUN.slice(-5)}7`;
const DO_B = `82${RUN.slice(-5)}9`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await createUser(svc, { email: ADV2.email, password: ADV2.password, name: ADV2.name, role: "advisor", advisor_code: ADV2.code });
  await svc.from("imports").delete().eq("file_hash", `e7-${RUN}`);
  const { data: admin } = await svc.from("profiles").select("id").eq("email", ADMIN.email).single();
  const { data: imp } = await svc
    .from("imports")
    .upsert({ kind: "diversificacao", file_name: "e7.xlsx", file_size: 1, file_hash: `e7-${RUN}`, ref_date: "2026-08-15", status: "concluida", created_by: admin!.id }, { onConflict: "kind,file_hash" })
    .select("id")
    .single();
  await svc.from("clients").upsert([
    { account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO" },
    { account_code: DO_B, advisor_code: ADV2.code, name: "Cliente Do B", status: "ATIVO" },
  ]);
  await svc.from("positions").insert([
    { import_id: imp!.id, account_code: ANA, advisor_code: ADV.code, ref_date: "2026-08-15", product: "Renda Variável", asset: "PETR4", quantity: 18400, value: 706928 },
    { import_id: imp!.id, account_code: DO_B, advisor_code: ADV2.code, ref_date: "2026-08-15", product: "Renda Variável", asset: "PETR4", quantity: 100, value: 3842 },
  ]);
  // estado inicial limpo da conexão
  await svc.from("mt_connection").update({ status: "desconectada", login: null, server: null, password_ciphertext: null, connected_at: null, health_events: [] }).eq("id", 1);
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home], .admin-shell");
}

test.describe("tela 18 · fluxo (d)", () => {

  test("falha em língua de leigo → correção → sucesso; credencial nunca reexibida", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/metatrader");
    await expect(page.locator(".admin-header__title")).toHaveText("Conexão MetaTrader");
    await expect(page.getByText("Esses três dados vêm no e-mail da sua corretora")).toBeVisible();
    await expect(page.locator(".chip--neutral")).toHaveText("Desconectada");

    // falha: senha recusada — banner claro + código técnico discreto + campo limpo
    await page.getByLabel("Login").fill("50191");
    await page.getByRole("textbox", { name: "Senha" }).fill("senha-errada");
    await page.getByLabel("Servidor").fill("XPMT5-Real02");
    await page.getByRole("button", { name: "Testar conexão" }).click();
    await expect(page.locator(".banner--danger .banner__title")).toHaveText("Não conectou: o servidor recusou a senha");
    await expect(page.locator(".banner--danger")).toContainText("o campo foi limpo por segurança");
    await expect(page.locator(".banner--danger .mt-code")).toHaveText("(AUTH_FAILED)");
    await expect(page.getByRole("textbox", { name: "Senha" })).toHaveValue("");
    await expect(page.locator(".mt-field-ok").first()).toContainText("Login confirmado");
    await expect(page.locator(".chip--danger")).toHaveText("Caída");
    await expect(page.getByText("o que os assessores estão vendo")).toBeVisible();
    await expect(page.getByText("Cotações pausadas — mostrando preços de")).toBeVisible();
    await expect(page.getByRole("button", { name: "Testar de novo" })).toBeVisible();

    // correção → sucesso com o texto exato do quadro
    await page.getByRole("textbox", { name: "Senha" }).fill("senha-correta-1");
    await page.getByRole("button", { name: "Testar conexão" }).click();
    await expect(page.locator(".banner--success .banner__title")).toHaveText("Funcionou: estamos recebendo cotações agora");
    await expect(page.locator(".banner--success")).toContainText("Pode fechar esta tela, está tudo certo.");
    await expect(page.locator(".chip--success")).toContainText("Ativa");
    await expect(page.getByText("Teste de conexão bem-sucedido")).toBeVisible();

    // saúde: tempo de resposta é o MEDIDO no teste (persistido), não um número decorativo
    const { data: connRow } = await serviceClient().from("mt_connection").select("response_seconds").eq("id", 1).single();
    expect(connRow!.response_seconds).not.toBeNull();
    const secondsLabel = `${Number(connRow!.response_seconds).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} s`;
    await expect(page.getByText(secondsLabel, { exact: true })).toBeVisible();

    // sem METAAPI_TOKEN a tela avisa que o teste é demonstração
    await expect(page.getByText(/modo demonstração — o teste de conexão real/)).toBeVisible();

    // Salvar grava sem testar (login/servidor novos persistem no banco)
    await page.getByLabel("Login").fill("60222");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText(/Salvo às/)).toBeVisible();
    await expect(async () => {
      const { data } = await serviceClient().from("mt_connection").select("login").eq("id", 1).single();
      expect(data!.login).toBe("60222");
    }).toPass();
    await page.getByLabel("Login").fill("50191");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();

    // credencial nunca volta em claro
    const mt = await (await import("./helpers/seed")).serviceClient().from("mt_connection").select("password_ciphertext").eq("id", 1).single();
    expect(mt.data!.password_ciphertext).not.toContain("senha-correta-1");

    // auditoria registrou falha e sucesso
    const svc = serviceClient();
    const { data: audit } = await svc.from("audit_log").select("event").eq("category", "metatrader");
    const events = (audit ?? []).map((a) => a.event);
    expect(events).toContain("Teste de conexão falhou");
    expect(events).toContain("Credenciais testadas e salvas");
  });
});

test.describe("tela 11 · cotações", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 390, height: 844 }));

  test.beforeAll(async () => {
    // garante conexão ativa para as cotações fluírem
    const svc = serviceClient();
    await svc.from("mt_connection").update({ status: "ativa", connected_at: new Date().toISOString(), last_quote_at: new Date().toISOString() }).eq("id", 1);
  });

  test("ao vivo, fixados com seções (Índice primeiro) e Editar funcional", async ({ page }) => {
    await login(page, ADV.email, ADV.password);
    await page.goto("/cotacoes");
    await expect(page.locator(".page-header__title")).toHaveText("Cotações");
    await expect(page.locator('[data-live="on"]')).toContainText("ao vivo ·");
    // sem herói fixo: o IBOV é a primeira linha da lista de Fixados
    await expect(page.locator(".quote-hero__label")).toHaveCount(0);
    await expect(page.locator(".fav-section").first()).toHaveText("Índice");
    await expect(page.locator(".fav-row__ticker", { hasText: "IBOV" })).toBeVisible();
    await expect(page.locator(".fav-section").nth(1)).toHaveText("Moeda");
    await expect(page.locator(".fav-row__ticker", { hasText: "DOLAR" })).toBeVisible();
    await expect(page.locator(".fav-section").nth(2)).toHaveText("Ações");
    // Editar entra no modo de remoção e Concluir sai dele
    await page.getByRole("button", { name: "Editar lista" }).click();
    await expect(page.getByRole("button", { name: "Desafixar DOLAR" })).toBeVisible();
    await page.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByRole("button", { name: "Desafixar DOLAR" })).toHaveCount(0);
  });

  test("fixar e desafixar persistem — inclusive partindo da seleção padrão", async ({ page }) => {
    const svc = serviceClient();
    const solo = { email: `solo.e7.${RUN}@elev.test`, password: "Senha@2026!x", name: "Solo Fixados", code: `73${RUN.slice(-4)}` };
    await createUser(svc, { email: solo.email, password: solo.password, name: solo.name, role: "advisor", advisor_code: solo.code });
    await login(page, solo.email, solo.password);
    await page.goto("/cotacoes");
    await page.waitForSelector(".fav-row");

    // desafixar pelo modo Editar, partindo dos PADRÕES (nada salvo ainda)
    await page.getByRole("button", { name: "Editar lista" }).click();
    await page.getByRole("button", { name: "Desafixar DOLAR" }).click();
    await expect(page.locator("[data-fixados] .fav-row__ticker", { hasText: "DOLAR" })).toHaveCount(0);
    await page.getByRole("button", { name: "Concluir" }).click();

    // pelo detalhe: PETR4 segue fixado → Desafixar funciona; Fixar de novo também
    await page.getByLabel("Buscar ativo").fill("PETR4");
    await page.getByLabel("Buscar ativo").press("Enter");
    await expect(page.getByRole("button", { name: "Desafixar" })).toBeVisible();
    await page.getByRole("button", { name: "Desafixar" }).click();
    await expect(page.getByRole("button", { name: "Fixar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fixar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Desafixar" })).toBeVisible();

    // a lista reflete e persiste após recarregar
    await page.reload();
    await page.waitForSelector(".fav-row");
    await expect(page.locator("[data-fixados] .fav-row__ticker", { hasText: "PETR4" })).toBeVisible();
    await expect(page.locator("[data-fixados] .fav-row__ticker", { hasText: "DOLAR" })).toHaveCount(0);

    // desafixar TODOS não ressuscita a seleção padrão (nem após recarregar)
    await page.getByRole("button", { name: "Editar lista" }).click();
    for (const t of ["ITUB4", "VALE3", "PETR4"]) {
      await page.getByRole("button", { name: `Desafixar ${t}` }).click();
      await expect(page.locator("[data-fixados] .fav-row__ticker", { hasText: t })).toHaveCount(0);
    }
    await expect(page.locator("[data-fixados] .fav-row")).toHaveCount(1); // só o IBOV (Índice)
    await page.reload();
    await page.waitForSelector(".fav-row");
    await expect(page.locator("[data-fixados] .fav-row")).toHaveCount(1);
  });

  test("resultado da busca: herói, fios, ações e 'quem tem este ativo' sob RLS", async ({ page }) => {
    await login(page, ADV.email, ADV.password);
    await page.goto("/cotacoes");
    await page.getByLabel("Buscar ativo").fill("PETR4");
    await page.getByLabel("Buscar ativo").press("Enter");

    await expect(page.locator(".quote-detail__ticker")).toHaveText("PETR4");
    await expect(page.locator(".quote-detail__name")).toHaveText("Petrobras PN · B3");
    await expect(page.locator(".quote-detail__at")).toContainText("às ");
    await expect(page.locator(".quote-facts__label").nth(0)).toHaveText("Abertura");
    await expect(page.locator(".quote-facts__label").nth(3)).toHaveText("Fech. ant.");
    // com a fonte real (brapi) o gráfico é a série diária do mês — chips de período saem de cena
    await expect(page.getByText("fechamentos diários do último mês")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar alerta" })).toBeVisible();

    // quem tem este ativo: só a carteira do assessor (Ana sim, cliente do B não)
    await expect(page.getByText("Quem tem este ativo")).toBeVisible();
    await expect(page.getByText("Ana Bertoldi")).toBeVisible();
    await expect(page.getByText("R$ 706.928,00")).toBeVisible();
    await expect(page.getByText("Cliente Do B")).toHaveCount(0);
    await expect(page.getByText("Só aparecem clientes da sua carteira.")).toBeVisible();

    // PETR4 já vem fixado (seleção padrão): desafixar remove, fixar de novo persiste no banco
    await page.getByRole("button", { name: "Desafixar" }).click();
    await expect(page.getByRole("button", { name: "Fixar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Fixar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Desafixar" })).toBeVisible();
    const svc = serviceClient();
    const { data: prof } = await svc.from("profiles").select("id").eq("email", ADV.email).single();
    const { data: fav } = await svc.from("quote_favorites").select("ticker").eq("user_id", prof!.id);
    expect((fav ?? []).map((f) => f.ticker)).toContain("PETR4");
  });

  test("conexão caída: cotações pausadas com horário", async ({ page }) => {
    const svc = serviceClient();
    await svc.from("mt_connection").update({ status: "caida" }).eq("id", 1);
    await login(page, ADV.email, ADV.password);
    await page.goto("/cotacoes");
    await expect(page.locator(".banner--warning")).toContainText("Cotações pausadas — mostrando preços de");
    await svc.from("mt_connection").update({ status: "ativa" }).eq("id", 1);
  });
});
