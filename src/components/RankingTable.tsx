import { Avatar } from "@/components/Avatar";
import type { ChallengerViewRow } from "@/lib/domain/challenger";

/**
 * Tabela da classificação do F CHALLENGER (página pública estática).
 * Mesmas colunas da planilha: POS · ATLETA · PONTOS · JGS · MÉDIA.
 */
export function RankingTable({ rows }: { rows: ChallengerViewRow[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Atleta</th>
            <th className="num">Pontos</th>
            <th className="num">JGS</th>
            <th className="num">Média</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="num">
                <strong style={r.pos <= 3 ? { color: "var(--accent-dark)" } : undefined}>
                  {r.pos}
                </strong>
              </td>
              <td>
                <span className="player-cell">
                  <Avatar initials={r.initials} />
                  {r.name}
                </span>
              </td>
              <td className="num">
                <strong>{r.pts}</strong>
              </td>
              <td className="num">{r.games}</td>
              <td className="num">
                {r.avg.toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
