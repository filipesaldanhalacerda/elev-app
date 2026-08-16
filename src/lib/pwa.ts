/**
 * Instalação do PWA: captura o beforeinstallprompt UMA vez no carregamento
 * e expõe helpers para qualquer tela (banner da tela 26, cartão do Perfil).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** true quando o navegador ofereceu o prompt nativo (Android/desktop Chrome). */
export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  deferred = null;
  listeners.forEach((l) => l());
  return true;
}

export function onInstallAvailability(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
