import Link from "next/link";
import type { Metadata } from "next";
import { requireGlobalAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { getSnapshotsMeta } from "@/lib/queries/rankings";
import { describeFormat, describeScoring } from "@/lib/describe";
import { formatDateTime } from "@/lib/format";
import { PublishButton } from "@/components/PublishButton";

export const metadata: Metadata = { title: "Níveis e regras" };

/** Administração dos níveis: criação, edição e publicação manual. */
export default async function AdminLevelsPage() {
  await requireGlobalAdmin();
  const supabase = await createSupabaseServer();

  const levels = await listLevelsAdmin(supabase);
  const meta = await getSnapshotsMeta(
    supabase,
    levels.map((l) => l.id),
  );

  return (
    <>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title">Níveis e regras</h1>
        <Link href="/admin/levels/new" className="btn">
          + Novo nível
        </Link>
      </div>
      <p className="page-sub">
        Cada nível define formato, pontuação e desempate. Ao salvar, somente o
        ranking deste nível é recalculado e republicado.
      </p>

      {levels.length === 0 ? (
        <div className="card">
          <p className="muted">
            Nenhum nível cadastrado. Crie os níveis iniciais (ex.: A, B, C, D)
            ou importe o <code>supabase/seed.sql</code>.
          </p>
        </div>
      ) : (
        levels.map((level) => {
          const computedAt = meta.get(level.id);
          return (
            <section key={level.id} className="card">
              <div className="row-actions" style={{ justifyContent: "space-between" }}>
                <strong>
                  {level.name} <span className="muted small">({level.code})</span>{" "}
                  {!level.active && <span className="badge badge-rejected">Inativo</span>}
                </strong>
                <span className="row-actions">
                  <Link href={`/admin/levels/${level.id}`} className="btn btn-secondary btn-sm">
                    Editar
                  </Link>
                  <PublishButton levelId={level.id} />
                  <Link
                    href={`/rankings/${level.slug}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Ver público
                  </Link>
                </span>
              </div>
              <ul className="small muted" style={{ marginBottom: 0 }}>
                <li>{describeFormat(level.config)}</li>
                <li>{describeScoring(level.config)}</li>
              </ul>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Publicado:{" "}
                {computedAt ? formatDateTime(computedAt) : "ainda não publicado"}
              </p>
            </section>
          );
        })
      )}
    </>
  );
}
