// Painel de cartão: nome, limite, dia de fechamento, dia de vencimento, cor.
// Mesmo padrão dos outros painéis (null = criar, card = editar).
import { useEffect, useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { parseBRL, centsToInput } from '../lib/money'

const COLORS = ['#8A05BE', '#7C5CFF', '#EF4444', '#F97316', '#22C55E',
                '#3B82F6', '#14B8A6', '#EAB308']

// dias 1–28: evita o pesadelo de "fechamento dia 31" em fevereiro.
// O backend faz clamp de qualquer jeito, mas nem oferecer já poupa confusão.
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

const EMPTY = { name: '', limit: '', closing_day: 5, due_day: 12, color: COLORS[0] }

export default function CardPanel({ open, onClose, card = null }) {
  const editing = card != null
  const { bump } = useRefresh()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const firstInput = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { name: card.name, limit: centsToInput(card.limit_amount),
          closing_day: card.closing_day, due_day: card.due_day, color: card.color }
      : EMPTY)
    setError(null)
    setConfirmingDelete(false)
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open, card]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!form.name.trim()) return setError('Dá um nome pro cartão.')
    const cents = parseBRL(form.limit)
    if (cents == null) return setError('Limite inválido — ex: 5000,00')
    const payload = {
      name: form.name.trim(),
      limit_amount: cents,
      closing_day: Number(form.closing_day),
      due_day: Number(form.due_day),
      color: form.color,
    }
    run(() => editing
      ? api.patch(`/cards/${card.id}`, payload)
      : api.post('/cards', payload))
  }

  const remove = () => {
    if (!confirmingDelete) return setConfirmingDelete(true)
    run(() => api.delete(`/cards/${card.id}`))
  }

  const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
                 placeholder:text-muted focus:outline-none focus:border-primary/60`

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto
                      rounded-t-2xl bg-card border-t border-border
                      md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:w-[400px]
                      md:max-h-none md:rounded-none md:border-t-0 md:border-l
                      p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">
            {editing ? 'Editar cartão' : 'Novo cartão'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <input ref={firstInput} className={input} placeholder="Nome (ex: Nubank Crédito)"
                 value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

          <input className={input} inputMode="decimal" placeholder="Limite (ex: 5000,00)"
                 value={form.limit}
                 onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))} />

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Fecha dia
              <select className={`${input} mt-1`} value={form.closing_day}
                      onChange={(e) => setForm((f) => ({ ...f, closing_day: e.target.value }))}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              Vence dia
              <select className={`${input} mt-1`} value={form.due_day}
                      onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                      aria-label={`Cor ${c}`}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        form.color === c
                          ? 'ring-2 ring-offset-2 ring-offset-card scale-110' : ''}`}
                      style={{ backgroundColor: c, '--tw-ring-color': c }} />
            ))}
          </div>
        </div>

        {error && <p className="text-expense text-xs mt-3">{error}</p>}

        <button onClick={submit} disabled={saving}
                className="w-full mt-5 py-3 rounded-lg bg-primary text-white text-sm
                           font-medium hover:bg-primary/90 disabled:opacity-60">
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar cartão'}
        </button>

        {editing && (
          <button onClick={remove} disabled={saving}
                  className={`w-full mt-3 py-2.5 rounded-lg border text-sm flex items-center
                              justify-center gap-2 transition-colors ${
                    confirmingDelete
                      ? 'bg-expense text-white border-expense'
                      : 'border-expense/40 text-expense hover:bg-expense/10'}`}>
            <Trash2 size={15} />
            {confirmingDelete ? 'Confirmar exclusão?' : 'Excluir cartão'}
          </button>
        )}
      </div>
    </div>
  )
}
