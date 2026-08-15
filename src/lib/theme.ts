/**
 * Tema claro/escuro/sistema (tela 16). O tema vive no atributo data-theme do <html>;
 * "sistema" segue prefers-color-scheme. Persistido em localStorage.
 */

export type ThemePreference = "claro" | "escuro" | "sistema";

const STORAGE_KEY = "elev.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "claro" || stored === "escuro" || stored === "sistema") return stored;
  return "sistema";
}

export function setThemePreference(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function applyTheme(pref: ThemePreference = getThemePreference()): void {
  const dark = pref === "escuro" || (pref === "sistema" && media.matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function initTheme(): void {
  applyTheme();
  media.addEventListener("change", () => {
    if (getThemePreference() === "sistema") applyTheme();
  });
}
