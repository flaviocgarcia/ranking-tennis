#!/usr/bin/env node
/**
 * ============================================================
 * RECALCULAR E PUBLICAR OS RANKINGS
 *
 *   npm run rankings:rebuild
 *
 * Útil depois de uma mudança de regra de pontuação (ex.: ponto do
 * derrotado no tiebreakão), sem precisar abrir cada nível no painel.
 * Usa a MESMA função de domínio do app (`computeRanking`) e as mesmas
 * consultas do recálculo oficial, então o resultado é idêntico ao de
 * "Publicar" e ao de /admin/verify.
 *
 * Não altera partidas nem jogadores — grava apenas `ranking_snapshots`.
 * ============================================================
 */
import {
  buildAdminClient,
  loadComputeRanking,
  loadEnv,
} from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();
const computeRanking = loadComputeRanking();

const levelsRes = await admin
  .from("levels")
  .select("id, code, slug, name, config, sort_order")
  .order("sort_order", { ascending: true });
if (levelsRes.error) throw new Error(levelsRes.error.message);
const levels = levelsRes.data ?? [];
if (levels.length === 0) {
  console.error("Nenhum nível cadastrado.");
  process.exit(1);
}

console.log(`Recalculando ${levels.length} nível(is)...`);

for (const level of levels) {
  const [playersRes, matchesRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, name, initials")
      .eq("level_id", level.id)
      .eq("active", true)
      .eq("pending_approval", false)
      .order("name", { ascending: true })
      .limit(2000),
    admin
      .from("matches")
      .select("id, player1_id, player2_id, sets")
      .eq("level_id", level.id)
      .eq("status", "confirmed")
      .limit(10000),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (matchesRes.error) throw new Error(matchesRes.error.message);

  const players = playersRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const { entries, invalid } = computeRanking(players, matches, level.config);

  const at = new Date().toISOString();
  const saved = await admin.from("ranking_snapshots").upsert({
    level_id: level.id,
    data: { entries, mc: matches.length, at },
    computed_at: at,
  });
  if (saved.error) throw new Error(saved.error.message);

  const leader = entries[0];
  const leaderName = leader
    ? players.find((p) => p.id === leader.id)?.name
    : "-";
  console.log(
    `  ${level.code}: ${entries.length} jogador(es), ${matches.length} partida(s), ` +
      `líder ${leaderName ?? "-"} (${leader?.pts ?? 0} pts)` +
      (invalid.length > 0 ? ` — ${invalid.length} placar(es) ignorado(s)` : ""),
  );
}

console.log("Rankings republicados.");
