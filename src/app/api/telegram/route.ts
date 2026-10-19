import { telegramSecret, telegramToken } from "@/lib/env";
import { tgSend, type TelegramUpdate } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/telegram/bot";

export const runtime = "nodejs";
// Webhook não faz parte de nenhuma página: sem cache, sem pré-renderização.
export const dynamic = "force-dynamic";

/**
 * Webhook do Telegram (recurso 100% opcional).
 *
 * - Sem polling e sem processo residente: o Telegram chama ESTE endpoint.
 * - Protegido por X-Telegram-Bot-Api-Secret-Token (setado em setWebhook).
 * - Sem TOKEN configurado => 404 (módulo desabilitado, sistema normal).
 */
export async function POST(req: Request): Promise<Response> {
  const token = telegramToken();
  const secret = telegramSecret();
  if (!token || !secret) {
    return new Response("Not found", { status: 404 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 32_768) {
    return new Response("Payload too large", { status: 413 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const reply = await handleTelegramUpdate(update);
    if (reply) await tgSend(token, reply.chatId, reply.text);
  } catch (e) {
    // Responde 200 mesmo em erro de domínio para o Telegram não reenviar
    // repetidamente a mesma atualização.
    console.warn("[telegram] falha ao processar:", e instanceof Error ? e.message : e);
  }
  return Response.json({ ok: true });
}

export function GET(): Response {
  return new Response("Method not allowed", { status: 405 });
}
