/** Tela 03 · Perdi minha senha — quadro "03 Perdi a senha escuro" (#3a). */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CodeBoxes } from "../../components/CodeBoxes";
import { Button } from "../../components/Button";
import { Banner } from "../../components/feedback";
import { Avatar } from "../../components/Avatar";

export default function LostPassword() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  return (
    <div className="auth-screen" data-screen="03">
      <header className="auth-header">
        <button type="button" className="auth-header__back" aria-label="Voltar" onClick={() => navigate("/login")}>
          <i className="ph ph-arrow-left" aria-hidden />
        </button>
        <span className="auth-header__title">Perdi minha senha</span>
      </header>

      <div className="auth-screen__top" style={{ paddingTop: 12 }}>
        <Banner kind="info">
          A Elev não envia e-mail. Quem redefine sua senha é o administrador da assessoria, com um novo código de acesso.
        </Banner>

        <div className="auth-section-title" style={{ marginTop: 22 }}>Como funciona</div>
        <div className="howto" style={{ marginTop: 12 }}>
          <span className="howto__step">
            <span className="howto__num">1</span>
            <span className="howto__text">Você pede um novo código ao administrador.</span>
          </span>
          <span className="howto__step">
            <span className="howto__num">2</span>
            <span className="howto__text">Ele gera o código na área administrativa e sua senha atual deixa de valer.</span>
          </span>
          <span className="howto__step">
            <span className="howto__num">3</span>
            <span className="howto__text">Você entra com o código e cria uma senha nova na hora.</span>
          </span>
        </div>

        <div className="contact-card" style={{ marginTop: 22 }}>
          <Avatar name="Administrador" size={36} />
          <span style={{ flex: 1 }}>
            <span className="contact-card__title">Administrador</span>
            <span className="contact-card__sub">administrador da sua assessoria</span>
          </span>
          <a className="contact-card__wa" href="https://wa.me/" target="_blank" rel="noreferrer" aria-label="WhatsApp do administrador">
            <i className="ph ph-whatsapp-logo" aria-hidden />
          </a>
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <div className="auth-section-title">Já recebeu o código?</div>
          <div style={{ marginTop: 12 }}>
            <CodeBoxes value={code} onChange={setCode} height={56} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Button block disabled={code.length < 6} onClick={() => navigate("/primeiro-acesso", { state: { code } })}>
              Entrar com código
            </Button>
          </div>
        </div>

        <p className="auth-fineprint">
          Administrador sem acesso: apenas o responsável pelo sistema pode redefinir, direto no banco de dados.
        </p>
      </div>
    </div>
  );
}
