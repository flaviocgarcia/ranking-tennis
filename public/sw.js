/* Service worker do rankingTenis.
 *
 * Política de cache (pensada para um site serverless sem rotinas periódicas):
 *   - /_next/static e ícones -> cache-first (arquivos com hash, imutáveis);
 *   - navegação (HTML)      -> network-first, com cópia antiga só como
 *                              fallback offline;
 *   - rotas privadas         -> NUNCA cacheadas (páginas autenticadas não
 *                              ficam guardadas no aparelho);
 *   - POST (server actions)  -> nunca interceptado;
 *   - domínios externos      -> fora do escopo (Supabase é chamado do
 *                              servidor, não do navegador).
 *
 * Além do cache, este worker recebe as notificações Web Push (evento
 * `push`) e as abre na página certa ao clicar (`notificationclick`).
 */

const VERSION = "v2";
const CACHE = `ranking-tenis-${VERSION}`;
const CACHE_PREFIX = "ranking-tenis-";

const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILES = ["/icon.svg", "/favicon.ico"];
const PRIVATE_PREFIXES = ["/app", "/admin", "/profile", "/login", "/register"];

self.addEventListener("install", () => {
  // Assume o controle na hora: sem esperar o visitante fechar as abas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return (
    STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) ||
    STATIC_FILES.includes(url.pathname)
  );
}

function isPrivate(url) {
  return PRIVATE_PREFIXES.some(
    (p) => url.pathname === p || url.pathname.startsWith(`${p}/`),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET: server actions e chamadas de escrita passam direto.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // terceiros: fora
  if (isPrivate(url)) return; // privado: sempre rede

  if (isStatic(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // Só guarda respostas completas (evita arquivar erros 5xx/redirects).
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

/* ---------- Web Push ----------
 *
 * O payload enviado pelas server actions é
 * `{ title, body, url }`; `url` é um caminho interno (ex.:
 * /app/chat?c=… ou /admin/results). O clique foca uma aba já aberta e
 * navega para o destino — ou abre uma nova.
 */
self.addEventListener("push", (event) => {
  let data = { title: "F CHALLENGER", body: "", url: "/app" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Payload sem JSON válido: mostra o texto bruto.
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(
    (event.notification.data && event.notification.data.url) || "/app",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const janelas = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && "focus" in janela) {
          await janela.focus();
          if ("navigate" in janela) {
            await janela.navigate(destino);
            return;
          }
          return;
        }
      }
      await clients.openWindow(destino);
    })(),
  );
});
