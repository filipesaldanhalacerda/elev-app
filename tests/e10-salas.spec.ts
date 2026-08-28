/**
 * E10 — tela 20 (gestão de salas) e tela 14 + fluxo (f):
 * reserva com conflito → alternativa em um toque → confirmada + notificação.
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = { email: `marina.e10.${RUN}@elev.test`, password: "Admin@2026!x", name: "Marina Costa" };
const RAFA = { email: `rafael.e10.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `10${RUN.slice(-4)}` };
const BRUNO = { email: `bruno.e10.${RUN}@elev.test`, password: "Senha@2026!b", name: `Bruno${RUN.slice(-3)} Salles`, code: `20${RUN.slice(-4)}` };
const IPE = `Ipê ${RUN.slice(-4)}`;
const JACA = `Jacarandá ${RUN.slice(-4)}`;

let rafaId: string;
let brunoId: string;
let ipeId: string;
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

test.beforeAll(async () => {
  const svc = serviceClient();
  await createUser(svc, { email: ADMIN.email, password: ADMIN.password, name: ADMIN.name, role: "admin" });
  rafaId = await createUser(svc, { email: RAFA.email, password: RAFA.password, name: RAFA.name, role: "advisor", advisor_code: RAFA.code });
  brunoId = await createUser(svc, { email: BRUNO.email, password: BRUNO.password, name: BRUNO.name, role: "advisor", advisor_code: BRUNO.code });
  await svc.from("rooms").delete().in("name", [IPE, JACA, `Aroeira ${RUN.slice(-4)}`]);
  const { data: ipe } = await svc.from("rooms").insert({ name: IPE, capacity: 6, resources: ["TV", "Videoconferência", "Quadro"] }).select("id").single();
  ipeId = ipe!.id;
  await svc.from("rooms").insert({ name: JACA, capacity: 4, resources: ["TV"] });
  // Bruno ocupa 10:00–11:00 hoje na Ipê (agenda do dia) e amanhã (o conflito do quadro —
  // F2-10 bloqueia reservar no passado, então o conflito é tentado amanhã)
  await svc.from("reservations").insert([
    { room_id: ipeId, owner: brunoId, title: "Onboarding", period: `[${today}T10:00:00-03:00,${today}T11:00:00-03:00)` },
    { room_id: ipeId, owner: brunoId, title: "Onboarding", period: `[${tomorrow}T10:00:00-03:00,${tomorrow}T11:00:00-03:00)` },
  ]);
});

// as salas criadas aqui somem no fim: a base fica só com as salas do escritório
test.afterAll(async () => {
  // sala é recurso do escritório, não sobra de teste — reservas caem por cascade
  await serviceClient().from("rooms").delete().in("name", [IPE, JACA, `Aroeira ${RUN.slice(-4)}`]);
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home], .admin-shell");
}

test.describe("tela 20 · gestão de salas (admin)", () => {
  test.skip(({ isMobile }) => isMobile, "tela 20 é desktop");

  test("cards de sala, criar, desativar e reativar", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/salas");
    const ipe = page.locator(`[data-room="${IPE}"]`);
    await expect(ipe.locator(".room-card__name")).toHaveText(IPE);
    await expect(ipe.locator(".chip--success")).toHaveText("Ativa");
    await expect(ipe.getByText("6 lugares")).toBeVisible();
    await expect(ipe.getByText("1 reserva hoje")).toBeVisible();
    await expect(ipe.locator(".resource-chip")).toHaveCount(3);

    // nova sala pelo form composto
    await page.getByRole("button", { name: "Nova sala" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill(`Aroeira ${RUN.slice(-4)}`);
    await modal.getByLabel("Capacidade (lugares)").fill("8");
    await modal.getByLabel("Recursos (separados por vírgula)").fill("TV, Quadro");
    await modal.getByRole("button", { name: "Criar sala" }).click();
    await expect(page.locator(`[data-room="Aroeira ${RUN.slice(-4)}"]`)).toBeVisible();

    // desativar → mostra motivo e Reativar
    const jaca = page.locator(`[data-room="${JACA}"]`);
    await jaca.getByRole("button", { name: `Desativar ${JACA}` }).click();
    await expect(jaca.locator(".chip--neutral")).toHaveText("Inativa");
    await expect(jaca.getByText("em manutenção")).toBeVisible();
    await jaca.getByRole("button", { name: "Reativar" }).click();
    await expect(jaca.locator(".chip--success")).toHaveText("Ativa");
  });
});

test.describe("tela 14 · fluxo (f)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => !isMobile, "tela 14 é mobile");

  test("agenda do dia com reserva de outro assessor e horários livres", async ({ page }) => {
    await login(page, RAFA.email, RAFA.password);
    await page.goto("/salas");
    await expect(page.locator(".page-header__title")).toHaveText("Sala de reunião");

    // seletor de salas: a PRIMEIRA sala começa na borda esquerda, inteira — nunca cortada
    const scroller = page.locator("[data-salas-seletor]");
    await expect(scroller).toBeVisible();
    const box = await scroller.boundingBox();
    const first = await scroller.locator(".room-chip").first().boundingBox();
    expect(first!.x).toBeGreaterThanOrEqual(box!.x - 1);
    expect(first!.x + first!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);

    await page.locator(".room-chip", { hasText: IPE }).click();
    await expect(page.locator(".cal-event--other", { hasText: `Onboarding — Bruno${RUN.slice(-3)}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reservar às 08:00" })).toBeVisible();
  });

  test("uma sala só: sem seletor para rolar — o nome, a lotação e os recursos ficam na grade", async ({ page }) => {
    const svc = serviceClient();
    // deixa só a Sala 1 visível para este assessor (as de teste ficam inativas por um instante)
    await svc.from("rooms").update({ is_active: false }).in("name", [IPE, JACA]);
    try {
      await login(page, RAFA.email, RAFA.password);
      await page.goto("/salas");
      await expect(page.locator("[data-salas-sala]")).toBeVisible();
      await expect(page.locator("[data-salas-seletor]")).toHaveCount(0);
      await expect(page.locator("[data-salas-sala]")).toContainText("Sala 1");
      await expect(page.locator("[data-salas-sala]")).toContainText("lugares");
    } finally {
      await svc.from("rooms").update({ is_active: true }).in("name", [IPE, JACA]);
    }
  });

  test("conflito → alternativas em um toque → confirmada em Minhas reservas + notificação", async ({ page }) => {
    const svc = serviceClient();
    await login(page, RAFA.email, RAFA.password);
    await page.goto("/salas");
    await page.locator(".room-chip", { hasText: IPE }).click();
    await page.getByRole("button", { name: "Reservar", exact: true }).click();

    // formulário 10:00–11:00 na Ipê (colide com o Onboarding do Bruno)
    await expect(page.getByText("Nova reserva")).toBeVisible();
    await page.locator("#res-data").fill(tomorrow);
    await page.locator("#res-inicio").fill("10:00"); // colide com o Onboarding do Bruno
    await page.getByLabel("Título").fill("Revisão trimestral");
    const confirmar = page.getByRole("button", { name: "Confirmar reserva" });
    await confirmar.click();

    // banner do conflito com quem ocupa + confirmação travada
    await expect(page.locator(".banner--danger .banner__title")).toContainText("já está reservada das 10:00 às 11:00");
    await expect(page.locator(".banner--danger")).toContainText(`Onboarding — Bruno${RUN.slice(-3)}`);
    await expect(page.getByText("Escolha uma alternativa livre para liberar a confirmação.")).toBeVisible();
    await expect(page.getByText("Alternativas livres")).toBeVisible();
    const alt = page.locator(".alt-chip").first();
    await expect(alt).toContainText(IPE);

    // um toque na alternativa → confirma
    await alt.click();
    await expect(alt).toHaveClass(/alt-chip--active/);
    await confirmar.click();

    await expect(page.locator(".reservation-row", { hasText: "Revisão trimestral" })).toBeVisible();
    await expect(page.locator(".reservation-row", { hasText: "Revisão trimestral" }).locator(".reservation-row__meta")).toContainText(IPE);

    // banco recusou o conflito e aceitou a alternativa; notificação criada
    const { data: res } = await svc.from("reservations").select("id").eq("owner", rafaId).is("cancelled_at", null);
    expect(res).toHaveLength(1);
    const { data: notif } = await svc.from("notifications").select("title").eq("user_id", rafaId).eq("kind", "reserva_confirmada");
    expect((notif ?? []).some((n) => n.title.startsWith(`Reserva confirmada — ${IPE}`))).toBe(true);
  });

  test("cancelar reserva em danger-action", async ({ page }) => {
    const svc = serviceClient();
    await login(page, RAFA.email, RAFA.password);
    await page.goto("/salas");
    const row = page.locator(".reservation-row", { hasText: "Revisão trimestral" });
    await row.getByRole("button", { name: "Cancelar" }).click();
    // confirmação obrigatória antes de cancelar
    await expect(page.locator(".sheet__title")).toHaveText("Cancelar esta reserva?");
    await page.locator(".sheet").getByRole("button", { name: "Cancelar reserva" }).click();
    await expect(page.locator(".reservation-row", { hasText: "Revisão trimestral" })).toHaveCount(0);
    const { data } = await svc.from("reservations").select("cancelled_at").eq("owner", rafaId).eq("title", "Revisão trimestral").single();
    expect(data!.cancelled_at).not.toBeNull();
  });
});
