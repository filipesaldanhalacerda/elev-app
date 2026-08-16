/**
 * Tela 02 · Primeiro acesso (2 passos) — quadros "02 Codigo de acesso claro" e
 * "02 Primeiro acesso claro" (#3a). Código de 6 caracteres, 24h, uso único;
 * validar invalida a credencial anterior; botão libera só com os 3 requisitos.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { CodeBoxes } from "../../components/CodeBoxes";
import { PasswordField } from "../../components/Field";
import { Button } from "../../components/Button";
import { Banner } from "../../components/feedback";
import { formatTime } from "../../lib/format";

function Requirement({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span className={`pw-req${ok ? " pw-req--ok" : ""}`}>
      <span className="pw-req__dot">{ok && <i className="icon-check" aria-hidden />}</span>
      {children}
    </span>
  );
}

export default function FirstAccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  // a tela 03 pode encaminhar o código já digitado
  const [code, setCode] = useState<string>((location.state as { code?: string } | null)?.code ?? "");
  const [emailMasked, setEmailMasked] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const reqs = { len: pw.length >= 8, upper: /[A-Z]/.test(pw), digit: /\d/.test(pw) };
  const allOk = reqs.len && reqs.upper && reqs.digit && pw === pw2 && pw2.length > 0;

  async function validateCode() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/code/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Código inválido ou expirado.");
      return;
    }
    setEmailMasked(body.email_masked);
    setExpiresAt(body.expires_at);
    setStep(2);
  }

  async function setPassword() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/code/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, password: pw }),
    });
    const body = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(body.error ?? "Não foi possível definir a senha.");
      return;
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: body.email, password: pw });
    setLoading(false);
    if (signErr) {
      setError("Senha criada — entre pela tela de login.");
      return;
    }
    navigate("/");
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setCode(text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6));
    } catch {
      /* sem permissão de clipboard */
    }
  }

  return (
    <div className="auth-screen" data-screen="02" data-step={step}>
      <header className="auth-header">
        <button type="button" className="auth-header__back" aria-label="Voltar" onClick={() => (step === 2 ? setStep(1) : navigate("/login"))}>
          <i className="icon-arrow-left" aria-hidden />
        </button>
        <span className="auth-header__title">Primeiro acesso</span>
      </header>

      {step === 1 ? (
        <div className="auth-screen__top">
          <div className="step-indicator">
            <span className="step-indicator__num">1</span>passo 1 de 2
          </div>
          <h1 className="auth-title" style={{ marginTop: 22 }}>Código de acesso</h1>
          <p className="auth-sub">O administrador da sua assessoria gerou um código para você. Ele vale 24 horas e serve uma única vez.</p>

          {error && (
            <div style={{ marginTop: 18 }}>
              <Banner kind="danger">{error}</Banner>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <CodeBoxes value={code} onChange={setCode} />
          </div>
          <div className="code-meta">
            <span className="code-meta__expiry">
              <i className="icon-clock" aria-hidden />
              {expiresAt ? `expira em ${formatTime(expiresAt)}` : "vale por 24 horas"}
            </span>
            <button type="button" className="btn btn--paste" onClick={paste}>
              <i className="icon-clipboard-list" aria-hidden />
              Colar código
            </button>
          </div>
          <div style={{ marginTop: 22 }}>
            <Button block disabled={code.length < 6} loading={loading} onClick={validateCode}>
              Validar código
            </Button>
          </div>
          <div className="contact-card" style={{ marginTop: 26 }}>
            <span style={{ flex: 1 }}>
              <span className="contact-card__title">Sem código? Fale com o administrador</span>
              <span className="contact-card__sub">administrador da sua assessoria</span>
            </span>
            <a className="contact-card__wa" href="https://wa.me/" target="_blank" rel="noreferrer" aria-label="WhatsApp do administrador">
              <i className="icon-message-circle" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        <div className="auth-screen__top" style={{ paddingTop: 20 }}>
          <div className="step-indicator">
            <span className="step-indicator__num">2</span>passo 2 de 2
          </div>
          <h1 className="auth-title" style={{ marginTop: 22 }}>Crie sua senha</h1>
          <p className="auth-sub">Código validado. Crie agora a senha que você vai usar para entrar de hoje em diante — só você a conhece.</p>

          <div className="code-confirm" style={{ marginTop: 18 }}>
            <span className="code-confirm__label">
              <i className="icon-circle-check" aria-hidden />
              Código <span className="code-confirm__code">{code}</span>
            </span>
            <span className="code-confirm__email">{emailMasked}</span>
          </div>

          {error && (
            <div style={{ marginTop: 14 }}>
              <Banner kind="danger">{error}</Banner>
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <PasswordField label="Nova senha" className="auth-field" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
            <PasswordField label="Repita a senha" className="auth-field" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>

          <div className="pw-checklist" style={{ marginTop: 16 }}>
            <Requirement ok={reqs.len}>Pelo menos 8 caracteres</Requirement>
            <Requirement ok={reqs.upper}>Uma letra maiúscula</Requirement>
            <Requirement ok={reqs.digit}>Um número</Requirement>
          </div>

          <div style={{ marginTop: 24 }}>
            <Button block disabled={!allOk} loading={loading} onClick={setPassword}>
              Definir senha e entrar
            </Button>
          </div>
          <p className="auth-note">O botão libera quando os três requisitos passam.</p>
        </div>
      )}
    </div>
  );
}
