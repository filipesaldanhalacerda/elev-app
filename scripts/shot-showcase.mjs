// Captura /showcase nos 2 temas para comparação lado a lado com os quadros #2b–#2i.
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results";
const browser = await chromium.launch();
for (const theme of ["claro", "escuro"]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript((t) => localStorage.setItem("elev.theme", t), theme);
  await page.goto("http://localhost:5173/showcase");
  await page.waitForSelector('[data-showcase="2i"]');
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.screenshot({ path: `${out}/showcase-${theme}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("ok");
