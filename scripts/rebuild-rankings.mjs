#!/usr/bin/env node
/**
 * ============================================================
 * RECALCULAR E PUBLICAR A CLASSIFICAÇÃO (F CHALLENGER)
 *
 *   npm run rankings:rebuild
 *
 * Útil depois de uma mudança de regra de pontuação, sem precisar abrir
 * o resultado de cada partida. Usa a MESMA função de domínio do app
 * (`computeChallengerSnapshot`) e as mesmas consultas do recálculo
 * oficial, então o snapshot é idêntico ao de "Publicar" e ao de
 * /admin/verify.
 *
 * O snapshot guarda as contribuições [data, pts] de cada partida; a
 * janela de 12 meses é aplicada na leitura (sem cron).
 *
 * Não altera partidas nem jogadores — grava apenas `ranking_snapshots`.
 * ============================================================
 */
import {
  buildAdminClient,
  loadChallengerDomain,
  loadEnv,
} from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();
const { computeChallengerSnapshot, applyWindow, toViewRows, windowStart } =
  loadChallengerDomain();

const levelsRes = await admin
  .from("levels")
  .select("id, code, slug, name, sort_order")
  .eq("active", true)
  .order("sort_order", { ascending: true });
if (levelsRes.error) throw new Error(levelsRes.error.message);
const levels = levelsRes.data ?? [];
if (levels.length === 0) {
  console.error("Nenhum nível ativo cadastrado.");
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
      .select("id, player1_id, player2_id, sets, format, walkover_winner, played_on")
      .eq("level_id", level.id)
      .eq("status", "confirmed")
      .limit(10000),
  ]);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (matchesRes.error) throw new Error(matchesRes.error.message);

  const players = playersRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const { data, invalid } = computeChallengerSnapshot(players, matches);

  const saved = await admin.from("ranking_snapshots").upsert({
    level_id: level.id,
    data,
    computed_at: data.at,
  });
  if (saved.error) throw new Error(saved.error.message);

  // Conferência rápida na janela corrente (mesma leitura do site).
  const names = new Map(players.map((p) => [p.id, p]));
  const rows = toViewRows(applyWindow(data, windowStart(new Date().toISOString().slice(0, 10))), names);
  const leader = rows[0];
  console.log(
    `  ${level.code}: ${rows.length} jogador(es) na janela, ` +
      `${matches.length} partida(s) confirmada(s), ` +
      `líder ${leader ? names.get(leader.id)?.name : "-"} (${leader?.pts ?? 0} pts)` +
      (invalid.length > 0 ? ` — ${invalid.length} partida(s) ignorada(s)` : ""),
  );
}

console.log("Classificação republicada.");
