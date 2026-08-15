/**
 * Importadores dos 4 relatórios essenciais da XP (tela 21).
 * A estrutura de colunas dos arquivos reais é a fonte da verdade (analisada na E0):
 *  - Positivador mensal: cabeçalho na linha 1, colunas DSC_/VAL_/DAT_ (47)
 *  - Positivador semanal: 2 linhas de totais ANTES do cabeçalho em português (44)
 *  - Diversificação: 11 colunas DSC_/VAL_/DAT_
 *  - Captação: 9 colunas (valor com sinal, C/D)
 *  - Saldo Consolidado: Conta · Cliente · Assessor · D0..D+3 · Total (único com nome)
 * Detecção automática + pré-visualização; NADA é gravado antes da confirmação.
 */
import * as XLSX from "xlsx";

export type ImportKind = "positivador" | "diversificacao" | "captacao" | "saldo_consolidado";
export type PositivadorVariant = "mensal" | "semanal";

export interface ImportWarning {
  level: "warning" | "info";
  title: string;
  text: string;
  /** rótulo do botão acionável ("Baixar lista" / "Ver clientes") */
  action?: string;
  /** linhas CSV para o download acionável */
  csv?: string[][];
}

export interface ParsedImport {
  kind: ImportKind;
  variant: PositivadorVariant | null;
  kindLabel: string;
  refDate: string; // yyyy-mm-dd
  rows: Record<string, unknown>[];
  validCount: number;
  invalidCount: number;
  advisorCodes: string[]; // códigos normalizados presentes no arquivo
  extraColumns: string[]; // colunas fora do modelo (guardadas sem processar)
  sample: { name: string | null; account: string; value: number | null }[];
  warnings: ImportWarning[];
  fileHash: string;
}

export const KIND_LABELS: Record<ImportKind, string> = {
  positivador: "Positivador",
  diversificacao: "Diversificação",
  captacao: "Captação",
  saldo_consolidado: "Saldo Consolidado",
};

/** A31342 = 31342 (mesma regra do banco). */
export function normalizeAdvisor(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^A?[\s-]?(\d+)$/);
  return m ? String(Number(m[1])) : null;
}

