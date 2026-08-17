/** Tela 16 · Perfil e configurações — quadros "16 Perfil claro/escuro" (#3g). */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
import { Sheet } from "../components/Sheet";
import { Toggle, PasswordField } from "../components/Field";
import { Toast } from "../components/feedback";
import { Button } from "../components/Button";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getThemePreference, setThemePreference, type ThemePreference } from "../lib/theme";
import { subscribeDevice } from "../lib/push";
import { initials, displayAdvisorCode } from "../lib/format";
import { useGoogleStatus, connectGoogle, disconnectGoogle } from "../lib/google";
import { GoogleLogo } from "../components/GoogleLogo";
import { isStandalone, isIOS, canPromptInstall, promptInstall, onInstallAvailability } from "../lib/pwa";

const PUSH_ITEMS: { key: string; label: string; description?: string }[] = [
  { key: "alerta_preco", label: "Alerta de preço atingido" },
  { key: "lembrete_diario", label: "Lembrete diário de tarefas" },
  { key: "movimentacoes", label: "Movimentações de clientes", description: "aportes e resgates acima de R$ 100 mil na importação" },
];

/** F2-11: no mobile o padrão do sistema é o sheet que desliza de baixo — não modal central. */
function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const ok = pw.length >= 8 && /[A-Z]/.test(pw) && /\d/.test(pw) && pw === pw2;

  async function save() {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (!error) {
      await supabase.rpc("log_audit", { p_category: "usuario", p_event: "Senha trocada pelo próprio usuário", p_detail: null });
      setDone(true);
      setTimeout(onClose, 1200);
    }
  }

  return (
    <Sheet label="Trocar senha" onClose={onClose}>
        <div className="sheet__title">Trocar senha</div>
        {done ? (
          <div style={{ padding: "8px 0 4px" }}><Toast>Senha trocada.</Toast></div>
        ) : (
          <div className="sheet__fields" style={{ gap: 14 }}>
            <PasswordField label="Nova senha" value={pw} onChange={(e) => setPw(e.target.value)} />
            <PasswordField label="Repita a senha" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <div style={{ font: "400 11px/1.5 var(--font-sans)", color: "var(--text-3)" }}>
              Pelo menos 8 caracteres, uma maiúscula e um número.
            </div>
          </div>
        )}
        <div className="sheet__footer" style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok || done} loading={saving} onClick={save}>Salvar senha</Button>
        </div>
    </Sheet>
  );
}

const sectionTitle = (text: string) => (
  <div style={{ font: "600 11px/1 var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-2)", padding: "2px 2px 0" }}>{text}</div>
);

