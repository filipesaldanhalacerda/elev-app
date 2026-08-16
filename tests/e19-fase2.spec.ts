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
    const st = await page.evaluate(() => {
      const tab = [...document.querySelectorAll(".ficha-tab")].find((t) => t.textContent === "Cadastro") as HTMLElement;
      tab.focus();
      return { shadow: getComputedStyle(tab).boxShadow, underline: getComputedStyle(tab, "::after").height };
    });
    // NENHUM anel/sombra na aba (nem focada); o sublinhado é um elemento real de 2px
    expect(st.shadow).toBe("none");
    expect(st.underline).toBe("2px");
  });

  test("F2-04: menu ⋮ da ficha abre ações e leva à nova tarefa com o cliente vinculado", async ({ page }) => {
    await login(page);
    await page.goto(`/clientes/${ANA}`);
    await page.getByRole("button", { name: "Mais opções" }).click();
    const sheet = page.getByRole("dialog", { name: "Ações do cliente" });
    await expect(sheet.getByText("Novo alerta")).toBeVisible();
    await expect(sheet.getByText("Reservar sala")).toBeVisible();
    await expect(sheet.getByText("Copiar número da conta")).toBeVisible();
    await sheet.getByText("Nova tarefa", { exact: true }).click();
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
    // tarefa é sempre sua: o campo Responsável deixou de existir; descrição entra no lugar
    await expect(page.locator("#card-resp")).toHaveCount(0);
    await expect(page.getByLabel("Descrição · opcional")).toBeVisible();
    await expect(page.getByLabel("Hora do lembrete diário")).toHaveCount(0); // a hora vive no Perfil

    await page.getByLabel("Título").fill(`Card retro ${RUN}`);
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#card-prazo").fill(ontem);
    await expect(page.getByText("O prazo não pode ficar no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar tarefa" })).toBeDisabled();
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#card-prazo").fill(amanha);
    await expect(page.getByRole("button", { name: "Criar tarefa" })).toBeEnabled();
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
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await svc.from("reservations").insert([
      { room_id: room!.id, owner: advId, title: "Quebrada", period: `[${day}T10:00:00-03:00,${day}T11:12:00-03:00)` },
      // segunda reserva COMEÇANDO dentro da hora da continuação (o bug do PO: ela sumia)
      { room_id: room!.id, owner: advId, title: "Emenda", period: `[${day}T11:12:00-03:00,${day}T12:00:00-03:00)` },
      // e uma amanhã, para o seletor de data
      { room_id: room!.id, owner: advId, title: "De amanhã", period: `[${amanha}T09:00:00-03:00,${amanha}T10:00:00-03:00)` },
    ]);

    await login(page);
    await page.goto("/salas");
    await page.locator(".room-chip", { hasText: `A0 Quebrada ${RUN.slice(-4)}` }).click();
    await page.waitForSelector(".cal-grid");
    // grade proporcional: cada reserva é UM bloco com a altura da duração
    await expect(page.locator(".cal-event", { hasText: "10:00–11:12" })).toHaveCount(1);
    await expect(page.locator(".cal-event", { hasText: "Emenda" })).toBeVisible();
    await expect(page.locator(".cal-event", { hasText: "11:12–12:00" })).toHaveCount(1);
    // o bloco de 1h12 é mais alto que 1 linha (48px por hora)
    const h = await page.locator(".cal-event", { hasText: "Quebrada" }).boundingBox();
    expect(h!.height).toBeGreaterThan(48);

    // a faixa de dias muda o dia e o marcador aponta quem tem reserva
    await expect(page.locator(`[data-salas-day="${amanha}"]`)).toHaveClass(/cal-day--has/);
    await page.locator(`[data-salas-day="${amanha}"]`).click();
    await expect(page.locator(".cal-event", { hasText: "De amanhã" })).toBeVisible();
    await expect(page.locator(".cal-event", { hasText: "Quebrada" })).toHaveCount(0);
    // detalhes por toque: dono vê o botão de cancelar
    await page.getByRole("button", { name: "Reserva De amanhã" }).click();
    await expect(page.getByText("Sua reserva", { exact: true })).toBeVisible();
    await page.locator(".sheet").getByRole("button", { name: "Fechar" }).click();
  });

  test("F2-10: reserva não aceita passado nem fim antes do início", async ({ page }) => {
    await login(page);
    await page.goto("/salas?novo=1");
    await page.waitForSelector("#res-titulo");
    await page.getByLabel("Título").fill("Retro");
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#res-data").fill(ontem);
    await expect(page.getByText("Não é possível reservar um horário no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();

    // não existe mais "fim" para errar: início + duração, com o término calculado
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#res-data").fill(amanha);
    await page.locator("#res-inicio").fill("14:00");
    await page.getByRole("button", { name: "1h30" }).click();
    await expect(page.getByLabel("Fim calculado")).toHaveValue("15:30");
    await expect(page.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
  });

  test("cancelar reserva exige confirmação; colega NÃO cancela reserva alheia", async ({ page }) => {
    const svc = serviceClient();
    const { data: room } = await svc.from("rooms").upsert({ name: `Canc ${RUN.slice(-6)}`, capacity: 2, resources: [] }, { onConflict: "name" }).select("id").single();
    await svc.from("reservations").delete().eq("room_id", room!.id);
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const { data: resv } = await svc
      .from("reservations")
      .insert({ room_id: room!.id, owner: advId, title: `Cancelável ${RUN.slice(-5)}`, period: `[${amanha}T09:00:00-03:00,${amanha}T10:00:00-03:00)` })
      .select("id")
      .single();

    // outro assessor tenta cancelar a reserva alheia: o RLS ignora o update (0 linhas)
    const env = supabaseEnv();
    const asB = makeClient(env.url, env.anon);
    await asB.auth.signInWithPassword({ email: ADV_B.email, password: ADV_B.password });
    const { data: tentativa } = await asB.from("reservations").update({ cancelled_at: new Date().toISOString() }).eq("id", resv!.id).select("id");
    expect(tentativa).toHaveLength(0);
    await asB.auth.signOut();

    // o dono cancela, mas só depois de confirmar no sheet
    await login(page);
    await page.goto("/salas");
    const row = page.locator(".reservation-row", { hasText: `Cancelável ${RUN.slice(-5)}` });
    await row.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator(".sheet__title")).toHaveText("Cancelar esta reserva?");
    // Voltar não cancela nada
    await page.locator(".sheet").getByRole("button", { name: "Voltar" }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Cancelar" }).click();
    await page.locator(".sheet").getByRole("button", { name: "Cancelar reserva" }).click();
    await expect(page.locator(".reservation-row", { hasText: `Cancelável ${RUN.slice(-5)}` })).toHaveCount(0);
    const { data: final } = await svc.from("reservations").select("cancelled_at").eq("id", resv!.id).single();
    expect(final!.cancelled_at).not.toBeNull();
  });

  test("sheet fecha deslizando para baixo, como app nativo", async ({ page }) => {
    await login(page);
    await page.goto("/cards?novo=1");
    await page.waitForSelector(".sheet__title");
    // gesto de arrastar: passa do limiar → fecha
    await page.evaluate(() => {
      const el = document.querySelector(".sheet")!;
      const fire = (type: string, y: number) => {
        const t = new Touch({ identifier: 1, target: el, clientX: 200, clientY: y });
        el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
      };
      fire("touchstart", 300);
      fire("touchmove", 340);
      fire("touchmove", 460);
      fire("touchend", 460);
    });
    await expect(page.locator(".sheet")).toHaveCount(0);

    // arrasto curto NÃO fecha (volta para o lugar)
    await page.goto("/alertas?novo=1");
    await page.waitForSelector(".sheet__title");
    await page.evaluate(() => {
      const el = document.querySelector(".sheet")!;
      const fire = (type: string, y: number) => {
        const t = new Touch({ identifier: 1, target: el, clientX: 200, clientY: y });
        el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
      };
      fire("touchstart", 300);
      fire("touchmove", 330);
      fire("touchend", 330);
    });
    await expect(page.locator(".sheet__title")).toHaveText("Novo alerta de preço");
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

  test("F2-12: home enxuta — atalhos Alertas e Sala; nav principal com Tarefas e Agenda", async ({ page }) => {
    await login(page);
    const quick = page.locator("[data-home-quick-actions]");
    await expect(quick.getByText("Alertas")).toBeVisible();
    await expect(quick.getByText("Sala")).toBeVisible();
    await expect(quick.getByText("Novo card")).toHaveCount(0);
    // sem busca central nem avisos na home
    await expect(page.getByPlaceholder("Buscar cliente por nome ou conta")).toHaveCount(0);
    await expect(page.getByText("Avisos recentes")).toHaveCount(0);
    // nav principal: Tarefas (ex-Cards) e Agenda no lugar do Perfil
    const nav = page.locator(".mnav");
    await expect(nav.getByText("Tarefas")).toBeVisible();
    await expect(nav.getByText("Agenda")).toBeVisible();
    await expect(nav.getByText("Perfil")).toHaveCount(0);
    await nav.getByText("Agenda").click();
    await page.waitForURL("**/agenda");
    await page.goto("/");
    await quick.getByText("Alertas").click();
    await page.waitForURL("**/alertas");
    await page.goto("/");
    await quick.getByText("Sala", { exact: true }).click();
    await page.waitForURL("**/salas");
    await expect(page.locator(".page-header__title")).toHaveText("Sala de reunião");
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

  test("F2-03: conta Google conectada — agenda cria/edita/cancela sincronizando", async ({ page }) => {
    await login(page);
    // com credenciais reais no ambiente o Conectar redireciona ao Google (não dá para
    // automatizar o consentimento); o teste planta a conexão de demonstração e valida o estado
    await serviceClient().from("google_accounts").upsert({ user_id: advId, email: `agenda.rafa.${RUN.slice(-5)}@gmail.com`, mode: "simulado" });
    await page.goto("/perfil");
    await expect(page.getByRole("button", { name: "Desconectar" })).toBeVisible();
    await expect(page.getByText(/agenda sincronizada \(demonstração\)/)).toBeVisible();
    // a Agenda vive no menu principal
    await page.goto("/");
    await page.locator(".mnav").getByText("Agenda").click();
    await page.waitForURL("**/agenda");
    await expect(page.locator(".page-header__title")).toHaveText("Agenda");

    // criar
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    const amanha = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.getByLabel("Título").fill(`Reunião ${RUN}`);
    await page.locator("#ag-data").fill(amanha);
    await page.locator("#ag-inicio").fill("10:00");
    await expect(page.locator("[data-ends-at]")).toContainText("termina às 11:00"); // duração padrão 1h
    await page.getByRole("button", { name: "Agendar", exact: true }).click();
    // o compromisso é amanhã: selecionar o dia na faixa mostra o bloco na linha do tempo
    await page.locator(`[data-agenda-day="${amanha}"]`).click();
    await expect(page.locator(".cal-event", { hasText: `Reunião ${RUN}` })).toBeVisible();
    await expect(page.locator("[data-google-sync]")).toContainText("Sincronizado com o Google Agenda");

    // passado bloqueado
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.getByLabel("Título").fill("Retroativo");
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.locator("#ag-data").fill(ontem);
    await expect(page.getByText("Não é possível agendar no passado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agendar", exact: true })).toBeDisabled();
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();

    // editar: toque no bloco → ações → Editar
    await page.getByRole("button", { name: `Agendamento Reunião ${RUN}` }).click();
    await page.getByText("Editar agendamento").click();
    await page.getByLabel("Título").fill(`Reunião editada ${RUN}`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.locator(".cal-event", { hasText: `Reunião editada ${RUN}` })).toBeVisible();


    // cancelar: toque no bloco → ações → Cancelar → confirmação
    await page.getByRole("button", { name: `Agendamento Reunião editada ${RUN}` }).click();
    await page.getByText("Cancelar agendamento").click();
    await expect(page.locator(".sheet__title")).toHaveText("Cancelar este agendamento?");
    await page.locator(".sheet").getByRole("button", { name: "Cancelar agendamento" }).click();
    await expect(page.locator(".cal-event", { hasText: `Reunião editada ${RUN}` })).toHaveCount(0);
  });

  test("sincronizar é opcional: a agenda funciona sem conta Google", async ({ page }) => {
    const svc = serviceClient();
    await svc.from("google_accounts").delete().eq("user_id", advId); // assessor que NÃO quer sincronizar
    await login(page);
    await page.goto("/agenda");
    await page.waitForSelector(".cal-grid"); // a grade abre normalmente
    await expect(page.locator("[data-google-sync]")).toContainText("Sincronização com o Google Agenda desligada");
    // criar um compromisso local, sem Google nenhum
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.getByLabel("Título").fill(`Local ${RUN.slice(-5)}`);
    await page.getByRole("button", { name: "Agendar", exact: true }).click();
    await expect(page.locator(".cal-event", { hasText: `Local ${RUN.slice(-5)}` })).toBeVisible();
  });

  test("novo agendamento abre já num horário à frente — nunca com erro de passado", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.waitForSelector(".sheet__title");
    await expect(page.getByText("Não é possível agendar no passado.")).toHaveCount(0);
    await page.getByLabel("Título").fill("Futuro");
    await expect(page.getByRole("button", { name: "Agendar", exact: true })).toBeEnabled();
    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();
  });

  test("cabeçalho da agenda escolhe mês e ano; 'hoje' traz de volta", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForSelector(".cal-strip");
    // pular para um dia de outro mês pelo seletor do cabeçalho
    const target = new Date(Date.now() + 45 * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await page.evaluate((d) => {
      const input = document.querySelector('input[aria-label="Data da agenda"]') as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      set.call(input, d);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, target);
    const monthName = new Date(`${target}T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
    await expect(page.locator("[data-agenda-month]")).toContainText(new RegExp(monthName, "i"));
    // a faixa de dias reancora no dia escolhido
    await expect(page.locator(`[data-agenda-day="${target}"]`)).toHaveClass(/cal-day--active/);
    // atalho de volta para hoje
    await page.getByRole("button", { name: "hoje", exact: true }).click();
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await expect(page.locator(`[data-agenda-day="${today}"]`)).toHaveClass(/cal-day--active/);
  });

  test("duração: atalhos + Mais (Manhã/Tarde/Dia todo e término personalizado)", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.waitForSelector(".sheet__title");

    // atalho rápido
    await page.getByRole("button", { name: "2h", exact: true }).click();
    await expect(page.locator("[data-ends-at]")).toContainText("2h");

    // Mais → Dia todo define início e fim de uma vez
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.getByRole("button", { name: "Dia todo" }).click();
    await expect(page.locator("#ag-inicio")).toHaveValue("08:00");
    await expect(page.locator("[data-ends-at]")).toContainText("termina às 18:00");

    // término personalizado
    await page.locator("#ag-termina").fill("16:30");
    await expect(page.locator("[data-ends-at]")).toContainText("termina às 16:30");

    await page.locator(".sheet").getByRole("button", { name: "Cancelar", exact: true }).click();
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
