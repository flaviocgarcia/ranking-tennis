// Smoke test do site publicado (Vercel).
//
//   node scripts/smoke-prod.mjs                 # usa o domínio padrão
//   BASE=https://meu-app.vercel.app node scripts/smoke-prod.mjs
//
// Cobre o que um curl não vê: sessão de verdade.
//   1) rotas públicas respondem 200;
//   2) rotas privadas SEM sessão vão para /login;
//   3) login real (conta demo) entra em /app;
//   4) /admin carrega para o administrador.
//
// Credenciais: só as contas de demonstração (publicadas no docs/setup.md).
import { chromium } from "playwright";

const BASE = process.env.BASE || "https://ranking-tenis-app.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL || "demo-admin@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD || "Demo@12345";

const erros = [];
const ok = (t) => console.log(`  ✔ ${t}`);
const falha = (t) => {
  console.log(`  ✘ ${t}`);
  erros.push(t);
};

const PUBLICAS = ["/", "/rules", "/rankings", "/results", "/atletas", "/agenda", "/login", "/ativar", "/rankings/challenger", "/results/challenger"];
const PRIVADAS = ["/app", "/app/results", "/app/agenda", "/admin", "/admin/players", "/admin/convites", "/profile"];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log(`Base: ${BASE}\n`);

// 1) rotas públicas
console.log("1) rotas públicas");
for (const p of PUBLICAS) {
  const r = await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = r?.status();
  const titulo = (await page.title()) || "(sem título)";
  if (status === 200 && titulo.length > 3) ok(`${p} -> 200 · "${titulo}"`);
  else falha(`${p} -> status ${status} · título "${titulo}"`);
}

// 2) privadas sem sessão => /login
console.log("\n2) rotas privadas sem sessão");
for (const p of PRIVADAS) {
  await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  const url = page.url();
  if (new URL(url).pathname === "/login") ok(`${p} -> redireciona para /login`);
  else falha(`${p} parou em ${new URL(url).pathname} (esperado /login)`);
}

// 3) login real
console.log("\n3) login da conta demo");
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
    console.log(`    tentativa ${tentativa} sem entrar | alertas: ${JSON.stringify(alerta)}`);
    await page.waitForTimeout(1000);
  }
}
if (logado) ok("login entrou em /app");
else falha("login não completou em 3 tentativas");
await page.waitForTimeout(1200);
const nav = await page.locator("header nav").innerText().catch(() => "");
if (/Resultados/.test(nav) && /Novo resultado/.test(nav)) ok("navegação da área do jogador renderizada");
else falha(`navegação inesperada: ${JSON.stringify(nav.slice(0, 80))}`);

// 4) admin
console.log("\n4) painel administrativo");
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
const posAdmin = new URL(page.url()).pathname;
const adminTxt = await page.locator("main").innerText().catch(() => "");
if (posAdmin === "/admin" && /admin|resultado|jogador|convite|classifica/i.test(adminTxt)) {
  ok(`/admin acessível (${adminTxt.length} chars de conteúdo)`);
} else {
  falha(`/admin parou em ${posAdmin}`);
}

// 5) fim
await browser.close();
console.log(erros.length === 0 ? "\nSMOKE PROD OK" : `\nFALHAS: ${erros.length}`);
process.exit(erros.length === 0 ? 0 : 1);
