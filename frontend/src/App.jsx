import { useState, useEffect, useCallback } from 'react'
import { getCategorias, getTransacoes, deletarTransacao, getResumoCategorias, getResumoMensal } from './api'
import ListaTransacoes from './components/ListaTransacoes'
import FormTransacao from './components/FormTransacao'
import Dashboard from './components/Dashboard'

function mesAtual() {
  return new Date().toISOString().slice(0, 7) // "2026-07"
}

export default function App() {
  const [mes, setMes] = useState(mesAtual())
  const [categorias, setCategorias] = useState([])
  const [transacoes, setTransacoes] = useState([])
  const [formAberto, setFormAberto] = useState(false)
  const [resumoMensal, setResumoMensal] = useState(null)
  const [resumoCategorias, setResumoCategorias] = useState([])

  useEffect(() => {
    getCategorias().then(setCategorias)
  }, [])

  const carregar = useCallback(() => {
    getTransacoes(mes).then(setTransacoes)
    getResumoMensal(mes).then(setResumoMensal)
    getResumoCategorias(mes).then(setResumoCategorias)
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
        <Dashboard resumoMensal={resumoMensal} resumoCategorias={resumoCategorias} />
        <ListaTransacoes
          transacoes={transacoes}
          categorias={categorias}
          onDeletar={handleDeletar}
        />
      </div>
      <button
        onClick={() => setFormAberto(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center"
      >
        <span className="text-2xl font-bold leading-none pb-0.5">+</span>
      </button>

      {formAberto && (
        <FormTransacao
          categorias={categorias}
          onCriada={carregar}
          onFechar={() => setFormAberto(false)}
        />
      )}
    </div>
  )
}