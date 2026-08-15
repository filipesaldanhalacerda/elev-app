/** Assinatura de Web Push do aparelho (telas 16/25). */
import { workerFetch } from "./auth";

export async function subscribeDevice(): Promise<"ok" | "denied" | "unsupported" | "no-key"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const { key } = (await workerFetch("/api/push/key")) as { key: string | null };
  if (!key) return "no-key"; // dev sem VAPID: preferências valem, push entra com as chaves de produção
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await workerFetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return "ok";
}
