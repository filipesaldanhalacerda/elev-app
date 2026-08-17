/** Cliente de cotações (tela 11): consulta o Worker sob o JWT do usuário. */
import { useEffect, useRef, useState } from "react";
import { workerFetch } from "./auth";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  changePct: number;
  unit: "preco" | "pp";
  at: string;
}

export interface QuotesResponse {
  paused: boolean;
  source?: "brapi" | "simulado";
  last_quote_at: string | null;
  quotes: Quote[];
}

const CACHE_KEY = "elev.quotes.cache";
export const RECENT_KEY = "elev.quotes.recentes";

export function useQuotes(symbols: string[], refreshMs = 15000) {
  const [data, setData] = useState<QuotesResponse | null>(null);
  const [tick, setTick] = useState(0);
  const prev = useRef<Map<string, number>>(new Map());
  const [flashes, setFlashes] = useState<Map<string, "up" | "down">>(new Map());
  const key = symbols.join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = async () => {
      try {
        const body = (await workerFetch(`/api/quotes?symbols=${encodeURIComponent(key)}`)) as QuotesResponse;
        if (!alive) return;
        // flash ÚNICO por mudança de preço (400ms, some sozinho)
        const nextFlashes = new Map<string, "up" | "down">();
        for (const q of body.quotes) {
          const before = prev.current.get(q.symbol);
          if (before !== undefined && before !== q.price) nextFlashes.set(q.symbol, q.price > before ? "up" : "down");
          prev.current.set(q.symbol, q.price);
        }
        if (nextFlashes.size > 0) {
          setFlashes(nextFlashes);
          setTimeout(() => alive && setFlashes(new Map()), 450);
        }
        setData(body);
        if (!body.paused && body.quotes.length > 0) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), quotes: body.quotes }));
        }
      } catch {
        if (alive) setData((d) => d ?? { paused: true, last_quote_at: null, quotes: [] });
      }
    };
    void load();
    const t = setInterval(() => setTick((v) => v + 1), refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const cached = (() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { at: number; quotes: Quote[] } | null;
    } catch {
      return null;
    }
  })();

  return { data, flashes, cached };
}

export function useQuoteDetail(symbol: string | null) {
  const [data, setData] = useState<{ paused: boolean; quote?: Quote; series?: number[] } | null>(null);
  useEffect(() => {
    if (!symbol) {
      setData(null);
      return;
    }
    let alive = true;
    setData(null);
    workerFetch(`/api/quotes/detail?symbol=${encodeURIComponent(symbol)}`)
      .then((body) => alive && setData(body as { paused: boolean; quote?: Quote; series?: number[] }))
      .catch(() => alive && setData({ paused: true }));
    return () => {
      alive = false;
    };
  }, [symbol]);
  return data;
}

export function pushRecent(symbol: string) {
  const list = getRecents().filter((s) => s !== symbol);
  list.unshift(symbol);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
}

export function getRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Futuros (WDOU26, DI1F27, WINV26…) têm dígitos de vencimento no fim. */
export const isFuture = (symbol: string) => /^(WDO|WIN|DI1|DOL|IND)[A-Z]\d{2}$/.test(symbol);

/** pt-BR sem R$ para índices/futuros (134.287 · 5.412,50) */
export function formatQuotePrice(q: Quote): string {
  if (q.unit === "pp") return `${q.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`;
  const decimals = q.price >= 1000 && Number.isInteger(q.price) ? 0 : 2;
  return q.price.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatQuoteChange(q: Quote): string {
  const abs = Math.abs(q.changePct).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${q.changePct >= 0 ? "+" : "-"}${abs}${q.unit === "pp" ? " pp" : "%"}`;
}
