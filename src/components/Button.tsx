import { type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "icon";
type Size = 36 | 44 | 52;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  /** classe do ícone Phosphor, ex. "ph-plus" (leading) */
  icon?: string;
  /** ícone à direita, ex. "ph-caret-down" */
  trailingIcon?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = 44,
  block = false,
  loading = false,
  icon,
  trailingIcon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size !== 44 ? `btn--${size}` : "",
    block ? "btn--block" : "",
    loading ? "btn--loading" : "",
    icon && children ? "btn--leading-icon" : "",
    trailingIcon ? "btn--trailing-icon" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="btn__spinner" aria-hidden />}
      {!loading && icon && <i className={`ph ${icon}`} aria-hidden />}
      {children}
      {trailingIcon && <i className={`ph ${trailingIcon}`} aria-hidden />}
    </button>
  );
}
