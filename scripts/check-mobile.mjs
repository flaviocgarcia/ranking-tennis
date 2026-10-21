// Teste mobile (iPhone 12/13: 390x844, DPR 3):
//  1) menu do site colado na borda esquerda (sem padding lateral);
//  2) placar no /app/results/new: teclado numérico + montagem do "6-4".
import { chromium, devices } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const errors = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) errors.push(label);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 12"] });
const page = await ctx.newPage();

// ---------- 1) menu público com padding lateral ----------
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const navBox = await page.locator("header .nav a", { hasText: "Início" }).boundingBox();
const vpWidth = page.viewportSize().width;
console.log(`viewport=${vpWidth}px  "Início" x=${navBox?.x?.toFixed(1)} width=${navBox?.width?.toFixed(1)}`);
ok("menu público com ≥14px de respiro à esquerda", (navBox?.x ?? 0) >= 14, `x=${navBox?.x?.toFixed(1)}`);
const brandBox = await page.locator("header .brand").boundingBox();
ok("logo/marca também afastada da borda", (brandBox?.x ?? 0) >= 14, `x=${brandBox?.x?.toFixed(1)}`);
// nada estourando a largura da viewport (sem scroll horizontal do header)
const headerW = await page.locator("header .inner").evaluate((el) => el.scrollWidth);
ok("cabeçalho não estoura a largura da tela", headerW <= vpWidth, `scrollWidth=${headerW}`);

// ---------- 2) placar com 2 campos numéricos ----------
// login como demo player
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "demo-player@example.com");
await page.fill("#password", "Demo@12345");
await Promise.all([page.waitForURL(/\/app/, { timeout: 30000 }), page.click("button[type=submit]")]);

await page.goto(`${BASE}/app/results/new`, { waitUntil: "networkidle" });
await page.selectOption("#opponent_id", { index: 2 });

const sideA = page.getByLabel(/no set 1$/).first();
const sideB = page.getByLabel(/no set 1$/).nth(1);
ok("campo do lado 1 usa teclado numérico", (await sideA.getAttribute("inputmode")) === "numeric");
ok("campo do lado 2 usa teclado numérico", (await sideB.getAttribute("inputmode")) === "numeric");

await sideA.fill("6");
await sideB.fill("4");
// o hidden input enviado ao servidor deve ser "6-4"
const hidden = await page.locator('input[type="hidden"][name="set"]').first().inputValue();
ok("placar montado com hífen (hidden set=6-4)", hidden === "6-4", `valor=${hidden}`);

// tiebreakão de 2 dígitos: 10-12
await sideA.fill("10");
await sideB.fill("12");
const hidden2 = await page.locator('input[type="hidden"][name="set"]').first().inputValue();
ok("tiebreakão 10-12 cabe (2 dígitos por lado)", hidden2 === "10-12", `valor=${hidden2}`);

// limpar o lado B remove o hífen
await sideB.fill("");
const hidden3 = await page.locator('input[type="hidden"][name="set"]').first().inputValue();
ok("limpar lado B volta a string simples", hidden3 === "10", `valor=${hidden3}`);

// linhas dos inputs ficam dentro da viewport
const rowBox = await page.locator(".set-row").first().boundingBox();
ok("linha do set cabe na tela", (rowBox?.x ?? 0) >= 0 && (rowBox?.x ?? 0) + (rowBox?.width ?? 9999) <= vpWidth + 1, `w=${rowBox?.width?.toFixed(0)}`);

await browser.close();
console.log(errors.length === 0 ? "\nTUDO OK" : `\n${errors.length} FALHA(S)`);
process.exit(errors.length === 0 ? 0 : 1);
