import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  ChatApp,
  type ChatChannelView,
  type ChatMessageView,
  type ChatPlayerView,
} from "@/components/ChatApp";

export const metadata: Metadata = { title: "Chat" };

const MESSAGE_LIMIT = 100;

/**
 * Chat do clube: conversa geral + conversas diretas, em tempo real
 * (Supabase Realtime com RLS — cada um só recebe o que é seu).
 *
 * Dinâmico (lê cookies da sessão); os dados iniciais vêm do servidor e
 * as mensagens novas chegam via `postgres_changes` no componente de
 * cliente (ChatApp).
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const info = await requireUser();
  const { profile } = info;

  if (profile.pending_approval) {
    return (
      <>
        <h1 className="page-title">Chat</h1>
        <div className="alert alert-warn">
          <strong>Seu cadastro aguarda aprovação do administrador.</strong>
          <br />
          O chat fica disponível assim que o cadastro for aprovado.
        </div>
        <p className="muted">
          Enquanto isso, consulte as{" "}
          <Link href="/rankings">classificações públicas</Link> e os{" "}
          <Link href="/results">resultados</Link>.
        </p>
      </>
    );
  }

  const supabase = await createSupabaseServer();
  const params = await searchParams;

  // 1) Minhas conversas (RLS: só canais de que participo).
  const { data: memberships } = await supabase
    .from("chat_members")
    .select(
      "channel_id, last_read_at, channel:chat_channels!chat_members_channel_id_fkey(id, kind)",
    )
    .eq("user_id", info.userId);

  type MembershipRow = {
    channel_id: string;
    channel: { id: string; kind: "geral" | "dm" } | null;
  };
  const myChannels = ((memberships ?? []) as unknown as MembershipRow[]).filter(
    (m) => m.channel !== null,
  );
  const channelIds = myChannels.map((m) => m.channel_id);

  // 2) Resumo de cada conversa (não lidas + última mensagem) — 1 consulta.
  const { data: summaryRows } = await supabase.rpc("chat_channel_summary", {
    p_user: info.userId,
  });
  const summary = new Map<
    string,
    { unread: number; last_at: string | null; last_body: string | null; last_sender: string | null }
  >(((summaryRows ?? []) as Array<{
    channel_id: string;
    unread: number;
    last_at: string | null;
    last_body: string | null;
    last_sender: string | null;
  }>).map((r) => [r.channel_id, r]));

  // 3) Parceiros das DMs (nomes).
  const partnerByChannel = new Map<string, ChatPlayerView>();
  if (channelIds.length > 0) {
    const { data: partners } = await supabase
      .from("chat_members")
      .select(
        "channel_id, user_id, profile:profiles!chat_members_user_id_fkey(id, name, initials)",
      )
      .in("channel_id", channelIds)
      .neq("user_id", info.userId);
    for (const row of (partners ?? []) as unknown as Array<{
      channel_id: string;
      user_id: string;
      profile: { id: string; name: string; initials: string } | null;
    }>) {
      if (row.profile) {
        partnerByChannel.set(row.channel_id, {
          id: row.profile.id,
          name: row.profile.name,
          initials: row.profile.initials,
        });
      }
    }
  }

  const channels: ChatChannelView[] = myChannels
    .map((m) => {
      const s = summary.get(m.channel_id);
      const other =
        m.channel!.kind === "dm" ? partnerByChannel.get(m.channel_id) : null;
      return {
        id: m.channel_id,
        kind: m.channel!.kind,
        title:
          m.channel!.kind === "geral"
            ? "Conversa geral"
            : (other?.name ?? "Conversa direta"),
        initials: m.channel!.kind === "geral" ? "G" : (other?.initials ?? "?"),
        unread: Number(s?.unread ?? 0),
        lastAt: s?.last_at ?? null,
        lastBody: s?.last_body ?? null,
        lastSenderId: s?.last_sender ?? null,
      };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "geral" ? -1 : 1;
      return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    });

  const activeId =
    params.c && channels.some((c) => c.id === params.c)
      ? params.c
      : (channels[0]?.id ?? null);

  // 4) Mensagens da conversa aberta (últimas N; mais antigas entram com
  //    scroll futuro — MVP com histórico recente).
  let messages: ChatMessageView[] = [];
  if (activeId) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_id, body, created_at, edited_at")
      .eq("channel_id", activeId)
      .order("created_at", { ascending: true })
      .limit(MESSAGE_LIMIT);
    messages = ((data ?? []) as Array<{
      id: string;
      sender_id: string;
      body: string;
      created_at: string;
      edited_at: string | null;
    }>).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
      editedAt: m.edited_at,
    }));

    // Quem abriu a conversa leu — zera o contador no servidor.
    await supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", activeId)
      .eq("user_id", info.userId);
  }

  // 5) Jogadores para iniciar uma conversa direta.
  const { data: playersRows } = await supabase
    .from("profiles")
    .select("id, name, initials")
    .eq("active", true)
    .eq("pending_approval", false)
    .neq("id", info.userId)
    .order("name", { ascending: true });
  const players: ChatPlayerView[] = (playersRows ?? []) as ChatPlayerView[];

  return (
    <>
      <h1 className="page-title">Chat</h1>
      <p className="page-sub">
        Conversa geral do clube e conversas diretas entre jogadores.
      </p>
      <ChatApp
        me={{ id: info.userId, name: profile.name, initials: profile.initials }}
        isAdmin={profile.role === "admin"}
        channels={channels}
        activeId={activeId}
        initialMessages={messages}
        players={players}
      />
    </>
  );
}
