// Service worker do meufin — deliberadamente MINIMALISTA.
//
// Estratégia por tipo de recurso:
//   /api/*  → NUNCA cacheia. Dado financeiro desatualizado é pior que
//             tela de erro: você tomaria decisão com saldo velho.
//   estáticos (js/css/ícones) → cache-first: o Vite põe hash no nome
//             (index-Bx3f.js), então cache velho é impossível por design.
//   navegação (o index.html) → network-first com fallback: online pega
//             a versão nova; offline ainda abre o app.
const CACHE = 'meufin-v1'

self.addEventListener('install', (e) => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return res
      })
    )
  )
})
