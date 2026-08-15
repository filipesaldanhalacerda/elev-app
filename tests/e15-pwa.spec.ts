/**
 * E15 — tela 24 (offline: banner com horário, estado central, fila de sync)
 * e tela 26 (manifest/splash brand-800, prompt de instalação composto).
 */
import { test, expect } from "@playwright/test";
import { serviceClient, createUser } from "./helpers/seed";

const RUN = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e4)}`;
const ADV = { email: `rafael.e15.${RUN}@elev.test`, password: "Senha@2026!a", name: `Rafa${RUN.slice(-3)} Moura`, code: `15${RUN.slice(-4)}` };
const ANA = `51${RUN.slice(-5)}7`;

test.skip(({ isMobile }) => !isMobile, "telas 24/26 são mobile");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const svc = serviceClient();
  const id = await createUser(svc, { email: ADV.email, password: ADV.password, name: ADV.name, role: "advisor", advisor_code: ADV.code });
  void id;
  await svc.from("clients").upsert({ account_code: ANA, advisor_code: ADV.code, name: "Ana Bertoldi", status: "ATIVO" });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADV.email);
  await page.locator('input[type="password"]').fill(ADV.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
}

test("tela 24: banner fixo com horário, estado central e retorno online", async ({ page, context }) => {
  await login(page);
  await expect(page.locator("[data-offline-banner]")).toHaveCount(0);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator("[data-offline-banner]")).toContainText(/Você está offline\. Mostrando dados de \d{2}:\d{2}\./);
  await expect(page.locator("[data-offline-central]")).toContainText("Sem conexão agora");
  await expect(page.locator("[data-offline-central]")).toContainText("guardados no aparelho e sincronizam quando a rede voltar");
  await expect(page.getByRole("button", { name: "Tentar reconectar" })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("[data-offline-banner]")).toHaveCount(0);
});

test("fila de sincronização: anotação offline entra na fila e sincroniza ao voltar", async ({ page, context }) => {
  const svc = serviceClient();
  await login(page);
  await page.goto(`/clientes/${ANA}?aba=Linha%20do%20tempo`);
  await expect(page.getByLabel("Anotar algo desta conversa")).toBeVisible();

  // offline: anotar → vai para a fila
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByLabel("Anotar algo desta conversa").fill(`Anotação offline ${RUN}`);
  await page.getByRole("button", { name: "Enviar anotação" }).click();
  await expect(page.locator("[data-sync-queue]")).toContainText("1 anotação aguardando sincronizar");
  await expect(page.locator("[data-sync-queue]")).toContainText("na fila");
  const { data: before } = await svc.from("timeline_notes").select("id").ilike("body", `%${RUN}%`);
  expect(before).toHaveLength(0);

  // rede volta: fila esvazia e a anotação chega ao banco
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("[data-sync-queue]")).toHaveCount(0);
  await expect(async () => {
    const { data: after } = await svc.from("timeline_notes").select("body").ilike("body", `%${RUN}%`);
    expect(after).toHaveLength(1);
  }).toPass();
});

test("tela 26: manifest com splash brand-800 e prompt de instalação composto", async ({ page }) => {
  await login(page);
  // manifest: splash em brand-800 nos dois temas
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(new URL(href!, page.url()).href)).json();
  expect(manifest.background_color).toBe("#0E3729");
  expect(manifest.theme_color).toBe("#0E3729");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  // prompt de instalação com os textos do quadro
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & { prompt?: () => Promise<void> };
    e.prompt = async () => {};
    window.dispatchEvent(e);
  });
  const prompt = page.locator("[data-install-prompt]");
  await expect(prompt).toContainText("Instalar a Elev");
  await expect(prompt).toContainText("app.elev.com.br · funciona offline");
  await expect(prompt.getByRole("button", { name: "Adicionar à tela inicial" })).toBeVisible();

  // "Agora não" dispensa e não volta
  await prompt.getByRole("button", { name: "Agora não" }).click();
  await expect(page.locator("[data-install-prompt]")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));
  await expect(page.locator("[data-install-prompt]")).toHaveCount(0);
});
