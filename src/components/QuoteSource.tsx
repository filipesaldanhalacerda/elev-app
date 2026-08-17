/**
 * Selo de FONTE das cotações (mesmo padrão do rodapé do Google Agenda):
 * logo + link da brapi e o horário REAL do último dado recebido, que se
 * atualiza sozinho a cada ciclo de cotações.
 */
import type { Quote } from "../lib/quotes";
import { formatTimeSeconds } from "../lib/format";

export function QuoteSource({ quotes, source, compact }: { quotes: Quote[]; source?: "brapi" | "simulado"; compact?: boolean }) {
  // horário mais recente entre os dados exibidos — é o carimbo do provedor, não o do app
  const lastAt = quotes.reduce<string | null>((acc, q) => (acc === null || q.at > acc ? q.at : acc), null);
  if (source !== "brapi") {
    return (
      <div data-quote-source style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: compact ? "2px 0 0" : "6px 0", font: "400 10.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>
        cotações em modo demonstração — dados simulados
      </div>
    );
  }
  return (
    <a
      href="https://brapi.dev"
      target="_blank"
      rel="noreferrer"
      data-quote-source
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: compact ? "2px 0 0" : "6px 0", font: "400 10.5px/1.4 var(--font-sans)", fontVariantNumeric: "tabular-nums", color: "var(--text-3)" }}
    >
      <img src="/brapi-logo.svg" width={14} height={14} alt="brapi" style={{ borderRadius: 4, flex: "none" }} />
      <span>
        dados da B3 por <span style={{ fontWeight: 600, color: "var(--text-2)" }}>brapi.dev</span>
        {lastAt ? ` · atualizado às ${formatTimeSeconds(lastAt)}` : ""}
      </span>
    </a>
  );
}
