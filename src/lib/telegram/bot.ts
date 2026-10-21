/**
 * Chatbot do Telegram — totalMENTE opcional (desligado sem env vars).
 *
 * Princípios de economia:
 * - Webhook HTTPS (sem polling, sem processo residente).
 * - Reutiliza as mesmas funções de domínio do sistema web
 *   (validateChallengerScore, snapshot do F CHALLENGER, mesmas consultas).
 * - Responde APENAS o pedido do usuário, com limites de histórico
 *   (top 10 do ranking, últimos 5 resultados).
 * - Sem notificações automáticas, sem envio em massa.
 */
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { formatDate, scoreText } from "@/lib/format";
import { listRecentMatchesOf } from "@/lib/queries/matches";
import { getSnapshot } from "@/lib/queries/rankings";
import { hydrateNames } from "@/lib/queries/players";
import { applyWindow, toViewRows, validateChallengerScore, windowStart } from "@/lib/domain/challenger";
import { siteUrl } from "@/lib/env";
import type { ProfileRow } from "@/types/db";
import type { ScoreSet } from "@/lib/domain/config";
import type { TelegramReply, TelegramUpdate } from "./api";

const HELP = (linked: boolean) =>
  linked
    ? [
        "Comandos disponíveis:",
        "/ranking [codigo] — classificação (top 10 + sua posição)",
        "/meus — seus 5 últimos resultados",
        "/registrar JOGADOR 6-4 7-5 — informar um resultado (fica pendente até o adm)",
        "/desvincular — desvincular este Telegram",
        "/ajuda — esta mensagem",
      ].join("\n")
    : [
        "Este bot ainda não está vinculado à sua conta.",
        `1. Abra ${siteUrl()}/profile e copie seu código de vínculo`,
        "2. Envie: /vincular SEU-CODIGO",
        "",
        "Depois disso: /ranking, /meus, /registrar.",
      ].join("\n");

function escapeIlike(term: string): string {
  return term.replace(/([%_\\])/g, "\\$1");
}

async function getLinkedProfile(
  telegramUserId: number,
): Promise<ProfileRow | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, name, initials, role, level_id, admin_level_id, pending_approval, active, must_change_password, telegram_id, telegram_link_code, created_at, updated_at",
    )
    .eq("telegram_id", telegramUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const profile = data as ProfileRow | null;
  return profile && profile.active ? profile : null;
}

async function splitArgs(text: string): Promise<{ cmd: string; args: string[] }> {
  const tokens = text.trim().split(/\s+/);
  const cmd = (tokens[0] ?? "").split("@")[0].toLowerCase();
  return Promise.resolve({ cmd, args: tokens.slice(1) });
}

async function cmdVincular(
  chatId: number,
  telegramUserId: number,
  args: string[],
): Promise<TelegramReply> {
  const code = (args[0] ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(code)) {
    return { chatId, text: "Envie: /vincular SEU-CODIGO (veja em /profile no site)." };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, telegram_id")
    .eq("telegram_link_code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { chatId, text: "Código não encontrado. Gere um novo em /profile no site." };
  }
  if (data.telegram_id && data.telegram_id !== telegramUserId) {
    return { chatId, text: "Este código já está vinculado a outra conta." };
  }
  const { error: updErr } = await admin
    .from("profiles")
    .update({ telegram_id: telegramUserId })
    .eq("id", data.id);
  if (updErr) throw new Error(updErr.message);
  return {
    chatId,
    text: `Vinculado como ${data.name}. Digite /ranking para ver a classificação.`,
  };
}

async function cmdDesvincular(
  chatId: number,
  telegramUserId: number,
): Promise<TelegramReply> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ telegram_id: null })
    .eq("telegram_id", telegramUserId);
  if (error) throw new Error(error.message);
  return { chatId, text: "Telegram desvinculado." };
}

