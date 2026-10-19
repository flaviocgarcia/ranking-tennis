"use server";

import { levelOutOfScope, requireAdmin, requireUser } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { validateMatchScore } from "@/lib/domain/match";
import { rebuildAndRevalidate } from "@/lib/ranking/service";
import { getLevelAdmin } from "@/lib/queries/levels";
import { getMatchAdmin } from "@/lib/queries/matches";
import { dateString, parseSetStrings, uuidString } from "@/lib/validation";
import type { ActionResult, MatchStatus } from "@/types/db";
import type { LevelConfig, ScoreSet } from "@/lib/domain/config";
import type { SupabaseClient } from "@supabase/supabase-js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Evita reenvio duplicado: mesma partida no mesmo dia já registrada. */
async function duplicateExists(
  supabase: SupabaseClient,
  levelId: string,
  p1: string,
  p2: string,
  playedOn: string,
  ignoreId?: string,
): Promise<boolean> {
  let q = supabase
    .from("matches")
    .select("id")
    .eq("level_id", levelId)
    .eq("played_on", playedOn)
    .neq("status", "rejected")
    .or(
      `and(player1_id.eq.${p1},player2_id.eq.${p2}),and(player1_id.eq.${p2},player2_id.eq.${p1})`,
    )
    .limit(1);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function loadLevelConfig(
  supabase: SupabaseClient,
  levelId: string,
): Promise<{ id: string; slug: string; config: LevelConfig }> {
  const level = await getLevelAdmin(supabase, levelId);
  if (!level) throw new Error("Nível não encontrado.");
  return level;
}

async function assertPlayersInLevel(
  supabase: SupabaseClient,
  levelId: string,
  playerIds: string[],
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, level_id, active, pending_approval")
    .in("id", playerIds);
  if (error) throw new Error(error.message);
  for (const id of playerIds) {
    const row = (data ?? []).find((p) => p.id === id);
    if (!row) throw new Error("Jogador não encontrado.");
    if (!row.active) throw new Error("Jogador inativo.");
    if (row.pending_approval) {
      throw new Error("Jogador com cadastro aguardando aprovação do administrador.");
    }
    if (row.level_id !== levelId) {
      throw new Error("Os dois jogadores precisam estar no mesmo nível.");
    }
  }
}

/** Recalcula o ranking afetado e limpa o cache estático das páginas públicas. */
async function afterOfficialChange(levelId: string): Promise<void> {
  await rebuildAndRevalidate(levelId);
}

/**
 * Registrar resultado (qualquer jogador — entra como PENDENTE).
 * RLS garante que só participantes inserem, sempre como pendente.
 */
export async function submitMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error:
          "Seu cadastro ainda aguarda aprovação do administrador. Você poderá informar resultados depois de aprovado.",
      };
    }
    const levelId = info.profile.level_id;
    if (!levelId) {
      return {
        ok: false,
        error: "Você ainda não foi incluído em um nível. Fale com o administrador.",
      };
    }

    const opponentId = uuidString(formData.get("opponent_id"), "Adversário");
    if (opponentId === info.userId) {
      return { ok: false, error: "Você não pode jogar contra você mesmo." };
    }
    const playedOn = dateString(formData.get("played_on"), "Data");
    if (playedOn > today()) {
      return { ok: false, error: "A data não pode estar no futuro." };
    }
    const sets = parseSetStrings(formData.getAll("set"));

    const supabase = await createSupabaseServer();
    const level = await loadLevelConfig(supabase, levelId);
    const validation = validateMatchScore(sets, level.config);
    if (!validation.ok) return { ok: false, error: validation.error };

    await assertPlayersInLevel(supabase, levelId, [info.userId, opponentId]);

    if (await duplicateExists(supabase, levelId, info.userId, opponentId, playedOn)) {
      return {
        ok: false,
        error: "Já existe um resultado entre esses jogadores nessa data.",
      };
    }

    const { error } = await supabase.from("matches").insert({
      level_id: levelId,
      player1_id: info.userId,
      player2_id: opponentId,
      sets,
      status: "pending",
      reported_by: info.userId,
      played_on: playedOn,
      source: "web",
    });
    if (error) throw new Error(error.message);

    // Pendente não altera o ranking oficial => nenhum recálculo.
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao registrar." };
  }
}

/**
 * Criar/editar resultado pelo administrador.
 * Resultado confirmado recalcula o ranking do nível na mesma operação.
 */