export default function Profile() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile?.push_prefs ?? {});
  const [changingPw, setChangingPw] = useState(false);
  const standalone = isStandalone();
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [, forceInstallCheck] = useState(0);
  useEffect(() => onInstallAvailability(() => forceInstallCheck((n) => n + 1)), []);
  const [reminderTime, setReminderTime] = useState("08:00");
  useEffect(() => {
    if (!profile) return;
    supabase.from("profiles").select("reminder_time").eq("id", profile.id).single().then(({ data }) => {
      if (data?.reminder_time) setReminderTime(String(data.reminder_time).slice(0, 5));
    });
  }, [profile]);
  async function pickReminderTime(v: string) {
    setReminderTime(v);
    if (profile && v) await supabase.from("profiles").update({ reminder_time: v }).eq("id", profile.id);
  }
  const { status: google, reload: reloadGoogle } = useGoogleStatus();
  const [googleBusy, setGoogleBusy] = useState(false);

  async function toggleGoogle() {
    setGoogleBusy(true);
    try {
      if (google?.connected) {
        await disconnectGoogle();
      } else {
        const res = await connectGoogle();
        if (res.url) {
          window.location.href = res.url; // modo real: consentimento no Google
          return;
        }
      }
      await reloadGoogle();
    } finally {
      setGoogleBusy(false);
    }
  }

  async function pickTheme(next: ThemePreference) {
    setTheme(next);
    setThemePreference(next);
    if (profile) await supabase.from("profiles").update({ theme: next }).eq("id", profile.id);
  }

  async function togglePref(key: string, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (profile) await supabase.from("profiles").update({ push_prefs: next }).eq("id", profile.id);
    if (value) void subscribeDevice();
  }

  if (!profile) return <MobileShell><div /></MobileShell>;

  return (
    <MobileShell>
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Perfil</span>
      </header>

      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {sectionTitle("Conta")}
        <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 13 }}>
          <span
            style={{
              width: 46, height: 46, borderRadius: 999, flex: "none",
              background: "var(--brand-800)", color: "var(--brand-100)",
              display: "flex", alignItems: "center", justifyContent: "center",
              font: "600 15px/1 var(--font-sans)",
            }}
            data-avatar
          >
            {initials(profile.name)}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "600 15px/1.3 var(--font-sans)", color: "var(--text-1)" }}>{profile.name}</span>
            <span style={{ display: "block", marginTop: 3, font: "400 11.5px/1.4 var(--font-sans)", color: "var(--text-2)" }}>{profile.email}</span>
            <span style={{ display: "block", marginTop: 2, font: "400 10.5px/1.4 var(--font-mono)", color: "var(--text-3)" }}>
              {profile.role === "admin" ? "administrador" : "assessor"}
              {profile.advisor_code ? ` · código ${displayAdvisorCode(profile.advisor_code)}` : ""}
            </span>
          </span>
        </div>

        {!standalone && (
          <button
            type="button"
            data-install-card
            onClick={() => (canPromptInstall() ? void promptInstall() : setShowIOSInstall(true))}
            style={{ minHeight: 62, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", textAlign: "left", borderRadius: 14, border: "1.5px dashed var(--action)", background: "color-mix(in srgb, var(--action) 5%, transparent)" }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--brand-800)", color: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 16px/1 var(--font-mono)", flex: "none" }}>e</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "600 13.5px/1.3 var(--font-sans)", color: "var(--text-1)" }}>Instalar o aplicativo</span>
              <span style={{ display: "block", marginTop: 2, font: "400 11px/1.4 var(--font-sans)", color: "var(--text-2)" }}>
                Abre direto da tela inicial, em tela cheia e com notificações.
              </span>
            </span>
            <i className="icon-arrow-down-to-line" style={{ fontSize: 18, color: "var(--ghost-text)", flex: "none" }} aria-hidden />
          </button>
        )}

        {sectionTitle("Aparência")}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Tema</div>
          <div className="segmented" style={{ height: 44, marginTop: 10, background: "var(--chip-pill-bg)", border: "1px solid var(--border)" }}>
            {([["claro", "Claro", "icon-sun"], ["escuro", "Escuro", "icon-moon"], ["sistema", "Sistema", "icon-sun-moon"]] as const).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={`segmented__item${theme === key ? " segmented__item--active" : ""}`}
                style={theme === key && key === "claro" ? { background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-1)" } : undefined}
                onClick={() => pickTheme(key)}
              >
                <i className={`${icon}`} style={{ fontSize: 14 }} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {sectionTitle("Notificações")}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 14px 6px", font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Push por tipo de evento</div>
          {PUSH_ITEMS.map((item, i) => (
            <div
              key={item.key}
              style={{
                minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "8px 14px",
                borderTop: i > 0 ? "1px solid var(--divider)" : undefined,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>{item.label}</span>
                {item.description && (
                  <span style={{ display: "block", marginTop: 2, font: "400 10.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>{item.description}</span>
                )}
                {item.key === "lembrete_diario" && prefs.lembrete_diario !== false && (
                  <span className="field" style={{ display: "block", marginTop: 8, maxWidth: 180 }}>
                    <span className="field__label" style={{ display: "block" }}>Todo dia às</span>
                    <span className="field__box field__box--tabular" style={{ height: 44 }}>
                      <input
                        type="time"
                        aria-label="Hora do lembrete diário"
                        className="field__input"
                        value={reminderTime}
                        onChange={(e) => void pickReminderTime(e.target.value)}
                        style={{ fontVariantNumeric: "tabular-nums", fontSize: 15 }}
                      />
                    </span>
                  </span>
                )}
              </span>
              <Toggle checked={prefs[item.key] ?? false} onChange={(v) => togglePref(item.key, v)} label={item.label} />
            </div>
          ))}
        </div>

        {sectionTitle("Conexões e segurança")}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chip-pill-bg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <GoogleLogo size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Conta Google</span>
              <span style={{ display: "block", marginTop: 2, font: "400 10.5px/1.4 var(--font-sans)", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {google?.connected
                  ? `${google.email} · agenda sincronizada${google.mode === "simulado" ? " (demonstração)" : ""}`
                  : google?.mode === "simulado"
                    ? "modo demonstração — a conexão real chega com as credenciais Google"
                    : "conecte para sincronizar a agenda"}
              </span>
            </span>
            <Button variant="secondary" style={{ height: 44, fontSize: 12 }} loading={googleBusy} onClick={toggleGoogle}>
              {google?.connected ? "Desconectar" : "Conectar"}
            </Button>
          </div>
          <button type="button" style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--divider)", textAlign: "left" }} onClick={() => setChangingPw(true)}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chip-pill-bg)", color: "var(--field-label)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <i className="icon-lock-keyhole" style={{ fontSize: 15 }} aria-hidden />
            </span>
            <span style={{ flex: 1, font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Trocar senha</span>
            <i className="icon-chevron-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
          </button>
          <button
            type="button"
            style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", textAlign: "left" }}
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--danger-action-hover-bg)", color: "var(--danger-action-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <i className="icon-log-out" style={{ fontSize: 15 }} aria-hidden />
            </span>
            <span style={{ flex: 1, font: "600 13px/1.35 var(--font-sans)", color: "var(--danger-action-text)" }}>Sair da conta</span>
          </button>
        </div>

        <div style={{ font: "400 10.5px/1.5 var(--font-mono)", color: "var(--text-3)", textAlign: "center", padding: "2px 0 14px" }}>
          Elev 1.0.0 · PWA {standalone ? "instalado" : "no navegador"}
        </div>
      </div>

      {changingPw && <ChangePasswordSheet onClose={() => setChangingPw(false)} />}

      {showIOSInstall && (
        <Sheet label="Instalar o aplicativo" onClose={() => setShowIOSInstall(false)}>
          <div className="sheet__title">Instalar o aplicativo</div>
          <div className="howto" style={{ marginTop: 12 }}>
            {[
              isIOS() ? <>Toque em <strong>Compartilhar</strong> na barra do Safari (o quadrado com a seta para cima).</> : <>Abra o menu do navegador (três pontos, no canto superior).</>,
              isIOS() ? <>Role e toque em <strong>Adicionar à Tela de Início</strong>.</> : <>Toque em <strong>Instalar aplicativo</strong> (ou "Adicionar à tela inicial").</>,
              <>Confirme — a Elev abre em tela cheia, com ícone próprio e notificações.</>,
            ].map((text, i) => (
              <div key={i} className="howto__step">
                <span className="howto__num">{i + 1}</span>
                <span className="howto__text">{text}</span>
              </div>
            ))}
          </div>
          <div className="sheet__footer" style={{ marginTop: 16 }}>
            <Button variant="secondary" block onClick={() => setShowIOSInstall(false)}>Entendi</Button>
          </div>
        </Sheet>
      )}
    </MobileShell>
  );
}
