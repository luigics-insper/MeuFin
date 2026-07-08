const API = 'http://localhost:8000'

export async function getCategorias() {
  const r = await fetch(`${API}/categorias/`)
  return r.json()
}

export async function getTransacoes(mes) {
  const r = await fetch(`${API}/transacoes/?mes=${mes}`)
  return r.json()
}

export async function criarTransacao(dados) {
  const r = await fetch(`${API}/transacoes/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  if (!r.ok) throw new Error('Erro ao criar transação')
  return r.json()
}

export async function deletarTransacao(id) {
  await fetch(`${API}/transacoes/${id}`, { method: 'DELETE' })
}