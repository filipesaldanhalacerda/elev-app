/**
 * Rolagem infinita do sistema: hook de paginação + sentinela.
 * Comportamento padrão para listas longas (alertas, histórico etc.):
 * carrega por páginas e busca a próxima quando a sentinela entra na viewport.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SkeletonCardRows } from "./states";

export interface Page<T> {
  rows: T[];
  /** total de linhas no servidor (count exact), quando a consulta informa */
  total?: number | null;
}

export function usePagedList<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  deps: unknown[],
  pageSize = 25
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // geração invalida respostas atrasadas quando os filtros mudam no meio de um fetch
  const genRef = useRef(0);
  const lengthRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    const gen = reset ? ++genRef.current : genRef.current;
    const from = reset ? 0 : lengthRef.current;
    if (!reset) setLoadingMore(true);
    try {
      const page = await fetchPage(from, from + pageSize - 1);
      if (gen !== genRef.current) return;
      setItems((prev) => {
        const next = reset || prev === null ? page.rows : [...prev, ...page.rows];
        lengthRef.current = next.length;
        setHasMore(page.total != null ? next.length < page.total : page.rows.length === pageSize);
        return next;
      });
      if (page.total !== undefined) setTotal(page.total ?? null);
    } finally {
      if (gen === genRef.current) setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps.concat(pageSize));

  useEffect(() => {
    setItems(null);
    lengthRef.current = 0;
    setHasMore(false);
    void load(true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) void load(false);
  }, [load, loadingMore, hasMore]);

  return { items, total, hasMore, loadingMore, loadMore, reload: () => load(true) };
}

/** Sentinela: dispara onMore quando aparece na tela; mostra o skeleton desenhado enquanto carrega. */
export function InfiniteSentinel({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && onMore(),
      { rootMargin: "320px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onMore]);

  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} data-infinite-sentinel style={{ paddingBottom: 4 }}>
      {loading && <SkeletonCardRows rows={2} height={64} label="Carregando mais itens" />}
    </div>
  );
}
