// Tela de Transações — timeline agrupada por dia + filtros combináveis.
//
// Conceitos pra estudar aqui:
// 1. Todos os filtros viram query params da API (o backend filtra, não o front).
//    Isso escala: com 10 mil transações, o navegador não precisa saber de todas.
// 2. Busca com debounce: espera 300ms de silêncio antes de bater na API,
//    senão cada tecla dispararia uma request.
// 3. O agrupamento por dia acontece no front (reduce), porque é apresentação —
//    a MESMA lista pode virar timeline, tabela ou calendário sem mudar a API.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Repeat } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import { hierarchize } from '../lib/categories'
import TransactionPanel from '../components/TransactionPanel'

// ---------- períodos pré-definidos ----------
function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function periodRange(key) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (key) {
    case 'this_month':
      return { start: isoDate(new Date(y, m, 1)), end: isoDate(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { start: isoDate(new Date(y, m - 1, 1)), end: isoDate(new Date(y, m, 0)) }
    case 'last_30': {
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return { start: isoDate(start), end: isoDate(today) }
    }
    default:
      return {} // 'all' → sem filtro de data
  }
}

const PERIODS = [
  ['this_month', 'Este mês'],
  ['last_month', 'Mês passado'],
  ['last_30', 'Últimos 30 dias'],
  ['all', 'Tudo'],
]

const TYPES = [
  ['', 'Todas'],
  ['income', 'Receitas'],
  ['expense', 'Despesas'],
  ['transfer', 'Transferências'],
]

// select estilizado no tema (reusado 4x na barra de filtros)
function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-card border border-border rounded-lg px-3 py-2 text-sm
                 text-slate-200 focus:outline-none focus:border-primary/60
                 hover:bg-hover cursor-pointer"
    >
      {children}
    </select>
  )
}

function TransactionRow({ tx, onClick }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left flex items-center gap-3 py-3 px-1 -mx-1
                   rounded-lg hover:bg-hover transition-colors"
      >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{
          backgroundColor: (tx.category_color || '#7C5CFF') + '26',
          color: tx.category_color || '#7C5CFF',
        }}
      >
        ●
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {tx.description}
          {tx.installment_total > 1 && (
            <span className="text-[10px] text-muted">
              {tx.installment_number}/{tx.installment_total}
            </span>
          )}
          {tx.is_recurring && <Repeat size={12} className="text-muted shrink-0" />}
        </p>
        <p className="text-xs text-muted">
          {tx.type === 'transfer'
            // transferência: origem → destino (destino = conta ou cartão/fatura)
            ? `${tx.account_name} → ${tx.to_account_name ?? tx.card_name}`
            : <>
                {tx.category_name || 'Sem categoria'}
                {tx.category_parent_name && ` (${tx.category_parent_name})`}
                {' · '}{tx.account_name ?? tx.card_name}
              </>}
        </p>
      </div>
      <p className={`text-sm font-medium ${
        tx.type === 'income' ? 'text-income'
        : tx.type === 'transfer' ? 'text-muted' : 'text-slate-200'}`}>
        {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '−'}
        {formatBRL(tx.amount)}
      </p>
      </button>
    </li>
  )
}

export default function Transactions() {
  const { version } = useRefresh()
  // ---------- estado dos filtros ----------
  // Filtro pode chegar pela URL (ex: clique no donut do dashboard leva a
  // /transacoes?category_id=3). Lazy initializer: lê a URL só no 1º render.
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState('this_month')
  const [categoryId, setCategoryId] = useState(
    () => searchParams.get('category_id') ?? '')
  const [accountId, setAccountId] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')        // o que o usuário digita
  const [query, setQuery] = useState('')          // o que vai pra API (debounced)

  // ---------- dados ----------
  const [transactions, setTransactions] = useState(null)
  const [selected, setSelected] = useState(null)  // transação sendo editada
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState(null)

  // Opções dos selects: carrega uma vez só
  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => {})
    api.get('/accounts').then(setAccounts).catch(() => {})
  }, [])

  // Debounce da busca: 300ms depois da última tecla, atualiza `query`
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(t) // cancela se digitar de novo antes dos 300ms
  }, [search])

  // Recarrega da API sempre que qualquer filtro muda
  useEffect(() => {
    const params = new URLSearchParams()
    const { start, end } = periodRange(period)
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    if (categoryId) params.set('category_id', categoryId)
    if (accountId) params.set('account_id', accountId)
    if (type) params.set('type', type)
    if (query) params.set('q', query)
    params.set('limit', '200')

    api.get(`/transactions?${params}`)
      .then(setTransactions)
      .catch((e) => setError(e.message))
  }, [period, categoryId, accountId, type, query, version])

  // Agrupa por dia (a API já devolve ordenado por data desc).
  // useMemo: só re-agrupa quando a lista muda, não a cada render.
  const groups = useMemo(() => {
    if (!transactions) return []
    const map = new Map()
    for (const tx of transactions) {
      if (!map.has(tx.date)) map.set(tx.date, [])
      map.get(tx.date).push(tx)
    }
    return [...map.entries()].map(([date, txs]) => ({
      date,
      txs,
      // total líquido do dia: receitas somam, despesas subtraem,
      // transferência é neutra (o dinheiro continua seu)
      net: txs.reduce(
        (sum, t) => sum + (t.type === 'income' ? t.amount
                          : t.type === 'expense' ? -t.amount : 0), 0),
    }))
  }, [transactions])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-3xl">
      <PageTitle sub="Todas as suas movimentações, filtráveis.">Transações</PageTitle>

      {/* ---------- barra de filtros ---------- */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterSelect value={period} onChange={setPeriod}>
          {PERIODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </FilterSelect>

        <FilterSelect value={categoryId} onChange={setCategoryId}>
          <option value="">Categoria</option>
          {hierarchize(categories).map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </FilterSelect>

        <FilterSelect value={accountId} onChange={setAccountId}>
          <option value="">Conta</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </FilterSelect>

        <FilterSelect value={type} onChange={setType}>
          {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </FilterSelect>

        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar…"
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2
                       text-sm placeholder:text-muted focus:outline-none
                       focus:border-primary/60"
          />
        </div>
      </div>

      {/* ---------- timeline ---------- */}
      {!transactions && <p className="text-muted text-sm">Carregando…</p>}

      {transactions && groups.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            Nenhuma transação com esses filtros. Tente ampliar o período.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {groups.map(({ date, txs, net }) => (
          <Card key={date} className="py-2">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <p className="text-xs font-medium text-muted uppercase tracking-wide">
                {relativeDay(date)}
              </p>
              <p className={`text-xs font-medium ${net >= 0 ? 'text-income' : 'text-muted'}`}>
                {net >= 0 ? '+' : '−'}{formatBRL(Math.abs(net))}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {txs.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onClick={() => setSelected(tx)} />
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <TransactionPanel
        open={selected != null}
        transaction={selected}
        onClose={() => setSelected(null)}
      />

      {transactions && transactions.length === 200 && (
        <p className="text-xs text-muted mt-4 text-center">
          Mostrando as 200 mais recentes — refine os filtros pra ver mais.
        </p>
      )}
    </div>
  )
}