async function cmdRanking(
  chatId: number,
  profile: ProfileRow,
  args: string[],
): Promise<TelegramReply> {
  if (!profile.level_id) {
    return { chatId, text: "Você ainda não possui nível definido." };
  }
  const admin = createSupabaseAdmin();
  const arg = (args[0] ?? "").trim().toLowerCase();

  let levelId = profile.level_id;
  let levelName = "";
  if (arg) {
    const { data, error } = await admin
      .from("levels")
      .select("id, name")
      .eq("active", true)
      .or(`slug.eq.${arg},code.ilike.${escapeIlike(arg)}`)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return { chatId, text: `Nível "${arg}" não encontrado.` };
    }
    levelId = data[0].id;
    levelName = data[0].name;
  } else {
    const { data } = await admin
      .from("levels")
      .select("id, name")
      .eq("id", profile.level_id)
      .maybeSingle();
    levelName = data?.name ?? "Seu nível";
  }

  const snapshot = await getSnapshot(admin, levelId);
  if (!snapshot || snapshot.data.players.length === 0) {
    return { chatId, text: "A classificação ainda não foi publicada." };
  }

  // Mesma janela de 12 meses da página pública (caducidade dos pontos).
  const today = new Date().toISOString().slice(0, 10);
  const windowRows = applyWindow(snapshot.data, windowStart(today));
  if (windowRows.length === 0) {
    return { chatId, text: "Nenhum jogo na janela de 12 meses." };
  }

  const names = await hydrateNames(
    admin,
    windowRows.map((r) => r.id),
  );
  const rows = toViewRows(windowRows, names);

  const lines: string[] = [`Classificação — ${levelName}`];
  for (const row of rows.slice(0, 10)) {
    lines.push(`${row.pos}. ${row.name} — ${row.pts} pts (${row.games} jogos)`);
  }
  const mineIdx = rows.findIndex((r) => r.id === profile.id);
  if (mineIdx >= 10) {
    const mine = rows[mineIdx];
    lines.push(
      `...`,
      `${mine.pos}. ${mine.name} (você) — ${mine.pts} pts (${mine.games} jogos)`,
    );
  }
  lines.push(`Atualizado em ${formatDate(snapshot.computed_at)}`);
  return { chatId, text: lines.join("\n") };
}

async function cmdMeus(
  chatId: number,
  profile: ProfileRow,
  args: string[],
): Promise<TelegramReply> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(Math.max(Number.parseInt(args[0] ?? "5", 10) || 5, 1), 10);
  const matches = await listRecentMatchesOf(admin, profile.id, limit);
  if (matches.length === 0) {
    return { chatId, text: "Você ainda não tem resultados registrados." };
  }
  const lines: string[] = ["Seus últimos resultados:"];
  for (const m of matches) {
    const p1Name = m.p1?.name ?? "?";
    const p2Name = m.p2?.name ?? "?";
    const status =
      m.status === "confirmed" ? "confirmado" : m.status === "pending" ? "pendente" : "rejeitado";
    lines.push(
      `${formatDate(m.played_on)} ${m.level?.name ?? ""}: ${p1Name} x ${p2Name} (${scoreText(m.sets)}) — ${status}`,
    );
  }
  return { chatId, text: lines.join("\n") };
}

