// E2E das tabelas públicas com ordenação + busca (componente DataTable).
//  - /rankings: clicar no cabeçalho ordena (asc → desc → ordem original),
//    a busca por atleta filtra e o contador mostra "X de Y linhas".
//  - /results: ordenação por data cronológica e busca por atleta.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3100";
const errors = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
  if (!cond) errors.push(label);
};
const norm = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ddmm2iso = (s) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}${m[2]}${m[1]}` : s;
};

const browser = await chromium.launch();
const page = await browser.newPage();

// ================= /rankings =================
await page.goto(`${BASE}/rankings`, { waitUntil: "networkidle" });
const table = page.locator("table.table").first();

ok("cabeçalhos marcados como ordenáveis", (await table.locator("th.sortable").count()) >= 4);
ok("aria-sort inicial 'none'", (await table.locator('th[aria-sort="none"]').count()) >= 4);

// --- ordenar por Atleta (asc → alfabética) ---
const thAtleta = table.locator("th", { hasText: "Atleta" }).first();
const firstName = async () =>
  (await table.locator("tbody tr:visible td[data-sort]").first().getAttribute("data-sort")) ?? "";

const originalFirst = await firstName();
await thAtleta.click();
const namesAsc = await table.locator("tbody tr:visible td[data-sort]").evaluateAll((tds) =>
  tds.map((t) => t.getAttribute("data-sort") ?? ""),
);
ok(
  "Atleta asc: nomes em ordem alfabética",
  namesAsc.every((n, i) => i === 0 || namesAsc[i - 1].localeCompare(n, "pt-BR") <= 0),
  `1º=${namesAsc[0]}`,
);
ok("aria-sort=ascending no Atleta", (await thAtleta.getAttribute("aria-sort")) === "ascending");

// --- 2º clique: decrescente ---
await thAtleta.click();
const namesDesc = await table.locator("tbody tr:visible td[data-sort]").evaluateAll((tds) =>
  tds.map((t) => t.getAttribute("data-sort") ?? ""),
);
ok(
  "Atleta desc: ordem invertida",
  namesDesc.every((n, i) => i === 0 || namesDesc[i].localeCompare(namesDesc[i - 1], "pt-BR") <= 0),
);
ok("aria-sort=descending no Atleta", (await thAtleta.getAttribute("aria-sort")) === "descending");

// --- 3º clique: volta à ordem original (posição 1 da classificação) ---
await thAtleta.click();
ok("3º clique restaura a ordem original", (await firstName()) === originalFirst, `1º=${await firstName()}`);

// --- ordenar por Pontos (asc → desc) ---
const thPontos = table.locator("th", { hasText: "Pontos" }).first();
await thPontos.click();
const ptsAsc = await table
  .locator("tbody tr:visible td:nth-child(3)")
  .allInnerTexts();
const numsAsc = ptsAsc.map((t) => parseInt(t.replace(/\D/g, ""), 10));
ok(
  "Pontos asc: valores não decrescentes",
  numsAsc.every((n, i) => i === 0 || numsAsc[i - 1] <= n),
  `1º=${numsAsc[0]}`,
);
await thPontos.click();
const numsDesc = (await table.locator("tbody tr:visible td:nth-child(3)").allInnerTexts()).map((t) =>
  parseInt(t.replace(/\D/g, ""), 10),
);
ok(
  "Pontos desc: valores não crescentes",
  numsDesc.every((n, i) => i === 0 || numsDesc[i - 1] >= n),
  `1º=${numsDesc[0]}`,
);

// --- busca por atleta ---
const totalRows = await table.locator("tbody tr").count();
const term = norm(originalFirst).slice(0, 8);
const search = page.locator("input.table-search");
ok("caixa de busca presente no /rankings", (await search.count()) === 1);
await search.fill(term);
await page.waitForTimeout(150);
const visible = await table.locator("tbody tr:not([hidden])").evaluateAll((trs) =>
  trs.map((r) => r.textContent ?? ""),
);
ok(
  `busca "${term}" filtra linhas`,
  visible.length > 0 && visible.length < totalRows && visible.every((t) => norm(t).includes(term)),
  `${visible.length}/${totalRows} linhas`,
);
const status = await page.locator('.table-controls [role="status"]').innerText();
ok(
  "contador 'X de Y linhas'",
  /^\d+ de \d+ linhas?$/.test(status.trim()) && status.includes(String(totalRows)),
  status.trim(),
);
await search.fill("");
await page.waitForTimeout(150);
const afterClear = await table.locator("tbody tr:not([hidden])").count();
ok("limpar busca restaura todas as linhas", afterClear === totalRows, `${afterClear}/${totalRows}`);

// busca sem resultado
await search.fill("zzzz-nao-existe");
await page.waitForTimeout(150);
const noneText = await page.locator('.table-controls [role="status"]').innerText();
ok("busca sem resultado mostra aviso", noneText.includes("Nenhum"), noneText.trim());
await search.fill("");

// ================= /results =================
await page.goto(`${BASE}/results`, { waitUntil: "networkidle" });
const rtable = page.locator("table.table").first();
const rThData = rtable.locator("th", { hasText: "Data" }).first();
const rThAtleta = rtable.locator("th", { hasText: "Jogadores" }).first();
const totalR = await rtable.locator("tbody tr").count();

const originalDates = await rtable
  .locator("tbody tr td:first-child")
  .allInnerTexts();

// ordena por data asc e confere a ordem cronológica
await rThData.click();
const datesAsc = await rtable.locator("tbody tr td:first-child").allInnerTexts();
const expected = [...originalDates].map(ddmm2iso).sort();
ok(
  "Data asc: cronológica",
  datesAsc.map(ddmm2iso).every((d, i) => d === expected[i]),
  `1ª=${datesAsc[0]}`,
);
await rThData.click(); // desc
const datesDesc = await rtable.locator("tbody tr td:first-child").allInnerTexts();
ok(
  "Data desc: mais recente primeiro",
  ddmm2iso(datesDesc[0]) >= ddmm2iso(datesDesc[datesDesc.length - 1]),
  `1ª=${datesDesc[0]}`,
);
await rThData.click(); // original
const backDates = await rtable.locator("tbody tr td:first-child").allInnerTexts();
ok("Data: 3º clique restaura ordem original", backDates.join("|") === originalDates.join("|"));

// busca por atleta em /results
const firstMatchNames = await rtable
  .locator("tbody tr td[data-sort]")
  .first()
  .getAttribute("data-sort");
const rTerm = norm(firstMatchNames ?? "").split(/\s+/)[0].slice(0, 6);
const rSearch = page.locator("input.table-search");
ok("caixa de busca presente no /results", (await rSearch.count()) === 1);
await rSearch.fill(rTerm);
await page.waitForTimeout(150);
const rVisible = await rtable.locator("tbody tr:not([hidden])").evaluateAll((trs) =>
 trs.map((r) => r.querySelector("td[data-sort]")?.getAttribute("data-sort") ?? ""),
);
ok(
  `busca "${rTerm}" no /results mantém só partidas com o atleta`,
  rVisible.length > 0 &&
    rVisible.length < totalR &&
    rVisible.every((t) => norm(t).includes(rTerm)),
  `${rVisible.length}/${totalR} linhas`,
);

// busca também em página de nível
await page.goto(`${BASE}/results/challenger`, { waitUntil: "networkidle" });
const lTable = page.locator("table.table").first();
ok(
  "/results/challenger tem cabeçalhos ordenáveis",
  (await lTable.locator("th.sortable").count()) >= 3,
);

// ordenação não quebra os links/botões da página
const href = await page.locator("table.table tbody tr a").first().getAttribute("href").catch(() => null);
ok("tabela continua renderizando conteúdo normal", (await lTable.locator("tbody tr").count()) > 0, `1º link=${href ?? "-"}`);

await browser.close();
console.log(errors.length === 0 ? "\nTABELAS OK" : `\n${errors.length} FALHA(S)`);
process.exit(errors.length === 0 ? 0 : 1);