function normAccount(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\D/g, "");
  return s.length > 0 ? s : null;
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim();
  // com vírgula = formato pt-BR (1.234,56); sem vírgula = ponto é decimal (613886.68)
  const cleaned = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(cleaned.replace(/[^\d.eE-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toISODate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    // serial do Excel
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

async function hashFile(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lê a planilha como matriz de valores brutos. */
function sheetRows(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

interface Detected {
  kind: ImportKind;
  variant: PositivadorVariant | null;
  headerRow: number;
  headers: string[];
}

function detect(rows: unknown[][]): Detected | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const headers = (rows[i] ?? []).map((c) => (c === null ? "" : String(c).trim()));
    const has = (h: string) => headers.some((x) => x.toLowerCase() === h.toLowerCase());
    if (has("DSC_PRODUTO") && has("VAL_QUANTIDADE")) return { kind: "diversificacao", variant: null, headerRow: i, headers };
    if (has("DSC_TIPO_CAPTACAO") || has("QTD_CAPTACAO")) return { kind: "captacao", variant: null, headerRow: i, headers };
    if (has("DSC_ASSESSOR") && has("VAL_NET_EM_M")) return { kind: "positivador", variant: "mensal", headerRow: i, headers };
    if (has("Assessor") && (has("Net Em M") || has("Net em M"))) return { kind: "positivador", variant: "semanal", headerRow: i, headers };
    if (has("Conta") && has("Cliente") && has("D0")) return { kind: "saldo_consolidado", variant: null, headerRow: i, headers };
  }
  return null;
}

const MENSAL_MODEL = new Set([
  "DSC_ASSESSOR","COD_CLIENTE","DSC_PROFISSAO","DSC_SEXO","DSC_SEGMENTO","DSC_SEGMENTACAO_CLIENTE","DSC_SUITABILITY",
  "DSC_TERMO_QUALIFICADO","DSC_TERMO_PROFISSIONAL","DAT_DATA_CADASTRO","DSC_FEZ_SEGUNDO_APORTE","DAT_DATA_NASCIMENTO",
  "DSC_STATUS","DSC_ATIVOU_EM_M","DSC_EVADIU_EM_M","DSC_OPEROU_BOLSA","DSC_OPEROU_FUNDOS","DSC_OPEROU_RENDA_FIXA",
  "VAL_APLICACOES_FINANCEIRAS","VAL_RECEITA_MES","VAL_RECEITA_BOVESPA","VAL_RECEITA_FUTUROS","VAL_RECEITA_RF_BANCARIOS",
  "VAL_RECEITA_RF_PRIVADOS","VAL_RECEITA_RF_PUBLICOS","VAL_CAPTACAO_BRUTA_EM_M","VAL_RESGATE_EM_M","VAL_CAPTACAO_LIQUIDA_EM_M",
  "VAL_CAPTACAO_TED","VAL_CAPTACAO_ST","VAL_CAPTACAO_OTA","VAL_CAPTACAO_RF","VAL_CAPTACAO_TD","VAL_CAPTACAO_PREV",
  "VAL_NET_EM_M1","VAL_NET_EM_M","VAL_NET_RENDA_FIXA","VAL_NET_FUNDOS_IMOBILIARIOS","VAL_NET_RENDA_VARIAVEL","VAL_NET_FUNDOS",
  "VAL_NET_FINANCEIRO","VAL_NET_PREVIDENCIA","VAL_NET_OUTROS","VAL_RECEITA_ALUGUEL","VAL_RECEITA_COMPLEMENTO_PACOTE",
  "DSC_TIPO_PESSOA","DAT_DATA_FATO",
]);

const SEMANAL_MAP: Record<string, string> = {
  "Assessor": "DSC_ASSESSOR", "Cliente": "COD_CLIENTE", "Profissão": "DSC_PROFISSAO", "Sexo": "DSC_SEXO",
  "Segmento": "DSC_SEGMENTO", "Data de Cadastro": "DAT_DATA_CADASTRO", "Fez Segundo Aporte?": "DSC_FEZ_SEGUNDO_APORTE",
  "Data de Nascimento": "DAT_DATA_NASCIMENTO", "Status": "DSC_STATUS", "Ativou em M?": "DSC_ATIVOU_EM_M",
  "Evadiu em M?": "DSC_EVADIU_EM_M", "Operou Bolsa?": "DSC_OPEROU_BOLSA", "Operou Fundo?": "DSC_OPEROU_FUNDOS",
  "Operou Renda Fixa?": "DSC_OPEROU_RENDA_FIXA",
  "Aplicação Financeira Declarada": "VAL_APLICACOES_FINANCEIRAS",
  "Aplicação Financeira Declarada Ajustada": "VAL_APLICACOES_FINANCEIRAS",
  "Receita no Mês": "VAL_RECEITA_MES", "Receita Bovespa": "VAL_RECEITA_BOVESPA", "Receita Futuros": "VAL_RECEITA_FUTUROS",
  "Receita RF Bancários": "VAL_RECEITA_RF_BANCARIOS", "Receita RF Privados": "VAL_RECEITA_RF_PRIVADOS",
  "Receita RF Públicos": "VAL_RECEITA_RF_PUBLICOS", "Captação Bruta em M": "VAL_CAPTACAO_BRUTA_EM_M",
  "Resgate em M": "VAL_RESGATE_EM_M", "Captação Líquida em M": "VAL_CAPTACAO_LIQUIDA_EM_M", "Captação TED": "VAL_CAPTACAO_TED",
  "Captação ST": "VAL_CAPTACAO_ST", "Captação OTA": "VAL_CAPTACAO_OTA", "Captação RF": "VAL_CAPTACAO_RF",
  "Captação TD": "VAL_CAPTACAO_TD", "Captação PREV": "VAL_CAPTACAO_PREV", "Net em M 1": "VAL_NET_EM_M1",
  "Net Em M": "VAL_NET_EM_M", "Net Renda Fixa": "VAL_NET_RENDA_FIXA", "Net Fundos Imobiliários": "VAL_NET_FUNDOS_IMOBILIARIOS",
  "Net Renda Variável": "VAL_NET_RENDA_VARIAVEL", "Net Fundos": "VAL_NET_FUNDOS", "Net Financeiro": "VAL_NET_FINANCEIRO",
  "Net Previdência": "VAL_NET_PREVIDENCIA", "Net Outros": "VAL_NET_OUTROS", "Receita Aluguel": "VAL_RECEITA_ALUGUEL",
  "Receita Complemento Pacote Corretagem": "VAL_RECEITA_COMPLEMENTO_PACOTE", "Tipo Pessoa": "DSC_TIPO_PESSOA",
  "Data Posição": "DAT_DATA_FATO", "Data Atualização": "DAT_DATA_ATUALIZACAO",
};

/** Objeto por linha usando o cabeçalho detectado (semanal é convertido às chaves DSC_/VAL_). */
function objectRows(rows: unknown[][], det: Detected): Record<string, unknown>[] {
  const keys = det.headers.map((h) => (det.variant === "semanal" ? SEMANAL_MAP[h] ?? h : h));
  const out: Record<string, unknown>[] = [];
  for (let i = det.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null || c === "")) continue;
    const obj: Record<string, unknown> = {};
    keys.forEach((k, j) => {
      if (k) obj[k] = row[j] ?? null;
    });
    out.push(obj);
  }
  return out;
}

export async function parseReportFile(file: { name: string; buffer: ArrayBuffer }): Promise<ParsedImport> {
  const matrix = sheetRows(file.buffer);
  const det = detect(matrix);
  if (!det) throw new Error("Não reconhecemos este arquivo como um dos quatro relatórios essenciais.");
  const fileHash = await hashFile(file.buffer);
  const objs = objectRows(matrix, det);
  const warnings: ImportWarning[] = [];
  const advisorSet = new Set<string>();
  const invalid: string[][] = [];
  const rows: Record<string, unknown>[] = [];
  let refDate: string | null = null;

  const pushInvalid = (i: number, motivo: string) => invalid.push([String(i + det.headerRow + 2), motivo]);

  if (det.kind === "positivador") {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const account = normAccount(o["COD_CLIENTE"]);
      const advisor = normalizeAdvisor(o["DSC_ASSESSOR"]);
      if (!account) {
        pushInvalid(i, "sem número de conta");
        continue;
      }
      if (advisor) advisorSet.add(advisor);
      refDate = refDate ?? toISODate(o["DAT_DATA_FATO"]);
      rows.push({
        account_code: account,
        advisor_code: advisor,
        profession: o["DSC_PROFISSAO"] ?? null,
        sex: o["DSC_SEXO"] ?? null,
        segment: o["DSC_SEGMENTO"] ?? null,
        segmentation: o["DSC_SEGMENTACAO_CLIENTE"] ?? null,
        suitability: o["DSC_SUITABILITY"] ?? null,
        status: o["DSC_STATUS"] ?? null,
        person_type: o["DSC_TIPO_PESSOA"] ?? null,
        birth_date: toISODate(o["DAT_DATA_NASCIMENTO"]),
        xp_registered_at: toISODate(o["DAT_DATA_CADASTRO"]),
        aplicacao_financeira: toNumber(o["VAL_APLICACOES_FINANCEIRAS"]),
        receita_mes: toNumber(o["VAL_RECEITA_MES"]),
        captacao_bruta_m: toNumber(o["VAL_CAPTACAO_BRUTA_EM_M"]),
        resgates_m: toNumber(o["VAL_RESGATE_EM_M"]),
        captacao_liquida_m: toNumber(o["VAL_CAPTACAO_LIQUIDA_EM_M"]),
        net_em_m1: toNumber(o["VAL_NET_EM_M1"]),
        net_em_m: toNumber(o["VAL_NET_EM_M"]),
        net_renda_fixa: toNumber(o["VAL_NET_RENDA_FIXA"]),
        net_fundos_imobiliarios: toNumber(o["VAL_NET_FUNDOS_IMOBILIARIOS"]),
        net_renda_variavel: toNumber(o["VAL_NET_RENDA_VARIAVEL"]),
        net_fundos: toNumber(o["VAL_NET_FUNDOS"]),
        net_financeiro: toNumber(o["VAL_NET_FINANCEIRO"]),
        net_previdencia: toNumber(o["VAL_NET_PREVIDENCIA"]),
        net_outros: toNumber(o["VAL_NET_OUTROS"]),
      });
    }
    if (det.variant === "mensal") {
      const extras = det.headers.filter((h) => h && !MENSAL_MODEL.has(h));
      if (extras.length) {
        warnings.push({
          level: "info",
          title: `Coluna nova “${extras[0]}”`,
          text: "— não faz parte do modelo e será guardada sem processar.",
        });
      }
    }
  } else if (det.kind === "diversificacao") {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const account = normAccount(o["COD_CLIENTE"]);
      const advisor = normalizeAdvisor(o["DSC_ASSESSOR"]);
      const value = toNumber(o["VAL_NET"]);
      if (!account) {
        pushInvalid(i, "sem número de conta");
        continue;
      }
      if (value === null) {
        pushInvalid(i, "sem valor");
        continue;
      }
      if (advisor) advisorSet.add(advisor);
      refDate = refDate ?? toISODate(o["DAT_DATA_FATO"]);
      rows.push({
        account_code: account,
        advisor_code: advisor,
        product: String(o["DSC_PRODUTO"] ?? "Outros"),
        sub_product: o["DSC_SUB_PRODUTO"] ?? null,
        fund_cnpj: o["DSC_CNPJ_FUNDO"] ?? null,
        asset: String(o["DSC_ATIVO"] ?? ""),
        issuer: o["DSC_EMISSOR"] ?? null,
        maturity_date: toISODate(o["DAT_DATA_VENCIMENTO"]),
        quantity: toNumber(o["VAL_QUANTIDADE"]),
        value,
      });
    }
  } else if (det.kind === "captacao") {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const account = normAccount(o["COD_CODIGO_CLIENTE"]);
      const advisor = normalizeAdvisor(o["DSC_ASSESSOR"]);
      const amount = toNumber(o["QTD_CAPTACAO"]);
      if (!account) {
        pushInvalid(i, "sem número de conta");
        continue;
      }
      if (amount === null) {
        pushInvalid(i, "sem valor");
        continue;
      }
      if (advisor) advisorSet.add(advisor);
      const movDate = toISODate(o["DATA_EXP"]) ?? toISODate(o["DAT_DATA_FATO"]);
      refDate = refDate ?? movDate;
      rows.push({
        account_code: account,
        advisor_code: advisor,
        mov_date: movDate,
        kind: String(o["DSC_TIPO_CAPTACAO"] ?? "Outros"),
        flow: String(o["DSC_AUX"] ?? (amount >= 0 ? "C" : "D")),
        amount,
        segment: o["DSC_SEGMENTO"] ?? null,
      });
    }
  } else {
    // saldo_consolidado: data de referência vem do nome do arquivo (…_YYYYMM)
    const ym = file.name.match(/(\d{4})(\d{2})/);
    refDate = ym ? `${ym[1]}-${ym[2]}-01` : new Date().toISOString().slice(0, 10);
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const account = normAccount(o["Conta"]);
      const advisor = normalizeAdvisor(o["Assessor"]);
      if (!account) {
        pushInvalid(i, "sem número de conta");
        continue;
      }
      if (advisor) advisorSet.add(advisor);
      rows.push({
        account_code: account,
        advisor_code: advisor,
        name: o["Cliente"] ?? null,
        d0: toNumber(o["D0"]) ?? 0,
        d1: toNumber(o["D+1"]) ?? 0,
        d2: toNumber(o["D+2"]) ?? 0,
        d3: toNumber(o["D+3"]) ?? 0,
        total: toNumber(o["Total"]) ?? 0,
      });
    }
  }

  // Positivador/Saldo: 1 registro por conta — conta repetida no arquivo mantém a linha mais recente
  let finalRows = rows;
  if (det.kind === "positivador" || det.kind === "saldo_consolidado") {
    const byAccount = new Map<string, Record<string, unknown>>();
    for (const r of rows) byAccount.set(String(r.account_code), r); // última ocorrência vence
    finalRows = [...byAccount.values()];
  }

  if (invalid.length) {
    warnings.unshift({
      level: "warning",
      title: `${invalid.length} linha${invalid.length > 1 ? "s" : ""} sem número de conta`,
      text: "— serão ignoradas. Baixe a lista para conferir na planilha original.",
      action: "Baixar lista",
      csv: [["linha", "motivo"], ...invalid],
    });
  }

  const sample = finalRows.slice(0, 3).map((r) => ({
    name: (r as { name?: string }).name ?? null,
    account: String(r.account_code),
    value: (r as { net_em_m?: number; value?: number; amount?: number; total?: number }).net_em_m
      ?? (r as { value?: number }).value
      ?? (r as { amount?: number }).amount
      ?? (r as { total?: number }).total
      ?? null,
  }));

  return {
    kind: det.kind,
    variant: det.variant,
    kindLabel: KIND_LABELS[det.kind],
    refDate: refDate ?? new Date().toISOString().slice(0, 10),
    rows: finalRows,
    validCount: finalRows.length,
    invalidCount: invalid.length,
    advisorCodes: [...advisorSet],
    extraColumns: [],
    sample,
    warnings,
    fileHash,
  };
}

/** Aviso de assessores desconhecidos, calculado contra os códigos cadastrados. */
export function unknownAdvisorsWarning(parsed: ParsedImport, knownCodes: string[]): ImportWarning | null {
  const known = new Set(knownCodes);
  const unknown = parsed.advisorCodes.filter((c) => !known.has(c));
  if (unknown.length === 0) return null;
  const affected = parsed.rows.filter((r) => r.advisor_code && unknown.includes(String(r.advisor_code)));
  const label = unknown.map((c) => `A-${c}`).join(" e ");
  return {
    level: "warning",
    title: `Código${unknown.length > 1 ? "s" : ""} ${label} não existe${unknown.length > 1 ? "m" : ""} aqui`,
    text: `— ${affected.length} cliente${affected.length !== 1 ? "s" : ""} ficarão sem assessor até você criá-los ou reatribuir.`,
    action: "Ver clientes",
    csv: [["conta", "assessor"], ...affected.map((r) => [String(r.account_code), `A-${r.advisor_code}`])],
  };
}
