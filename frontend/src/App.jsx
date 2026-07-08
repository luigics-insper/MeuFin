import { useState, useEffect, useCallback } from 'react'
import { getCategorias, getTransacoes, deletarTransacao } from './api'
import ListaTransacoes from './components/ListaTransacoes'

function mesAtual() {
  return new Date().toISOString().slice(0, 7) // "2026-07"
}

export default function App() {
  const [mes, setMes] = useState(mesAtual())
  const [categorias, setCategorias] = useState([])
  const [transacoes, setTransacoes] = useState([])

  useEffect(() => {
    getCategorias().then(setCategorias)
  }, [])

  const carregar = useCallback(() => {
    getTransacoes(mes).then(setTransacoes)
  }, [mes])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function handleDeletar(id) {
    await deletarTransacao(id)
    carregar()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-md mx-auto p-4">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">💰 Finanças</h1>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="bg-gray-900 rounded-lg px-3 py-1.5 text-sm"
          />
        </header>
        <ListaTransacoes
          transacoes={transacoes}
          categorias={categorias}
          onDeletar={handleDeletar}
        />
      </div>
    </div>
  )
}