/**
 * Provedor de cotações do Worker.
 * - modo "fake" (dev/testes): simulador determinístico — sem METAAPI_TOKEN configurado.
 * - modo "metaapi" (produção): conecta na conta MT5 do admin via metaapi.cloud usando
 *   exatamente os 3 campos da tela 18 (login, senha, servidor).
 * O app nunca fala com o provedor: só com estes endpoints, sob JWT.
 */

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  changePct: number;
  /** DI futuro varia em pontos-percentuais */
  unit: "preco" | "pp";
  at: string;
  /** série diária real (último mês) quando a fonte fornece */
  series?: number[];
}

const KNOWN: Record<string, { name: string; base: number; unit?: "pp"; decimals?: number }> = {
  IBOV: { name: "IBOVESPA", base: 134287, decimals: 0 },
  DOLAR: { name: "Dólar americano (USD/BRL)", base: 5.18 },
  WDOU26: { name: "Dólar mini · out/26", base: 5412.5, decimals: 2 },
  WINV26: { name: "Índice mini · nov/26", base: 134410, decimals: 0 },
  DI1F27: { name: "DI futuro · jan/27", base: 10.84, unit: "pp" },
  PETR4: { name: "Petrobras PN", base: 38.42 },
  VALE3: { name: "Vale ON", base: 61.08 },
  BBAS3: { name: "Banco do Brasil ON", base: 28.74 },
  ITUB4: { name: "Itaú Unibanco PN", base: 33.9 },
  HGLG11: { name: "CSHG Logística FII", base: 158.2 },
  BOVA11: { name: "iShares Ibovespa", base: 129.4 },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Preço simulado: caminhada suave determinística por símbolo e minuto. */
export function fakeQuote(symbolRaw: string, now = new Date()): Quote {
  const symbol = symbolRaw.toUpperCase();
  const known = KNOWN[symbol];
  const seed = hash(symbol);
  const base = known?.base ?? Math.round((5 + seed * 200) * 100) / 100;
  const decimals = known?.decimals ?? 2;
  const minutes = Math.floor(now.getTime() / 60000);
  const wave = (m: number) => Math.sin(m / 37 + seed * 40) * 0.012 + Math.sin(m / 9 + seed * 13) * 0.004;
  const openMinutes = Math.floor(now.getTime() / 86400000) * 1440; // meia-noite UTC como âncora do dia
  const prevClose = base * (1 + wave(openMinutes - 300));
  const open = base * (1 + wave(openMinutes + 600));
  const price = base * (1 + wave(minutes));
  let high = open;
  let low = open;
  for (let m = openMinutes + 600; m <= minutes; m += 15) {
    const p = base * (1 + wave(m));
    if (p > high) high = p;
    if (p < low) low = p;
  }
  const round = (v: number) => Number(v.toFixed(decimals));
  const changePct = known?.unit === "pp" ? Number((price - prevClose).toFixed(2)) : Number((((price - prevClose) / prevClose) * 100).toFixed(2));
  return {
    symbol,
    name: known?.name ?? `${symbol} · B3`,
    price: round(price),
    open: round(open),
    high: round(Math.max(high, price)),
    low: round(Math.min(low, price)),
    prevClose: round(prevClose),
    changePct,
    unit: known?.unit ?? "preco",
    at: now.toISOString(),
  };
}

/** Série intradiária simulada para gráficos. */
export function fakeSeries(symbolRaw: string, points = 28, now = new Date()): number[] {
  const symbol = symbolRaw.toUpperCase();
  const seed = hash(symbol);
  const base = KNOWN[symbol]?.base ?? 5 + seed * 200;
  const minutes = Math.floor(now.getTime() / 60000);
  const out: number[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const m = minutes - i * 12;
    out.push(base * (1 + Math.sin(m / 37 + seed * 40) * 0.012 + Math.sin(m / 9 + seed * 13) * 0.004));
  }
  return out;
}

// ---------- Provedor real: brapi.dev (dados da B3, ~15 min de atraso) ----------
// Plano grátis: 1 ativo por requisição e 15 mil requisições/mês — por isso o
// cache de 5 minutos por símbolo. Símbolos fora da brapi (futuros WDO/DI) caem
// no simulador, marcado pelo nome, até termos provedor de derivativos.

const BRAPI_TTL_MS = 5 * 60 * 1000;
const brapiCache = new Map<string, { quote: Quote; series?: number[]; fetchedAt: number }>();

/** IBOV na brapi é o índice ^BVSP. */
const toBrapiSymbol = (s: string) => (s === "IBOV" ? "^BVSP" : s);

interface BrapiResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: string;
  historicalDataPrice?: { close: number }[];
}

