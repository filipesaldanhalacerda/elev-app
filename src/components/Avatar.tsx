import { initials } from "../lib/format";

interface AvatarProps {
  name: string;
  size?: 26 | 34 | 36;
  neutral?: boolean;
}

/** Avatar de iniciais (#2d/#2e): tinta brand; neutro para cliente inativo. */
export function Avatar({ name, size = 36, neutral = false }: AvatarProps) {
  return (
    <span className={`avatar avatar--${size}${neutral ? " avatar--neutral" : ""}`} aria-hidden>
      {initials(name)}
    </span>
  );
}
