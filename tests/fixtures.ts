import { test as base } from "@playwright/test";

export type Theme = "claro" | "escuro";

/**
 * Fixture de tema: cada teste que usa `theme` roda duas vezes (describe por tema no spec).
 * Seta a preferência ANTES do app carregar, como o usuário teria feito na tela 16.
 */
export const test = base.extend<{ theme: Theme }>({
  theme: ["claro", { option: true }],
  page: async ({ page, theme }, use) => {
    await page.addInitScript((t) => {
      localStorage.setItem("elev.theme", t);
    }, theme);
    await use(page);
  },
});

export const expect = test.expect;

/** Helper: roda o mesmo bloco nos dois temas. */
export function emAmbosTemas(
  titulo: string,
  fn: (args: { theme: Theme }) => void
): void {
  for (const theme of ["claro", "escuro"] as const) {
    test.describe(`${titulo} · tema ${theme}`, () => {
      test.use({ theme });
      fn({ theme });
    });
  }
}
