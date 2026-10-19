import type { Metadata } from "next";
import Link from "next/link";
import { listPublicLevels } from "@/lib/queries/levels";
import { getSnapshotsMeta } from "@/lib/queries/rankings";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Classificações",
  description: "Ranking publicado por nível.",
};

interface LevelCard {
  id: string;
  code: string;
  slug: string;
  name: string;
  computedAt: string | null;
}

async function loadCards(): Promise<LevelCard[] | null> {
  try {
    const anon = createSupabaseAnon();
    const levels = await listPublicLevels(anon);
    const meta = await getSnapshotsMeta(
      anon,
      levels.map((l) => l.id),
    );
    return levels.map((l) => ({
      id: l.id,
      code: l.code,
      slug: l.slug,
      name: l.name,
      computedAt: meta.get(l.id) ?? null,
    }));
  } catch (e) {
    console.error("[rankings] falha ao carregar níveis:", e);
    return null;
  }
}

/** Lista pública dos níveis — página estática (2 consultas na build/revalidação). */
export default async function RankingsIndexPage() {
  const cards = await loadCards();

  return (
    <>
      <h1 className="page-title">Classificações</h1>
      <p className="page-sub">
        Escolha um nível para ver a classificação publicada.
      </p>

      {cards === null ? (
        <div className="card">
          <p className="muted">
            Não foi possível carregar as classificações agora. Tente novamente
            mais tarde.
          </p>
        </div>
      ) : cards.length === 0 ? (
        <div className="card">
          <p className="muted">Nenhum nível publicado até o momento.</p>
        </div>
      ) : (
        <div className="grid mt">
          {cards.map((c) => (
            <Link key={c.id} href={`/rankings/${c.slug}`} className="link-card">
              <div className="title">
                {c.name} <span className="muted">({c.code})</span>
              </div>
              <div className="desc">
                {c.computedAt
                  ? `Atualizada em ${formatDateTime(c.computedAt)}`
                  : "Aguardando primeira publicação"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