function brapiToQuote(symbol: string, r: BrapiResult): Quote | null {
  if (typeof r.regularMarketPrice !== "number") return null;
  const prevClose = r.regularMarketPreviousClose ?? r.regularMarketPrice;
  return {
    symbol,
    name: KNOWN[symbol]?.name ?? r.shortName ?? r.longName ?? `${symbol} · B3`,
    price: r.regularMarketPrice,
    open: r.regularMarketOpen ?? prevClose,
    high: r.regularMarketDayHigh ?? r.regularMarketPrice,
    low: r.regularMarketDayLow ?? r.regularMarketPrice,
    prevClose,
    changePct: Number((r.regularMarketChangePercent ?? 0).toFixed(2)),
    unit: "preco",
    at: r.regularMarketTime ?? new Date().toISOString(),
  };
}

/** Busca UM símbolo na brapi com cache; null = símbolo indisponível lá. */
async function brapiFetchOne(symbol: string, token: string): Promise<Quote | null> {
  const hit = brapiCache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < BRAPI_TTL_MS) return hit.quote;
  try {
    // range=1mo (diário) vem junto no mesmo request: sparkline e gráfico REAIS
    const res = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(toBrapiSymbol(symbol))}?token=${token}&range=1mo`);
    if (!res.ok) return hit?.quote ?? null; // limite/erro: serve o cache velho se houver
    const body = (await res.json()) as { results?: BrapiResult[] };
    const quote = body.results?.[0] ? brapiToQuote(symbol, body.results[0]) : null;
    if (!quote) return null;
    const series = body.results?.[0]?.historicalDataPrice?.map((p) => p.close).filter((v) => typeof v === "number");
    if (series && series.length >= 8) quote.series = series;
    brapiCache.set(symbol, { quote, fetchedAt: Date.now() });
    return quote;
  } catch {
    return hit?.quote ?? null;
  }
}

/** Dólar comercial REAL via AwesomeAPI (gratuita, sem chave), com a mesma vida de cache. */
async function dolarFetch(): Promise<Quote | null> {
  const hit = brapiCache.get("DOLAR");
  if (hit && Date.now() - hit.fetchedAt < BRAPI_TTL_MS) return hit.quote;
  try {
    const [lastRes, dailyRes] = await Promise.all([
      fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL"),
      fetch("https://economia.awesomeapi.com.br/json/daily/USD-BRL/22"),
    ]);
    if (!lastRes.ok) return hit?.quote ?? null;
    const last = ((await lastRes.json()) as Record<string, { bid: string; high: string; low: string; varBid: string; pctChange: string; timestamp: string }>).USDBRL;
    if (!last) return null;
    const price = Number(last.bid);
    const prevClose = Number((price - Number(last.varBid)).toFixed(4));
    const quote: Quote = {
      symbol: "DOLAR",
      name: "Dólar americano (USD/BRL)",
      price,
      open: prevClose,
      high: Number(last.high),
      low: Number(last.low),
      prevClose,
      changePct: Number(Number(last.pctChange).toFixed(2)),
      unit: "preco",
      at: new Date(Number(last.timestamp) * 1000).toISOString(),
    };
    if (dailyRes.ok) {
      const daily = (await dailyRes.json()) as { bid: string }[];
      const series = daily.map((d) => Number(d.bid)).filter((v) => Number.isFinite(v)).reverse();
      if (series.length >= 8) quote.series = series;
    }
    brapiCache.set("DOLAR", { quote, fetchedAt: Date.now() });
    return quote;
  } catch {
    return hit?.quote ?? null;
  }
}

const isDerivative = (s: string) => KNOWN[s]?.unit === "pp" || /^(WDO|WIN|DI1|DOL[FGHJKMNQUVXZ]|IND)/.test(s);

/**
 * Cotações REAIS — nunca inventadas: símbolo sem fonte fica FORA da resposta.
 * (derivativos de balcão só entram quando houver provedor contratado)
 */
export async function realQuotes(symbols: string[], token: string): Promise<Quote[]> {
  const out = await Promise.all(
    symbols.map(async (s) => {
      if (s === "DOLAR") return dolarFetch();
      if (isDerivative(s)) return null;
      return brapiFetchOne(s, token);
    })
  );
  return out.filter((q): q is Quote => q !== null);
}

/** Detalhe real; null = ativo indisponível na fonte (o app avisa com honestidade). */
export async function realDetail(symbol: string, token: string): Promise<{ quote: Quote; series: number[] } | null> {
  const quote = symbol === "DOLAR" ? await dolarFetch() : isDerivative(symbol) ? null : await brapiFetchOne(symbol, token);
  if (!quote) return null;
  return { quote, series: quote.series ?? [] };
}

// ---------- Simulador do "Testar conexão" (tela 18) ----------
// Regras determinísticas do modo dev; em produção o adaptador MetaApi substitui isto.
export interface MtTestResult {
  ok: boolean;
  code?: "AUTH_FAILED" | "SERVER_NOT_FOUND";
  responseSeconds?: number;
}

export function fakeMtTest(login: string, password: string, server: string): MtTestResult {
  if (!/^XPMT5-/i.test(server.trim())) return { ok: false, code: "SERVER_NOT_FOUND" };
  if (!login.trim() || password === "senha-errada") return { ok: false, code: "AUTH_FAILED" };
  return { ok: true, responseSeconds: 0.2 };
}
