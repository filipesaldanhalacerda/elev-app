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
