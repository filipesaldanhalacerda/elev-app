/** Tela 16 · Perfil e configurações — quadros "16 Perfil claro/escuro" (#3g). */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../components/MobileShell";
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

const PUSH_ITEMS: { key: string; label: string; description?: string }[] = [
  { key: "alerta_preco", label: "Alerta de preço atingido" },
  { key: "lembrete_diario", label: "Lembrete diário de cards" },
  { key: "card_delegado", label: "Card delegado a mim" },
  { key: "movimentacoes", label: "Movimentações de clientes", description: "aportes e resgates relevantes" },
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
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Trocar senha">
        <div className="sheet__handle"><span /></div>
        <div className="sheet__title">Trocar senha</div>
        {done ? (
          <div style={{ padding: "8px 0 4px" }}><Toast>Senha trocada.</Toast></div>
        ) : (
          <div className="sheet__fields" style={{ gap: 14 }}>
            <PasswordField label="Nova senha" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
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
      </div>
    </>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile?.push_prefs ?? {});
  const [changingPw, setChangingPw] = useState(false);
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

  if (!profile) return <MobileShell active="perfil"><div /></MobileShell>;

  return (
    <MobileShell active="perfil">
      <header className="page-header" style={{ background: "var(--surface)" }}>
        <span className="page-header__title">Perfil</span>
      </header>

      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
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

        <div className="card" style={{ padding: 14 }}>
          <div style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--text-1)" }}>Tema</div>
          <div className="segmented" style={{ height: 44, marginTop: 10, background: "var(--chip-pill-bg)", border: "1px solid var(--border)" }}>
            {([["claro", "Claro", "ph-sun"], ["escuro", "Escuro", "ph-moon"], ["sistema", "Sistema", "ph-circle-half"]] as const).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={`segmented__item${theme === key ? " segmented__item--active" : ""}`}
                style={theme === key && key === "claro" ? { background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-1)" } : undefined}
                onClick={() => pickTheme(key)}
              >
                <i className={`ph ${icon}`} style={{ fontSize: 14 }} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

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
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>{item.label}</span>
                {item.description && (
                  <span style={{ display: "block", marginTop: 2, font: "400 10.5px/1.4 var(--font-sans)", color: "var(--text-3)" }}>{item.description}</span>
                )}
              </span>
              <Toggle checked={prefs[item.key] ?? false} onChange={(v) => togglePref(item.key, v)} label={item.label} />
            </div>
          ))}
        </div>

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
              <i className="ph ph-lock-key" style={{ fontSize: 15 }} aria-hidden />
            </span>
            <span style={{ flex: 1, font: "400 13px/1.35 var(--font-sans)", color: "var(--text-1)" }}>Trocar senha</span>
            <i className="ph ph-caret-right" style={{ fontSize: 16, color: "var(--icon-decor)" }} aria-hidden />
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
              <i className="ph ph-sign-out" style={{ fontSize: 15 }} aria-hidden />
            </span>
            <span style={{ flex: 1, font: "600 13px/1.35 var(--font-sans)", color: "var(--danger-action-text)" }}>Sair da conta</span>
          </button>
        </div>

        <div style={{ font: "400 10.5px/1.5 var(--font-mono)", color: "var(--text-3)", textAlign: "center", padding: "2px 0 14px" }}>
          Elev 1.0.0 · PWA {window.matchMedia("(display-mode: standalone)").matches ? "instalado" : "no navegador"}
        </div>
      </div>

      {changingPw && <ChangePasswordSheet onClose={() => setChangingPw(false)} />}
    </MobileShell>
  );
}
