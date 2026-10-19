import Link from "next/link";

/**
 * Paginação renderizada no servidor (links simples, sem JS extra).
 * Os dados já vêm paginados do banco (range no servidor).
 */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  query = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v) params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className="pagination" aria-label="Paginação">
      {page > 1 ? (
        <Link href={href(page - 1)}>← Anterior</Link>
      ) : (
        <span className="muted small">← Anterior</span>
      )}
      <span className="page-info">
        Página <strong>{page}</strong> de <strong>{totalPages}</strong> ·{" "}
        {total} registro{total === 1 ? "" : "s"}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)}>Próxima →</Link>
      ) : (
        <span className="muted small">Próxima →</span>
      )}
    </nav>
  );
}
