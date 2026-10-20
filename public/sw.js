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
 * Não há rotinas periódicas aqui: só eventos install/activate/fetch.
 * Os handlers de push/notificationclick entram na fase das notificações.
 */

const VERSION = "v1";
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
