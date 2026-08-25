// Tela de Categorias — lista (estilo do spec: ícone, nome, gasto do mês,
// % do limite). Clicar abre o painel de edição.
// O % do limite é só texto por enquanto — as barras de progresso com as
// regras 80%/100% são a feature "Orçamentos" da Fase 2.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Tag } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import CategoryPanel, { CATEGORY_ICONS } from '../components/CategoryPanel'

function CategoryRow({ category, onClick }) {
  const Icon = CATEGORY_ICONS[category.icon] || Tag
  const hasLimit = category.monthly_limit != null && category.monthly_limit > 0
  const pct = hasLimit
    ? Math.round((category.spent_this_month / category.monthly_limit) * 100)
    : null
  // acima de 100% = estourou o limite → vermelho; 80–100% → laranja (spec)
  const pctColor =
    pct == null ? '' : pct >= 100 ? 'text-expense' : pct >= 80 ? 'text-warn' : 'text-muted'

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left flex items-center gap-3 px-4 py-3.5
                   hover:bg-hover transition-colors"
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: category.color + '26', color: category.color }}
        >
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{category.name}</p>
          <p className="text-xs text-muted">
            {hasLimit ? `Limite ${formatBRL(category.monthly_limit)}` : 'Sem limite'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{formatBRL(category.spent_this_month)}</p>
          {pct != null && (
            <p className={`text-xs ${pctColor}`}>{pct}% do limite</p>
          )}
        </div>
      </button>
    </li>
  )
}

export default function Categories() {
  const navigate = useNavigate()
  const { version } = useRefresh()
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(null) // null | 'new' | category

  useEffect(() => {
    api.get('/categories').then(setCategories).catch((e) => setError(e.message))
  }, [version])

  // mais gasto primeiro — a categoria que mais consome fica no topo
  // só categorias raiz aqui — subcategorias vivem no detalhe da mãe
  const sorted = categories
    ? categories
        .filter((c) => c.parent_id == null)
        .sort((a, b) => b.spent_this_month - a.spent_this_month)
    : null

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub="Gasto deste mês por categoria.">Categorias</PageTitle>
        <button
          onClick={() => setPanel('new')}
          className="shrink-0 flex items-center gap-2 bg-primary text-white text-sm
                     font-medium px-4 py-2.5 rounded-lg hover:bg-primary/90
                     transition-colors"
        >
          <Plus size={16} /> Nova categoria
        </button>
      </div>

      {!sorted && <p className="text-muted text-sm">Carregando…</p>}

      {sorted && (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border">
            {sorted.map((c) => (
              <CategoryRow key={c.id} category={c}
                           onClick={() => navigate(`/categorias/${c.id}`)} />
            ))}
          </ul>
        </Card>
      )}

      <CategoryPanel
        open={panel != null}
        category={panel === 'new' ? null : panel}
        onClose={() => setPanel(null)}
      />
    </div>
  )
}
