// Painel de categoria: nome, ícone (grade curada), cor, limite mensal opcional.
// Mesmo padrão dos outros painéis: null = criar, category = editar.
import { useEffect, useRef, useState } from 'react'
import {
  X, Trash2, Utensils, Car, Home, Gamepad2, HeartPulse, ShoppingCart,
  Banknote, Gift, Plane, BookOpen, Music, Shirt, Dumbbell, Coffee,
  Smartphone, Tag,
} from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { parseBRL, centsToInput } from '../lib/money'

// Grade curada de ícones (nome Lucide → componente). Curada de propósito:
// um picker com os 1500 ícones do Lucide vira paralisia de escolha.
export const CATEGORY_ICONS = {
  utensils: Utensils,
  car: Car,
  home: Home,
  'gamepad-2': Gamepad2,
  'heart-pulse': HeartPulse,
  'shopping-cart': ShoppingCart,
  banknote: Banknote,
  gift: Gift,
  plane: Plane,
  'book-open': BookOpen,
  music: Music,
  shirt: Shirt,
  dumbbell: Dumbbell,
  coffee: Coffee,
  smartphone: Smartphone,
  tag: Tag,
}

const COLORS = ['#7C5CFF', '#EF4444', '#F97316', '#EAB308', '#22C55E',
                '#14B8A6', '#3B82F6', '#EC4899']

const EMPTY = { name: '', icon: 'tag', color: COLORS[0], monthly_limit: '' }

export default function CategoryPanel({ open, onClose, category = null,
                                        defaultParentId = null }) {
  const editing = category != null
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
          name: category.name,
          icon: category.icon,
          color: category.color,
          monthly_limit: category.monthly_limit != null
            ? centsToInput(category.monthly_limit)
            : '',
        }
      : EMPTY)
    setError(null)
    setConfirmingDelete(false)
    setTimeout(() => firstInput.current?.focus(), 50)
  }, [open, category]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!form.name.trim()) return setError('Dá um nome pra categoria.')
    // limite vazio = sem limite (null), não zero — são coisas diferentes
    let limit = null
    if (form.monthly_limit.trim() !== '') {
      limit = parseBRL(form.monthly_limit)
      if (limit == null) return setError('Limite inválido — ex: 1450,00')
    }
    const payload = {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      monthly_limit: limit,
      parent_id: editing ? category.parent_id : defaultParentId,
    }
    run(() => editing
      ? api.patch(`/categories/${category.id}`, payload)
      : api.post('/categories', payload))
  }

  const remove = () => {
    if (!confirmingDelete) return setConfirmingDelete(true)
    run(() => api.delete(`/categories/${category.id}`))
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
            {editing ? 'Editar categoria'
              : defaultParentId ? 'Nova subcategoria' : 'Nova categoria'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <input ref={firstInput} className={input} placeholder="Nome (ex: Alimentação)"
                 value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

          {/* Ícones: grade 8 colunas, o selecionado ganha a cor escolhida */}
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => {
              const active = form.icon === name
              return (
                <button key={name}
                  onClick={() => setForm((f) => ({ ...f, icon: name }))}
                  aria-label={`Ícone ${name}`}
                  className={`aspect-square rounded-lg flex items-center justify-center
                              border transition-colors ${
                    active ? 'border-transparent' : 'border-border text-muted hover:bg-hover'
                  }`}
                  style={active
                    ? { backgroundColor: form.color + '26', color: form.color }
                    : undefined}
                >
                  <Icon size={17} />
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
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

          <input className={input} inputMode="decimal"
                 placeholder="Limite mensal (opcional — ex: 1450,00)"
                 value={form.monthly_limit}
                 onChange={(e) =>
                   setForm((f) => ({ ...f, monthly_limit: e.target.value }))} />
        </div>

        {error && <p className="text-expense text-xs mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full mt-5 py-3 rounded-lg bg-primary text-white text-sm
                     font-medium hover:bg-primary/90 disabled:opacity-60
                     transition-colors"
        >
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar categoria'}
        </button>

        {editing && (
          <>
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
              {confirmingDelete ? 'Confirmar exclusão?' : 'Excluir categoria'}
            </button>
            {confirmingDelete && (
              <p className="text-[11px] text-muted mt-2 text-center">
                As transações dessa categoria não serão apagadas —
                elas viram "Sem categoria".
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
