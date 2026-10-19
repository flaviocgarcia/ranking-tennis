#!/usr/bin/env node
/**
 * Configura o webhook do Telegram apontando para /api/telegram com segredo.
 *
 * Uso:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   NEXT_PUBLIC_SITE_URL=https://seu-app.vercel.app \
 *   npm run telegram:set-webhook
 *
 * Alternativa com curl (documentada em docs/setup.md).
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = process.env.NEXT_PUBLIC_SITE_URL;

if (!token || !secret || !site) {
  console.error(
    "Defina TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e NEXT_PUBLIC_SITE_URL.",
  );
  process.exit(1);
}

const url = `${site.replace(/\/$/, "")}/api/telegram`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }),
});

const body = await res.json();
if (!body.ok) {
  console.error("Falha ao configurar webhook:", JSON.stringify(body));
  process.exit(1);
}
console.log(`Webhook configurado: ${url}`);
