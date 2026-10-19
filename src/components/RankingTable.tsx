import { Avatar } from "@/components/Avatar";
import type { RankingViewRow } from "@/lib/ranking/view";

/** Tabela de classificação (usada na página pública estática). */
export function RankingTable({ rows }: { rows: RankingViewRow[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            <th className="num">Pts</th>
            <th className="num">V</th>
            <th className="num">D</th>
            <th className="num col-sm">Sets</th>
            <th className="num col-sm">Games</th>
            <th className="num col-sm">P</th>
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
              <td className="num">{r.w}</td>
              <td className="num">{r.l}</td>
              <td className="num col-sm">
                {r.sw}-{r.sl}
              </td>
              <td className="num col-sm">
                {r.gw}-{r.gl}
              </td>
              <td className="num col-sm">{r.mp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
