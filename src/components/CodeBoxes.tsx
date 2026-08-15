/** 6 casas do código de uso único (telas 02/03): preenchidas + cursor na ativa. */
import { useRef } from "react";

interface CodeBoxesProps {
  value: string;
  onChange: (value: string) => void;
  height?: 60 | 56;
  disabled?: boolean;
}

export function CodeBoxes({ value, onChange, height = 60, disabled }: CodeBoxesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chars = value.toUpperCase().slice(0, 6);

  return (
    <div
      className={`code-boxes${height === 56 ? " code-boxes--56" : ""}`}
      style={{ position: "relative" }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="code-boxes__input"
        style={{ position: "absolute", inset: 0, width: "100%", opacity: 0 }}
        value={chars}
        maxLength={6}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        aria-label="Código de acesso"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
      />
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = i < chars.length;
        const active = i === chars.length;
        return (
          <span
            key={i}
            className={`code-boxes__cell${active ? " code-boxes__cell--active" : ""}${!filled && !active ? " code-boxes__cell--empty" : ""}`}
            data-cell={i}
          >
            {filled ? chars[i] : active ? <span className="code-boxes__caret" /> : null}
          </span>
        );
      })}
    </div>
  );
}
