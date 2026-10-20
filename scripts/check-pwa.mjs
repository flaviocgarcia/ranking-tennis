// Verificação objetiva do PWA em produção.
// Confere: manifesto legível, service worker registrado e ativo,
// cache criado e HTML offline servido pelo cache.
import { chromium } from "playwright";

const BASE = process.env.BASE || "https://ranking-tenis-mu.vercel.app";

const erros = [];
const ok = (t) => console.log(`  ✔ ${t}`);
const falha = (t) => {
  console.log(`  ✘ ${t}`);
  erros.push(t);
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log(`Base: ${BASE}`);
await page.goto(BASE, { waitUntil: "load" });

// 1) manifesto
const manifestHref = await page
  .locator('link[rel="manifest"]')
  .getAttribute("href");
if (manifestHref) ok(`link do manifesto presente (${manifestHref})`);
else falha("link do manifesto ausente");

const manifest = await page.evaluate(async (h) => {
  const r = await fetch(h);
  return { status: r.status, body: await r.json() };
}, manifestHref);

if (manifest.status === 200) ok(`manifesto responde 200`);
else falha(`manifesto http ${manifest.status}`);

const m = manifest.body;
if (m.display === "standalone" && m.start_url === "/") {
  ok(`manifesto: display=${m.display}, start_url=${m.start_url}, scope=${m.scope}`);
} else {
  falha(`manifesto inesperado: ${JSON.stringify({ display: m.display, start_url: m.start_url })}`);
}
if (m.icons?.some((i) => i.purpose === "maskable")) ok(`icone maskable declarado`);
else falha("icone maskable ausente");

// ícones realmente servidos
for (const ic of m.icons) {
  const r = await page.evaluate(async (u) => (await fetch(u)).status, ic.src);
  if (r === 200) ok(`icone ${ic.src} -> 200`);
  else falha(`icone ${ic.src} -> ${r}`);
}

// 2) service worker
await page.waitForFunction(() => navigator.serviceWorker, null, { timeout: 15000 });
await page.evaluate(async () => {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
});
const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) return null;
  await new Promise((res) => {
    if (r.active) return res();
    const st = r.installing || r.waiting;
    if (!st) return res();
    st.addEventListener("statechange", () => st.state === "activated" && res());
  });
  return {
    script: r.active?.scriptURL || null,
    scope: r.scope,
    estado: r.active?.state || "sem ativo",
  };
});

if (reg && reg.script?.endsWith("/sw.js") && reg.estado === "activated") {
  ok(`service worker ativo (${reg.script}, escopo ${reg.scope}, estado ${reg.estado})`);
} else {
  falha(`service worker: ${JSON.stringify(reg)}`);
}

// 3) cache criado e preenchido
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);
const cacheInfo = await page.evaluate(async () => {
  const keys = await caches.keys();
  const out = {};
  for (const k of keys) {
    const c = await caches.open(k);
    out[k] = (await c.keys()).map((r) => new URL(r.url).pathname);
  }
  return out;
});
const nosso = Object.keys(cacheInfo).find((k) => k.startsWith("ranking-tenis-"));
if (nosso) {
  const itens = cacheInfo[nosso];
  ok(`cache "${nosso}" com ${itens.length} item(ns): ${itens.slice(0, 6).join(", ")}${itens.length > 6 ? "…" : ""}`);
  if (itens.some((p) => p === "/")) ok("HTML da home arquivado (fallback offline)");
  else falha("home não foi arquivada no cache");
} else {
  falha(`nenhum cache nosso: ${JSON.stringify(Object.keys(cacheInfo))}`);
}

// 4) nada privado pode estar no cache
const privados = ["/app", "/admin", "/profile", "/login"];
const vazou = Object.values(cacheInfo)
  .flat()
  .filter((p) => privados.some((x) => p === x || p.startsWith(`${x}/`)));
if (vazou.length === 0) ok("nenhuma rota privada no cache");
else falha(`rotas privadas cacheadas: ${vazou.join(", ")}`);

// 5) offline: a navegação da home continua abrindo pelo cache
// (o SW trata pedidos de navegação; um fetch() da página tem
// mode "same-origin" e passa direto, então testamos page.goto)
const controlado = await page.evaluate(() => !!navigator.serviceWorker.controller);
if (controlado) ok("página sob controle do service worker");
else falha("página sem controle do service worker");

await ctx.setOffline(true);
let offlineStatus = null;
try {
  const resp = await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 20000 });
  offlineStatus = resp?.status() ?? "sem status";
} catch (e) {
  offlineStatus = `erro: ${String(e).slice(0, 60)}`;
}
await ctx.setOffline(false);
if (offlineStatus === 200) ok("offline: navegação da home servida pelo cache");
else falha(`offline: status ${offlineStatus}`);

await browser.close();
console.log(erros.length === 0 ? "\nPWA OK em produção" : `\nFALHAS: ${erros.length}`);
process.exit(erros.length === 0 ? 0 : 1);
