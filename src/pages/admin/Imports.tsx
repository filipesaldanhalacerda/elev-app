/**
 * Tela 21 · Importação de relatórios — quadro "21 Importacao claro preview" (#4e).
 * Upload → detecção automática → conferência com avisos acionáveis → confirmação
 * ("Nada é gravado antes desta confirmação.") → processamento com progresso → histórico.
 */
import { useEffect, useRef, useState } from "react";
import { AdminShell } from "./AdminShell";
import { supabase } from "../../lib/supabase";
import { workerFetch } from "../../lib/auth";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/states";
import { Toast, Banner } from "../../components/feedback";
import { parseReportFile, unknownAdvisorsWarning, type ParsedImport, type ImportWarning } from "../../lib/importers/parse";
import { formatBRL, formatInt, formatDateAtTime } from "../../lib/format";

type Step = 1 | 2 | 3;

interface HistoryRow {
  id: string;
  kind: string;
  status: string;
  file_name: string;
  counts: { validos?: number } | null;
  created_at: string;
  error: string | null;
  author: string;
}

const KIND_TITLES: Record<string, string> = {
  positivador: "Positivador",
  diversificacao: "Diversificação",
  captacao: "Captação",
  saldo_consolidado: "Saldo Consolidado",
};

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Imports() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [newClients, setNewClients] = useState(0);
  const [unknownAdvisors, setUnknownAdvisors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function loadHistory() {
    const { data } = await supabase
      .from("imports")
      .select("id, kind, status, file_name, counts, created_at, error, profiles!imports_created_by_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(6);
    setHistory(
      (data ?? []).map((r) => ({
        ...(r as unknown as HistoryRow),
        author: ((r as { profiles?: { name?: string } }).profiles?.name ?? "").split(" ")[0],
      }))
    );
  }
  useEffect(() => {
    void loadHistory();
  }, []);

  async function onFile(f: File) {
    setError(null);
    setDone(null);
    try {
      const buffer = await f.arrayBuffer();
      const p = await parseReportFile({ name: f.name, buffer });
      // avisos que dependem do banco: assessores desconhecidos + clientes novos
      const { data: profiles } = await supabase.from("profiles").select("advisor_code").not("advisor_code", "is", null);
      const knownCodes = (profiles ?? []).map((r) => String(r.advisor_code));
      const advisorWarning = unknownAdvisorsWarning(p, knownCodes);
      setUnknownAdvisors(advisorWarning ? new Set(advisorWarning.csv!.slice(1).map((r) => r[1])).size : 0);
      const accounts = [...new Set(p.rows.map((r) => String(r.account_code)))];
      // consulta em blocos: milhares de contas não cabem numa URL só
      let existingCount = 0;
      for (let i = 0; i < accounts.length; i += 200) {
        const { count } = await supabase
          .from("clients")
          .select("*", { count: "exact", head: true })
          .in("account_code", accounts.slice(i, i + 200));
        existingCount += count ?? 0;
      }
      setNewClients(accounts.length - existingCount);
      setWarnings([...(advisorWarning ? [advisorWarning] : []), ...p.warnings]);
      setFile({ name: f.name, size: f.size });
      setParsed(p);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function confirm() {
    if (!parsed || !file) return;
    setStep(3);
    setProgress(8);
    const timer = setInterval(() => setProgress((v) => Math.min(v + 7, 90)), 250);
    try {
      const body = (await workerFetch("/api/admin/imports/commit", {
        method: "POST",
        body: JSON.stringify({
          kind: parsed.kind,
          variant: parsed.variant,
          file_name: file.name,
          file_size: file.size,
          file_hash: parsed.fileHash,
          ref_date: parsed.refDate,
          counts: { validos: parsed.validCount, invalidos: parsed.invalidCount, novos: newClients },
          warnings: warnings.map((w) => ({ level: w.level, title: w.title, text: w.text })),
          rows: parsed.rows,
        }),
      })) as { records: number };
      clearInterval(timer);
      setProgress(100);
      setDone(body.records);
      setParsed(null);
      setFile(null);
      setStep(1);
      await loadHistory();
    } catch (e) {
      clearInterval(timer);
      setError((e as Error).message);
      setStep(2);
    }
  }

  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

  return (
    <AdminShell
      title="Importar relatório"
      actions={
        <span className="stepper">
          <span className={`stepper__step${step > 1 ? " stepper__step--done" : " stepper__step--current"}`}>
            <span className="stepper__num">{step > 1 ? <i className="icon-check" aria-hidden /> : "1"}</span>Enviar
          </span>
          <span className="stepper__line" aria-hidden />
          <span className={`stepper__step${step === 2 ? " stepper__step--current" : step > 2 ? " stepper__step--done" : ""}`}>
            <span className="stepper__num">{step > 2 ? <i className="icon-check" aria-hidden /> : "2"}</span>Conferir
          </span>
          <span className="stepper__line" aria-hidden />
          <span className={`stepper__step${step === 3 ? " stepper__step--current" : ""}`}>
            <span className="stepper__num">3</span>Processar
          </span>
        </span>
      }
    >
      <div className="import-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <Banner kind="danger" title="Não foi possível ler o arquivo">
              {error}
            </Banner>
          )}
          {done !== null && (
            <Toast icon="icon-circle-check">Importação concluída — {formatInt(done)} registros processados.</Toast>
          )}

          {step === 1 && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                data-testid="import-file"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <EmptyState
                icon="icon-upload"
                title="Envie o relatório da XP"
                description="Positivador (mensal ou semanal), Diversificação, Captação ou Saldo Consolidado — o tipo é detectado automaticamente."
                action="Escolher arquivo"
                onAction={() => fileInput.current?.click()}
              />
            </>
          )}

          {step >= 2 && parsed && file && (
            <div className="import-card">
              <div className="import-file">
                <span className="import-file__icon">
                  <i className="icon-file-spreadsheet" aria-hidden />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="import-file__name">{file.name}</span>
                  <span className="import-file__meta">{mb(file.size)} · enviado agora</span>
                </span>
                <span className="import-file__chip">
                  <i className="icon-sparkles" aria-hidden />
                  {parsed.kindLabel}
                  {parsed.variant ? ` ${parsed.variant}` : ""} detectado
                </span>
              </div>

              <div className="import-counts">
                <span className="import-counts__cell">
                  <span className="import-counts__label">Registros válidos</span>
                  <span className="import-counts__value">{formatInt(parsed.validCount)}</span>
                </span>
                <span className="import-counts__cell">
                  <span className="import-counts__label">Clientes novos</span>
                  <span className="import-counts__value">{formatInt(newClients)}</span>
                </span>
                <span className="import-counts__cell">
                  <span className="import-counts__label">Linhas inválidas</span>
                  <span className={`import-counts__value${parsed.invalidCount > 0 ? " import-counts__value--warning" : ""}`}>
                    {formatInt(parsed.invalidCount)}
                  </span>
                </span>
                <span className="import-counts__cell">
                  <span className="import-counts__label">Assessores desconhecidos</span>
                  <span className={`import-counts__value${unknownAdvisors > 0 ? " import-counts__value--warning" : ""}`}>
                    {formatInt(unknownAdvisors)}
                  </span>
                </span>
              </div>

              {warnings.length > 0 && (
                <div className="import-warnings">
                  {warnings.map((w, i) => (
                    <div key={i} className={`import-warning import-warning--${w.level}`}>
                      <i className={`${w.level === "warning" ? "icon-circle-alert" : "icon-info"} import-warning__icon`} aria-hidden />
                      <span className="import-warning__text">
                        <strong>{w.title}</strong> {w.text}
                      </span>
                      {w.action && w.csv && (
                        <button type="button" className="import-warning__action" onClick={() => downloadCsv(`${w.action!.toLowerCase().replace(" ", "-")}.csv`, w.csv!)}>
                          {w.action}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {step === 3 ? (
                <div style={{ padding: "18px 20px" }}>
                  <div className="import-progress">
                    <div className="import-progress__fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="import-footer__note" style={{ marginTop: 10 }}>
                    Processando {formatInt(parsed.validCount)} registros…
                  </div>
                </div>
              ) : (
                <div className="import-footer">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setParsed(null);
                      setFile(null);
                      setStep(1);
                    }}
                  >
                    Voltar
                  </Button>
                  <span className="import-footer__right">
                    <span className="import-footer__note">Nada é gravado antes desta confirmação.</span>
                    <Button icon="icon-check" onClick={confirm}>
                      Confirmar e processar
                    </Button>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="import-side">
          {step >= 2 && parsed && (
            <div className="import-panel import-sample">
              <div className="import-sample__title">Amostra dos dados</div>
              <div className="import-sample__head">
                <span>Cliente</span>
                <span style={{ textAlign: "right" }}>Conta</span>
                <span style={{ textAlign: "right" }}>Valor</span>
              </div>
              {parsed.sample.map((s) => (
                <div key={s.account} className="import-sample__row">
                  <span>{s.name ?? "—"}</span>
                  <span style={{ textAlign: "right", color: "var(--text-2)" }}>{s.account}</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>{s.value !== null ? formatBRL(s.value) : "—"}</span>
                </div>
              ))}
              <div className="import-sample__count">
                mostrando {Math.min(3, parsed.validCount)} de {formatInt(parsed.validCount)}
              </div>
            </div>
          )}

          <div className="import-panel">
            <div className="import-panel__title">Histórico de importações</div>
            {history.length === 0 && <div className="import-history__row import-history__meta">Nenhuma importação ainda.</div>}
            {history.map((h) => (
              <div key={h.id} className="import-history__row">
                <span className={`import-history__dot ${h.status === "concluida" ? "import-history__dot--ok" : h.status === "falhou" ? "import-history__dot--fail" : "import-history__dot--ok"}`} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="import-history__title">
                    {KIND_TITLES[h.kind] ?? h.kind} · {h.status === "falhou" ? "falhou na leitura" : `${formatInt(h.counts?.validos ?? 0)} registros`}
                  </span>
                  <span className="import-history__meta">
                    {formatDateAtTime(h.created_at)} · {h.author} · {h.status === "concluida" ? "concluída" : h.status === "falhou" ? (h.error ?? "falhou") : "processando"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
