/**
 * Shell mobile do assessor: conteúdo + bottom nav 86px (padrão das telas 04–16),
 * banner de offline fixo (tela 24), fila de sincronização e prompt de instalação (tela 26).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Banner } from "./feedback";
import { Button } from "./Button";
import { useOnline, useQueueCount, flushQueue, lastDataAt } from "../lib/offline";
import { useAuth } from "../lib/auth";
import { formatTime } from "../lib/format";

const ITEMS = [
  { key: "inicio", label: "Início", icon: "icon-house", path: "/" },
  { key: "clientes", label: "Clientes", icon: "icon-users-round", path: "/clientes" },
  { key: "cotacoes", label: "Cotações", icon: "icon-chart-line", path: "/cotacoes" },
  { key: "tarefas", label: "Tarefas", icon: "icon-square-check", path: "/cards" },
  { key: "agenda", label: "Agenda", icon: "icon-calendar", path: "/agenda" },
] as const;

export type MobileNavKey = (typeof ITEMS)[number]["key"];

const INSTALL_DISMISSED_KEY = "elev.instalacao-dispensada";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (!event) return null;
  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 98, zIndex: 60, maxWidth: 496, margin: "0 auto", background: "var(--surface)", borderRadius: 18, boxShadow: "var(--elev-modal)", border: "1px solid var(--border)", overflow: "hidden" }} data-install-prompt>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 44, height: 44, borderRadius: 11, background: "var(--brand-800)", color: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 19px/1 var(--font-mono)", flex: "none" }}>e</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 14px/1.3 var(--font-sans)", color: "var(--text-1)" }}>Instalar a Elev</span>
          <span style={{ display: "block", marginTop: 2, font: "400 11px/1.4 var(--font-sans)", color: "var(--text-2)" }}>app.elev.com.br · funciona offline</span>
        </span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button
          variant="secondary"
          style={{ fontSize: 13 }}
          onClick={() => {
            localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
            setEvent(null);
          }}
        >
          Agora não
        </Button>
        <Button
          icon="icon-plus"
          style={{ fontSize: 13 }}
          onClick={async () => {
            await event.prompt();
            setEvent(null);
          }}
        >
          Adicionar à tela inicial
        </Button>
      </div>
    </div>
  );
}

export function MobileShell({ active, children }: { active?: MobileNavKey; children: ReactNode }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const online = useOnline();
  const queueCount = useQueueCount();

  // rede voltou: esvazia a fila de sincronização
  useEffect(() => {
    if (online && queueCount > 0 && profile) void flushQueue(profile.id);
  }, [online, queueCount, profile]);

  const frozenAt = lastDataAt();

  return (
    <div className="mobile-shell">
      {!online && (
        <div style={{ flex: "none", margin: "8px 16px 0" }} data-offline-banner>
          <Banner kind="warning">
            Você está offline. Mostrando dados de {frozenAt ? formatTime(frozenAt) : "—"}.
          </Banner>
        </div>
      )}
      <div className="mobile-shell__content">{children}</div>
      {queueCount > 0 && (
        <div style={{ flex: "none", margin: "0 16px 8px" }} data-sync-queue>
          <div className="card" style={{ borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--chip-pill-bg)", color: "var(--text-body)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <i className="icon-cloud-upload" style={{ fontSize: 15 }} aria-hidden />
            </span>
            <span style={{ flex: 1, font: "400 12px/1.45 var(--font-sans)", color: "var(--text-body)" }}>
              {queueCount} anotaç{queueCount > 1 ? "ões aguardando" : "ão aguardando"} sincronizar
            </span>
            <span style={{ font: "500 10px/1 var(--font-mono)", color: "var(--text-3)" }}>na fila</span>
          </div>
        </div>
      )}
      <nav className="mnav">
        <span className="mnav__indicator" aria-hidden />
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mnav__item${item.key === active ? " mnav__item--active" : ""}`}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => navigate(item.path)}
          >
            <i className={`${item.icon}`} aria-hidden />
            <span className="mnav__label">{item.label}</span>
          </button>
        ))}
      </nav>
      <InstallPrompt />
    </div>
  );
}
