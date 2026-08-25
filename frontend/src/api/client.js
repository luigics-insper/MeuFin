// Cliente HTTP minimalista. Um lugar só pra tratamento de erro,
// então as páginas nunca chamam fetch() direto.
const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    // 401 = sessão expirou/não logado → manda pro login (exceto se a própria
    // chamada é de auth — a tela de login trata os erros dela sozinha)
    if (res.status === 401 && !path.startsWith('/auth') &&
        window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Erro ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
