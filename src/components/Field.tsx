import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

interface FieldShellProps {
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Casca de campo (#2c): rótulo 12/500 acima, caixa 44px, linha de ajuda de erro. */
export function FieldShell({ label, error, disabled, className, children }: FieldShellProps) {
  const classes = ["field", error ? "field--error" : "", disabled ? "field--disabled" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {label && <div className="field__label">{label}</div>}
      {children}
      {error && (
        <div className="field__help">
          <i className="ph ph-warning-circle" aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  mono?: boolean;
  tabular?: boolean;
  /** ícone Phosphor à direita (ex. ph-calendar-blank, ph-clock, ph-caret-down) */
  trailingIcon?: string;
}

export function TextField({ label, error, mono, tabular, trailingIcon, className, disabled, ...rest }: TextFieldProps) {
  const boxClasses = ["field__box", tabular ? "field__box--tabular" : ""].filter(Boolean).join(" ");
  return (
    <FieldShell label={label} error={error} disabled={disabled} className={className}>
      <div className={boxClasses}>
        <input className={`field__input${mono ? " field__input--mono" : ""}`} disabled={disabled} {...rest} />
        {trailingIcon && (
          <i
            className={`ph ${trailingIcon} ${trailingIcon === "ph-caret-down" ? "field__caret" : "field__trailing-icon"}`}
            aria-hidden
          />
        )}
      </div>
    </FieldShell>
  );
}

interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function PasswordField({ label, error, className, disabled, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell label={label} error={error} disabled={disabled} className={`field--password${className ? ` ${className}` : ""}`}>
      <div className="field__box">
        <input className="field__input" type={visible ? "text" : "password"} disabled={disabled} {...rest} />
        <button
          type="button"
          className="field__eye"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((v) => !v)}
        >
          <i className={`ph ${visible ? "ph-eye-slash" : "ph-eye"}`} aria-hidden />
        </button>
      </div>
    </FieldShell>
  );
}

interface MoneyFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/** Valor monetário (#2c): prefixo "R$" em text-3, dígitos à direita 600 tabular. */
export function MoneyField({ label, error, className, disabled, ...rest }: MoneyFieldProps) {
  return (
    <FieldShell label={label} error={error} disabled={disabled} className={className}>
      <div className="field__box">
        <span className="field__prefix">R$</span>
        <input className="field__input field__money" inputMode="decimal" disabled={disabled} {...rest} />
      </div>
    </FieldShell>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextareaField({ label, error, className, ...rest }: TextareaFieldProps) {
  return (
    <FieldShell label={label} error={error} className={className}>
      <textarea className="field__textarea" {...rest} />
    </FieldShell>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="checkbox"
      onClick={() => onChange?.(!checked)}
    >
      {checked && <i className="ph ph-check" aria-hidden />}
    </button>
  );
}

interface RadioProps {
  checked: boolean;
  onSelect?: () => void;
  label?: string;
}

export function Radio({ checked, onSelect, label }: RadioProps) {
  return <button type="button" role="radio" aria-checked={checked} aria-label={label} className="radio" onClick={onSelect} />;
}
