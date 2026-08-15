// Captura as telas da E4 para comparação lado a lado com os quadros #3a e #4d.
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const out = process.argv[2] ?? "test-results";
const env = (() => {
  const s = execSync("supabase status -o env", { encoding: "utf8" });
  const g = (k) => s.match(new RegExp(`${k}="([^"]+)"`))?.[1];
  return { url: g("API_URL"), anon: g("ANON_KEY"), service: g("SERVICE_ROLE_KEY") };
})();

const svc = createClient(env.url, env.service, { realtime: { transport: ws } });
const RUN = `shot${Date.now()}`;
const admin = { email: `marina.${RUN}@elev.test`, password: "Admin@2026!x" };

async function mk(email, name, role, code) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: admin.password, email_confirm: true });
  if (error) throw error;
  await svc.from("profiles").insert({ id: data.user.id, name, email, role, advisor_code: code });
  return data.user.id;
}
await mk(admin.email, "Marina Costa", "admin", null);
await mk(`rafael.${RUN}@elev.test`, "Rafael Moura", "advisor", "871");
const brunoId = await mk(`bruno.${RUN}@elev.test`, "Bruno Salles", "advisor", "1042");
const paulaId = await mk(`paula.${RUN}@elev.test`, "Paula Freitas", "advisor", "1103");
const marcosId = await mk(`marcos.${RUN}@elev.test`, "Marcos Lima", "advisor", "455");
await svc.from("profiles").update({ is_active: false }).eq("id", marcosId);
void paulaId;
void brunoId;

const browser = await chromium.launch();

// telas 01–03 (mobile 390)
const shots = [
  { name: "01-login-claro", theme: "claro", url: "/login" },
  { name: "02-passo1-claro", theme: "claro", url: "/primeiro-acesso" },
  { name: "03-perdi-escuro", theme: "escuro", url: "/perdi-a-senha" },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((t) => localStorage.setItem("elev.theme", t), s.theme);
  await page.goto(`http://localhost:5173${s.url}`);
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.screenshot({ path: `${out}/e4-${s.name}.png`, fullPage: true });
  await page.close();
}

// 01 escuro com erro
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((t) => localStorage.setItem("elev.theme", t), "escuro");
  await page.goto("http://localhost:5173/login");
  await page.getByLabel("E-mail").fill("rafael.moura@assessoria.com.br");
  await page.locator('input[type="password"]').fill("errada1");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector(".banner--danger");
  await page.screenshot({ path: `${out}/e4-01-login-escuro-erro.png`, fullPage: true });
  await page.close();
}

// 19 usuários claro com modal do código (desktop 1440)
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  await page.addInitScript((t) => localStorage.setItem("elev.theme", t), "claro");
  await page.goto("http://localhost:5173/login");
  await page.getByLabel("E-mail").fill(admin.email);
  await page.locator('input[type="password"]').fill(admin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
  await page.goto("http://localhost:5173/admin/usuarios");
  await page.waitForSelector(".users-table__row");
  const row = page.locator(".users-table__row", { hasText: `bruno.${RUN}@elev.test` });
  await row.getByRole("button", { name: "Gerar código" }).click();
  await page.waitForSelector(".code-modal__code");
  await page.screenshot({ path: `${out}/e4-19-usuarios-modal.png` });
  await page.close();
}

await browser.close();
console.log("ok");
