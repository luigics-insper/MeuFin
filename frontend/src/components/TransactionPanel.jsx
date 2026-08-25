// Painel de transação — UM componente, DOIS modos:
//   transaction == null  → criar (POST)
//   transaction != null  → editar (PATCH) + Duplicar + Excluir
//
// Por que não dois componentes separados? O formulário é idêntico nos dois
// modos. Duplicar código de formulário é o jeito mais rápido de os dois
// saírem de sincronia (corrige bug num, esquece no outro). A diferença
// entre criar/editar vira só: valores iniciais + qual request sai no submit.
//
// Refatoração a estudar: esse arquivo substituiu o antigo
// NewTransactionPanel.jsx. Compare no git (git log --oneline / git diff).
import { useEffect, useRef, useState } from 'react'
import { X, Copy, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { useToast } from '../lib/toast'
import { parseBRL, centsToInput } from '../lib/money'

const formatBRLSafe = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
import { hierarchize } from '../lib/categories'

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
  card_id: '',
  to_account_id: '',   // destino — só faz sentido em transferência
  method: 'account',   // 'account' | 'card' — de onde sai o dinheiro
  installments: 1,
  is_recurring: false,
}

// transação da API → shape do formulário (tudo string, como inputs esperam)
function fromTransaction(tx) {
  return {
    type: tx.type,
    description: tx.description,
    amount: centsToInput(tx.amount),
    date: tx.date,
    category_id: tx.category_id ? String(tx.category_id) : '',
    account_id: tx.account_id ? String(tx.account_id) : '',
    card_id: tx.card_id ? String(tx.card_id) : '',
    to_account_id: tx.to_account_id ? String(tx.to_account_id) : '',
    method: tx.card_id ? 'card' : 'account',
    installments: 1,  // parcelamento não é editável (cada parcela é uma tx)
    is_recurring: tx.is_recurring,
  }
}

