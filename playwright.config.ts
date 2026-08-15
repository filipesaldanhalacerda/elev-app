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
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "assessor",
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: "chromium",
      },
    },
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
