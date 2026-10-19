import type { Metadata } from "next";
import { listPublicLevels } from "@/lib/queries/levels";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import {
  describeFormat,
  describeScoring,
  describeTiebreakers,
} from "@/lib/describe";
import type { LevelRow } from "@/types/db";

export const metadata: Metadata = {
  title: "Regras dos rankings",
  description:
    "Formato das partidas, pontuação e critérios de desempate de cada nível.",
};

/**
 * Regras públicas — página estática (atualizada via revalidatePath
 * quando o administrador altera um nível, sem cron).
 */
async function loadLevels(): Promise<LevelRow[] | null> {
  try {
    return (await listPublicLevels(createSupabaseAnon())) as LevelRow[];
  } catch (e) {
    console.error("[rules] falha ao carregar níveis:", e);
    return null;
  }
}

export default async function RulesPage() {
  const levels = await loadLevels();

  return (
    <>
      <h1 className="page-title">Regras dos rankings</h1>
      <p className="page-sub">
        Cada nível define seu formato, sua pontuação e seus critérios de
        desempate. A configuração abaixo é a vigente.
      </p>

      {levels === null ? (
        <div className="card">
          <p className="muted">
            Não foi possível carregar as regras agora. Tente novamente mais
            tarde.
          </p>
        </div>
      ) : levels.length === 0 ? (
        <div className="card">
          <p className="muted">Nenhum nível publicado até o momento.</p>
        </div>
      ) : (
        levels.map((level) => (
          <section key={level.id} className="card">
            <h2>
              {level.name}{" "}
              <span className="muted small">({level.code})</span>
            </h2>
            <ul>
              <li>{describeFormat(level.config)}</li>
              <li>{describeScoring(level.config)}</li>
              <li>{describeTiebreakers(level.config)}</li>
            </ul>
          </section>
        ))
      )}
    </>
  );
}
