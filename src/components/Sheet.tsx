/**
 * Sheet padrão do sistema (#2h): sobe de baixo, scrim atrás e — como em app
 * nativo — fecha ARRASTANDO para baixo (acompanha o dedo; passou do limiar, fecha).
 * O arrasto só começa quando o conteúdo do sheet está no topo (scrollTop 0),
 * para não brigar com a rolagem interna.
 */
import { useEffect, useRef, type ReactNode } from "react";

const CLOSE_THRESHOLD_PX = 90;

export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY: number | null = null;
    let dy = 0;
    let dragging = false;

    const onStart = (e: TouchEvent) => {
      startY = el.scrollTop > 0 ? null : e.touches[0].clientY;
      dy = 0;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging && dy > 8) dragging = true;
      if (dragging && dy > 0) {
        e.preventDefault(); // segura a rolagem: o sheet acompanha o dedo
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
      }
    };
    const onEnd = () => {
      if (startY === null) return;
      if (dragging && dy > CLOSE_THRESHOLD_PX) {
        onCloseRef.current();
      } else {
        el.style.transition = "transform 160ms ease";
        el.style.transform = "";
      }
      startY = null;
      dragging = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={ref} className="sheet" role="dialog" aria-label={label}>
        <div className="sheet__handle"><span /></div>
        {children}
      </div>
    </>
  );
}
