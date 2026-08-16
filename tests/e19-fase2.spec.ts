/**
 * E19 — FASE 2: acesso amarrado à base, Google Agenda, menu da ficha, máscaras,
 * filtros de clientes, regras de cards, datas retroativas, sheet de senha,
 * salas com horário quebrado e ações rápidas na home.
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser, makeClient, supabaseEnv } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV = { email: `rafael.e19.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `19${RUN.slice(-4)}` };
const ADV_B = { email: `bruno.e19.${RUN}@elev.test`, password: "Senha@2026!b", name: `Bruno${RUN.slice(-3)} Salles`, code: `29${RUN.slice(-4)}` };
const ADMIN = { email: `admin.e19.${RUN}@elev.test`, password: "Admin@2026!a", name: `Admin${RUN.slice(-3)} Costa` };
const ANA = `61${RUN.slice(-6)}7`;
const ZULU = `62${RUN.slice(-6)}9`;

let advId: string;
let advBId: string;

test.beforeAll(async () => {
  const svc = serviceClient();
  advId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  advBId = await createUser(svc, { email: ADV_B.email, password: ADV_B.password, name: ADV_B.name, role: "advisor", advisor_code: ADV_B.code });
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  await svc.from("mt_connection").update({ status: "ativa", last_quote_at: new Date().toISOString() }).eq("id", 1);
  await svc.from("clients").upsert([
    { account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO" },
    { account_code: ZULU, advisor_code: ADV.code, name: "Zulmira Prado", status: "ATIVO" },
  ]);
  await svc.from("client_extras").delete().eq("account_code", ANA);
  await svc.from("google_accounts").delete().in("user_id", [advId, advBId]);
  await svc.from("google_events").delete().in("user_id", [advId, advBId]);
  await svc.from("cards").delete().eq("creator", advId);
  await svc.from("reservations").delete().eq("owner", advId);
});

async function login(page: import("@playwright/test").Page, email = ADV.email, password = ADV.password) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

// ---------- Mobile (assessor) ----------
test.describe("fase 2 · mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "telas do assessor são mobile");
  test.describe.configure({ mode: "serial" });

  test("F2-01: aba selecionada da ficha não ganha anel de foco (só o sublinhado)", async ({ page }) => {
    await login(page);
    await page.goto(`/clientes/${ANA}?aba=Cadastro`);
    await page.waitForSelector(".extras-card");
    const shadow = await page.evaluate(() => {
      const tab = [...document.querySelectorAll(".ficha-tab")].find((t) => t.textContent === "Cadastro") as HTMLElement;
      tab.focus();
      return getComputedStyle(tab).boxShadow;
    });
    // apenas o sublinhado inset de 2px — nunca um anel em volta
    expect(shadow).toContain("inset");
    expect(shadow).not.toContain("3px");
  });

  test("F2-04: menu ⋮ da ficha abre ações e leva ao novo card com o cliente vinculado", async ({ page }) => {
    await login(page);
    await page.goto(`/clientes/${ANA}`);
    await page.getByRole("button", { name: "Mais opções" }).click();
    const sheet = page.getByRole("dialog", { name: "Ações do cliente" });
    await expect(sheet.getByText("Novo alerta")).toBeVisible();
    await expect(sheet.getByText("Reservar sala")).toBeVisible();
    await expect(sheet.getByText("Copiar número da conta")).toBeVisible();
    await sheet.getByText("Novo card", { exact: true }).click();
    await page.waitForURL("**/cards?novo=1*");
    await page.waitForSelector(".sheet__title");
    await expect(page.getByLabel("Cliente")).toHaveValue(ANA);
  });

  test("F2-05/F2-06: telefone ganha máscara e e-mail inválido não salva", async ({ page }) => {
    await login(page);
    await page.goto(`/clientes/${ANA}?aba=Cadastro`);
    await page.getByRole("button", { name: "Editar telefone" }).click();
    await page.getByLabel("Telefone").fill("11988124402");
    await expect(page.getByLabel("Telefone")).toHaveValue("(11) 98812-4402");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("(11) 98812-4402")).toBeVisible();

    await page.getByRole("button", { name: "Editar e-mail" }).click();
    await page.getByLabel("E-mail", { exact: true }).fill("nao-e-email");
    await expect(page.getByText("Digite um e-mail válido, como nome@dominio.com.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
    await page.getByLabel("E-mail", { exact: true }).fill("ana@dominio.com");
    await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("ana@dominio.com")).toBeVisible();
  });

  test("F2-09/F2-10: responsável do card é fixo 'Você' e prazo no passado não passa", async ({ page }) => {
    await login(page);
    await page.goto("/cards?novo=1");
    await page.waitForSelector(".sheet__title");
    // sem select de colegas: campo travado em "Você"
    const resp = page.locator("#card-resp");
    await expect(resp).toHaveValue("Você");
    expect(await resp.evaluate((el) => el.tagName)).toBe("INPUT");
    await expect(resp).toBeDisabled();

    await page.getByLabel("Título").fill(`Card retro ${RUN}`);
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#card-prazo").fill(ontem);
    await expect(page.getByText("O prazo não pode ficar no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar card" })).toBeDisabled();
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#card-prazo").fill(amanha);
    await expect(page.getByRole("button", { name: "Criar card" })).toBeEnabled();
  });

  test("RLS F2-09: assessor não consegue criar card para outro assessor", async () => {
    const env = supabaseEnv();
    const asA = makeClient(env.url, env.anon);
    await asA.auth.signInWithPassword({ email: ADV.email, password: ADV.password });
    const { error } = await asA.from("cards").insert({ title: `Invasão ${RUN}`, creator: advId, assignee: advBId, priority: "media", status: "pendente" });
    expect(error).not.toBeNull(); // barrado pelo RLS
    const { error: okErr } = await asA.from("cards").insert({ title: `Meu card ${RUN}`, creator: advId, assignee: advId, priority: "media", status: "pendente" });
    expect(okErr).toBeNull();
    await asA.auth.signOut();
  });

  test("F2-07: horário quebrado ocupa uma vez e as horas seguintes viram continuação", async ({ page }) => {
    const svc = serviceClient();
    const { data: room } = await svc.from("rooms").upsert({ name: `A0 Quebrada ${RUN.slice(-4)}`, capacity: 4, resources: [] }, { onConflict: "name" }).select("id").single();
    await svc.from("reservations").delete().eq("room_id", room!.id);
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await svc.from("reservations").insert({ room_id: room!.id, owner: advId, title: "Quebrada", period: `[${day}T10:00:00-03:00,${day}T11:12:00-03:00)` });

    await login(page);
    await page.goto("/salas");
    await page.locator(".room-chip", { hasText: `A0 Quebrada ${RUN.slice(-4)}` }).click();
    await page.waitForSelector(".agenda__row");
    // o cartão da reserva aparece UMA única vez…
    await expect(page.locator(".agenda__block", { hasText: "10:00–11:12" })).toHaveCount(1);
    // …e a hora seguinte é continuação discreta, não um segundo cartão
    await expect(page.getByText("ocupada até 11:12")).toBeVisible();
    // agenda completa: 08:00–17:00
    await expect(page.locator(".agenda__row")).toHaveCount(10);
  });

  test("F2-10: reserva com data no passado é bloqueada com mensagem", async ({ page }) => {
    await login(page);
    await page.goto("/salas?novo=1");
    await page.waitForSelector("#res-titulo");
    await page.getByLabel("Título").fill("Retro");
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#res-data").fill(ontem);
    await expect(page.getByText("Não é possível reservar um horário no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });

  test("F2-11: trocar senha abre o sheet padrão que desliza de baixo", async ({ page }) => {
    await login(page);
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Trocar senha" }).click();
    // padrão do sistema: sheet, nunca modal central
    await expect(page.locator(".sheet .sheet__title")).toHaveText("Trocar senha");
    await expect(page.locator(".modal")).toHaveCount(0);
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();
  });

  test("F2-12: home tem ações rápidas de card, alerta, sala e agenda", async ({ page }) => {
    await login(page);
    const quick = page.locator("[data-home-quick-actions]");
    await expect(quick.getByText("Novo card")).toBeVisible();
    await expect(quick.getByText("Agenda")).toBeVisible();
    await quick.getByText("Alerta").click();
    await page.waitForURL("**/alertas?novo=1");
    await expect(page.locator(".sheet__title")).toHaveText("Novo alerta de preço");
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.goto("/");
    await quick.getByText("Sala").click();
    await page.waitForURL("**/salas?novo=1");
    await expect(page.getByText("Nova reserva")).toBeVisible();
  });

  test("F2-08: funil abre filtros e a ordenação por nome reordena a lista", async ({ page }) => {
    await login(page);
    await page.goto("/clientes");
    await page.waitForSelector(".client-row");
    await page.getByRole("button", { name: "Filtrar" }).click();
    const sheet = page.getByRole("dialog", { name: "Filtros de clientes" });
    await sheet.getByRole("button", { name: "Nome" }).click();
    await sheet.getByRole("button", { name: "Menor primeiro" }).click();
    await sheet.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.locator(".filter-sort")).toContainText("Nome");
    // A→Z: Ana vem antes de Zulmira
    await expect(page.locator(".client-row").first()).toContainText("Ana Bertoldi");
  });

  test("F2-03: conecta a conta Google, agenda cria/edita/cancela e reserva sincroniza", async ({ page }) => {
    await login(page);
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Conectar" }).first().click();
    // no modo demonstração isso fica EXPLÍCITO para o PO
    await expect(page.getByText(/agenda sincronizada \(demonstração\)/)).toBeVisible();
    // a Agenda vive nas ações rápidas da home
    await page.goto("/");
    await page.locator("[data-home-quick-actions]").getByText("Agenda").click();
    await page.waitForURL("**/agenda");
    await expect(page.locator(".page-header__title")).toHaveText("Agenda");

    // criar
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.getByLabel("Título").fill(`Reunião ${RUN}`);
    await page.locator("#ag-data").fill(amanha);
    await page.locator("#ag-inicio").fill("10:00");
    await page.locator("#ag-fim").fill("11:00");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page.locator(".reservation-row", { hasText: `Reunião ${RUN}` })).toBeVisible();
    await expect(page.getByText(/Compromissos sincronizados com agenda\./)).toBeVisible();

    // passado bloqueado
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.getByLabel("Título").fill("Retroativo");
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#ag-data").fill(ontem);
    await expect(page.getByText("Não é possível agendar no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agendar" })).toBeDisabled();
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();

    // editar
    await page.getByRole("button", { name: `Editar Reunião ${RUN}` }).click();
    await page.getByLabel("Título").fill(`Reunião editada ${RUN}`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.locator(".reservation-row", { hasText: `Reunião editada ${RUN}` })).toBeVisible();

    // reserva de sala entra na agenda (sala exclusiva deste teste para não colidir com outras execuções)
    const svc = serviceClient();
    await svc.from("rooms").upsert({ name: `Sync ${RUN.slice(-6)}`, capacity: 4, resources: [] }, { onConflict: "name" });
    await page.goto("/salas?novo=1");
    await page.waitForSelector("#res-titulo");
    await page.locator("#res-sala").selectOption({ label: `Sync ${RUN.slice(-6)}` });
    await page.locator("#res-data").fill(amanha);
    await page.locator("#res-inicio").fill("15:00");
    await page.locator("#res-fim").fill("16:00");
    await page.getByLabel("Título").fill(`Comitê ${RUN}`);
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await page.goto("/agenda");
    await expect(page.locator(".reservation-row", { hasText: `Reserva · Comitê ${RUN}` })).toBeVisible();
    await expect(page.getByText("reserva de sala")).toBeVisible();

    // cancelar agendamento some da lista
    await page.getByRole("button", { name: `Cancelar Reunião editada ${RUN}` }).click();
    await expect(page.locator(".reservation-row", { hasText: `Reunião editada ${RUN}` })).toHaveCount(0);
  });
});

