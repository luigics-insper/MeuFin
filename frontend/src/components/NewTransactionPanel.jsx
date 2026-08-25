// Painel "Nova transação".
// Desktop: drawer lateral direito (como no seu spec — lateral, não outra página).
// Mobile: bottom sheet (padrão de app de banco).
// É o MESMO componente — só as classes responsivas mudam o formato.
//
// Conceito importante: o input de valor é TEXTO ("82,40"), e a conversão
// pra centavos (8240) acontece uma vez só, no submit (parseBRL).
// O backend nunca vê float.
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'

// "82,40" | "82.40" | "1.234,56" | "82" → centavos (int) ou null se inválido
export function parseBRL(text) {
  const clean = text.trim().replace(/\s|R\$/g, '')
  if (!clean) return null
  // Se tem vírgula, ela é o separador decimal e pontos são de milhar
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const EMPTY = {
  type: 'expense',
  description: '',
  amount: '',
  date: todayISO(),
  category_id: '',
  account_id: '',
  is_recurring: false,
}

export default function NewTransactionPanel({ open, onClose }) {
  const { bump } = useRefresh()
  const [form, setForm] = useState(EMPTY)
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const firstInput = useRef(null)

  // Carrega opções quando abre (e reseta o formulário)
  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setError(null)
    api.get('/categories').then(setCategories).catch(() => {})
    api.get('/accounts').then((accs) => {
      setAccounts(accs)
      // pré-seleciona a primeira conta (menos um clique no caminho feliz)
      if (accs[0]) setForm((f) => ({ ...f, account_id: String(accs[0].id) }))
    }).catch(() => {})
    // foco no primeiro campo assim que o painel renderizar
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open])

  // Esc fecha
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit() {
    const cents = parseBRL(form.amount)
    if (!form.description.trim()) return setError('Dá um nome pra transação.')
    if (cents == null) return setError('Valor inválido — ex: 82,40')
    if (!form.account_id) return setError('Escolhe uma conta.')

    setSaving(true)
    setError(null)
    try {
      await api.post('/transactions', {
        description: form.description.trim(),
        amount: cents,
        type: form.type,
        date: form.date,
        account_id: Number(form.account_id),
        category_id: form.category_id ? Number(form.category_id) : null,
        is_recurring: form.is_recurring,
      })
      bump()      // avisa Dashboard/Transações pra recarregarem
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
                 placeholder:text-muted focus:outline-none focus:border-primary/60`

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop — clicar fora fecha */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* mobile: sheet embaixo · desktop: drawer à direita */}
      <div
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto
                   rounded-t-2xl bg-card border-t border-border
                   md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[400px]
                   md:max-h-none md:rounded-none md:border-t-0 md:border-l
                   p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Nova transação</h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Tipo: despesa | receita */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[['expense', 'Despesa'], ['income', 'Receita']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setForm((f) => ({ ...f, type: value }))}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                form.type === value
                  ? value === 'expense'
                    ? 'bg-expense/15 border-expense/50 text-expense'
                    : 'bg-income/15 border-income/50 text-income'
                  : 'border-border text-muted hover:bg-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input ref={firstInput} className={input} placeholder="Descrição (ex: Mercado)"
                 value={form.description} onChange={set('description')} />

          <input className={input} placeholder="Valor (ex: 82,40)" inputMode="decimal"
                 value={form.amount} onChange={set('amount')} />

          <input type="date" className={input}
                 value={form.date} onChange={set('date')} />

          <select className={input} value={form.category_id} onChange={set('category_id')}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select className={input} value={form.account_id} onChange={set('account_id')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={form.is_recurring}
                   onChange={set('is_recurring')}
                   className="accent-[#7C5CFF]" />
            Recorrente (todo mês)
          </label>
        </div>

        {error && <p className="text-expense text-xs mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-5 py-3 rounded-lg bg-primary text-white text-sm
                     font-medium hover:bg-primary/90 disabled:opacity-60
                     transition-colors"
        >
          {saving ? 'Salvando…' : 'Salvar transação'}
        </button>
      </div>
    </div>
  )
}
