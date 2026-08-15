import { test, expect, emAmbosTemas } from "./fixtures";
import {
  formatBRL,
  formatSignedBRL,
  formatPct,
  formatDate,
  formatTime,
  formatDateAtTime,
  normalizeAdvisorCode,
  displayAdvisorCode,
  initials,
} from "../src/lib/format";

// ---------- Formatação pt-BR (roda em Node, sem navegador) ----------

test.describe("formatação pt-BR", () => {
  test("moeda no padrão R$ 1.234.567,89", () => {
    expect(formatBRL(1234567.89)).toBe("R$ 1.234.567,89");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(-500)).toBe("-R$ 500,00");
  });

  test("movimentação em neutro com sinal explícito", () => {
    expect(formatSignedBRL(1000)).toBe("+R$ 1.000,00");
    expect(formatSignedBRL(-500)).toBe("−R$ 500,00");
  });

  test("percentual com vírgula e sinal", () => {
    expect(formatPct(1.25)).toBe("+1,25%");
    expect(formatPct(-0.8)).toBe("−0,80%");
  });

  test("datas dd/mm/aaaa e horas hh:mm no fuso America/Sao_Paulo", () => {
    expect(formatDate("2026-08-15")).toBe("15/08/2026");
    // 21:20Z = 18:20 em São Paulo (UTC-3)
    expect(formatTime("2026-08-14T21:20:00Z")).toBe("18:20");
    expect(formatDateAtTime("2026-08-14T21:20:00Z")).toBe("14/08 às 18:20");
  });

  test("regra de ouro: A31342 e 31342 são o mesmo assessor", () => {
    expect(normalizeAdvisorCode("A31342")).toBe("31342");
    expect(normalizeAdvisorCode("31342")).toBe("31342");
    expect(normalizeAdvisorCode(" a31342 ")).toBe("31342");
    expect(normalizeAdvisorCode(31390)).toBe("31390");
    expect(normalizeAdvisorCode("A-0871")).toBe("871");
    expect(normalizeAdvisorCode("")).toBeNull();
    expect(normalizeAdvisorCode("XPTO")).toBeNull();
    expect(displayAdvisorCode("871")).toBe("A-871");
  });

  test("iniciais de avatar", () => {
    expect(initials("Helena Prado")).toBe("HP");
    expect(initials("Carlos Alberto Bertrand")).toBe("CB");
    expect(initials("Rafael")).toBe("RA");
  });
});

// ---------- Fundações no navegador: tokens, tema, fontes ----------

emAmbosTemas("fundações", ({ theme }) => {
  test("app sobe com o tema e os tokens certos", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", theme === "escuro" ? "dark" : "light");

    // bg do tema: claro #F1F5F3 · escuro #0F1614 (01-fundacoes.md)
    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe(theme === "escuro" ? "rgb(15, 22, 20)" : "rgb(241, 245, 243)");
  });

  test("IBM Plex Sans e Mono carregadas", async ({ page }) => {
    await page.goto("/");
    const ok = await page.evaluate(async () => {
      // força o download das faces declaradas (o navegador só baixa fonte usada)
      await Promise.all([
        document.fonts.load('15px "IBM Plex Sans"'),
        document.fonts.load('600 15px "IBM Plex Sans"'),
        document.fonts.load('600 14px "IBM Plex Mono"'),
      ]);
      return {
        sans400: document.fonts.check('15px "IBM Plex Sans"'),
        sans600: document.fonts.check('600 15px "IBM Plex Sans"'),
        mono600: document.fonts.check('600 14px "IBM Plex Mono"'),
      };
    });
    expect(ok).toEqual({ sans400: true, sans600: true, mono600: true });
  });
});

test.describe("PWA", () => {
  test("manifest com nome Elev e cores brand-800", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!, "http://localhost:5173").href);
    const manifest = await res.json();
    expect(manifest.name).toBe("Elev");
    expect(manifest.background_color).toBe("#0E3729");
    expect(manifest.theme_color).toBe("#0E3729");
    expect(manifest.lang).toBe("pt-BR");
  });
});
