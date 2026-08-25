// Tela de Orçamentos — a mais visual do spec:
// cada categoria com limite vira uma barra ████████░░ com as regras de cor
// (< 80% ok · ≥ 80% amarelo · ≥ 100% vermelho) e dá pra navegar entre meses.
import { useEffect, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, AlertTriangle, Tag } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import { CATEGORY_ICONS } from '../components/CategoryPanel'
import BudgetPanel from '../components/BudgetPanel'

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// regra de cor do spec, num lugar só
function barColor(pct) {
  if (pct >= 100) return '#EF4444'  // estourou
  if (pct >= 80) return '#F59E0B'   // zona de atenção
  return '#22C55E'                  // dentro do orçamento
}

function BudgetRow({ category, onClick }) {
  const Icon = CATEGORY_ICONS[category.icon] || Tag
  const pct = Math.round((category.spent_this_month / category.monthly_limit) * 100)
  const color = barColor(pct)

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left px-4 py-3.5 hover:bg-hover transition-colors"
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: category.color + '26', color: category.color }}
          >
            <Icon size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{category.name}</p>
            <p className="text-xs text-muted">
              {formatBRL(category.spent_this_month)} de {formatBRL(category.monthly_limit)}
            </p>
          </div>
          <p className="text-sm font-semibold shrink-0" style={{ color }}>
            {pct}%
          </p>
        </div>

        {/* Barra: trilho fixo + preenchimento com min(pct, 100) —
            estourar o orçamento muda a COR, não vaza da barra */}
        <div className="h-2 rounded-full bg-bg overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
          />
        </div>
      </button>
    </li>
  )
}

export default function Budgets() {
  const { version } = useRefresh()
  const today = new Date()
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(null) // null | 'new' | categoria

  useEffect(() => {
    api.get(`/categories?year=${ym.year}&month=${ym.month}`)
      .then(setCategories)
      .catch((e) => setError(e.message))
  }, [version, ym])

  const shiftMonth = (delta) => {
    setYm(({ year, month }) => {
      let m = month + delta, y = year
      if (m < 1) { m = 12; y-- }
      if (m > 12) { m = 1; y++ }
      return { year: y, month: m }
    })
  }

  const budgets = categories
    ?.filter((c) => c.monthly_limit != null && c.monthly_limit > 0)
    .sort((a, b) =>
      b.spent_this_month / b.monthly_limit - a.spent_this_month / a.monthly_limit)
  const exceeded = budgets?.filter((c) => c.spent_this_month >= c.monthly_limit).length

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub="Limites mensais por categoria.">Orçamentos</PageTitle>
        <button
          onClick={() => setPanel('new')}
          className="shrink-0 flex items-center gap-2 bg-primary text-white text-sm
                     font-medium px-4 py-2.5 rounded-lg hover:bg-primary/90
                     transition-colors"
        >
          <Plus size={16} /> Novo orçamento
        </button>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior"
                className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium w-40 text-center">
          {MONTHS_PT[ym.month - 1]} de {ym.year}
        </p>
        <button onClick={() => shiftMonth(1)} aria-label="Próximo mês"
                className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
          <ChevronRight size={18} />
        </button>
      </div>

      {!budgets && <p className="text-muted text-sm">Carregando…</p>}

      {budgets && budgets.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            Nenhuma categoria tem limite mensal ainda. Clique em
            "Novo orçamento" pra definir o primeiro.
          </p>
        </Card>
      )}

      {budgets && budgets.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border">
            {budgets.map((c) => (
              <BudgetRow key={c.id} category={c} onClick={() => setPanel(c)} />
            ))}
          </ul>
          {exceeded > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border
                            text-expense text-xs font-medium">
              <AlertTriangle size={14} />
              {exceeded} {exceeded === 1 ? 'orçamento excedido' : 'orçamentos excedidos'}
            </div>
          )}
        </Card>
      )}

      <BudgetPanel
        open={panel != null}
        budget={panel === 'new' ? null : panel}
        categories={categories ?? []}
        onClose={() => setPanel(null)}
      />
    </div>
  )
}
