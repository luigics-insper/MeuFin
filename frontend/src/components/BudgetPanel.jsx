// Painel de orçamento.
//
// Sacada de modelagem pra estudar: NÃO existe tabela "Budget". Um orçamento
// é só o campo monthly_limit da categoria. Criar orçamento = PATCH numa
// categoria sem limite; editar = PATCH no valor; remover = PATCH pra null.
// Antes de criar entidade nova, pergunte: isso não é um atributo de algo
// que já existe? Menos tabela = menos join, menos sync, menos bug.
import { useEffect, useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { parseBRL, centsToInput } from '../lib/money'
import { hierarchize } from '../lib/categories'

export default function BudgetPanel({ open, onClose, categories, budget = null }) {
  // budget = categoria que JÁ tem limite (editando) · null = criando
  const editing = budget != null
  const { bump } = useRefresh()
  const [categoryId, setCategoryId] = useState('')
  const [limit, setLimit] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const firstInput = useRef(null)

  // criando: só categorias que ainda NÃO têm orçamento entram no select
  // hierarchize ANTES de filtrar: mantém ordem e rótulos mesmo
  // quando a mãe já tem orçamento e sai da lista
  const available = hierarchize(categories).filter((c) => c.monthly_limit == null)

  useEffect(() => {
    if (!open) return
    setCategoryId(editing ? String(budget.id) : String(available[0]?.id ?? ''))
    setLimit(editing ? centsToInput(budget.monthly_limit) : '')
    setError(null)
    setConfirmingRemove(false)
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open, budget]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // PATCH parcial: manda SÓ o campo que muda. O backend usa
  // exclude_unset=True, então os outros campos ficam intactos.
  async function patchLimit(catId, newLimit) {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/categories/${catId}`, { monthly_limit: newLimit })
      bump()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const submit = () => {
    if (!categoryId) return setError('Escolhe uma categoria.')
    const cents = parseBRL(limit)
    if (cents == null) return setError('Limite inválido — ex: 800,00')
    patchLimit(Number(categoryId), cents)
  }

  const removeBudget = () => {
    if (!confirmingRemove) return setConfirmingRemove(true)
    patchLimit(budget.id, null) // remover orçamento = limite null
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
            {editing ? `Orçamento: ${budget.name}` : 'Novo orçamento'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {!editing && (
            available.length ? (
              <select className={input} value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted">
                Todas as categorias já têm orçamento. Edite um existente
                ou crie uma categoria nova primeiro.
              </p>
            )
          )}

          <input ref={firstInput} className={input} inputMode="decimal"
                 placeholder="Limite mensal (ex: 800,00)"
                 value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>

        {error && <p className="text-expense text-xs mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || (!editing && !available.length)}
          className="w-full mt-5 py-3 rounded-lg bg-primary text-white text-sm
                     font-medium hover:bg-primary/90 disabled:opacity-60
                     transition-colors"
        >
          {saving ? 'Salvando…' : editing ? 'Salvar limite' : 'Criar orçamento'}
        </button>

        {editing && (
          <button
            onClick={removeBudget}
            disabled={saving}
            className={`w-full mt-3 py-2.5 rounded-lg border text-sm flex items-center
                        justify-center gap-2 disabled:opacity-60 transition-colors ${
              confirmingRemove
                ? 'bg-expense text-white border-expense'
                : 'border-expense/40 text-expense hover:bg-expense/10'
            }`}
          >
            <Trash2 size={15} />
            {confirmingRemove ? 'Confirmar? (a categoria continua)' : 'Remover orçamento'}
          </button>
        )}
      </div>
    </div>
  )
}
