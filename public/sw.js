// =====================================================================
// sw.js — service worker do PósCréditos (PWA)
// ---------------------------------------------------------------------
// - Arquivos do app (STATIC_ASSETS): Cache First → abre rápido e offline.
//   Mudou algum deles? A versão do CACHE_NAME PRECISA subir (o hook
//   .githooks/pre-commit faz isso sozinho no commit).
// - /api/tmdb: Network First (dado fresco; cache só se estiver offline).
// - Firebase, imagens e fontes de outros domínios: direto da rede.
// =====================================================================

const CACHE_NAME = "poscreditos-v4";
const CACHE_API = "poscreditos-api";
// Quantas respostas do catálogo guardar para uso offline
const MAX_RESPOSTAS_API = 80;

const STATIC_ASSETS = [
  "/index.html",
  "/busca.html",
  "/titulo.html",
  "/perfil.html",
  "/onboarding.html",
  "/regras.html",
  "/notificacoes.html",
  "/review.html",
  "/manifest.json",
  "/css/tokens.css",
  "/css/base.css",
  "/css/componentes.css",
  "/js/acoes-review.js",
  "/js/auth.js",
  "/js/busca.js",
  "/js/cartao-review.js",
  "/js/feed.js",
  "/js/firebase-config.js",
  "/js/firebase.js",
  "/js/interesses.js",
  "/js/lists.js",
  "/js/moderacao-regras.js",
  "/js/moderation.js",
  "/js/notificacoes.js",
  "/js/onboarding.js",
  "/js/perfil-regras.js",
  "/js/perfil.js",
  "/js/pessoas-sugeridas.js",
  "/js/regras.js",
  "/js/review.js",
  "/js/reviews-regras.js",
  "/js/reviews.js",
  "/js/share-card.js",
  "/js/sino.js",
  "/js/social-regras.js",
  "/js/social.js",
  "/js/titulo-comunidade.js",
  "/js/titulo.js",
  "/js/tmdb.js",
  "/js/ui.js",
  "/icons/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/img/tmdb-logo.svg",
];

// Instala: baixa e guarda os arquivos do app da versão atual
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Ativa: apaga caches de versões antigas e assume as abas abertas
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME && n !== CACHE_API).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/** Cache First: usa o guardado; se não tiver, busca e guarda. */
async function cacheFirst(request, { ignorarBusca = false } = {}) {
  const guardado = await caches.match(request, { ignoreSearch: ignorarBusca });
  if (guardado) return guardado;
  try {
    return await fetch(request);
  } catch (erro) {
    // Offline numa página não guardada: abre o início
    if (request.mode === "navigate") return caches.match("/index.html");
    throw erro;
  }
}

/** Network First para o catálogo, guardando as últimas respostas. */
async function networkFirstApi(request) {
  const cache = await caches.open(CACHE_API);
  try {
    const resposta = await fetch(request);
    if (resposta.ok) {
      await cache.put(request, resposta.clone());
      // Mantém o cache pequeno: remove as mais antigas
      const chaves = await cache.keys();
      await Promise.all(chaves.slice(0, Math.max(0, chaves.length - MAX_RESPOSTAS_API)).map((c) => cache.delete(c)));
    }
    return resposta;
  } catch (erro) {
    const guardada = await cache.match(request);
    if (guardada) return guardada;
    throw erro;
  }
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Outros domínios (Firebase, TMDB imagens, fontes): sem interferir
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/tmdb") {
    evento.respondWith(networkFirstApi(request));
    return;
  }

  // "/" vira "/index.html"; páginas com ?id=… usam o HTML guardado
  const caminho = url.pathname === "/" ? "/index.html" : url.pathname;
  if (request.mode === "navigate" || STATIC_ASSETS.includes(caminho)) {
    const alvo = caminho !== url.pathname ? new Request("/index.html") : request;
    evento.respondWith(cacheFirst(alvo, { ignorarBusca: true }));
  }
});
