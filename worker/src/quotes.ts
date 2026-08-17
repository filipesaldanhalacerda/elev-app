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
}

const KNOWN: Record<string, { name: string; base: number; unit?: "pp"; decimals?: number }> = {
  IBOV: { name: "IBOVESPA", base: 134287, decimals: 0 },
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

/** Busca UM símbolo na brapi com cache; null = símbolo indisponível lá (usar fallback). */
async function brapiFetchOne(symbol: string, token: string, withSeries = false): Promise<{ quote: Quote; series?: number[] } | null> {
  const hit = brapiCache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < BRAPI_TTL_MS && (!withSeries || hit.series)) {
    return { quote: hit.quote, series: hit.series };
  }
  try {
    const params = withSeries ? "&range=1mo" : ""; // intraday não existe no plano grátis; 1mo dá a série diária real
    const res = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(toBrapiSymbol(symbol))}?token=${token}${params}`);
    if (!res.ok) return hit ? { quote: hit.quote, series: hit.series } : null; // limite/erro: serve o cache velho se houver
    const body = (await res.json()) as { results?: BrapiResult[] };
    const quote = body.results?.[0] ? brapiToQuote(symbol, body.results[0]) : null;
    if (!quote) return null;
    const series = body.results?.[0]?.historicalDataPrice?.map((p) => p.close).filter((v) => typeof v === "number");
    const entry = { quote, series: series && series.length >= 8 ? series : hit?.series, fetchedAt: Date.now() };
    brapiCache.set(symbol, entry);
    return { quote: entry.quote, series: entry.series };
  } catch {
    return hit ? { quote: hit.quote, series: hit.series } : null;
  }
}

/** Cotações reais quando há BRAPI_TOKEN; cada símbolo indisponível cai no simulador. */
export async function realQuotes(symbols: string[], token: string, now = new Date()): Promise<Quote[]> {
  return Promise.all(
    symbols.map(async (s) => {
      if (KNOWN[s]?.unit === "pp" || /^(WDO|WIN|DI1|DOL|IND)/.test(s)) return fakeQuote(s, now); // derivativos: fora da brapi
      const real = await brapiFetchOne(s, token);
      return real?.quote ?? fakeQuote(s, now);
    })
  );
}

export async function realDetail(symbol: string, token: string, now = new Date()): Promise<{ quote: Quote; series: number[] }> {
  if (KNOWN[symbol]?.unit === "pp" || /^(WDO|WIN|DI1|DOL|IND)/.test(symbol)) {
    return { quote: fakeQuote(symbol, now), series: fakeSeries(symbol) };
  }
  const real = await brapiFetchOne(symbol, token, true);
  if (!real) return { quote: fakeQuote(symbol, now), series: fakeSeries(symbol) };
  // SEM série real não inventamos gráfico: o app mostra a régua do dia (dados reais)
  return { quote: real.quote, series: real.series ?? [] };
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
