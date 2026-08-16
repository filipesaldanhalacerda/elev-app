/**
 * Gráficos (#2f + regras de 01-fundacoes.md):
 * linha única sem preenchimento; grade em divider; eixo Mono 10px;
 * patrimônio em brand (NUNCA cores de mercado); sparkline na cor de mercado do período;
 * donut em 4 passos com filete de 1,2% na cor do card.
 */

interface LineChartProps {
  /** valores normalizados (qualquer escala) */
  points: number[];
  height?: number;
  /** rótulos do eixo do tempo (Mono 10px, espaçados) */
  axis?: string[];
  /** stroke — padrão série patrimonial em brand */
  stroke?: string;
  /** linha tracejada horizontal (ex.: abertura na tela 11), em fração 0–1 da altura */
  dashedAt?: number;
}

export function LineChart({ points, height = 92, axis, stroke = "var(--chart-line, #1F7355)", dashedAt }: LineChartProps) {
  const W = 300;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 8;
  const usable = height - pad * 2;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = pad + usable - ((v - min) / span) * usable;
    return [x, y] as const;
  });
  const last = coords[coords.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1={pad} x2={W} y2={pad} stroke="var(--divider)" strokeWidth="1" />
        <line x1="0" y1={height / 2} x2={W} y2={height / 2} stroke="var(--divider)" strokeWidth="1" />
        <line x1="0" y1={height - pad} x2={W} y2={height - pad} stroke="var(--border)" strokeWidth="1" />
        {dashedAt !== undefined && (
          <line
            x1="0"
            y1={pad + usable - dashedAt * usable}
            x2={W}
            y2={pad + usable - dashedAt * usable}
            stroke="var(--border-strong)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}
        <polyline
          points={coords.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1].toFixed(1)} r="3" fill={stroke} />
      </svg>
      {axis && (
        <div className="chart-axis">
          {axis.map((a, i) => (
            <span key={`${i}-${a}`}>{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface SparklineProps {
  points: number[];
  /** cor de mercado do período */
  up: boolean;
  width?: number;
  height?: number;
}

export function Sparkline({ points, up, width = 64, height = 26 }: SparklineProps) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((v, i) => `${((i / (points.length - 1)) * width).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display: "block" }} aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke={`var(--market-${up ? "up" : "down"})`}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  pct: number;
}

/** Donut 4 passos (#2f): conic-gradient com filete de 1,2% na cor do card entre fatias. */
export function Donut({ slices, size = 74, hole = 44 }: { slices: DonutSlice[]; size?: number; hole?: number }) {
  const GAP = 1.2;
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
  let acc = 0;
  const stops: string[] = [];
  slices.forEach((s, i) => {
    const start = acc;
    const end = acc + s.pct - GAP;
    stops.push(`${colors[i % 4]} ${start}% ${end}%`);
    stops.push(`var(--surface) ${end}% ${acc + s.pct}%`);
    acc += s.pct;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="donut" style={{ width: size, height: size, background: `conic-gradient(${stops.join(",")})` }} aria-hidden>
        <span className="donut__hole" style={{ width: hole, height: hole }} />
      </span>
      <span className="donut-legend">
        {slices.map((s, i) => (
          <span key={s.label} className="donut-legend__item">
            <span className="donut-legend__swatch" style={{ background: colors[i % 4] }} />
            {s.label} {s.pct}%
          </span>
        ))}
      </span>
    </div>
  );
}
