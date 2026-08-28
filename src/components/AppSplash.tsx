/**
 * Tela 26 · Splash — quadro "26 Splash e instalacao" (#5c).
 * É o que a pessoa vê enquanto a sessão é verificada: fundo brand-800 nos DOIS
 * temas, ícone "e" 76px, wordmark "elev" e spinner. Nunca uma tela em branco.
 */
export function AppSplash() {
  return (
    <div
      data-app-shell
      data-splash
      role="status"
      aria-label="Carregando a Elev"
      style={{
        minHeight: "100dvh",
        background: "var(--brand-800)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <span
        style={{
          width: 76,
          height: 76,
          borderRadius: 20,
          background: "var(--brand-50)",
          color: "var(--brand-800)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 38px/1 var(--font-mono)",
        }}
        aria-hidden
      >
        e
      </span>
      <span style={{ font: "600 24px/1 var(--font-sans)", letterSpacing: "-0.02em", color: "var(--brand-50)" }} aria-hidden>
        elev
      </span>
      <span className="splash__spinner" aria-hidden />
    </div>
  );
}
