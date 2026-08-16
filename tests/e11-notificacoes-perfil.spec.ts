/**
 * E11/E12 — tela 15 (central com lido/não lido por dia), lembrete diário (tela 25
 * modelo 2), assinatura de push e tela 16 (perfil: tema, toggles, trocar senha, sair).
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV = { email: `rafael.e11.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `11${RUN.slice(-4)}` };
let advId: string;

test.skip(({ isMobile }) => !isMobile, "telas 15/16 são mobile");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const svc = serviceClient();
  advId = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  await svc.from("notifications").delete().eq("user_id", advId);
  await svc.from("cards").delete().ilike("title", `%${RUN}%`);
  const now = Date.now();
  await svc.from("notifications").insert([
    { user_id: advId, kind: "alerta_atingido", title: "PETR4 atingiu R$ 41,00", body: "alerta de alta criado em 11/08", created_at: new Date(now).toISOString() },
    { user_id: advId, kind: "card_delegado", title: "Bruno delegou uma tarefa para você", body: "Ligar sobre COE · prazo 18/08", created_at: new Date(now - 3600000).toISOString() },
    { user_id: advId, kind: "reserva_confirmada", title: "Reserva confirmada — Ipê, seg 18/08 às 14:00", body: null, created_at: new Date(now - 86400000).toISOString(), read_at: new Date(now - 80000000).toISOString() },
  ]);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADV.email);
  await page.locator('input[type="password"]').fill(ADV.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

test("tela 15: grupos por dia, não lida destacada, contador e marcar lidas", async ({ page }) => {
  await login(page);
  await page.goto("/notificacoes");
  await expect(page.locator(".page-header__title")).toHaveText("Notificações");
  await expect(page.locator(".tab-42__count")).toHaveText("2 novas");

  await expect(page.locator(".notif-group__day").first()).toContainText("Hoje ·");
  await expect(page.locator(".notif-group__day").nth(1)).toContainText("Ontem ·");

  const unread = page.locator(".notif--unread");
  await expect(unread).toHaveCount(2);
  await expect(unread.first().locator(".notif__title")).toContainText("PETR4 atingiu R$ 41,00");
  await expect(page.locator(".notif:not(.notif--unread) .notif__title")).toContainText("Reserva confirmada");

  await page.getByRole("button", { name: "Marcar lidas" }).click();
  await expect(page.locator(".notif--unread")).toHaveCount(0);
  await expect(page.locator(".tab-42__count")).toHaveCount(0);
});

test("lembrete diário (cron): resumo dos cards com atrasado; respeita preferência", async ({ request }) => {
  const svc = serviceClient();
  await svc.from("cards").insert([
    { title: `Rebalancear carteira ${RUN}`, creator: advId, assignee: advId, priority: "alta", status: "pendente", due_at: new Date(Date.now() - 86400000).toISOString(), daily_reminder: true },
    { title: `Enviar relatório ${RUN}`, creator: advId, assignee: advId, priority: "media", status: "pendente", daily_reminder: true },
  ]);
  const res = await request.post("http://127.0.0.1:8787/api/cron/daily-reminder?force=1");
  expect((await res.json()).ok).toBe(true);

  const { data: notif } = await svc.from("notifications").select("title, body").eq("user_id", advId).eq("kind", "lembrete_diario");
  const reminder = (notif ?? []).find((n) => n.title.startsWith("Seu dia:"));
  expect(reminder).toBeTruthy();
  expect(reminder!.title).toContain("2 tarefas pendentes");
  expect(reminder!.title).toContain("1 atrasada");
  expect(reminder!.body).toContain("venceu");

  // preferência desligada: não gera novo lembrete
  await svc.from("profiles").update({ push_prefs: { alerta_preco: true, lembrete_diario: false, card_delegado: true, movimentacoes: false } }).eq("id", advId);
  const before = (notif ?? []).length;
  await request.post("http://127.0.0.1:8787/api/cron/daily-reminder?force=1");
  const { data: after } = await svc.from("notifications").select("id").eq("user_id", advId).eq("kind", "lembrete_diario");
  expect(after!.length).toBe(before);
  await svc.from("profiles").update({ push_prefs: { alerta_preco: true, lembrete_diario: true, card_delegado: true, movimentacoes: false } }).eq("id", advId);
});

test("tela 16: perfil completo — tema muda na hora, toggles persistem, trocar senha e sair", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  await expect(page.locator(".page-header__title")).toHaveText("Perfil");
  await expect(page.getByText(ADV.name)).toBeVisible();
  await expect(page.getByText(ADV.email)).toBeVisible();
  await expect(page.getByText(`assessor · código A-${ADV.code}`)).toBeVisible();

  // tema: Escuro aplica data-theme=dark na hora
  await page.getByRole("button", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // toggles de push: os 4 tipos do quadro; persistência no perfil
  await expect(page.getByText("Push por tipo de evento")).toBeVisible();
  await expect(page.getByText("aportes e resgates relevantes")).toBeVisible();
  const mov = page.getByRole("switch", { name: "Movimentações de clientes" });
  await expect(mov).toHaveAttribute("aria-checked", "false");
  await mov.click();
  await expect(mov).toHaveAttribute("aria-checked", "true");
  const svc = serviceClient();
  await expect(async () => {
    const { data } = await svc.from("profiles").select("push_prefs").eq("id", advId).single();
    expect((data!.push_prefs as Record<string, boolean>).movimentacoes).toBe(true);
  }).toPass();

  // hora do lembrete diário configurável no Perfil, persistida no banco
  const hora = page.getByLabel("Hora do lembrete diário");
  await expect(hora).toBeVisible();
  await hora.fill("09:30");
  await expect(async () => {
    const { data } = await svc.from("profiles").select("reminder_time").eq("id", advId).single();
    expect(String(data!.reminder_time).slice(0, 5)).toBe("09:30");
  }).toPass();

  // Google desconectada (fase 2) e rodapé
  await expect(page.getByRole("button", { name: "Conectar" })).toBeVisible();
  await expect(page.getByText("Elev 1.0.0 · PWA")).toBeVisible();

  // trocar senha pelo modal
  await page.getByRole("button", { name: "Trocar senha" }).click();
  await page.getByLabel("Nova senha").fill("NovaSenha9");
  await page.getByLabel("Repita a senha").fill("NovaSenha9");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByText("Senha trocada.")).toBeVisible();

  // sair da conta (danger-action) → login
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.waitForURL("**/login");

  // a senha nova vale
  await page.getByLabel("E-mail").fill(ADV.email);
  await page.locator('input[type="password"]').fill("NovaSenha9");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
});
