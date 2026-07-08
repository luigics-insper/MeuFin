import { useState } from 'react'
import { criarTransacao } from '../api'

export default function FormTransacao({ categorias, onCriada, onFechar }) {
  const [tipo, setTipo] = useState('gasto')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSubmit() {
    if (!valor || !categoriaId) {
      setErro('Preencha valor e categoria')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await criarTransacao({
        valor: parseFloat(valor.replace(',', '.')),
        tipo,
        descricao: descricao || null,
        data,
        categoria_id: parseInt(categoriaId),
      })
      onCriada()
      onFechar()
    } catch {
      setErro('Erro ao salvar. Backend rodando?')
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
      onClick={onFechar}
    >
      <div
        className="bg-gray-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Nova transação</h2>
          <button onClick={onFechar} className="text-gray-500">✕</button>
        </div>

        {/* Toggle gasto/receita */}
        <div className="grid grid-cols-2 gap-2">
          {['gasto', 'receita'].map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`py-2 rounded-lg font-medium capitalize ${
                tipo === t
                  ? t === 'gasto' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <input
          type="text"
          inputMode="decimal"
          placeholder="Valor (R$)"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-4 py-3 text-lg"
          autoFocus
        />

        <select
          value={categoriaId}
          onChange={e => setCategoriaId(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-4 py-3"
        >
          <option value="">Categoria...</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Descrição (opcional)"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-4 py-3"
        />

        <input
          type="date"
          value={data}
          onChange={e => setData(e.target.value)}
          className="w-full bg-gray-800 rounded-lg px-4 py-3"
        />

        {erro && <p className="text-red-400 text-sm">{erro}</p>}

        <button
          onClick={handleSubmit}
          disabled={salvando}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-3 font-semibold"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}