// E2E do backup em planilha (admin): CSV com TODOS os resultados
// confirmados e a pontuação atribuída a cada jogador.
//  - admin baixa o arquivo com sessão (cookie) → 200 + text/csv
//  - BOM UTF-8, cabeçalho e separador ";" (Excel pt-BR)
//  - 1 linha por resultado confirmado (comparado com o total do painel)
//  - pontuação de cada linha confere com as regras (Normal/GS/W.O.)
//  - jogador comum NÃO recebe o arquivo (redirect para /app)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const errors = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) errors.push(label);
};

/** Divisor de CSV que respeita aspas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

async function login(page, email) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.fill("#password", "Demo@12345");
    if ((await page.inputValue("#email")) !== email) {
      await page.fill("#email", email);
      await page.fill("#password", "Demo@12345");
    }
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL("**/app**", { timeout: 15000 });
      return true;
    } catch {
      await page.waitForTimeout(3000);
    }
  }
  return false;
}

const browser = await chromium.launch();

// ---------- admin ----------
const ctxAdmin = await browser.newContext({ locale: "pt-BR" });
const page = await ctxAdmin.newPage();
ok("admin logou", await login(page, "demo-admin@example.com"));

// Total de confirmados exibido pelo painel (fonte independente do CSV).
await page.goto(`${BASE}/admin/results?status=confirmed`, { waitUntil: "networkidle" });
const info = await page.locator(".page-info").innerText().catch(() => "");
const totalPainel = Number((info.match(/·\s*([\d.]+)\s*registro/) ?? [])[1]?.replace(/\./g, "") ?? NaN);
ok("painel mostra o total de confirmados", Number.isFinite(totalPainel), info);
ok(
  "botão de exportar na tela de resultados",
  (await page.locator('a[href="/admin/results/export"]').count()) > 0,
);

await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
ok(
  "cartão de exportar no painel",
  (await page.locator('a[href="/admin/results/export"]').count()) > 0,
);
await page.goto(`${BASE}/admin/results?status=confirmed`, { waitUntil: "networkidle" });

// Download com a sessão do navegador.
const res = await page.request.get(`${BASE}/admin/results/export`);
ok("resposta 200", res.status() === 200, `status=${res.status()}`);
ok("content-type CSV", /text\/csv/.test(res.headers()["content-type"] ?? ""), res.headers()["content-type"]);
const disposition = res.headers()["content-disposition"] ?? "";
ok("nome do arquivo .csv", /attachment; filename="resultados-.*\.csv"/.test(disposition), disposition);

const raw = await res.body();
const text = raw.toString("utf8");
ok("BOM UTF-8 no início", text.charCodeAt(0) === 0xfeff);
const rows = parseCsv(text.slice(1));
const header = rows[0] ?? [];
const data = rows.slice(1);

ok("cabeçalho esperado", header.length === 17 && header[0] === "Data" && header[10] === "Pontos J1" && header[16] === "ID da partida", header.join(" | "));
ok("mesma quantidade de linhas do painel", data.length === totalPainel, `csv=${data.length} painel=${totalPainel}`);

// Todas as linhas têm 17 colunas e ID em formato UUID.
ok("todas as linhas com 17 colunas", data.every((r) => r.length === 17));
ok("IDs de partida válidos", data.every((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r[16])));

// Datas DD/MM/AAAA e ordem cronológica crescente.
const datas = data.map((r) => r[0]);
ok("datas em DD/MM/AAAA", datas.every((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d)), datas[0]);
const iso = (d) => d.split("/").reverse().join("");
ok("ordem cronológica crescente", datas.every((d, i) => i === 0 || iso(datas[i - 1]) <= iso(d)));

// Pontuação de cada linha confere com as regras.
const erroPontos = [];
for (const r of data) {
  const [, , formato, , , s1, s2, , , , p1, p2] = r;
  const sets1 = Number(s1);
  const sets2 = Number(s2);
  const pts1 = Number(p1);
  const pts2 = Number(p2);
  const key = `${formato} ${sets1}x${sets2} => ${pts1}/${pts2}`;
  if (formato === "W.O.") {
    if (!((pts1 === 300 && pts2 === 0) || (pts1 === 0 && pts2 === 300))) erroPontos.push(key);
    continue;
  }
  if (formato === "Normal") {
    const okstraight = (pts1 === 300 && pts2 === 50) || (pts1 === 50 && pts2 === 300);
    const okextended = (pts1 === 200 && pts2 === 100) || (pts1 === 100 && pts2 === 200);
    const loserSets = Math.min(sets1, sets2);
    const winnerOk = Math.max(sets1, sets2) === 2;
    if (!winnerOk || !(loserSets === 0 ? okstraight : okextended)) erroPontos.push(key);
    continue;
  }
  if (formato === "Grand Slam") {
    const loserSets = Math.min(sets1, sets2);
    const winnerOk = Math.max(sets1, sets2) === 3;
    const esperado = loserSets === 0 ? 75 : loserSets === 1 ? 150 : 300;
    const p1Ok = (pts1 === 450 && pts2 === esperado) || (pts1 === esperado && pts2 === 450);
    if (!winnerOk || !p1Ok) erroPontos.push(key);
    continue;
  }
  erroPontos.push(`formato desconhecido: ${formato}`);
}
ok("pontuação de todas as linhas correta", erroPontos.length === 0, erroPontos.slice(0, 3).join(" · "));

// ---------- jogador comum não baixa ----------
const ctxPlayer = await browser.newContext({ locale: "pt-BR" });
const p2 = await ctxPlayer.newPage();
ok("player logou", await login(p2, "demo-player@example.com"));
const resPlayer = await p2.request.get(`${BASE}/admin/results/export`);
const tipoPlayer = resPlayer.headers()["content-type"] ?? "";
ok("player NÃO recebe CSV", !/text\/csv/.test(tipoPlayer), `status=${resPlayer.status()} type=${tipoPlayer}`);
ok("player foi mandado para a área do jogador", p2.url().includes("/app") || resPlayer.url().includes("/app"), p2.url());

await browser.close();

if (errors.length) {
  console.log(`\n${errors.length} FALHA(S)`);
  process.exit(1);
}
console.log("\nEXPORTAÇÃO OK");
