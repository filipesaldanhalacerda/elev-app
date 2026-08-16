import { type ReactNode } from "react";
import { Button } from "./Button";

/** Toast (#2h): superfície invertida — único componente que quebra a regra de superfície. */
export function Toast({ icon = "icon-circle-check", children, action, onAction }: { icon?: string; children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="toast" role="status">
      <i className={`${icon}`} aria-hidden />
      <span className="toast__text">{children}</span>
      {action && (
        <button type="button" className="toast__action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

type BannerKind = "danger" | "warning" | "info" | "success";

const BANNER_ICONS: Record<BannerKind, string> = {
  danger: "icon-circle-alert",
  warning: "icon-wifi-off",
  info: "icon-info",
  success: "icon-circle-check",
};

interface BannerProps {
  kind: BannerKind;
  title?: string;
  children: ReactNode;
  icon?: string;
  action?: string;
  onAction?: () => void;
}

/** Banner semântico (#2h): tinta + borda + ícone 19px; erro pode carregar ação. */
export function Banner({ kind, title, children, icon, action, onAction }: BannerProps) {
  return (
    <div className={`banner banner--${kind}${title ? " banner--multiline" : ""}`} role={kind === "danger" ? "alert" : "status"}>
      <i className={`${icon ?? BANNER_ICONS[kind]} banner__icon`} aria-hidden />
      <span className="banner__body">
        {title ? (
          <>
            <span className="banner__title">{title}</span>
            <span className="banner__text">{children}</span>
          </>
        ) : (
          children
        )}
      </span>
      {action && (
        <button type="button" className="banner__action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

interface ModalProps {
  title: string;
  /** identificação em Mono sob o título (ex. "assessor · código A-1042") */
  id?: string;
  onClose?: () => void;
  children: ReactNode;
  impact?: { label: string; value: string }[];
  note?: string;
  actions?: ReactNode;
  /** para showcase/testes: renderiza sem position:fixed */
  inline?: boolean;
}

/** Modal (#2h): scrim, painel de impacto, rodapé com nota + ações. */
export function Modal({ title, id, onClose, children, impact, note, actions, inline }: ModalProps) {
  const dialog = (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="modal__head">
        <span>
          <span className="modal__title">{title}</span>
          {id && <span className="modal__id">{id}</span>}
        </span>
        <button type="button" className="modal__close" aria-label="Fechar" onClick={onClose}>
          <i className="icon-x" aria-hidden />
        </button>
      </div>
      <div className="modal__body">{children}</div>
      {impact && (
        <div className="modal__impact">
          {impact.map((row) => (
            <div key={row.label} className="modal__impact-row">
              {row.label}
              <span className="modal__impact-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="modal__foot">
        <span className="modal__note">{note}</span>
        <span className="modal__buttons">{actions}</span>
      </div>
    </div>
  );
  if (inline) return dialog;
  return (
    <div className="scrim" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        {dialog}
      </div>
    </div>
  );
}

type ChipKind = "success" | "neutral" | "warning" | "info" | "danger";

/** Chip de status (#2h): ponto + palavra — cor nunca é o único sinal. */
export function StatusChip({ kind, dot = true, icon, children }: { kind: ChipKind; dot?: boolean; icon?: string; children: ReactNode }) {
  return (
    <span className={`chip chip--${kind}`}>
      {icon ? <i className={`${icon}`} aria-hidden /> : dot ? <span className="chip__dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Chip de mercado (#2h): NEUTRO com seta — nunca imita chip de sucesso/erro. */
export function MarketChip({ up, children }: { up: boolean; children: ReactNode }) {
  return (
    <span className={`chip chip--market ${up ? "chip--up" : "chip--down"}`}>
      <i className={`${up ? "icon-arrow-up-right" : "icon-arrow-down-right"}`} aria-hidden />
      {children}
    </span>
  );
}

export { Button as ModalButton };
