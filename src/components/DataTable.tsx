"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

/**
 * Tabela com ordenação por coluna e busca textual — tudo no navegador.
 *
 * Usada nas páginas PÚBLICAS (/rankings e /results), que já entregam a
 * lista inteira no HTML estático: clicar num cabeçalho ou digitar na
 * busca apenas reorderna/esconde os <tr> existentes — NENHUMA requisição
 * de rede, o cache da CDN segue intacto e o HTML servido é o mesmo para
 * todos (o comportamento é acrescentado depois da hidratação).
 *
 * O <table> continua renderizado pelo servidor (children) — links,
 * badges e cores de cada linha não mudam. Este componente só acrescenta:
 * clique/teclado nos <th> (com aria-sort), a caixa de busca e o filtro
 * de linhas. A ordem original é guardada por linha, para voltar ao
 * padrão ao clicar pela terceira vez.
 */

type Sort = { col: number; dir: "asc" | "desc" } | null;

interface Props {
  /** <table> já montada pelo servidor. */
  children: ReactNode;
  /** Com texto, exibe a caixa de busca acima da tabela. */
  searchPlaceholder?: string;
  /** Classes extras no wrapper de rolagem horizontal (ex.: "mt"). */
  className?: string;
}

/** Minúsculas e sem acento: "José" casa com "jose". */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Chave de ordenação de uma célula:
 * - "10/05/2025" → "20250510" (a data vira comparável em ordem cronológica);
 * - "475" ou "12,4" → número;
 * - qualquer outro texto → normalizado (sem acento/caixa).
 */
function cellKey(td: HTMLTableCellElement | undefined): string | number {
  const raw = (td?.dataset.sort ?? td?.textContent ?? "").trim();
  if (!raw) return "";
  const d = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (d) return `${d[3]}${d[2]}${d[1]}`;
  const n = raw.replace(/\./g, "").replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(n)) return Number(n);
  return norm(raw);
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR");
}

export function DataTable({ children, searchPlaceholder, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<{ shown: number; total: number } | null>(null);

  // Sem lista de dependências: roda após CADA render e (re)aplica ordem e
  // busca — assim, se o servidor entregar linhas novas (troca de página),
  // o estado do usuário é mantido sobre elas.
  useEffect(() => {
    const table = wrapRef.current?.querySelector("table");
    const head = table?.tHead?.rows[0];
    const body = table?.tBodies[0];
    if (!head || !body) return;

    const rows = Array.from(body.rows);

    // Ordem original = ordem de chegada da linha, guardada em data-ri
    // para poder restaurar o padrão depois de ordenar.
    rows.forEach((r, i) => {
      if (r.dataset.ri === undefined) r.dataset.ri = String(i);
    });

    // Cabeçalhos ordenáveis (clique é delegado no wrapper).
    Array.from(head.cells).forEach((th, i) => {
      th.classList.add("sortable");
      th.tabIndex = 0;
      th.title = "Ordenar por esta coluna";
      th.setAttribute(
        "aria-sort",
        sort && sort.col === i
          ? sort.dir === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
    });

    // Busca: esconde as linhas que não batem com o texto digitado.
    const q = norm(query.trim());
    let shown = 0;
    for (const r of rows) {
      const hit = !q || norm(r.textContent ?? "").includes(q);
      r.hidden = !hit;
      if (hit) shown++;
    }

    // Ordenação (ou restauração da ordem original quando sort === null).
    const sign = sort ? (sort.dir === "asc" ? 1 : -1) : 0;
    const ordered = [...rows].sort((a, b) => {
      if (sort) {
        const byKey =
          compare(cellKey(a.cells[sort.col]), cellKey(b.cells[sort.col])) * sign;
        if (byKey !== 0) return byKey;
      }
      return Number(a.dataset.ri) - Number(b.dataset.ri);
    });
    const frag = document.createDocumentFragment();
    for (const r of ordered) frag.appendChild(r);
    body.appendChild(frag);

    setCount((prev) =>
      prev && prev.shown === shown && prev.total === rows.length
        ? prev
        : { shown, total: rows.length },
    );
  });

  function colIndexFrom(target: EventTarget | null): number | null {
    const el = target instanceof Element ? target : null;
    const th = el?.closest("th");
    if (!th || !wrapRef.current?.contains(th)) return null;
    const tr = th.parentElement as HTMLTableRowElement | null;
    if (tr?.parentElement?.tagName !== "THEAD") return null;
    return Array.from(tr.cells).indexOf(th as HTMLTableCellElement);
  }

  /** Clique: 1º = crescente, 2º = decrescente, 3º = ordem original. */
  function activate(e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    const col = colIndexFrom(e.target);
    if (col === null) return;
    setSort((prev) =>
      prev?.col !== col
        ? { col, dir: "asc" }
        : prev.dir === "asc"
          ? { col, dir: "desc" }
          : null,
    );
  }

  const hasQuery = query.trim() !== "";

  return (
    <>
      {searchPlaceholder !== undefined && (
        <div className="table-controls">
          <input
            type="search"
            className="table-search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {hasQuery && count && (
            <span className="muted small" role="status">
              {count.shown === 0
                ? "Nenhum resultado"
                : `${count.shown} de ${count.total} linha${
                    count.shown === 1 ? "" : "s"
                  }`}
            </span>
          )}
        </div>
      )}
      <div
        ref={wrapRef}
        className={className ? `table-wrap ${className}` : "table-wrap"}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          activate(e);
        }}
      >
        {children}
      </div>
    </>
  );
}
