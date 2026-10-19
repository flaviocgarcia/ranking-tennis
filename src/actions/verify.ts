"use server";

import { requireAdmin, adminScope } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { computeRanking, type RankingMatch } from "@/lib/domain/ranking";
import { getLevelAdmin, listLevelsAdmin } from "@/lib/queries/levels";
import { MATCH_RANKING_COLS } from "@/lib/queries/matches";
import { PROFILE_MIN_COLS } from "@/lib/queries/players";
import { getSnapshot } from "@/lib/queries/rankings";
import type { ActionResult, ConsistencyReport } from "@/types/db";

/**
 * Verificação de consistência (§5): recalcula cada ranking a partir dos
 * RESULTADOS OFICIAIS com a MESMA função de domínio usada na gravação e
 * compara com o snapshot publicado. Não altera nada.
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
          .limit(10000),
        getSnapshot(admin, level.id),
      ]);
      if (playersRes.error) throw new Error(playersRes.error.message);
      if (matchesRes.error) throw new Error(matchesRes.error.message);

      const players = (playersRes.data ?? []) as {
        id: string;
        name: string;
        initials: string;
      }[];
      const matches = (matchesRes.data ?? []) as RankingMatch[];

      const { entries, invalid } = computeRanking(players, matches, level.config);

      const diffs: string[] = [];
      const snapEntries = Array.isArray(snapshot?.data?.entries)
        ? snapshot.data.entries
        : null;

      if (!snapEntries) {
        diffs.push("Snapshot ausente (ranking nunca publicado).");
      } else {
        const snapPos = new Map(snapEntries.map((e) => [e.id, e]));
        const calcPos = new Map(entries.map((e) => [e.id, e]));

        for (const e of entries) {
          const s = snapPos.get(e.id);
          if (!s) {
            diffs.push(`Jogador ${e.id}: existe no cálculo, não no snapshot.`);
            continue;
          }
          if (s.pos !== e.pos || s.pts !== e.pts) {
            diffs.push(
              `Jogador ${e.id}: snapshot ${s.pos}º/${s.pts} pts vs cálculo ${e.pos}º/${e.pts} pts.`,
            );
          }
        }
        for (const s of snapEntries) {
          if (!calcPos.has(s.id)) {
            diffs.push(`${s.id}: existe no snapshot, não no cálculo.`);
          }
        }
        if (
          snapEntries.length !== entries.length &&
          diffs.length === 0
        ) {
          diffs.push(
            `Quantidades diferentes: snapshot ${snapEntries.length} vs cálculo ${entries.length}.`,
          );
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
