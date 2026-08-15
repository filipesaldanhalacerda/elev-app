/** Série local para sparklines (mesma matemática determinística do Worker). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function fakeSeriesLocal(symbol: string, points = 28): number[] {
  const seed = hash(symbol.toUpperCase());
  const minutes = Math.floor(Date.now() / 60000);
  const out: number[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const m = minutes - i * 12;
    out.push(1 + Math.sin(m / 37 + seed * 40) * 0.012 + Math.sin(m / 9 + seed * 13) * 0.004);
  }
  return out;
}
