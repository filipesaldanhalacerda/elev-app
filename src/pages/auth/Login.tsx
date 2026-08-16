/** Tela 01 · Login — quadros "01 Login claro" e "01 Login escuro erro" (#3a). */
import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { PasswordField, TextField } from "../../components/Field";
import { Banner } from "../../components/feedback";
import { Button } from "../../components/Button";
import { OrganicLines } from "../../components/OrganicLines";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(true);
      return;
    }
    navigate("/");
  }

  return (
    <div className="auth-screen" data-screen="01">
      <OrganicLines height={230} />
      <form className="auth-screen__center" onSubmit={submit}>
        <div className="auth-logo">
          <span className="auth-logo__mark">e</span>
          <span className="auth-logo__word">elev</span>
        </div>
        <h1 className="auth-title">Entrar na plataforma</h1>
        <p className="auth-sub">Use o e-mail cadastrado pela sua assessoria.</p>

        {error && (
          <div style={{ marginTop: 20 }}>
            <Banner kind="danger" title="E-mail ou senha incorretos">
              Restam 3 tentativas antes do bloqueio temporário.
            </Banner>
          </div>
        )}

        <div style={{ marginTop: error ? 18 : 26, display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            className="auth-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            label="Senha"
            autoComplete="current-password"
            className={`auth-field${error ? " field--error" : ""}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 22 }}>
          <Button type="submit" block loading={loading}>
            Entrar
          </Button>
        </div>
        <Link to="/primeiro-acesso" className="auth-link">
          Primeiro acesso ou perdi a senha
        </Link>
      </form>
      <footer className="auth-screen__footer">Elev Investimentos · assessoria vinculada à XP</footer>
    </div>
  );
}