async function cmdRegistrar(
  chatId: number,
  profile: ProfileRow,
  args: string[],
  updateId: number,
): Promise<TelegramReply> {
  if (!profile.level_id) {
    return { chatId, text: "Você ainda não possui nível definido." };
  }
  if (profile.pending_approval) {
    return {
      chatId,
      text: "Seu cadastro aguarda aprovação do administrador. Você poderá registrar resultados depois de aprovado.",
    };
  }

  // Separa "nome do adversário" dos tokens de set (6-4, 10-8...).
  const setTokens: string[] = [];
  const nameTokens: string[] = [];
  let seenSet = false;
  for (const t of args) {
    if (/^\d{1,2}-\d{1,2}$/.test(t)) {
      seenSet = true;
      setTokens.push(t);
    } else if (!seenSet) {
      nameTokens.push(t);
    } else {
      return { chatId, text: 'Formato: /registrar JOGADOR 6-4 7-5' };
    }
  }
  const term = nameTokens.join(" ").trim();
  if (!term || setTokens.length === 0) {
    return { chatId, text: 'Formato: /registrar JOGADOR 6-4 7-5' };
  }

  const admin = createSupabaseAdmin();
  const { data: levelRow, error: lvlErr } = await admin
    .from("levels")
    .select("id, name, config")
    .eq("id", profile.level_id)
    .maybeSingle();
  if (lvlErr) throw new Error(lvlErr.message);
  if (!levelRow) return { chatId, text: "Nível não encontrado." };

  // Busca por nome com limite (volume pequeno de um clube).
  const { data: candidates, error: candErr } = await admin
    .from("profiles")
    .select("id, name")
    .eq("level_id", profile.level_id)
    .eq("active", true)
    .eq("pending_approval", false)
    .neq("id", profile.id)
    .ilike("name", `%${escapeIlike(term)}%`)
    .order("name")
    .limit(8);
  if (candErr) throw new Error(candErr.message);

  const pool = candidates ?? [];
  const lower = term.toLowerCase();
  const exact = pool.filter((p) => p.name.toLowerCase() === lower);
  const starts = pool.filter((p) => p.name.toLowerCase().startsWith(lower));

  let chosen: { id: string; name: string } | undefined;
  if (exact.length === 1) chosen = exact[0];
  else if (starts.length === 1) chosen = starts[0];
  else if (exact.length === 0 && starts.length === 0 && pool.length === 1) chosen = pool[0];

  if (!chosen) {
    if (pool.length === 0) {
      return { chatId, text: `Nenhum jogador encontrado com "${term}" no seu nível.` };
    }
    const opts = (exact.length > 0 ? exact : starts.length > 0 ? starts : pool)
      .slice(0, 5)
      .map((p) => p.name)
      .join(", ");
    return { chatId, text: `Nome ambíguo. Tente mais específico: ${opts}` };
  }

  const sets: ScoreSet[] = setTokens.map((t) => {
    const [a, b] = t.split("-").map((n) => Number.parseInt(n, 10));
    return [a, b] as ScoreSet;
  });

  const validation = validateChallengerScore(sets, "normal");
  if (!validation.ok) return { chatId, text: validation.error };

  // Mesma checagem de duplicidade do formulário web.
  const { data: dup, error: dupErr } = await admin
    .from("matches")
    .select("id")
    .eq("level_id", profile.level_id)
    .eq("played_on", new Date().toISOString().slice(0, 10))
    .neq("status", "rejected")
    .or(
      `and(player1_id.eq.${profile.id},player2_id.eq.${chosen.id}),and(player1_id.eq.${chosen.id},player2_id.eq.${profile.id})`,
    )
    .limit(1);
  if (dupErr) throw new Error(dupErr.message);
  if ((dup ?? []).length > 0) {
    return { chatId, text: "Já existe um resultado entre vocês registrado hoje." };
  }

  const { error: insErr } = await admin.from("matches").insert({
    level_id: profile.level_id,
    player1_id: profile.id,
    player2_id: chosen.id,
    sets,
    format: "normal",
    walkover_winner: null,
    status: "pending",
    reported_by: profile.id,
    played_on: new Date().toISOString().slice(0, 10),
    source: "telegram",
    external_ref: `tg:${updateId}`,
  });
  if (insErr) {
    if (insErr.code === "23505") {
      return { chatId, text: "Este resultado já foi registrado (reenvio ignorado)." };
    }
    throw new Error(insErr.message);
  }

  const winnerName = validation.winner === "p1" ? profile.name : chosen.name;
  return {
    chatId,
    text:
      `Resultado registrado como PENDENTE:\n` +
      `${profile.name} x ${chosen.name} — ${scoreText(sets)}\n` +
      `Vencedor: ${winnerName} (${validation.winnerSets}x${validation.loserSets})\n` +
      `Aguardando confirmação do administrador.`,
  };
}

/**
 * Processa uma atualização do webhook e devolve NO MÁXIMO uma resposta.
 * Retorna null quando não há nada a responder (ex.: atualização sem texto).
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
): Promise<TelegramReply | null> {
  const msg = update.message;
  if (!msg || !msg.text || !msg.from) return null;
  if (msg.text.length > 500) return null;

  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const { cmd, args } = await splitArgs(msg.text);

  try {
    switch (cmd) {
      case "/start":
      case "/ajuda":
      case "/help": {
        const profile = await getLinkedProfile(fromId);
        return { chatId, text: HELP(profile !== null) };
      }
      case "/vincular":
        return await cmdVincular(chatId, fromId, args);
      case "/desvincular":
        return await cmdDesvincular(chatId, fromId);
      default: {
        const profile = await getLinkedProfile(fromId);
        if (!profile) {
          return { chatId, text: HELP(false) };
        }
        switch (cmd) {
          case "/ranking":
            return await cmdRanking(chatId, profile, args);
          case "/meus":
            return await cmdMeus(chatId, profile, args);
          case "/registrar":
            return await cmdRegistrar(chatId, profile, args, update.update_id);
          default:
            return { chatId, text: HELP(true) };
        }
      }
    }
  } catch (e) {
    console.warn("[telegram] erro:", e instanceof Error ? e.message : e);
    return {
      chatId,
      text: "Não foi possível processar agora. Tente novamente em instantes.",
    };
  }
}