export async function saveMatchAdminAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const info = await requireAdmin();
    const matchIdRaw = formData.get("match_id");
    const matchId = matchIdRaw ? uuidString(matchIdRaw, "Resultado") : null;

    const levelId = uuidString(formData.get("level_id"), "Nível");
    const scopeError = levelOutOfScope(info, levelId);
    if (scopeError) return { ok: false, error: scopeError };
    const player1 = uuidString(formData.get("player1_id"), "Jogador 1");
    const player2 = uuidString(formData.get("player2_id"), "Jogador 2");
    if (player1 === player2) {
      return { ok: false, error: "Escolha dois jogadores diferentes." };
    }
    const playedOn = dateString(formData.get("played_on"), "Data");
    const statusRaw = String(formData.get("status") ?? "confirmed");
    const status: MatchStatus =
      statusRaw === "pending" ? "pending" : "confirmed";
    const sets: ScoreSet[] = parseSetStrings(formData.getAll("set"));

    const admin = createSupabaseAdmin();
    const level = await loadLevelConfig(admin, levelId);
    const validation = validateMatchScore(sets, level.config);
    if (!validation.ok) return { ok: false, error: validation.error };

    await assertPlayersInLevel(admin, levelId, [player1, player2]);

    if (await duplicateExists(admin, levelId, player1, player2, playedOn, matchId ?? undefined)) {
      return {
        ok: false,
        error: "Já existe um resultado entre esses jogadores nessa data.",
      };
    }

    let affected = status === "confirmed";
    let previousStatus: MatchStatus | null = null;
    let previousLevelId: string | null = null;

    if (matchId) {
      const existing = await getMatchAdmin(admin, matchId);
      if (!existing) return { ok: false, error: "Resultado não encontrado." };
      const existingScopeError = levelOutOfScope(info, existing.level_id);
      if (existingScopeError) return { ok: false, error: existingScopeError };
      previousStatus = existing.status;
      previousLevelId = existing.level_id;
      affected = affected || existing.status === "confirmed";

      const { error } = await admin
        .from("matches")
        .update({
          level_id: levelId,
          player1_id: player1,
          player2_id: player2,
          sets,
          status,
          played_on: playedOn,
          confirmed_by: status === "confirmed" ? info.userId : null,
          confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
        })
        .eq("id", matchId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("matches").insert({
        level_id: levelId,
        player1_id: player1,
        player2_id: player2,
        sets,
        status,
        played_on: playedOn,
        reported_by: info.userId,
        confirmed_by: status === "confirmed" ? info.userId : null,
        confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
        source: "admin",
      });
      if (error) throw new Error(error.message);
    }

    if (affected || previousStatus === "confirmed") {
      await afterOfficialChange(levelId);
      // Troca de nível: o ranking do nível ANTERIOR também muda (o ponto
      // deixa de contar lá) e precisa ser recalculado e republicado.
      if (
        previousLevelId &&
        previousLevelId !== levelId &&
        previousStatus === "confirmed"
      ) {
        await afterOfficialChange(previousLevelId);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}

/** Confirmar / reabrir / rejeitar um resultado (administrador). */
export async function setMatchStatusAction(formData: FormData): Promise<void> {
  const info = await requireAdmin();
  const id = uuidString(formData.get("id"), "Resultado");
  const target = String(formData.get("target"));
  if (target !== "confirmed" && target !== "pending" && target !== "rejected") {
    throw new Error("Ação inválida.");
  }

  const admin = createSupabaseAdmin();
  const existing = await getMatchAdmin(admin, id);
  if (!existing) throw new Error("Resultado não encontrado.");
  const scopeError = levelOutOfScope(info, existing.level_id);
  if (scopeError) throw new Error(scopeError);

  const { error } = await admin
    .from("matches")
    .update({
      status: target,
      confirmed_by: target === "confirmed" ? info.userId : null,
      confirmed_at: target === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (existing.status === "confirmed" || target === "confirmed") {
    await afterOfficialChange(existing.level_id);
  }
}

/** Remover um resultado (administrador). */
export async function deleteMatchAction(formData: FormData): Promise<void> {
  const info = await requireAdmin();
  const id = uuidString(formData.get("id"), "Resultado");

  const admin = createSupabaseAdmin();
  const existing = await getMatchAdmin(admin, id);
  if (!existing) throw new Error("Resultado não encontrado.");
  const scopeError = levelOutOfScope(info, existing.level_id);
  if (scopeError) throw new Error(scopeError);

  const { error } = await admin.from("matches").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (existing.status === "confirmed") {
    await afterOfficialChange(existing.level_id);
  }
}

/** Retirar uma própria pendente (jogador que a informou). */
export async function withdrawMatchAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuidString(formData.get("id"), "Resultado");

  const supabase = await createSupabaseServer();
  // RLS: só pendentes reportadas pelo próprio jogador podem ser removidas.
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) {
    throw new Error(
      "Não foi possível retirar o resultado (só pendentes suas podem ser retiradas).",
    );
  }
}
