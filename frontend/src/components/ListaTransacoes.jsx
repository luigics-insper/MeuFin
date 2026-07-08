export default function ListaTransacoes({ transacoes, categorias, onDeletar }) {
  const catPorId = Object.fromEntries(categorias.map(c => [c.id, c]))

  if (transacoes.length === 0) {
    return <p className="text-gray-500 text-center py-8">Nenhuma transação nesse mês.</p>
  }

  return (
    <ul className="space-y-2">
      {transacoes.map(t => {
        const cat = catPorId[t.categoria_id]
        const receita = t.tipo === 'receita'
        return (
          <li
            key={t.id}
            className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cat?.cor }}
              />
              <div className="min-w-0">
                <p className="font-medium truncate">{t.descricao || cat?.nome}</p>
                <p className="text-xs text-gray-500">
                  {cat?.nome} · {new Date(t.data + 'T00:00').toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={receita ? 'text-green-400 font-semibold' : 'font-semibold'}>
                {receita ? '+' : '-'} R$ {t.valor.toFixed(2)}
              </span>
              <button
                onClick={() => onDeletar(t.id)}
                className="text-gray-600 hover:text-red-400 text-sm"
              >
                ✕
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}