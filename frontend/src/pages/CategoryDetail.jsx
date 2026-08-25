// Detalhe de categoria — /categorias/:id
// Resumo do mês · gráfico 6 meses · top estabelecimentos · subcategorias ·
// últimas transações. Alimentada por UM endpoint agregado.
//
// Novidade de routing pra estudar: useParams() lê o :id da URL.
// A rota é declarada como /categorias/:id no App.jsx — um "curinga" que
// casa /categorias/1, /categorias/42... e o componente descobre qual é.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Tag, Repeat,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import CategoryPanel, { CATEGORY_ICONS } from '../components/CategoryPanel'
import TransactionPanel from '../components/TransactionPanel'

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-sidebar border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-muted mb-0.5">{label}</p>
      <p className="font-medium">{formatBRL(payload[0].value)}</p>
    </div>
  )
}

export default function CategoryDetail() {
  const { id } = useParams()                 // o :id da URL, sempre string
  const navigate = useNavigate()
  const { version } = useRefresh()
  const today = new Date()
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editPanel, setEditPanel] = useState(false)   // editar a categoria
  const [subPanel, setSubPanel] = useState(false)     // nova subcategoria
  const [selectedTx, setSelectedTx] = useState(null)  // editar transação

  useEffect(() => {
    api.get(`/categories/${id}/detail?year=${ym.year}&month=${ym.month}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id, ym, version])

  const shiftMonth = (delta) => {
    setYm(({ year, month }) => {
      let m = month + delta, y = year
      if (m < 1) { m = 12; y-- }
      if (m > 12) { m = 1; y++ }
      return { year: y, month: m }
    })
  }

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }
  if (!data) return <p className="text-muted text-sm">Carregando…</p>

  const { category, spent, prev_spent, pct_of_expenses,
          history, top_merchants, children, recent } = data
  const Icon = CATEGORY_ICONS[category.icon] || Tag
  const changePct = prev_spent > 0
    ? Math.round((spent - prev_spent) / prev_spent * 100)
    : null
  const barData = history.map((h) => ({
    label: MONTHS_SHORT[h.month - 1],
    total: h.total,
    current: h.year === ym.year && h.month === ym.month,
  }))

  return (
    <div className="max-w-3xl">
      {/* Header: voltar + identidade da categoria + editar */}
      <div className="flex items-center gap-3 mb-1">
        <Link to="/categorias" aria-label="Voltar"
              className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
          <ArrowLeft size={18} />
        </Link>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: category.color + '26', color: category.color }}
        >
          <Icon size={19} />
        </div>
        <PageTitle className="mb-0" sub={category.monthly_limit
          ? `Limite mensal: ${formatBRL(category.monthly_limit)}`
          : 'Sem limite mensal'}>
          {category.name}
        </PageTitle>
        <button
          onClick={() => setEditPanel(true)}
          className="ml-auto shrink-0 flex items-center gap-2 border border-border
                     text-sm px-3 py-2 rounded-lg text-slate-300 hover:bg-hover"
        >
          <Pencil size={14} /> Editar
        </button>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center gap-1 mb-4 mt-3">
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

      {/* Resumo do mês */}
      <Card>
        <p className="text-xs text-muted mb-1">Total gasto</p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-2xl font-semibold">{formatBRL(spent)}</p>
          <span className="text-xs text-muted">{pct_of_expenses}% das despesas do mês</span>
          {changePct != null && (
            <span className={`text-xs font-medium ${
              changePct > 0 ? 'text-expense' : 'text-income'}`}>
              {changePct > 0 ? '↑' : '↓'} {Math.abs(changePct)}% vs mês anterior
            </span>
          )}
        </div>
      </Card>

      {/* Evolução 6 meses — o mês selecionado ganha a cor da categoria */}
      <Card className="mt-4">
        <h2 className="text-sm font-medium mb-4">Últimos 6 meses</h2>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#8B95A7', fontSize: 11 }}
                     axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: '#1B2432' }} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {barData.map((d) => (
                  <Cell key={d.label}
                        fill={d.current ? category.color : '#1E2633'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Top estabelecimentos: GROUP BY description no backend */}
        <Card>
          <h2 className="text-sm font-medium mb-3">Top estabelecimentos</h2>
          {top_merchants.length === 0 && (
            <p className="text-xs text-muted">Nenhum gasto neste mês.</p>
          )}
          <ul className="space-y-2.5">
            {top_merchants.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3">
                <span className="text-xs text-muted w-4">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{m.name}</p>
                  <p className="text-[11px] text-muted">
                    {m.count} {m.count === 1 ? 'compra' : 'compras'}
                  </p>
                </div>
                <p className="text-sm font-medium">{formatBRL(m.total)}</p>
              </li>
            ))}
          </ul>
        </Card>

        {/* Subcategorias */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Subcategorias</h2>
            <button
              onClick={() => setSubPanel(true)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus size={13} /> Nova
            </button>
          </div>
          {children.length === 0 && (
            <p className="text-xs text-muted">
              Nenhuma ainda. Ex: dentro de Alimentação — Mercado,
              Restaurantes, Delivery.
            </p>
          )}
          <ul className="space-y-1">
            {children.map((c) => {
              const SubIcon = CATEGORY_ICONS[c.icon] || Tag
              return (
                <li key={c.id}>
                  <Link to={`/categorias/${c.id}`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5
                                   hover:bg-hover transition-colors">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center"
                          style={{ backgroundColor: c.color + '26', color: c.color }}>
                      <SubIcon size={13} />
                    </span>
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    <span className="text-xs font-medium">
                      {formatBRL(c.spent_this_month)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {/* Últimas transações do mês nessa categoria */}
      <Card className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Transações do mês</h2>
          <Link to={`/transacoes?category_id=${category.id}`}
                className="text-xs text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        {recent.length === 0 && (
          <p className="text-xs text-muted">Nenhuma transação neste mês.</p>
        )}
        <ul className="divide-y divide-border">
          {recent.map((tx) => (
            <li key={tx.id}>
              <button
                onClick={() => setSelectedTx(tx)}
                className="w-full text-left flex items-center gap-3 py-2.5 px-1 -mx-1
                           rounded-lg hover:bg-hover transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate flex items-center gap-1.5">
                    {tx.description}
                    {tx.is_recurring && <Repeat size={12} className="text-muted shrink-0" />}
                  </p>
                  <p className="text-xs text-muted">
                    {tx.account_name} · {relativeDay(tx.date)}
                  </p>
                </div>
                <p className="text-sm font-medium">−{formatBRL(tx.amount)}</p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* Painéis: editar categoria · nova subcategoria · editar transação */}
      <CategoryPanel open={editPanel} category={category}
                     onClose={() => setEditPanel(false)} />
      <CategoryPanel open={subPanel} defaultParentId={category.id}
                     onClose={() => setSubPanel(false)} />
      <TransactionPanel open={selectedTx != null} transaction={selectedTx}
                        onClose={() => setSelectedTx(null)} />
    </div>
  )
}
