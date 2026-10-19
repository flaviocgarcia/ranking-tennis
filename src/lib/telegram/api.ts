/** Cliente mínimo da API do Telegram (sem bibliotecas externas). */

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

export interface TelegramReply {
  chatId: number;
  text: string;
}

/**
 * Envia UMA mensagem por atualização (sem rajadas/massificação).
 * Falhas são apenas registradas: o Telegram é opcional e nunca deve
 * derrubar o fluxo principal.
 */
export async function tgSend(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[telegram] sendMessage HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("[telegram] falha ao enviar:", e instanceof Error ? e.message : e);
  }
}
