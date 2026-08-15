/**
 * Offline do PWA (tela 24): dados congelados com horário visível e
 * escritas guardadas no aparelho, sincronizadas quando a rede volta.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const QUEUE_KEY = "elev.fila.anotacoes";
const LAST_DATA_KEY = "elev.ultimo-dado-em";

export function markDataFresh() {
  localStorage.setItem(LAST_DATA_KEY, String(Date.now()));
}

export function lastDataAt(): Date | null {
  const v = localStorage.getItem(LAST_DATA_KEY);
  return v ? new Date(Number(v)) : null;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    if (online) markDataFresh();
  }, [online]);
  return online;
}

export interface QueuedNote {
  account: string;
  advisorCode: string;
  body: string;
  at: number;
}

export function getQueue(): QueuedNote[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedNote[];
  } catch {
    return [];
  }
}

export function enqueueNote(note: QueuedNote) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...getQueue(), note]));
  window.dispatchEvent(new Event("elev-queue-changed"));
}

/** Esvazia a fila quando a rede volta. */
export async function flushQueue(userId: string): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;
  let sent = 0;
  const remaining: QueuedNote[] = [];
  for (const note of queue) {
    const { error } = await supabase.from("timeline_notes").insert({
      account_code: note.account,
      advisor_code: note.advisorCode,
      author: userId,
      body: note.body,
    });
    if (error) remaining.push(note);
    else sent++;
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new Event("elev-queue-changed"));
  return sent;
}

export function useQueueCount(): number {
  const [count, setCount] = useState(getQueue().length);
  useEffect(() => {
    const update = () => setCount(getQueue().length);
    window.addEventListener("elev-queue-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("elev-queue-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return count;
}
