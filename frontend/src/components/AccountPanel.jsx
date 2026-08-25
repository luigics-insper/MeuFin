// Painel de conta — mesmo padrão do TransactionPanel (null = criar,
// account = editar), mas repare: NÃO é o mesmo componente. Transação e conta
// têm formulários diferentes; generalizar aqui criaria um monstro de ifs.
// Regra prática: unifica quando os formulários são IGUAIS, separa quando não.
import { useEffect, useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { parseBRL, centsToInput } from '../lib/money'

// tipo → rótulo em PT + ícone Lucide padrão (o usuário não escolhe ícone;
// ele vem do tipo — uma decisão a menos no formulário)
export const ACCOUNT_TYPES = {
  checking:   { label: 'Conta corrente', icon: 'landmark' },
  wallet:     { label: 'Carteira digital', icon: 'wallet' },
  savings:    { label: 'Poupança', icon: 'piggy-bank' },
  investment: { label: 'Investimento', icon: 'trending-up' },
  cash:       { label: 'Dinheiro', icon: 'banknote' },
}

const COLORS = ['#7C5CFF', '#8A05BE', '#22C55E', '#3B82F6', '#F97316',
                '#EF4444', '#EAB308', '#14B8A6']

const EMPTY = { name: '', type: 'checking', initial_balance: '', color: COLORS[0] }

export default function AccountPanel({ open, onClose, account = null }) {
  const editing = account != null
  const { bump } = useRefresh()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const firstInput = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? {
          name: account.name,
          type: account.type,
          initial_balance: centsToInput(account.initial_balance),
          color: account.color,
        }
      : EMPTY)
    setError(null)
    setConfirmingDelete(false)
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open, account]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function run(request) {
    setSaving(true)
    setError(null)
    try {
      await request()
      bump()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const submit = () => {
    if (!form.name.trim()) return setError('Dá um nome pra conta.')
    // saldo inicial vazio = 0; aceita negativo (conta que nasce devendo)
    const cents = form.initial_balance.trim() === ''
      ? 0
      : parseBRL(form.initial_balance, { allowNonPositive: true })
    if (cents == null) return setError('Saldo inicial inválido — ex: 150,00')

    const payload = {
      name: form.name.trim(),
      type: form.type,
      initial_balance: cents,
      color: form.color,
      icon: ACCOUNT_TYPES[form.type].icon,
    }
    run(() => editing
      ? api.patch(`/accounts/${account.id}`, payload)
      : api.post('/accounts', payload))
  }

  const remove = () => {
    if (!confirmingDelete) return setConfirmingDelete(true)
    // Se a conta tiver transações, o backend recusa com 409 e a mensagem
    // aparece aqui embaixo — o front não precisa duplicar essa regra.
    run(() => api.delete(`/accounts/${account.id}`))
  }

  const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
                 placeholder:text-muted focus:outline-none focus:border-primary/60`

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto
                   rounded-t-2xl bg-card border-t border-border
                   md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[400px]
                   md:max-h-none md:rounded-none md:border-t-0 md:border-l
                   p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">
            {editing ? 'Editar conta' : 'Nova conta'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <input ref={firstInput} className={input} placeholder="Nome (ex: Nubank)"
                 value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

          <select className={input} value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {Object.entries(ACCOUNT_TYPES).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <div>
            <input className={input} inputMode="decimal"
                   placeholder="Saldo inicial (ex: 150,00 — pode deixar vazio)"
                   value={form.initial_balance}
                   onChange={(e) =>
                     setForm((f) => ({ ...f, initial_balance: e.target.value }))} />
            {editing && (
              <p className="text-[11px] text-muted mt-1 px-1">
                O saldo atual = saldo inicial + transações. Ajustar o inicial
                recalcula tudo.
              </p>
            )}
          </div>

          {/* Cor: swatches clicáveis, sem color-picker nativo (feio no dark) */}
          <div className="flex gap-2 pt-1">
            {COLORS.map((c) => (
              <button key={c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                aria-label={`Cor ${c}`}
                className={`w-7 h-7 rounded-full transition-transform ${
                  form.color === c ? 'ring-2 ring-offset-2 ring-offset-card scale-110' : ''
                }`}
                style={{ backgroundColor: c, '--tw-ring-color': c }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-expense text-xs mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-5 py-3 rounded-lg bg-primary text-white text-sm
                     font-medium hover:bg-primary/90 disabled:opacity-60
                     transition-colors"
        >
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar conta'}
        </button>

        {editing && (
          <button
            onClick={remove}
            disabled={saving}
            className={`w-full mt-3 py-2.5 rounded-lg border text-sm flex items-center
                        justify-center gap-2 disabled:opacity-60 transition-colors ${
              confirmingDelete
                ? 'bg-expense text-white border-expense'
                : 'border-expense/40 text-expense hover:bg-expense/10'
            }`}
          >
            <Trash2 size={15} />
            {confirmingDelete ? 'Confirmar exclusão?' : 'Excluir conta'}
          </button>
        )}
      </div>
    </div>
  )
}
