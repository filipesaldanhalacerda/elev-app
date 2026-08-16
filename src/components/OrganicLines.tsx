/**
 * Linhas orgânicas decorativas — curvas suaves na cor de ação que se integram
 * ao topo das telas (junto com a aura), dando vida sem disputar com o conteúdo.
 * Puramente decorativo: aria-hidden, sem eventos, cores só via tokens.
 */
export function OrganicLines({ height = 190 }: { height?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 390 190"
      preserveAspectRatio="none"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height, pointerEvents: "none", zIndex: -1 }}
    >
      <path
        d="M-20,148 C90,92 170,168 258,108 S382,42 420,78"
        fill="none"
        stroke="color-mix(in srgb, var(--action) 18%, transparent)"
        strokeWidth="1.5"
      />
      <path
        d="M-20,110 C82,62 192,138 300,72 S396,14 420,42"
        fill="none"
        stroke="color-mix(in srgb, var(--action) 11%, transparent)"
        strokeWidth="1"
      />
      <path
        d="M-20,182 C124,132 246,192 420,122"
        fill="none"
        stroke="color-mix(in srgb, var(--action) 7%, transparent)"
        strokeWidth="2.5"
      />
    </svg>
  );
}
