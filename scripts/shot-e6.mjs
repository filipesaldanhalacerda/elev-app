// Capturas das telas 05–10 para comparação com os quadros #3b/#3c/#3d.
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const out = "C:/Users/FILIPE~1/AppData/Local/Temp/claude/c--Users-Filipe-Lacerda-Desktop-Projeto-SaaS-elev-app/c1fb225b-e587-44f3-82e7-3e4df19d839a/scratchpad";
const s = execSync("supabase status -o env", { encoding: "utf8" });
const g = (k) => s.match(new RegExp(`${k}="([^"]+)"`))?.[1];
const svc = createClient(g("API_URL"), g("SERVICE_ROLE_KEY"), { realtime: { transport: ws } });

const RUN = `${Date.now()}`;
const adv = { email: `shot6.${RUN}@elev.test`, password: "Elev@2026", code: `77${RUN.slice(-3)}` };
const ANA = `55${RUN.slice(-5)}7`;

const { data: u } = await svc.auth.admin.createUser({ email: adv.email, password: adv.password, email_confirm: true });
await svc.from("profiles").insert({ id: u.user.id, name: "Rafael Moura", email: adv.email, role: "advisor", advisor_code: adv.code });
const { data: imp } = await svc.from("imports").insert({ kind: "positivador", variant: "mensal", file_name: "s.xlsx", file_size: 1, file_hash: `s-${RUN}`, ref_date: "2026-08-15", status: "concluida", created_by: u.user.id }).select("id").single();
await svc.from("clients").insert([
  { account_code: ANA, advisor_code: adv.code, name: "Ana Bertoldi", status: "ATIVO", suitability: "AGRESSIVO", birth_date: "1971-03-02", xp_registered_at: "2019-04-08" },
  { account_code: ANA.replace("7", "1"), advisor_code: adv.code, name: "Carlos Bertrand", status: "INATIVO" },
]);
const snaps = [];
for (let m = 0; m < 12; m++) {
  const d = new Date(2025, 8 + m, 15);
  snaps.push({ import_id: imp.id, account_code: ANA, advisor_code: adv.code, ref_date: d.toISOString().slice(0, 10), variant: "mensal", net_em_m: 3800000 + m * 90000, net_em_m1: 3750000 + m * 88000, captacao_liquida_m: 250000 });
}
await svc.from("positivador_snapshots").insert(snaps);
await svc.from("positivador_snapshots").insert({ import_id: imp.id, account_code: ANA.replace("7", "1"), advisor_code: adv.code, ref_date: "2026-08-15", variant: "mensal", net_em_m: 918740.55, net_em_m1: 924300 });
await svc.from("positions").insert([
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, ref_date: "2026-08-15", product: "Renda Fixa", sub_product: "CDB", asset: "CDB Banco Fictício", maturity_date: "2026-08-18", value: 812400 },
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, ref_date: "2026-08-15", product: "Renda Fixa", sub_product: "Tesouro", asset: "Tesouro IPCA+ 2029", maturity_date: "2029-05-15", value: 568778.6 },
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, ref_date: "2026-08-15", product: "Renda Variável", asset: "PETR4", quantity: 18400, value: 706928 },
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, ref_date: "2026-08-15", product: "Fundos", asset: "Fundo Multimercado X", value: 366219.4 },
]);
await svc.from("movements").insert([
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, mov_date: "2026-08-07", kind: "TED", flow: "C", amount: 250000 },
  { import_id: imp.id, account_code: ANA, advisor_code: adv.code, mov_date: "2026-08-01", kind: "TED", flow: "D", amount: -40000 },
]);
await svc.from("client_extras").insert({ account_code: ANA, phone: "(11) 98812-4402", email: "ana.bertoldi@email.com", notes: "Prefere contato por WhatsApp após as 18h.", updated_by: u.user.id });

const browser = await chromium.launch();
async function shot(name, theme, path, action) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((t) => localStorage.setItem("elev.theme", t), theme);
  await page.goto("http://localhost:5173/login");
  await page.getByLabel("E-mail").fill(adv.email);
  await page.locator('input[type="password"]').fill(adv.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForSelector("[data-home]");
  await page.goto(`http://localhost:5173${path}`);
  if (action) await action(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/e6-${name}.png`, fullPage: true });
  await page.close();
}

await shot("05-claro", "claro", "/clientes");
await shot("06-claro", "claro", `/clientes/${ANA}`);
await shot("07-claro", "claro", `/clientes/${ANA}?aba=Carteira`);
await shot("08-claro", "claro", `/clientes/${ANA}?aba=Movimenta%C3%A7%C3%B5es`);
await shot("09-escuro", "escuro", `/clientes/${ANA}?aba=Cadastro`);
await shot("10-claro", "claro", `/clientes/${ANA}?aba=Linha%20do%20tempo`);
await browser.close();
console.log("ok");
