import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSnapshot } from "@/lib/queries/rankings";
import { hydrateNames } from "@/lib/queries/players";
import { listRecentMatchesOf } from "@/lib/queries/matches";
import { getLevelAdmin } from "@/lib/queries/levels";
import { toViewRows } from "@/lib/ranking/view";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, scoreText, resultVerdict } from "@/lib/format";
import { clubName } from "@/lib/env";

export const metadata: Metadata = { title: "Painel do jogador" };

const TOP = 5;
const RECENT = 6;

/**
 * Painel do jogador (dinâmico — dados da sessão).
 * Consultas: sessão/perfil (deduplicadas no layout), nível, snapshot,
 * hidratação (1 consulta) e últimos 6 resultados. Sem N+1, sem polling.
 */
export default async function DashboardPage() {
  const info = await requireUser();
  const supabase = await createSupabaseServer();
  const { profile } = info;

  // Auto-cadastro ainda não aprovado: nada de ranking/resultados.
  if (profile.pending_approval) {
    const chosenLevel = profile.level_id
      ? await getLevelAdmin(supabase, profile.level_id)
      : null;
    return (
      <>
        <h1 className="page-title">Cadastro em análise</h1>
        <div className="alert alert-warn">
          <strong>Seu cadastro aguarda aprovação do administrador.</strong>
          <br />
          Você já pode entrar no sistema, mas só aparece no ranking e pode
          informar resultados depois da aprovação. Nível escolhido no cadastro:{" "}
          <strong>{chosenLevel?.name ?? "—"}</strong>.
        </div>
        <p className="muted">
          Enquanto isso, consulte as{" "}
          <Link href="/rankings">classificações públicas</Link> e os{" "}
          <Link href="/results">resultados</Link>.
        </p>
      </>
    );
  }

  let levelName: string | null = null;
  let levelSlug: string | null = null;
  if (profile.level_id) {
    const level = await getLevelAdmin(supabase, profile.level_id);
    levelName = level?.name ?? null;
    levelSlug = level?.slug ?? null;
  }

  const [snapshot, recent] = await Promise.all([
    profile.level_id ? getSnapshot(supabase, profile.level_id) : Promise.resolve(null),
    listRecentMatchesOf(supabase, profile.id, RECENT),
  ]);

  const entries = Array.isArray(snapshot?.data?.entries)
    ? snapshot.data.entries
    : [];

  // Hidrata apenas top 5 + a própria linha (1 consulta, poucos ids).
  const topEntries = entries.slice(0, TOP);
  const mine = entries.find((e) => e.id === profile.id) ?? null;
  const idsToLoad = [...topEntries.map((e) => e.id), ...(mine ? [mine.id] : [])];
  const names = idsToLoad.length > 0
    ? await hydrateNames(supabase, idsToLoad)
    : new Map<string, { name: string; initials: string }>();
  const topRows = toViewRows(topEntries, names);
  const mineRow = mine ? toViewRows([mine], names)[0] : null;

  return (
    <>
      <h1 className="page-title">Olá, {profile.name.split(" ")[0]} 👋</h1>
      <p className="page-sub">
        {clubName()} ·{" "}
        {levelName ? (
          <>
            nível <strong>{levelName}</strong>
          </>
        ) : (
          <span className="badge badge-pending">aguardando nível</span>
        )}
      </p>

      {!levelName && (
        <div className="alert alert-warn">
          Você ainda não possui um nível atribuído. Fale com o administrador
          para começar a aparecer no ranking.
        </div>
      )}

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <span className="value">{mineRow ? `#${mineRow.pos}` : "—"}</span>
            <span className="label">Sua posição</span>
          </div>
          <div className="stat">
            <span className="value">{mineRow ? mineRow.pts : "—"}</span>
            <span className="label">Pontos</span>
          </div>
          <div className="stat">
            <span className="value">
              {mineRow ? `${mineRow.w}-${mineRow.l}` : "—"}
            </span>
            <span className="label">Vitórias-Derrotas</span>
          </div>
        </div>
        <p className="mt" style={{ marginBottom: 0 }}>
          <Link href="/app/results/new" className="btn">
            + Informar resultado
          </Link>
        </p>
      </div>

      <div className="card">
        <h2>Top {TOP} do ranking</h2>
        {topRows.length === 0 ? (
          <p className="muted">
            {levelSlug ? (
              <>
                Ranking ainda não publicado.{" "}
                <Link href={`/rankings/${levelSlug}`}>Ver página</Link>
              </>
            ) : (
              "Aguardando publicação."
            )}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador</th>
                  <th className="num">Pts</th>
                  <th className="num">V-D</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((r) => (
                  <tr key={r.id} style={r.id === profile.id ? { background: "var(--accent-soft)" } : undefined}>
                    <td className="num">{r.pos}</td>
                    <td>
                      <span className="player-cell">
                        <Avatar initials={r.initials} />
                        {r.name}
                        {r.id === profile.id && " (você)"}
                      </span>
                    </td>
                    <td className="num">
                      <strong>{r.pts}</strong>
                    </td>
                    <td className="num">
                      {r.w}-{r.l}
                    </td>
                  </tr>
                ))}
                {mineRow && mineRow.pos > TOP && (
                  <tr style={{ background: "var(--accent-soft)" }}>
                    <td className="num">{mineRow.pos}</td>
                    <td>
                      <span className="player-cell">
                        <Avatar initials={mineRow.initials} />
                        {mineRow.name} (você)
                      </span>
                    </td>
                    <td className="num">
                      <strong>{mineRow.pts}</strong>
                    </td>
                    <td className="num">
                      {mineRow.w}-{mineRow.l}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {levelSlug && (
          <p className="small mt">
            <Link href={`/rankings/${levelSlug}`}>Ver classificação completa →</Link>
          </p>
        )}
      </div>

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Seus últimos resultados</h2>
          <Link href="/app/results" className="small">
            Ver todos →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">Nenhum resultado registrado ainda.</p>
        ) : (
          <div className="table-wrap mt">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Adversário</th>
                  <th>Placar</th>
                  <th className="col-sm">Nível</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const isP1 = m.player1_id === profile.id;
                  const opponent = isP1 ? m.p2 : m.p1;
                  const verdict = resultVerdict(m.sets);
                  const won = verdict && ((isP1 && verdict === "p1") || (!isP1 && verdict === "p2"));
                  return (
                    <tr key={m.id}>
                      <td>{formatDate(m.played_on)}</td>
                      <td>
                        <span className="player-cell">
                          <Avatar initials={(opponent?.name ?? "?").slice(0, 2).toUpperCase()} />
                          {opponent?.name ?? "?"}
                        </span>
                      </td>
                      <td>
                        {scoreText(m.sets)}{" "}
                        <span className="muted small">
                          ({won ? "V" : verdict ? "D" : "—"})
                        </span>
                      </td>
                      <td className="col-sm">{m.level?.name}</td>
                      <td>
                        <StatusBadge status={m.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
