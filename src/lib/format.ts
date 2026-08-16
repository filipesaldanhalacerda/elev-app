/**
 * Formatação pt-BR — regras de handoff/01-fundacoes.md e da spec:
 * R$ 1.234.567,89 · dd/mm/aaaa · hh:mm · fuso America/Sao_Paulo · tabular-nums no CSS.
 */

export const TIMEZONE = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal2 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const dateBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIMEZONE,
});

const timeBR = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});

const timeWithSecondsBR = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: TIMEZONE,
});

/** R$ 1.234.567,89 (espaço normal entre R$ e o valor) */
export function formatBRL(value: number): string {
  return brl.format(value).replace(/ /g, " ");
}

/** 1.234.567,89 sem símbolo */
export function formatDecimal(value: number): string {
  return decimal2.format(value);
}

/** 1.234 inteiro */
export function formatInt(value: number): string {
  return integer.format(value);
}

/** Movimentações: NEUTRO com sinal explícito — +R$ 1.000,00 / −R$ 500,00 (sinal menos tipográfico U+2212) */
export function formatSignedBRL(value: number): string {
  const abs = formatBRL(Math.abs(value));
  if (value < 0) return `−${abs}`;
  return `+${abs}`;
}

/** +1,25% / −0,80% (para variação; cor de mercado é decisão do componente, nunca desta função) */
export function formatPct(value: number, digits = 2): string {
  const abs = Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value < 0 ? "−" : "+";
  return `${sign}${abs}%`;
}

/** dd/mm/aaaa */
export function formatDate(date: Date | string | number): string {
  return dateBR.format(toDate(date));
}

/** hh:mm */
export function formatTime(date: Date | string | number): string {
  return timeBR.format(toDate(date));
}

/** hh:mm:ss (cotações "ao vivo") */
export function formatTimeSeconds(date: Date | string | number): string {
  return timeWithSecondsBR.format(toDate(date));
}

/** dd/mm às hh:mm (padrão dos quadros, ex.: "de 14/08 às 18:20") */
export function formatDateAtTime(date: Date | string | number): string {
  const d = toDate(date);
  const dm = dateBR.format(d).slice(0, 5);
  return `${dm} às ${timeBR.format(d)}`;
}

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // data pura: meio-dia UTC evita deslocar o dia no fuso de São Paulo
    return new Date(`${value}T12:00:00Z`);
  }
  return new Date(value);
}

/**
 * Regra de ouro dos códigos de assessor: A31342 e 31342 são o MESMO assessor.
 * Forma canônica = dígitos, sem prefixo "A" e sem zeros à esquerda espúrios.
 */
export function normalizeAdvisorCode(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^A?[\s-]?(\d+)$/);
  if (!m) return null;
  return String(Number(m[1]));
}

/** Exibição do código do assessor no padrão dos quadros ("A-0871", tela 16/19) */
export function displayAdvisorCode(code: string): string {
  return `A-${code}`;
}

/** Iniciais para avatar (2 letras, como nos cards de cliente) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Máscara progressiva de telefone BR (F2-05): (11) 98812-4402 · (11) 3812-4402 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Validação de e-mail (F2-06): formato usuario@dominio.tld */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Soma minutos a um "HH:MM" (trava em 23:59). */
export function addMinutes(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Rótulo curto de duração: 30 min · 1h · 1h30 · 2h */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Próximo horário "redondo" à frente (meia em meia hora), no fuso do produto.
 *  Antes das 08:00 sugere 08:00; depois das 19:00 rola para amanhã às 08:00. */
export function nextSlotSP(marginMin = 5): { day: string; start: string } {
  const t = new Date(Date.now() + marginMin * 60000);
  const day = t.toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
  const [h, m] = t
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE })
    .split(":")
    .map(Number);
  let mins = Math.ceil((h * 60 + m) / 30) * 30;
  if (mins < 8 * 60) mins = 8 * 60;
  if (mins > 19 * 60) {
    return { day: new Date(t.getTime() + 86400000).toLocaleDateString("sv-SE", { timeZone: TIMEZONE }), start: "08:00" };
  }
  return { day, start: `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}` };
}
