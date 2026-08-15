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
      testIgnore: [/e3-rls/, /e7-cotacoes/],
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: "chromium",
      },
    },
    {
      name: "admin",
      testIgnore: [/e3-rls/, /e7-cotacoes/],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // testes de banco/RLS: só API, sem navegador; um único worker para não competir
      name: "rls",
      testMatch: /e3-rls/,
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
      command: "npx wrangler dev --config worker/wrangler.toml --port 8787",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: true,
      timeout: 90_000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
  ],
});
