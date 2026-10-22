"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  markChannelReadAction,
  openDmAction,
  sendChatMessageAction,
} from "@/actions/chat";
import { Avatar } from "@/components/Avatar";

/** Conversa exibida na lista lateral. */
export interface ChatChannelView {
  id: string;
  kind: "geral" | "dm";
  title: string;
  initials: string;
  unread: number;
  lastAt: string | null;
  lastBody: string | null;
  lastSenderId: string | null;
}

export interface ChatMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatPlayerView {
  id: string;
  name: string;
  initials: string;
}

function horaCurta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Interface do chat (componente de cliente — a página que a monta é
 * server component e busca os dados iniciais).
 *
 * Tempo real: assina `postgres_changes` no canal do Supabase com a
 * SESSÃO do usuário — o Realtime aplica as mesmas policies de RLS, então
 * cada um só recebe mensagens dos canais de que participa.
 */
export function ChatApp({
  me,
  isAdmin,
  channels: initialChannels,
  activeId,
  initialMessages,
  players,
}: {
  me: ChatPlayerView;
  isAdmin: boolean;
  channels: ChatChannelView[];
  activeId: string | null;
  initialMessages: ChatMessageView[];
  players: ChatPlayerView[];
}) {
  const router = useRouter();
  const [channels, setChannels] = useState(initialChannels);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [notifyAll, setNotifyAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const people: Record<string, ChatPlayerView> = { [me.id]: me };
  for (const p of players) people[p.id] = p;

  const canalAtivo = channels.find((c) => c.id === activeId) ?? null;

  /** Marca como lido com debounce (mensagens em chegam em rajada). */
  const agendarLeitura = useCallback(() => {
    if (!activeId) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      void markChannelReadAction(activeId);
      setChannels((atual) =>
        atual.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)),
      );
    }, 1200);
  }, [activeId]);

  // Ao abrir uma conversa: zera o contador e avisa o servidor.
  useEffect(() => {
    if (!activeId) return;
    setChannels((atual) =>
      atual.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)),
    );
    void markChannelReadAction(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Tempo real: novas mensagens do canal aberto chegam sem recarregar.
  // A sessão é garantida ANTES do join: o cliente de cookies do @supabase/ssr
  // recupera/expirada de forma assíncrona — assinar cedo demais faria o
  // servidor aceitar o canal sem autorização e nunca entregar eventos.
  useEffect(() => {
    if (!activeId) return;
    const supabase = createSupabaseBrowser();
    let cancelado = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      if (!data.session) {
        console.error("chat realtime: sem sessão — realtime desativado");
        return;
      }
      canal = supabase
        .channel(`chat-${activeId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `channel_id=eq.${activeId}`,
          },
          (payload) => {
            const nova = payload.new as {
              id: string;
              sender_id: string;
              body: string;
              created_at: string;
            };
            setMessages((atual) =>
              atual.some((m) => m.id === nova.id)
                ? atual
                : [
                    ...atual,
                    {
                      id: nova.id,
                      senderId: nova.sender_id,
                      body: nova.body,
                      createdAt: nova.created_at,
                    },
                  ],
            );
            if (nova.sender_id !== me.id) agendarLeitura();
          },
        )
        .subscribe((status) => {
          // Log de diagnóstico do tempo real (visível só no DevTools).
          console.log(`chat realtime: ${status} (canal ${activeId})`);
        });
    })();
    return () => {
      cancelado = true;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [activeId, me.id, agendarLeitura]);

  // Autoscroll para a última mensagem.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setErro(null);
    const res = await sendChatMessageAction(activeId, body, notifyAll);
    setSending(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    setDraft("");
    setNotifyAll(false);
    if (res.data) {
      const { id, created_at } = res.data;
      setMessages((atual) =>
        atual.some((m) => m.id === id)
          ? atual
          : [...atual, { id, senderId: me.id, body, createdAt: created_at }],
      );
    }
  }

  async function abrirDm(playerId: string) {
    setDmBusy(true);
    setErro(null);
    const res = await openDmAction(playerId);
    setDmBusy(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    if (!res.data) {
      setErro("Erro ao abrir conversa.");
      return;
    }
    setDmOpen(false);
    router.push(`/app/chat?c=${res.data.channelId}`);
  }

  return (
    <div className="chat-layout">
      <aside className="chat-side card">
        <div className="chat-side-head">
          <strong>Conversas</strong>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setDmOpen((v) => !v)}
          >
            {dmOpen ? "Fechar" : "+ Nova"}
          </button>
        </div>
        {dmOpen && (
          <div className="chat-players">
            {players.length === 0 && (
              <p className="muted small">Nenhum jogador disponível.</p>
            )}
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chat-player-row"
                disabled={dmBusy}
                onClick={() => void abrirDm(p.id)}
              >
                <Avatar initials={p.initials} />
                {p.name}
              </button>
            ))}
          </div>
        )}
        <ul className="chat-list">
          {channels.map((c) => (
            <li key={c.id}>
              <a
                href={`/app/chat?c=${c.id}`}
                className={`chat-item${c.id === activeId ? " active" : ""}`}
              >
                <Avatar initials={c.initials} />
                <span className="chat-item-body">
                  <span className="chat-item-title">
                    {c.title}
                    {c.unread > 0 && (
                      <span className="chat-badge">{c.unread}</span>
                    )}
                  </span>
                  <span className="chat-item-preview">
                    {c.lastBody
                      ? `${c.lastSenderId === me.id ? "Você: " : ""}${c.lastBody}`
                      : "Sem mensagens"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-main card">
        <header className="chat-head">
          <strong>{canalAtivo?.title ?? "Chat"}</strong>
          {canalAtivo?.kind === "dm" && (
            <span className="muted small">conversa direta</span>
          )}
        </header>

        <div className="chat-messages">
          {messages.length === 0 && (
            <p className="empty">
              Nenhuma mensagem ainda. Diga oi! 👋
            </p>
          )}
          {messages.map((m) => {
            const meu = m.senderId === me.id;
            const autor = people[m.senderId];
            return (
              <div key={m.id} className={`msg${meu ? " msg-mine" : ""}`}>
                {!meu && <Avatar initials={autor?.initials ?? "?"} />}
                <div className="msg-body">
                  <div className="msg-meta">
                    <strong>{meu ? "Você" : (autor?.name ?? "Jogador")}</strong>
                    <span className="muted small">{horaCurta(m.createdAt)}</span>
                  </div>
                  <div className="msg-text">{m.body}</div>
                </div>
              </div>
            );
          })}
          <div ref={fimRef} />
        </div>

        {erro && <div className="alert alert-error">{erro}</div>}

        <form className="chat-form" onSubmit={(e) => void enviar(e)}>
          <input
            type="text"
            className="input"
            placeholder="Escreva uma mensagem…"
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn" disabled={sending}>
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </form>
        {isAdmin && canalAtivo?.kind === "geral" && (
          <label className="chat-notify-all small">
            <input
              type="checkbox"
              checked={notifyAll}
              onChange={(e) => setNotifyAll(e.target.checked)}
            />
            Notificar todos por push (aviso do administrador)
          </label>
        )}
      </section>
    </div>
  );
}
