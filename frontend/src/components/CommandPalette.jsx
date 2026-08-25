// Ctrl+K — Pesquisa global + comando rápido.
//
// Dois modos, decididos pelo primeiro caractere:
//   texto normal  → busca em páginas, categorias, contas, cartões e
//                   transações (essas via API, com debounce)
//   começa com +  → comando rápido: "+ mercado 82" cria a despesa
//                   Mercado de R$ 82, hoje, na primeira conta — e REUSA
//                   a categoria da última transação de mesmo nome
//                   (auto-categorização: o app aprende com seu histórico)
//
// Conceito de UI pra estudar: a palette é UMA lista achatada de resultados
// com um índice ativo (setinhas movem, Enter executa). Os "grupos" são só
// visuais — a navegação ignora os cabeçalhos. Isso simplifica MUITO o
// código de teclado comparado a navegar uma estrutura aninhada.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Home, ArrowLeftRight, FolderOpen, Landmark, CreditCard,
  Target, Flag, Calendar, Plus, Tag, CornerDownLeft,
} from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { parseBRL } from '../lib/money'
import { CATEGORY_ICONS } from './CategoryPanel'

const PAGES = [
  { label: 'Dashboard', to: '/', icon: Home },
  { label: 'Transações', to: '/transacoes', icon: ArrowLeftRight },
  { label: 'Categorias', to: '/categorias', icon: FolderOpen },
  { label: 'Contas', to: '/contas', icon: Landmark },
  { label: 'Cartões', to: '/cartoes', icon: CreditCard },
  { label: 'Orçamentos', to: '/orcamentos', icon: Target },
  { label: 'Metas', to: '/metas', icon: Flag },
  { label: 'Calendário', to: '/calendario', icon: Calendar },
]

// "+ mercado 82" → { description: "mercado", cents: 8200 } | null
export function parseQuickCommand(text) {
  if (!text.startsWith('+')) return null
  const parts = text.slice(1).trim().split(/\s+/)
  if (parts.length < 2) return null
  const cents = parseBRL(parts[parts.length - 1])
  if (cents == null) return null
  const description = parts.slice(0, -1).join(' ')
  if (!description) return null
  return { description, cents }
}

