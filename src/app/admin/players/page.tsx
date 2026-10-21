import Link from "next/link";
import type { Metadata } from "next";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { adminAvailable, createSupabaseAdmin, SERVICE_KEY_HINT } from "@/lib/supabase/admin";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { listPlayersPaged } from "@/lib/queries/players";
import { approvePlayerAction } from "@/actions/players";
import { Avatar } from "@/components/Avatar";
import { Pagination } from "@/components/Pagination";

export const metadata: Metadata = { title: "Jogadores" };

const PAGE_SIZE = 15;

/**
 * Lista paginada de jogadores com busca por nome (ilike + limite)
 * e filtro por nível — tudo no servidor.
 *
 * Usa a chave de service: a coluna `email` é privada no RLS (grant por
 * coluna, ver 0002_rls.sql) e a listagem é um contexto administrativo.
 */
export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; level?: string; pending?: string }>;
}) {
  const info = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().slice(0, 60);
  // Administrador de nível enxerga somente o próprio nível (ignora ?level).
  const scope = adminScope(info);
  const levelId = scope ?? (sp.level ?? "").trim();
  const pending = sp.pending === "1";

  if (!adminAvailable()) {
    return (
      <>
        <h1 className="page-title">Jogadores</h1>
        <div className="alert alert-warn">{SERVICE_KEY_HINT}</div>
        <p className="small">
          <Link href="/admin">← Painel</Link>
        </p>
      </>
    );
  }

  const supabase = createSupabaseAdmin();
  const [allLevels, players] = await Promise.all([
    listLevelsAdmin(supabase),
    listPlayersPaged(supabase, {
      search: q,
      levelId,
      pending,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const levels = scope ? allLevels.filter((l) => l.id === scope) : allLevels;

  const levelName = (id: string | null) =>
    id ? (levels.find((l) => l.id === id)?.name ?? "—") : "sem nível";

  return (
    <>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Jogadores</h1>
        <Link href="/admin/players/new" className="btn">
          + Cadastrar jogador
        </Link>
      </div>

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="q">Buscar por nome</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={60} placeholder="Ex.: joão" />
        </div>
        {!scope && (
          <div className="field">
            <label htmlFor="level">Nível</label>
            <select id="level" name="level" defaultValue={levelId}>
              <option value="">Todos</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="check" style={{ alignSelf: "end", marginBottom: 10 }}>
          <input type="checkbox" name="pending" value="1" defaultChecked={pending} />
          Só aguardando aprovação
        </label>
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
      </form>

      {players.rows.length === 0 ? (
        <div className="card">
          <p className="muted">
            Nenhum jogador encontrado.{" "}
            <Link href="/admin/players/new">Cadastrar o primeiro</Link>.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th className="col-sm">E-mail</th>
                <th>Nível</th>
                <th className="col-sm">Perfil</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="player-cell">
                      <Avatar initials={p.initials} />
                      {p.name}
                      {p.ref_level && (
                        <span className="badge badge-level">{p.ref_level}</span>
                      )}
                    </span>
                  </td>
                  <td className="col-sm muted small">{p.email}</td>
                  <td>{levelName(p.level_id)}</td>
                  <td className="col-sm">
                    {p.role === "admin" ? "Admin" : "Jogador"}
                  </td>
                  <td>
                    {p.pending_approval && (
                      <span className="badge badge-pending">Aguardando aprovação</span>
                    )}{" "}
                    {p.active ? (
                      <span className="badge badge-confirmed">Ativo</span>
                    ) : (
                      <span className="badge badge-rejected">Inativo</span>
                    )}
                    {p.must_change_password && (
                      <>
                        {" "}
                        <span className="badge badge-pending">Senha pendente</span>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/admin/players/${p.id}`} className="btn btn-secondary btn-sm">
                        Editar
                      </Link>
                      {p.pending_approval && (
                        <form action={approvePlayerAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-sm" type="submit">
                            Aprovar
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={players.count}
        basePath="/admin/players"
        query={{ q, level: scope ? "" : levelId, pending: pending ? "1" : "" }}
      />
    </>
  );
}
