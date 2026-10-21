"use server";

import { requireAdmin, adminScope } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { computeChallengerSnapshot } from "@/lib/domain/challenger";
import { getLevelAdmin, listLevelsAdmin } from "@/lib/queries/levels";
import { MATCH_RANKING_COLS } from "@/lib/queries/matches";
import { PROFILE_MIN_COLS } from "@/lib/queries/players";
import { getSnapshot } from "@/lib/queries/rankings";
import type { ActionResult, ConsistencyReport } from "@/types/db";

/**
 * Verificação de consistência: recalcula o snapshot do F CHALLENGER a
 * partir dos RESULTADOS OFICIAIS com a MESMA função de domínio usada na
 * gravação e compara com o snapshot publicado (contribuições por partida
 * e total de jogos). Não altera nada.
 *
 * Executada sob demanda pelo administrador — nunca em leituras.
 */
export async function verifyRankingsAction(): Promise<
  ActionResult<ConsistencyReport[]>
> {
  try {
    const info = await requireAdmin();
    const admin = createSupabaseAdmin();
    const allLevels = await listLevelsAdmin(admin);
    // Administrador de nível verifica SOMENTE o nível sob sua responsabilidade.
    const scope = adminScope(info);
    const levels = scope ? allLevels.filter((l) => l.id === scope) : allLevels;

    const reports: ConsistencyReport[] = [];

    for (const level of levels) {
      const [playersRes, matchesRes, snapshot] = await Promise.all([
        admin
          .from("profiles")
          .select(PROFILE_MIN_COLS)
          .eq("level_id", level.id)
          .eq("active", true)
          .eq("pending_approval", false)
          .order("name")
          .limit(2000),
        admin
          .from("matches")
          .select(MATCH_RANKING_COLS)
          .eq("level_id", level.id)
          .eq("status", "confirmed")
          .order("played_on", { ascending: true })
          .order("id", { ascending: true })
          .limit(10000),
        getSnapshot(admin, level.id),
      ]);
      if (playersRes.error) throw new Error(playersRes.error.message);
      if (matchesRes.error) throw new Error(matchesRes.error.message);

      const players = (playersRes.data ?? []) as { id: string }[];
      const matches = matchesRes.data ?? [];

      const { data: calc, invalid } = computeChallengerSnapshot(players, matches);

      const diffs: string[] = [];
      const snap = snapshot?.data;

      if (!snap || !Array.isArray(snap.players)) {
        diffs.push("Snapshot ausente (ranking nunca publicado).");
      } else {
        if (snap.mc !== calc.mc) {
          diffs.push(
            `Jogos no snapshot: ${snap.mc} vs cálculo: ${calc.mc}.`,
          );
        }

        const calcById = new Map(calc.players.map((p) => [p.id, p.g]));
        const snapById = new Map(snap.players.map((p) => [p.id, p.g]));

        for (const [id, g] of calcById) {
          const s = snapById.get(id);
          if (!s) {
            diffs.push(`Jogador ${id}: existe no cálculo, não no snapshot.`);
            continue;
          }
          const cs = JSON.stringify(g);
          const ss = JSON.stringify(s);
          if (cs !== ss) {
            diffs.push(
              `Jogador ${id}: contribuições divergem — snapshot ${ss} vs cálculo ${cs}.`,
            );
          }
        }
        for (const id of snapById.keys()) {
          if (!calcById.has(id)) {
            diffs.push(`${id}: existe no snapshot, não no cálculo.`);
          }
        }
      }

      reports.push({
        levelId: level.id,
        levelName: level.name,
        slug: level.slug,
        snapshotAt: snapshot?.computed_at ?? null,
        matchesUsed: matches.length,
        invalidCount: invalid.length,
        consistent: diffs.length === 0,
        diffs: diffs.slice(0, 20),
      });
    }

    return { ok: true, data: reports };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha na verificação." };
  }
}
