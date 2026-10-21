/**
 * Purga o cache estático (ISR) das páginas públicas /rankings e /results.
 *
 * O cache é limpado por revalidatePath dentro de updateNameAction — e essa
 * action não altera nada se o nome enviado for o MESMO que já está gravado.
 * Ou seja: logar e "salvar" o nome atual é um purge seguro, sem efeito
 * colateral, servindo tanto para o servidor local quanto para a produção.
 *
 * Uso:
 *   node scripts/demo-video/purge-cache.mjs                     # VIDEO_BASE ou localhost:3000
 *   node scripts/demo-video/purge-cache.mjs https://ranking-tenis-app.vercel.app
 *
 * Rodar APÓS o restore do build.mjs, para garantir que a produção passe a
 * servir o estado pré-demo na hora (em vez de esperar o próximo tick de ISR).
 */
import { chromium } from "playwright";

const BASE =
  process.argv[2] ?? process.env.VIDEO_BASE ?? "http://localhost:3000";
const EMAIL = "demo-player@example.com";
const SENHA = "Demo@12345";

const b = await chromium.launch();
try {
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
  });
  const p = await ctx.newPage();

  // Login pode falhar por rate limit temporário do Supabase Auth (a demo
  // gera vários logins seguidos); tenta de novo antes de desistir.
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await p.goto(`${BASE}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await p.locator("h1").first().waitFor({ timeout: 60000 });
      await p.getByLabel("E-mail").fill(EMAIL);
      await p.getByLabel("Senha", { exact: true }).fill(SENHA);
      await p.getByRole("button", { name: "Entrar" }).click();
      await p.waitForURL("**/app", { timeout: 60000 });
      ultimoErro = null;
      break;
    } catch (e) {
      ultimoErro = e;
      console.log(
        `  tentativa ${tentativa}/3 de login falhou (${e.message.split("\n")[0].slice(0, 80)});`,
      );
      if (tentativa < 3) await new Promise((r) => setTimeout(r, 25000));
    }
  }
  if (ultimoErro) throw ultimoErro;

  await p.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.locator("h1").first().waitFor({ timeout: 60000 });
  const campo = p.getByLabel("Nome exibido no ranking");
  const nomeAtual = await campo.inputValue();
  await campo.fill(nomeAtual); // mesmo valor → nenhuma mudança de dado
  await p.getByRole("button", { name: "Salvar nome" }).click();
  await p.getByText("Nome atualizado.").first().waitFor({ timeout: 60000 });

  console.log(`✅ purge concluído em ${BASE} (nome "${nomeAtual}" regravado sem alteração).`);
  console.log("   revalidatePath('/rankings') e ('/results') disparados.");
} catch (e) {
  console.error("❌ purge falhou:", e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await b.close();
}