export default function CommandPalette({ open, onClose, onSelectTx }) {
  const navigate = useNavigate()
  const { bump } = useRefresh()
  const [query, setQuery] = useState('')
  const [txResults, setTxResults] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const inputRef = useRef(null)

  // dados estáticos: carrega quando abre
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setFeedback(null)
    api.get('/categories').then(setCategories).catch(() => {})
    api.get('/accounts').then(setAccounts).catch(() => {})
    api.get('/cards').then(setCards).catch(() => {})
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // busca de transações com debounce (só no modo busca)
  useEffect(() => {
    if (!open || !query.trim() || query.startsWith('+')) {
      setTxResults([])
      return
    }
    const t = setTimeout(() => {
      api.get(`/transactions?q=${encodeURIComponent(query.trim())}&limit=6`)
        .then(setTxResults)
        .catch(() => setTxResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  const quick = parseQuickCommand(query)

  // ---------- monta a lista achatada de resultados ----------
  const items = useMemo(() => {
    if (quick) {
      return [{
        kind: 'quick',
        label: `Criar despesa: ${quick.description}`,
        detail: `${formatBRL(quick.cents)} · hoje`,
        icon: Plus,
      }]
    }
    const q = query.trim().toLowerCase()
    const match = (s) => s.toLowerCase().includes(q)
    // rank simples: começa-com vem antes de contém
    const rank = (list, key) => q
      ? list.filter((x) => match(key(x)))
            .sort((a, b) =>
              key(b).toLowerCase().startsWith(q) - key(a).toLowerCase().startsWith(q))
      : list

    const out = []
    for (const p of rank(PAGES, (p) => p.label).slice(0, q ? 4 : 8)) {
      out.push({ kind: 'page', label: p.label, icon: p.icon, to: p.to, group: 'Páginas' })
    }
    if (q) {
      for (const c of rank(categories, (c) => c.name).slice(0, 4)) {
        out.push({ kind: 'category', label: c.name, color: c.color,
                   icon: CATEGORY_ICONS[c.icon] || Tag, to: `/categorias/${c.id}`,
                   group: 'Categorias' })
      }
      for (const a of rank(accounts, (a) => a.name).slice(0, 3)) {
        out.push({ kind: 'account', label: a.name, color: a.color, icon: Landmark,
                   detail: formatBRL(a.balance), to: '/contas', group: 'Contas' })
      }
      for (const c of rank(cards, (c) => c.name).slice(0, 3)) {
        out.push({ kind: 'card', label: c.name, color: c.color, icon: CreditCard,
                   to: '/cartoes', group: 'Cartões' })
      }
      for (const tx of txResults) {
        out.push({ kind: 'tx', label: tx.description, tx,
                   detail: `${tx.type === 'income' ? '+' : '−'}${formatBRL(tx.amount)} · ${tx.date}`,
                   icon: ArrowLeftRight, group: 'Transações' })
      }
    }
    return out
  }, [query, quick, categories, accounts, cards, txResults])

  // índice ativo nunca aponta pra fora da lista
  useEffect(() => setActive(0), [query, items.length])

  if (!open) return null

  // ---------- executa o item selecionado ----------
  async function execute(item) {
    if (!item) return
    if (item.kind === 'quick') {
      setCreating(true)
      try {
        // AUTO-CATEGORIZAÇÃO: procura a transação mais recente com a
        // mesma descrição e reusa a categoria dela. "Steam de novo?
        // Lazer, óbvio." O app aprende com o próprio histórico.
        let category_id = null
        try {
          const prev = await api.get(
            `/transactions?q=${encodeURIComponent(quick.description)}&limit=5`)
          const exact = prev.find(
            (t) => t.description.toLowerCase() === quick.description.toLowerCase())
          category_id = (exact ?? prev[0])?.category_id ?? null
        } catch { /* sem histórico, sem categoria — tudo bem */ }

        await api.post('/transactions', {
          description: quick.description,
          amount: quick.cents,
          type: 'expense',
          date: new Date().toISOString().slice(0, 10),
          account_id: accounts[0]?.id,
          category_id,
          is_recurring: false,
        })
        bump()
        setFeedback(`✓ ${quick.description} — ${formatBRL(quick.cents)} criada`)
        setQuery('')
        setTimeout(() => setFeedback(null), 2500)
      } catch (e) {
        setFeedback(`Erro: ${e.message}`)
      } finally {
        setCreating(false)
      }
      return // palette fica aberta: dá pra emendar outro comando
    }
    if (item.kind === 'tx') {
      onClose()
      onSelectTx(item.tx)
      return
    }
    onClose()
    navigate(item.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); execute(items[active]) }
    if (e.key === 'Escape') onClose()
  }

  let lastGroup = null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute inset-x-3 top-16 md:inset-x-auto md:left-1/2
                      md:-translate-x-1/2 md:w-[540px] md:top-24
                      bg-card border border-border rounded-2xl shadow-2xl
                      overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={17} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Pesquisar… ou "+ mercado 82" pra criar'
            className="flex-1 bg-transparent text-sm placeholder:text-muted
                       focus:outline-none"
          />
          <kbd className="hidden md:block text-[10px] text-muted border border-border
                          rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {feedback && (
          <p className={`px-4 py-2 text-xs border-b border-border ${
            feedback.startsWith('✓') ? 'text-income' : 'text-expense'}`}>
            {feedback}
          </p>
        )}

        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && query && (
            <li className="px-4 py-6 text-center text-xs text-muted">
              Nada encontrado pra "{query}"
            </li>
          )}
          {items.map((item, i) => {
            const Icon = item.icon
            const header = item.group && item.group !== lastGroup ? item.group : null
            lastGroup = item.group ?? lastGroup
            return (
              <li key={`${item.kind}-${item.label}-${i}`}>
                {header && (
                  <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide
                                text-muted font-medium">{header}</p>
                )}
                <button
                  onClick={() => execute(item)}
                  onMouseEnter={() => setActive(i)}
                  disabled={creating}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left
                              transition-colors ${
                    i === active ? 'bg-hover' : ''
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center
                                   shrink-0"
                        style={item.color
                          ? { backgroundColor: item.color + '26', color: item.color }
                          : undefined}>
                    <Icon size={15} className={item.color ? '' : 'text-muted'} />
                  </span>
                  <span className="text-sm flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="text-xs text-muted shrink-0">{item.detail}</span>
                  )}
                  {i === active && (
                    <CornerDownLeft size={13} className="text-muted shrink-0" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="px-4 py-2 border-t border-border flex gap-4 text-[10px] text-muted">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span className="text-primary">+ nome valor = criar despesa</span>
        </div>
      </div>
    </div>
  )
}
