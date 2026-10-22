"use server";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/push/send";
import type { ActionResult } from "@/types/db";

const MAX_BODY = 1000;

/**
 * Envia uma mensagem no canal (conversa geral ou DM).
 *
 * `notifyAll` = aviso do administrador: além da mensagem no canal geral,
 * dispara Web Push para todos os jogadores ativos (só admin pode usar).
 *
 * A escrita passa pelo cliente da SESSÃO (RLS): a política de insert
 * exige `sender_id = auth.uid()` e membership no canal.
 */
export async function sendChatMessageAction(
  channelId: string,
  rawBody: string,
  notifyAll: boolean,
): Promise<ActionResult<{ id: string; created_at: string }>> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error: "Seu cadastro ainda aguarda aprovação do administrador.",
      };
    }
    const body = String(rawBody ?? "").trim();
    if (!body) return { ok: false, error: "Digite uma mensagem." };
    if (body.length > MAX_BODY) {
      return {
        ok: false,
        error: `Mensagem muito longa (máximo de ${MAX_BODY} caracteres).`,
      };
    }
    if (notifyAll && info.profile.role !== "admin") {
      return {
        ok: false,
        error: "Apenas administradores podem notificar todos.",
      };
    }

    const supabase = await createSupabaseServer();
    const { data: channel } = await supabase
      .from("chat_channels")
      .select("id, kind")
      .eq("id", channelId)
      .maybeSingle();
    if (!channel) return { ok: false, error: "Conversa não encontrada." };

    const { data: membership } = await supabase
      .from("chat_members")
      .select("channel_id")
      .eq("channel_id", channelId)
      .eq("user_id", info.userId)
      .maybeSingle();
    if (!membership) {
      return { ok: false, error: "Você não participa desta conversa." };
    }

    const { data: message, error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: channelId, sender_id: info.userId, body })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Quem enviou já leu a própria mensagem.
    await supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", info.userId);

    // Web Push (melhor esforço — nunca falha a ação por causa disso).
    const admin = createSupabaseAdmin();
    const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    if (channel.kind === "dm") {
      const { data: partners } = await admin
        .from("chat_members")
        .select("user_id")
        .eq("channel_id", channelId)
        .neq("user_id", info.userId);
      await notifyUsers(
        (partners ?? []).map((p) => p.user_id),
        {
          title: `Mensagem de ${info.profile.name}`,
          body: preview,
          url: `/app/chat?c=${channelId}`,
        },
      );
    } else if (notifyAll) {
      const { data: targets } = await admin
        .from("profiles")
        .select("id")
        .eq("active", true)
        .eq("pending_approval", false)
        .neq("id", info.userId);
      await notifyUsers(
        (targets ?? []).map((t) => t.id),
        {
          title: `Aviso de ${info.profile.name}`,
          body: preview,
          url: `/app/chat?c=${channelId}`,
        },
      );
    }

    return { ok: true, data: { id: message.id, created_at: message.created_at } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao enviar." };
  }
}

/** Marca a conversa como lida (zera o contador de não lidas). */
export async function markChannelReadAction(
  channelId: string,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", info.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao marcar." };
  }
}

/**
 * Edita a própria mensagem: só o autor, e a RLS restringe o UPDATE às
 * colunas body/edited_at (nenhum cliente troca channel_id/sender_id).
 * `edited_at` alimenta o marcador "(editado)" na UI.
 */
export async function editChatMessageAction(
  messageId: string,
  rawBody: string,
): Promise<ActionResult<{ body: string; edited_at: string }>> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error: "Seu cadastro ainda aguarda aprovação do administrador.",
      };
    }
    const body = String(rawBody ?? "").trim();
    if (!body) return { ok: false, error: "A mensagem não pode ficar vazia." };
    if (body.length > MAX_BODY) {
      return {
        ok: false,
        error: `Mensagem muito longa (máximo de ${MAX_BODY} caracteres).`,
      };
    }
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("chat_messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("sender_id", info.userId)
      .select("body, edited_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return { ok: false, error: "Mensagem não encontrada ou não é sua." };
    }
    return { ok: true, data: { body: data.body, edited_at: data.edited_at } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao editar." };
  }
}

/** Apaga a própria mensagem (some do histórico para todos os membros). */
export async function deleteChatMessageAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error: "Seu cadastro ainda aguarda aprovação do administrador.",
      };
    }
    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("sender_id", info.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao apagar." };
  }
}

/**
 * Abre (ou reutiliza) uma conversa direta com outro jogador.
 * O par é canonizado ("uuidMenor|uuidMaior") — uma única DM por par.
 */
export async function openDmAction(
  otherUserId: string,
): Promise<ActionResult<{ channelId: string }>> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error: "Seu cadastro ainda aguarda aprovação do administrador.",
      };
    }
    if (!otherUserId || otherUserId === info.userId) {
      return { ok: false, error: "Escolha outro jogador." };
    }

    const admin = createSupabaseAdmin();
    const { data: other } = await admin
      .from("profiles")
      .select("id, active, pending_approval")
      .eq("id", otherUserId)
      .maybeSingle();
    if (!other || !other.active || other.pending_approval) {
      return { ok: false, error: "Jogador indisponível." };
    }

    const [a, b] = [info.userId, otherUserId].sort();
    const pair = `${a}|${b}`;
    const { data: existing } = await admin
      .from("chat_channels")
      .select("id")
      .eq("dm_pair", pair)
      .maybeSingle();
    if (existing) return { ok: true, data: { channelId: existing.id } };

    const { data: created, error } = await admin
      .from("chat_channels")
      .insert({ kind: "dm", dm_pair: pair })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: membersError } = await admin.from("chat_members").insert([
      { channel_id: created.id, user_id: a },
      { channel_id: created.id, user_id: b },
    ]);
    if (membersError) throw new Error(membersError.message);
    return { ok: true, data: { channelId: created.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao abrir conversa." };
  }
}
