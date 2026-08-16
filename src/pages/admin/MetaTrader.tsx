/**
 * Tela 18 · Conexão MetaTrader — quadros "18 MetaTrader claro sucesso" e
 * "18 MetaTrader escuro falha" (#4b/#4c). Linguagem de leigo, sem jargão.
 */
import { useEffect, useState } from "react";
import { AdminShell } from "./AdminShell";
import { workerFetch } from "../../lib/auth";
import { Button } from "../../components/Button";
import { StatusChip, Banner, Modal } from "../../components/feedback";
import { TextField, PasswordField } from "../../components/Field";
import { formatTime, formatDate, formatTimeSeconds } from "../../lib/format";

interface MtConnection {
  status: "ativa" | "instavel" | "caida" | "desconectada";
  login: string | null;
  server: string | null;
  last_quote_at: string | null;
  connected_at: string | null;
  health_events: { at: string; level: "success" | "warning" | "danger"; text: string }[];
  updated_at: string;
}

type TestOutcome =
  | { kind: "success"; at: string; seconds: number }
  | { kind: "fail"; code: string; motivo: string };

const STATUS_CHIP: Record<MtConnection["status"], { kind: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ativa: { kind: "success", label: "Ativa" },
  instavel: { kind: "warning", label: "Instável" },
  caida: { kind: "danger", label: "Caída" },
  desconectada: { kind: "neutral", label: "Desconectada" },
};