// ---------- Admin (desktop) ----------
test.describe("fase 2 · admin: acesso nasce da base importada", () => {
  test.skip(({ isMobile }) => isMobile, "tela 19 é desktop (1440px)");
  test.describe.configure({ mode: "serial" });

  test("worker: código inexistente e perfil admin são recusados; código da base passa", async ({ request }) => {
    const env = supabaseEnv();
    const asAdmin = makeClient(env.url, env.anon);
    const { data: sess } = await asAdmin.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password });
    const headers = { Authorization: `Bearer ${sess.session!.access_token}`, "content-type": "application/json" };

    const bad = await request.post("http://127.0.0.1:8787/api/admin/users", {
      headers,
      data: { name: "Fake", email: `fake.${RUN}@elev.test`, advisor_code: "999999", role: "advisor" },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain("não existe na base");

    const admBlocked = await request.post("http://127.0.0.1:8787/api/admin/users", {
      headers,
      data: { name: "Fake Admin", email: `fakeadm.${RUN}@elev.test`, advisor_code: null, role: "admin" },
    });
    expect(admBlocked.status()).toBe(400);
    expect((await admBlocked.json()).error).toContain("vinculado a um assessor");

    const codes = await request.get("http://127.0.0.1:8787/api/admin/advisor-codes", { headers });
    const list = (await codes.json()).codes as { code: string; clients: number; taken: boolean }[];
    const mine = list.find((c) => c.code === ADV.code);
    expect(mine).toBeTruthy();
    expect(mine!.clients).toBeGreaterThanOrEqual(2); // Ana + Zulmira
    expect(mine!.taken).toBe(true); // já tem acesso (ADV)

    await asAdmin.auth.signOut();
  });

  test("UI tela 19: código é escolhido da base, perfil fixo em Assessor, e a regra fica clara", async ({ page }) => {
    const svc = serviceClient();
    // um código livre na base para este teste
    const freeCode = `39${RUN.slice(-4)}`;
    await svc.from("clients").upsert({ account_code: `63${RUN.slice(-6)}3`, advisor_code: freeCode, name: "Cliente Livre", status: "ATIVO" });

    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const form = page.getByRole("dialog");
    // perfil travado em Assessor
    const perfil = form.locator("#perfil-select");
    await expect(perfil).toHaveValue("Assessor");
    await expect(perfil).toBeDisabled();
    // a regra de visibilidade fica explícita
    await expect(form.getByText(/enxerga SOMENTE a carteira dele/)).toBeVisible();

    await form.getByLabel("Nome completo").fill("Otávio Base");
    await form.getByLabel("E-mail").fill(`otavio.${RUN}@elev.test`);
    await form.getByLabel("Código de assessor").selectOption(freeCode);
    await form.getByRole("button", { name: "Criar e gerar código" }).click();
    await expect(page.locator(".modal__title")).toHaveText("Código de acesso gerado");
    await page.getByRole("button", { name: "Concluir" }).click();
    await expect(page.locator(".users-table__row", { hasText: `otavio.${RUN}@elev.test` })).toBeVisible();
  });
});
