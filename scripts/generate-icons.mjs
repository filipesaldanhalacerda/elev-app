// Gera public/icons/*.png a partir de scripts/icon.html usando o Chromium do Playwright,
// com a fonte IBM Plex Mono real (a mesma servida ao app) — fiel à tela 26.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "public", "icons");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(root, "scripts", "icon.html"));
await page.waitForFunction(() => document.fonts.status === "loaded");

const icon = page.locator("#icon");
await icon.screenshot({ path: path.join(out, "icon-512.png") });
// maskable: mesmo desenho full-bleed (zona segura de 40% respeitada pela letra centrada)
await icon.screenshot({ path: path.join(out, "icon-512-maskable.png") });

await page.setViewportSize({ width: 192, height: 192 });
await page.evaluate(() => {
  const el = document.getElementById("icon");
  el.style.width = "192px";
  el.style.height = "192px";
  const span = el.querySelector("span");
  span.style.fontSize = "112px";
  span.style.transform = "translateY(-5px)";
});
await icon.screenshot({ path: path.join(out, "icon-192.png") });

await browser.close();
console.log("Ícones gerados em public/icons/");
