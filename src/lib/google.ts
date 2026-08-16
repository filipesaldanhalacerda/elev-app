/** F2-03 · Agenda Google — conversa com o worker (/api/google/*). */
import { useEffect, useState } from "react";
import { workerFetch } from "./auth";

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  mode: "real" | "simulado";
}

export interface GoogleEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  account_code: string | null;
  origin: "elev" | "google";
  status: "confirmado" | "cancelado";
  clients?: { name?: string } | { name?: string }[] | null;
}

export function eventClientName(e: GoogleEvent): string | null {
  const c = Array.isArray(e.clients) ? e.clients[0] : e.clients;
  return c?.name ?? null;
}

export function useGoogleStatus() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const load = async () => {
    try {
      setStatus((await workerFetch("/api/google/status")) as GoogleStatus);
    } catch {
      setStatus({ connected: false, email: null, mode: "simulado" });
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return { status, reload: load };
}

/** Conecta: no modo real devolve a URL de consentimento do Google (redirecionar); no simulado conecta na hora. */
export async function connectGoogle(): Promise<{ url?: string; connected?: boolean; email?: string }> {
  return (await workerFetch("/api/google/connect", { method: "POST" })) as { url?: string; connected?: boolean; email?: string };
}

export async function disconnectGoogle(): Promise<void> {
  await workerFetch("/api/google/disconnect", { method: "POST" });
}

export async function listEvents(): Promise<GoogleEvent[]> {
  const body = (await workerFetch("/api/google/events")) as { events: GoogleEvent[] };
  return body.events;
}

export async function createEvent(ev: { title: string; starts_at: string; ends_at: string; account_code?: string | null }): Promise<void> {
  await workerFetch("/api/google/events", { method: "POST", body: JSON.stringify(ev) });
}

export async function updateEvent(id: string, patch: { title?: string; starts_at?: string; ends_at?: string; account_code?: string | null }): Promise<void> {
  await workerFetch(`/api/google/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function cancelEvent(id: string): Promise<void> {
  await workerFetch(`/api/google/events/${id}`, { method: "DELETE" });
}

