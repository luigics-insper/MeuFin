import { useEffect, useMemo, useRef, useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, StatCard, PageTitle } from '../components/shared'
import { NetWorthChart, CategoryDonut } from '../components/charts'
import UpcomingBills from '../components/UpcomingBills'
import { GripVertical } from 'lucide-react'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Dashboard() {
  const { version } = useRefresh()
  const [data, setData] = useState(null)
  const [byCategory, setByCategory] = useState(null)
  const [history, setHistory] = useState(null)
  const [bills, setBills] = useState(null)

  // ---- ordem dos widgets: arrastável e PERSISTIDA em localStorage ----
  // localStorage é a escolha certa aqui: é preferência de UI deste
  // navegador, não dado financeiro — não merece ir pro banco.
  const DEFAULT_ORDER = ['networth', 'bills', 'donut']
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('meufin:dashboard-order'))
      // valida: mesma composição (proteção contra versões antigas salvas)
      if (Array.isArray(saved)
          && saved.length === DEFAULT_ORDER.length
          && DEFAULT_ORDER.every((id) => saved.includes(id))) return saved
    } catch { /* primeiro uso */ }
    return DEFAULT_ORDER
  })
  const dragging = useRef(null)

  const onDrop = (targetId) => {
    const from = dragging.current
    dragging.current = null
    if (!from || from === targetId) return
    setOrder((cur) => {
      const next = cur.filter((id) => id !== from)
      next.splice(next.indexOf(targetId), 0, from)
      localStorage.setItem('meufin:dashboard-order', JSON.stringify(next))
      return next
    })
  }
  const [error, setError] = useState(null)

  useEffect(() => {
    // Promise.all: as 3 requests saem JUNTAS, não em fila.
    // Sequencial seria soma das latências; paralelo é a maior delas.
    Promise.all([
      api.get('/dashboard/summary'),
      api.get('/dashboard/by-category'),
      api.get('/dashboard/net-worth-history?months=12'),
      api.get('/dashboard/upcoming-bills'),
    ])
      .then(([summary, cats, hist, upcoming]) => {
        setData(summary)
        setByCategory(cats)
        setHistory(hist)
        setBills(upcoming)
      })
      .catch((e) => setError(e.message))
  }, [version])

  if (error) {
    return (
      <Card className="border-expense/40">
        <p className="text-sm">
          Não consegui falar com a API ({error}). O backend está rodando?
          <code className="block mt-2 text-xs text-muted">
            cd backend && uvicorn app.main:app --reload
          </code>
        </p>
      </Card>
    )
  }
  if (!data) return <p className="text-muted text-sm">Carregando…</p>

  return (
    <div className="max-w-6xl">
      <PageTitle sub="Aqui está o resumo da sua vida financeira.">
        {greeting()}, Luigi! 👋
      </PageTitle>

      {/* Widgets 1–4: os 4 números que respondem "como estou?" */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Saldo total" value={formatBRL(data.total_balance)}
                  icon={Wallet} tone="primary" />
        <StatCard label="Receitas" value={formatBRL(data.income)}
                  changePct={data.income_change_pct} icon={TrendingUp} tone="income" />
        <StatCard label="Despesas" value={formatBRL(data.expense)}
                  changePct={data.expense_change_pct} icon={TrendingDown} tone="expense" />
        <StatCard label="Economia" value={formatBRL(data.savings)}
                  changePct={data.savings_change_pct} icon={PiggyBank} tone="info" />
      </div>

      {/* Widgets arrastáveis: segura no ⋮⋮ e solta em cima de outro.
          A ordem é estado + localStorage; os widgets em si não sabem
          que são arrastáveis — o wrapper cuida de tudo. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        {order.map((id) => {
          const widget = {
            networth: history && <NetWorthChart points={history} />,
            bills: bills && <UpcomingBills bills={bills} />,
            donut: byCategory && <CategoryDonut data={byCategory} />,
          }[id]
          if (!widget) return null
          return (
            <div key={id}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={() => onDrop(id)}
                 className="relative group">
              <button
                draggable
                onDragStart={() => { dragging.current = id }}
                aria-label="Arrastar widget"
                className="hidden md:flex absolute top-4 right-3 z-10 p-1 rounded
                           text-muted opacity-0 group-hover:opacity-100
                           cursor-grab active:cursor-grabbing hover:bg-hover
                           transition-opacity"
              >
                <GripVertical size={15} />
              </button>
              {widget}
            </div>
          )
        })}
      </div>

      {/* Widget 9: últimas transações — lista estilo app de banco, não tabela */}
      <Card className="mt-4">
        <h2 className="text-sm font-medium mb-4">Últimas transações</h2>
        <ul className="divide-y divide-border">
          {data.recent_transactions.map((tx) => (
            <li key={tx.id} className="flex items-center gap-3 py-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: (tx.category_color || '#7C5CFF') + '26',
                         color: tx.category_color || '#7C5CFF' }}
              >
                ●
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-xs text-muted">
                  {tx.type === 'transfer'
                    ? `${tx.account_name} → ${tx.to_account_name ?? tx.card_name}`
                    : <>
                        {tx.category_name || 'Sem categoria'}
                        {tx.category_parent_name && ` (${tx.category_parent_name})`}
                        {' · '}{tx.account_name ?? tx.card_name}
                      </>}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${
                  tx.type === 'income' ? 'text-income'
                  : tx.type === 'transfer' ? 'text-muted' : 'text-slate-200'}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '−'}
                  {formatBRL(tx.amount)}
                </p>
                <p className="text-xs text-muted">{relativeDay(tx.date)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
