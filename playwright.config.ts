import { defineConfig, devices } from "@playwright/test";

/**
 * Dois projetos, como no handoff:
 *  - assessor: mobile 390×844 (telas 01–16, quadros mobile)
 *  - admin: desktop 1440×900 (telas 17–23)
 * Cada spec de tela roda nos 2 temas via fixture (tests/fixtures.ts).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 4,
  retries: 1,
  reporter: [["list"]],
  globalTeardown: "./tests/helpers/global-teardown.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:5173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "assessor",
      // o projeto mt derruba a conexão MetaTrader (singleton): rodar depois dele evita
      // que /api/quotes volte "pausado" no meio destes testes
      dependencies: ["mt"],
      testIgnore: [/e3-rls/, /e5-importacao/, /e7-cotacoes/, /e16-fluxos/, /e17-qa/, /e20-garantia/, /dados-reais/],
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: "chromium",
      },
    },
    {
      name: "admin",
      dependencies: ["mt"],
      testIgnore: [/e3-rls/, /e5-importacao/, /e7-cotacoes/, /e16-fluxos/, /e17-qa/, /e20-garantia/, /dados-reais/],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // e5 e e16 importam/apagam os MESMOS arquivos reais: nunca em paralelo.
      // e16 depende de e5 (roda depois), e ambos fora dos projetos gerais.
      name: "real-imports",
      testMatch: /e5-importacao/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "real-fluxos",
      testMatch: /e16-fluxos/,
      dependencies: ["real-imports"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // testes de banco/RLS: só API, sem navegador; um único worker para não competir
      name: "rls",
      testMatch: /e3-rls/,
      workers: 1,
    },
    {
      // E17: varredura de QA — serial, cria os próprios contexts
      name: "qa",
      testMatch: /e17-qa/,
      workers: 1,
    },
    {
      // carga de dados reais para o PO (npm run dados:reais) — nunca roda na bateria
      name: "dados-reais",
      testMatch: /dados-reais/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // E20: garantia transversal (console/rede/dado real) — serial, viewports próprios
      name: "garantia",
      testMatch: /e20-garantia/,
      dependencies: ["mt"],
      workers: 1,
    },
    {
      // E7 usa o singleton mt_connection: roda serial, viewport ajustado por bloco
      name: "mt",
      testMatch: /e7-cotacoes/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // roda DENTRO de worker/ para o wrangler achar o .dev.vars (sem ele as cotações caem no simulador)
      command: "npx wrangler dev --port 8787",
      cwd: "worker",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: true,
      timeout: 90_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
  ],
});