export default function TransactionPanel({ open, onClose, transaction = null }) {
  const editing = transaction != null
  const { bump } = useRefresh()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const firstInput = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(editing ? fromTransaction(transaction) : EMPTY)
    setError(null)
    setConfirmingDelete(false)
    api.get('/categories').then(setCategories).catch(() => {})
    api.get('/cards').then((cs) => {
      setCards(cs)
      if (editing && transaction.card_id) {
        setForm((f) => ({ ...f, card_id: String(transaction.card_id) }))
      } else if (cs[0]) {
        setForm((f) => ({ ...f, card_id: String(cs[0].id) }))
      }
    }).catch(() => {})
    api.get('/accounts').then((accs) => {
      setAccounts(accs)
      if (!editing && accs[0]) {
        setForm((f) => ({
          ...f,
          account_id: String(accs[0].id),
          // destino default: a 2ª conta (origem ≠ destino já de cara)
          to_account_id: accs[1] ? String(accs[1].id) : '',
        }))
      }
    }).catch(() => {})
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open, transaction]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Só o PAGAMENTO DE FATURA (transfer com card_id) é bloqueado pra edição.
  // Transferência conta→conta edita normal no form abaixo.
  if (editing && transaction.type === 'transfer' && transaction.card_id) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card border-t
                        border-border md:inset-auto md:top-1/2 md:left-1/2
                        md:-translate-x-1/2 md:-translate-y-1/2 md:w-[380px]
                        md:rounded-2xl md:border p-5
                        pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">{transaction.description}</h2>
            <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-muted mb-1">
            Transferência de {formatBRLSafe(transaction.amount)} —
            pagamento de fatura.
          </p>
          <p className="text-xs text-muted mb-4">
            Pagamentos não são editáveis (mudaria o histórico da conta e do
            cartão ao mesmo tempo). Se errou o valor, exclua e pague de novo.
          </p>
          {error && <p className="text-expense text-xs mb-3">{error}</p>}
          <button onClick={async () => {
                    if (!confirmingDelete) return setConfirmingDelete(true)
                    const snap = {
                      description: transaction.description,
                      amount: transaction.amount,
                      type: transaction.type,
                      date: transaction.date,
                      account_id: transaction.account_id,
                      card_id: transaction.card_id,
                    }
                    setSaving(true)
                    setError(null)
                    try {
                      await api.delete(`/transactions/${transaction.id}`)
                      bump()
                      onClose()
                      toast.show('Pagamento excluído', {
                        onUndo: async () => {
                          await api.post('/transactions', snap)
                          bump()
                        },
                      })
                    } catch (e) {
                      setError(e.message)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className={`w-full py-2.5 rounded-lg border text-sm flex items-center
                              justify-center gap-2 transition-colors ${
                    confirmingDelete
                      ? 'bg-expense text-white border-expense'
                      : 'border-expense/40 text-expense hover:bg-expense/10'}`}>
            <Trash2 size={15} />
            {confirmingDelete ? 'Confirmar exclusão?' : 'Excluir pagamento'}
          </button>
        </div>
      </div>
    )
  }

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Valida o form e devolve o payload pronto pra API (ou null + seta erro)
  function buildPayload() {
    const cents = parseBRL(form.amount)
    if (!form.description.trim()) { setError('Dá um nome pra transação.'); return null }
    if (cents == null) { setError('Valor inválido — ex: 82,40'); return null }
    const isTransfer = form.type === 'transfer'
    if (isTransfer) {
      if (!form.account_id || !form.to_account_id) {
        setError('Escolhe as contas de origem e destino.'); return null
      }
      if (form.account_id === form.to_account_id) {
        setError('Origem e destino não podem ser a mesma conta.'); return null
      }
    }
    if (!isTransfer && form.method === 'account' && !form.account_id) {
      setError('Escolhe uma conta.'); return null
    }
    const onCard = form.type === 'expense' && form.method === 'card'
    if (onCard && !form.card_id) { setError('Escolhe um cartão.'); return null }
    return {
      description: form.description.trim(),
      amount: cents,
      type: form.type,
      date: form.date,
      // exatamente UM dos dois — a regra que o backend valida
      account_id: onCard ? null : Number(form.account_id),
      card_id: onCard ? Number(form.card_id) : null,
      to_account_id: isTransfer ? Number(form.to_account_id) : null,
      // transferência não é gasto: sem categoria
      category_id: !isTransfer && form.category_id ? Number(form.category_id) : null,
      is_recurring: form.is_recurring,
      installments: onCard && !editing ? Number(form.installments) || 1 : undefined,
    }
  }

  // Um helper só pra as 3 ações: mesma coreografia (loading → request →
  // avisa as telas → fecha), muda só a request
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
    const payload = buildPayload()
    if (!payload) return
    run(() => editing
      ? api.patch(`/transactions/${transaction.id}`, payload)
      : api.post('/transactions', payload))
  }

  const duplicate = () => {
    const payload = buildPayload()
    if (!payload) return
    // cópia entra com a data de HOJE (caso de uso real: "comprei de novo")
    run(() => api.post('/transactions', { ...payload, date: todayISO() }))
  }

  // O undo RECRIA a transação excluída: guardamos o snapshot antes do
  // DELETE e o desfazer é um POST com os mesmos dados (id novo — pro
  // usuário, indistinguível de "voltou").
  const recreatePayload = (tx) => ({
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    date: tx.date,
    account_id: tx.account_id,
    card_id: tx.card_id,
    to_account_id: tx.to_account_id,
    category_id: tx.category_id,
    notes: tx.notes,
    is_recurring: tx.is_recurring,
  })

  const remove = async () => {
    // primeira vez: vira "Confirmar?" — segunda vez: exclui de verdade.
    if (!confirmingDelete) return setConfirmingDelete(true)
    const snapshot = recreatePayload(transaction)
    setSaving(true)
    setError(null)
    try {
      await api.delete(`/transactions/${transaction.id}`)
      bump()
      onClose()
      // toast SÓ depois do sucesso — oferecer "desfazer" de uma exclusão
      // que falhou criaria uma duplicata fantasma
      toast.show(`"${transaction.description}" excluída`, {
        onUndo: async () => {
          await api.post('/transactions', snapshot)
          bump()
        },
      })
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
            {editing ? 'Editar transação' : 'Nova transação'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[['expense', 'Despesa'], ['income', 'Receita'],
            ['transfer', 'Transferir']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setForm((f) => ({ ...f, type: value }))}
              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                form.type === value
                  ? value === 'expense'
                    ? 'bg-expense/15 border-expense/50 text-expense'
                    : value === 'income'
                      ? 'bg-income/15 border-income/50 text-income'
                      : 'bg-primary/15 border-primary/50 text-primary'
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

          {/* transferência não é gasto — categoria não se aplica */}
          {form.type !== 'transfer' && (
            <select className={input} value={form.category_id} onChange={set('category_id')}>
              <option value="">Sem categoria</option>
              {hierarchize(categories).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          )}

          {/* transferência: origem → destino */}
          {form.type === 'transfer' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted block">
                De
                <select className={`${input} mt-1`} value={form.account_id}
                        onChange={set('account_id')}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted block">
                Para
                <select className={`${input} mt-1`} value={form.to_account_id}
                        onChange={set('to_account_id')}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* De onde sai: conta ou cartão (cartão só pra despesa) */}
          {form.type === 'expense' && cards.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {[['account', 'Conta'], ['card', 'Cartão']].map(([value, label]) => (
                <button key={value} type="button"
                  onClick={() => setForm((f) => ({ ...f, method: value }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.method === value
                      ? 'bg-primary/15 border-primary/50 text-primary'
                      : 'border-border text-muted hover:bg-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {form.type === 'transfer' ? null
           : form.type === 'expense' && form.method === 'card' && cards.length > 0 ? (
            <>
              <select className={input} value={form.card_id} onChange={set('card_id')}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!editing && (
                <label className="text-xs text-muted block">
                  Parcelas
                  <select className={`${input} mt-1`} value={form.installments}
                          onChange={set('installments')}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? 'À vista' : `${n}x`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <select className={input} value={form.account_id} onChange={set('account_id')}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

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
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar transação'}
        </button>

        {/* Ações extras — só na edição */}
        {editing && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={duplicate}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm
                         text-slate-300 hover:bg-hover flex items-center
                         justify-center gap-2 disabled:opacity-60"
            >
              <Copy size={15} /> Duplicar
            </button>
            <button
              onClick={remove}
              disabled={saving}
              className={`flex-1 py-2.5 rounded-lg border text-sm flex items-center
                          justify-center gap-2 disabled:opacity-60 transition-colors ${
                confirmingDelete
                  ? 'bg-expense text-white border-expense'
                  : 'border-expense/40 text-expense hover:bg-expense/10'
              }`}
            >
              <Trash2 size={15} />
              {confirmingDelete ? 'Confirmar?' : 'Excluir'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
