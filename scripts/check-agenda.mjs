// E2E da agenda de disponibilidade — SEMPRE se limpa ao final.
//
//   node scripts/check-agenda.mjs                      # local (:3000)
//   BASE=https://ranking-tenis-app.vercel.app node scripts/check-agenda.mjs
//
// Cobre: formulário do jogador, revalidação da página estática pública,
// upsert (marcar duas vezes = atualiza, não duplica) e remoção.
// Usa conta de demonstração (credenciais já publicadas no docs/setup.md)
// e apaga a marcação no final mesmo se algo falhar no meio.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL || "demo-player@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD || "Demo@12345";

const erros = [];
const ok = (t) => console.log(`  ✔ ${t}`);
const falha = (t) => {
  console.log(`  ✘ ${t}`);
  erros.push(t);
};

const isoMais = (dias) =>
  new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

const DATA = isoMais(3);
// mesmo cálculo de src/lib/format.ts (local T00:00:00 + pt-BR)
const DATA_BR = new Date(`${DATA}T00:00:00`).toLocaleDateString("pt-BR");

/** Espera (com poll) até a condição do texto da localização ser verdadeira. */
async function esperaTexto(loc, condicao, ms = 15000, descricao = "") {
  const inicio = Date.now();
  let ultimo = "";
  while (Date.now() - inicio < ms) {
    // sem elemento (ex.: tabela vazia) conta como texto "" — aí a
    // condição é avaliada de verdade em vez de ficar em loop de erro.
    try {
      ultimo = (await loc.first().innerText()).replace(/\s+/g, " ");
    } catch {
      ultimo = "";
    }
    if (condicao(ultimo)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `timeout esperando: ${descricao} | último texto: "${ultimo.slice(0, 120)}"`,
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
let marcadoNoFim = false;

console.log(`Base: ${BASE}\ndata do teste: ${DATA} (${DATA_BR})\n`);

try {
  // 1) agenda pública responde
  console.log("1) agenda pública");
  const r0 = await page.goto(`${BASE}/agenda`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  if (r0?.status() === 200 && /Agenda/i.test(await page.title())) {
    ok(`/agenda -> 200 · "${await page.title()}"`);
  } else {
    falha(`/agenda -> status ${r0?.status()} · "${await page.title()}"`);
  }
  const navTemAgenda = await page
    .locator('header nav a[href="/agenda"]')
    .count();
  navTemAgenda ? ok('link "Agenda" no menu público') : falha("menu sem link de Agenda");

  // 2) login (com espera de hidratação e nova tentativa: no dev o
  //    React hidrata mais lento e um clique cedo vira submit nativo vazio)
  console.log("\n2) login da conta demo");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  let logado = false;
  for (let tentativa = 1; tentativa <= 3 && !logado; tentativa++) {
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL("**/app**", { timeout: 12000 });
      logado = true;
    } catch {
      const alerta = await page.locator(".alert").allInnerTexts().catch(() => []);
      console.log(
        `    tentativa ${tentativa} sem entrar | alertas: ${JSON.stringify(alerta)}`,
      );
      await page.waitForTimeout(1000);
    }
  }
  logado ? ok("logado") : falha("não consegui logar em 3 tentativas");
  if (!logado) throw new Error("login falhou — abortando para não poluir o teste");

  // 3) tela do jogador (networkidle: deixar chunks + hidratação
  //    terminarem antes de mexer nos campos controlados)
  console.log("\n3) /app/agenda");
  await page.goto(`${BASE}/app/agenda`, { waitUntil: "networkidle" });
  await page.waitForSelector("#play_date", { timeout: 30000 });
  ok("formulário presente (#play_date, #slot)");
  const temLinkPublico = await page.locator('a[href="/agenda"]').count();
  temLinkPublico ? ok("link para a agenda pública") : falha("sem link /agenda na área");
  const menuApp = await page.locator('header nav a[href="/app/agenda"]').count();
  menuApp ? ok('link "Agenda" no menu da área') : falha("menu da área sem Agenda");

  // 4) marcar disponibilidade
  console.log("\n4) marcar disponibilidade");
  await page.fill("#play_date", DATA);
  await page.selectOption("#slot", "afternoon");
  await page.click('button:has-text("Quero jogar nesta data")');
  marcadoNoFim = true;
  const linha = page.locator("table tbody tr").filter({ hasText: DATA_BR });
  // aceita qualquer período na primeira linha: se a hidratação resetou o
  // select pré-clique, a linha nasce com "qualquer horário" — o formulário
  // já está hidratado DEPOIS do envio, então reenviar corrige (upsert).
  await esperaTexto(
    linha,
    (t) => t.includes(DATA_BR),
    20000,
    "linha da data em Minhas marcações",
  );
  for (let t = 1; t <= 3; t++) {
    const txt = (await linha.first().innerText().catch(() => "")).replace(
      /\s+/g,
      " ",
    );
    if (txt.includes("tarde")) break;
    if (t === 3) throw new Error(`slot não aceitou 'tarde' (texto: "${txt}")`);
    console.log(`    período veio como "${txt.trim() || "?"}" — reenvio pós-hidratação`);
    await page.fill("#play_date", DATA);
    await page.selectOption("#slot", "afternoon");
    await page.click('button:has-text("Quero jogar nesta data")');
    await esperaTexto(
      linha,
      (x) => x.includes("tarde"),
      20000,
      "linha com período tarde",
    );
  }
  ok("marcação aparece em Minhas marcações (data + tarde)");

  // 5) repetir a mesma data => atualiza, não duplica
  console.log("\n5) reenvio da mesma data (upsert)");
  await page.fill("#play_date", DATA);
  await page.selectOption("#slot", "evening");
  await page.click('button:has-text("Quero jogar nesta data")');
  await esperaTexto(
    linha,
    (t) => t.includes(DATA_BR) && t.includes("noite"),
    20000,
    "linha atualizada para noite",
  );
  const total = await page
    .locator("table tbody tr")
    .filter({ hasText: DATA_BR })
    .count();
  if (total === 1) ok("atualizou para 'noite' e não duplicou (1 linha)");
  else falha(`esperava 1 linha, achei ${total}`);

  // 6) página pública (sem sessão) mostra a marca
  console.log("\n6) página pública sem sessão");
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${BASE}/agenda`, { waitUntil: "domcontentloaded" });
  const textoPub = (await ap.locator("main").innerText()).replace(/\s+/g, " ");
  if (textoPub.includes(DATA_BR) && textoPub.includes("noite")) {
    ok("agenda pública mostra a data com período");
  } else {
    falha(`página pública sem a marca | trecho: "${textoPub.slice(0, 160)}"`);
  }
  if (/Demo/i.test(textoPub)) ok("nome do jogador visível na agenda pública");
  else falha("nome do jogador ausente na agenda pública");
  await anon.close();

  // 7) remover
  console.log("\n7) remover marcação");
  await linha.first().getByRole("button", { name: "Remover" }).click();
  await esperaTexto(
    page.locator("table tbody tr"),
    (t) => !t.includes(DATA_BR),
    20000,
    "linha sumiu de Minhas marcações",
  );
  marcadoNoFim = false;
  ok("removida da Minhas marcações");

  // 8) pública volta ao estado anterior
  const anon2 = await browser.newContext();
  const ap2 = await anon2.newPage();
  await ap2.goto(`${BASE}/agenda`, { waitUntil: "domcontentloaded" });
  const textoDepois = await ap2.locator("main").innerText();
  textoDepois.includes(DATA_BR)
    ? falha("página pública ainda mostra a marca removida")
    : ok("página pública sem a marca removida (revalidate funcionou)");
  await anon2.close();
} catch (e) {
  falha(`exceção: ${e.message}`);
} finally {
  // ---- limpeza garantida (roda mesmo com falha no meio) ----
  try {
    if (marcadoNoFim && !page.isClosed()) {
      await page.goto(`${BASE}/app/agenda`, { waitUntil: "domcontentloaded" });
      const residuais = page.locator("table tbody tr").filter({ hasText: DATA_BR });
      for (let i = 0; i < 5 && (await residuais.count()); i++) {
        await residuais.first().getByRole("button", { name: "Remover" }).click();
        await page.waitForTimeout(1500);
      }
      const sobrou = await page
        .locator("table tbody tr")
        .filter({ hasText: DATA_BR })
        .count();
      if (sobrou === 0) console.log("\n  limpeza: nenhuma marca residual ✔");
      else console.log(`\n  limpeza: ATENÇÃO, ${sobrou} marca(ões) residual(is)`);
    } else if (!marcadoNoFim) {
      console.log("\n  limpeza: nada a apagar ✔");
    }
  } catch (e) {
    console.log(`\n  limpeza: falhou (${e.message.slice(0, 80)})`);
  }
  await browser.close();
}

console.log(erros.length === 0 ? "\nAGENDA OK" : `\nFALHAS: ${erros.length}`);
process.exit(erros.length === 0 ? 0 : 1);