export default function MetaTrader() {
  const [conn, setConn] = useState<MtConnection | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [testing, setTesting] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    const body = (await workerFetch("/api/admin/mt")) as { connection: MtConnection };
    setConn(body.connection);
    if (body.connection.login) setLogin(body.connection.login);
    if (body.connection.server) setServer(body.connection.server);
  }
  useEffect(() => {
    void load();
  }, []);

  async function test() {
    setTesting(true);
    setOutcome(null);
    try {
      const body = (await workerFetch("/api/admin/mt/test", {
        method: "POST",
        body: JSON.stringify({ login, password, server }),
      })) as { ok: boolean; code?: string; motivo?: string; tested_at?: string; response_seconds?: number };
      if (body.ok) {
        setOutcome({ kind: "success", at: body.tested_at!, seconds: body.response_seconds ?? 0 });
      } else {
        setOutcome({ kind: "fail", code: body.code ?? "ERRO", motivo: body.motivo ?? "erro desconhecido" });
        setPassword(""); // campo limpo por segurança (quadro da falha)
      }
      await load();
    } finally {
      setTesting(false);
    }
  }

  const authFailed = outcome?.kind === "fail" && outcome.code === "AUTH_FAILED";
  const downMinutes = conn?.status === "caida" && conn.updated_at ? Math.max(1, Math.round((Date.now() - new Date(conn.updated_at).getTime()) / 60000)) : null;

  return (
    <AdminShell title="Conexão MetaTrader">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {outcome?.kind === "success" && (
          <Banner kind="success" title="Funcionou: estamos recebendo cotações agora">
            Teste feito às {formatTime(outcome.at)} · resposta em {outcome.seconds.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} segundo. Pode
            fechar esta tela, está tudo certo.
          </Banner>
        )}
        {outcome?.kind === "fail" && (
          <Banner
            kind="danger"
            title={`Não conectou: ${outcome.motivo}`}
            action="Testar de novo"
            onAction={test}
          >
            {authFailed
              ? "A causa mais comum é a senha digitada diferente da que veio no e-mail da corretora. Copie a senha de lá e cole aqui — o campo foi limpo por segurança."
              : "Confira o campo Servidor: ele aparece como “Server” no e-mail da corretora, por exemplo XPMT5-Real02."}{" "}
            <span className="mt-code">({outcome.code})</span>
          </Banner>
        )}

        <div className="mt-grid">
          <div className="mt-card">
            <div className="mt-card__title">Credenciais da conta</div>
            <p className="mt-card__intro">
              Esses três dados vêm no e-mail da sua corretora com o assunto “Dados de acesso MetaTrader”. É só copiar de lá.
            </p>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <TextField label="Login" mono placeholder="número da conta" value={login} onChange={(e) => setLogin(e.target.value)} />
                {authFailed && login && (
                  <span className="mt-field-ok"><i className="icon-circle-check" aria-hidden />Login confirmado</span>
                )}
              </div>
              <PasswordField label="Senha" error={authFailed ? "O servidor recusou esta senha." : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
              <div>
                <TextField label="Servidor" mono placeholder="XPMT5-Real02" value={server} onChange={(e) => setServer(e.target.value)} />
                <p className="mt-help">Aparece como “Server” no e-mail. Ex.: XPMT5-Real02.</p>
                {authFailed && server && (
                  <span className="mt-field-ok"><i className="icon-circle-check" aria-hidden />Servidor confirmado</span>
                )}
              </div>
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
              <Button loading={testing} disabled={!login || !password || !server} onClick={test}>
                {testing ? "Testando" : "Testar conexão"}
              </Button>
              <Button variant="secondary" disabled={!login || !server}>Salvar</Button>
            </div>
          </div>

          <div className="mt-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="mt-card__title">Saúde da conexão</span>
              {conn && (
                <StatusChip kind={STATUS_CHIP[conn.status].kind} icon={conn.status === "ativa" ? "icon-plug-zap" : conn.status === "desconectada" ? "icon-unplug" : undefined}>
                  {STATUS_CHIP[conn.status].label}
                </StatusChip>
              )}
            </div>
            <div className="mt-health__grid">
              <span>
                <span className="mt-health__cell-label">Última cotação</span>
                <span className="mt-health__cell-value">{conn?.last_quote_at ? formatTimeSeconds(conn.last_quote_at) : "—"}</span>
              </span>
              <span>
                <span className="mt-health__cell-label">Tempo de resposta</span>
                <span className="mt-health__cell-value">{conn?.status === "ativa" ? "0,2 s" : "—"}</span>
              </span>
              <span>
                <span className="mt-health__cell-label">Conectada desde</span>
                <span className="mt-health__cell-value">{conn?.connected_at ? formatDate(conn.connected_at) : "—"}</span>
              </span>
              <span>
                <span className="mt-health__cell-label">Quedas em 30 dias</span>
                <span className="mt-health__cell-value">
                  {conn ? conn.health_events.filter((e) => e.level === "danger").length : "—"}
                </span>
              </span>
            </div>

            {conn?.status === "caida" && (
              <div className="mt-viewing">
                <span className="mt-viewing__label">Parada há {downMinutes} min · o que os assessores estão vendo</span>
                <span className="mt-viewing__text">
                  “Cotações pausadas — mostrando preços de {conn.last_quote_at ? formatTime(conn.last_quote_at) : "—"}.” O resto do aplicativo não é afetado.
                </span>
              </div>
            )}

            <div className="mt-events">
              <div className="mt-events__title">Últimos eventos</div>
              {(conn?.health_events ?? []).slice(-4).reverse().map((e, i) => (
                <div key={i} className="mt-event">
                  <span className={`mt-event__dot mt-event__dot--${e.level}`} aria-hidden />
                  <span className="mt-event__text">{e.text}</span>
                  <span className="mt-event__at">{formatTime(e.at)}</span>
                </div>
              ))}
              {(conn?.health_events ?? []).length === 0 && (
                <div className="mt-event"><span className="mt-event__text" style={{ color: "var(--text-3)" }}>Nenhum evento ainda.</span></div>
              )}
            </div>

            <div className="mt-actions">
              <div className="mt-card__title" style={{ fontSize: 12.5, marginBottom: 10 }}>Ações</div>
              <div className="mt-actions__buttons">
                <Button variant="secondary" onClick={() => setPassword("")}>Trocar credenciais</Button>
                <Button variant="destructive" icon="icon-ban" onClick={() => setDisconnecting(true)} disabled={conn?.status === "desconectada"}>
                  Desconectar
                </Button>
              </div>
              <p className="mt-actions__legend">
                Trocar credenciais mantém as cotações no ar até o novo teste. Desconectar pausa as cotações para todos os assessores na hora.
              </p>
            </div>
          </div>
        </div>
      </div>

      {disconnecting && (
        <Modal
          title="Desconectar o MetaTrader?"
          id={conn?.login ? `conta ${conn.login} · ${conn.server}` : undefined}
          onClose={() => setDisconnecting(false)}
          note="Reversível — reconecte testando as credenciais."
          actions={
            <>
              <Button variant="secondary" onClick={() => setDisconnecting(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                icon="icon-ban"
                onClick={async () => {
                  await workerFetch("/api/admin/mt/disconnect", { method: "POST" });
                  setDisconnecting(false);
                  setOutcome(null);
                  await load();
                }}
              >
                Desconectar
              </Button>
            </>
          }
        >
          As cotações param imediatamente para todos os assessores, que passam a ver os últimos preços recebidos. O resto do aplicativo segue funcionando.
        </Modal>
      )}
    </AdminShell>
  );
}
