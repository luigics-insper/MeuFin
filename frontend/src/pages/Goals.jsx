// Tela de Metas — cards com barra de progresso e depósitos rápidos.
// Notebook R$ 7.000 ████░░░░ 43% — como no spec.
import { useEffect, useState } from 'react'
import {
  Plus, X, Trash2, Flag, Laptop, Plane, Home, Car, GraduationCap,
  Gamepad2, Gift, PiggyBank,
} from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import { parseBRL, centsToInput } from '../lib/money'

const GOAL_ICONS = {
  flag: Flag, laptop: Laptop, plane: Plane, home: Home, car: Car,
  'graduation-cap': GraduationCap, 'gamepad-2': Gamepad2, gift: Gift,
  'piggy-bank': PiggyBank,
}
const COLORS = ['#7C5CFF', '#22C55E', '#3B82F6', '#F97316', '#EC4899',
                '#14B8A6', '#EAB308', '#EF4444']

// ---------- card de meta ----------
function GoalCard({ goal, onOpen }) {
  const Icon = GOAL_ICONS[goal.icon] || Flag
  const pct = Math.min(Math.round((goal.saved_amount / goal.target_amount) * 100), 100)
  const done = goal.saved_amount >= goal.target_amount
  return (
    <Card as="button" onClick={onOpen}
          className="w-full text-left hover:bg-hover transition-colors cursor-pointer">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
             style={{ backgroundColor: goal.color + '26', color: goal.color }}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{goal.name}</p>
          <p className="text-xs text-muted">
            {formatBRL(goal.saved_amount)} de {formatBRL(goal.target_amount)}
          </p>
        </div>
        <p className="text-sm font-semibold" style={{ color: done ? '#22C55E' : goal.color }}>
          {done ? '🎉 100%' : `${pct}%`}
        </p>
      </div>
      <div className="h-2 rounded-full bg-bg overflow-hidden">
        <div className="h-full rounded-full transition-all"
             style={{ width: `${pct}%`, backgroundColor: done ? '#22C55E' : goal.color }} />
      </div>
    </Card>
  )
}

// ---------- painel: criar/editar meta + depósitos ----------
function GoalPanel({ open, onClose, goal }) {
  const editing = goal != null
  const { bump } = useRefresh()
  const [form, setForm] = useState({ name: '', target: '', icon: 'flag', color: COLORS[0] })
  const [deposits, setDeposits] = useState([])
  const [depositValue, setDepositValue] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { name: goal.name, target: centsToInput(goal.target_amount),
          icon: goal.icon, color: goal.color }
      : { name: '', target: '', icon: 'flag', color: COLORS[0] })
    setError(null)
    setDepositValue('')
    setConfirmingDelete(false)
    if (editing) {
      api.get(`/goals/${goal.id}/deposits`).then(setDeposits).catch(() => {})
    } else {
      setDeposits([])
    }
  }, [open, goal]) // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!form.name.trim()) return setError('Dá um nome pra meta.')
    const cents = parseBRL(form.target)
    if (cents == null) return setError('Valor alvo inválido — ex: 7000,00')
    const payload = { name: form.name.trim(), target_amount: cents,
                      icon: form.icon, color: form.color }
    try {
      await run(() => editing
        ? api.patch(`/goals/${goal.id}`, payload)
        : api.post('/goals', payload))
      onClose()
    } catch { /* erro já exibido */ }
  }

  const addDeposit = async () => {
    const cents = parseBRL(depositValue, { allowNonPositive: true })
    if (cents == null || cents === 0) return setError('Depósito inválido — ex: 250,00')
    try {
      await run(() => api.post(`/goals/${goal.id}/deposits`, { amount: cents }))
      setDepositValue('')
      api.get(`/goals/${goal.id}/deposits`).then(setDeposits).catch(() => {})
    } catch { /* erro já exibido */ }
  }

  const removeDeposit = async (id) => {
    try {
      await run(() => api.delete(`/goals/${goal.id}/deposits/${id}`))
      setDeposits((d) => d.filter((x) => x.id !== id))
    } catch { /* erro já exibido */ }
  }

  const remove = async () => {
    if (!confirmingDelete) return setConfirmingDelete(true)
    try {
      await run(() => api.delete(`/goals/${goal.id}`))
      onClose()
    } catch { /* erro já exibido */ }
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
          <h2 className="text-lg font-semibold">{editing ? goal.name : 'Nova meta'}</h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <input className={input} placeholder="Nome (ex: Notebook)" value={form.name}
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={input} inputMode="decimal" placeholder="Valor alvo (ex: 7000,00)"
                 value={form.target}
                 onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />

          <div className="grid grid-cols-9 gap-1.5">
            {Object.entries(GOAL_ICONS).map(([name, Icon]) => {
              const active = form.icon === name
              return (
                <button key={name} onClick={() => setForm((f) => ({ ...f, icon: name }))}
                        aria-label={`Ícone ${name}`}
                        className={`aspect-square rounded-lg flex items-center justify-center
                                    border transition-colors ${
                          active ? 'border-transparent'
                                 : 'border-border text-muted hover:bg-hover'}`}
                        style={active
                          ? { backgroundColor: form.color + '26', color: form.color }
                          : undefined}>
                  <Icon size={16} />
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
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
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar meta'}
        </button>

        {/* Depósitos — só na edição */}
        {editing && (
          <>
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-medium mb-2">Depósitos</h3>
              <div className="flex gap-2">
                <input className={input} inputMode="decimal"
                       placeholder="Valor (negativo retira)"
                       value={depositValue}
                       onChange={(e) => setDepositValue(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && addDeposit()} />
                <button onClick={addDeposit} disabled={saving}
                        className="shrink-0 px-4 rounded-lg bg-primary/15 text-primary
                                   text-sm font-medium hover:bg-primary/25">
                  <Plus size={16} />
                </button>
              </div>
              <ul className="mt-3 space-y-1 max-h-44 overflow-y-auto">
                {deposits.map((d) => (
                  <li key={d.id}
                      className="flex items-center gap-2 text-sm px-2 py-1.5
                                 rounded-lg hover:bg-hover group">
                    <span className={`flex-1 ${d.amount < 0 ? 'text-warn' : ''}`}>
                      {d.amount < 0 ? '−' : '+'}{formatBRL(Math.abs(d.amount))}
                    </span>
                    <span className="text-xs text-muted">{relativeDay(d.date)}</span>
                    <button onClick={() => removeDeposit(d.id)}
                            aria-label="Excluir depósito"
                            className="opacity-0 group-hover:opacity-100 text-muted
                                       hover:text-expense p-0.5">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button onClick={remove} disabled={saving}
                    className={`w-full mt-4 py-2.5 rounded-lg border text-sm flex items-center
                                justify-center gap-2 transition-colors ${
                      confirmingDelete
                        ? 'bg-expense text-white border-expense'
                        : 'border-expense/40 text-expense hover:bg-expense/10'}`}>
              <Trash2 size={15} />
              {confirmingDelete ? 'Confirmar? (leva os depósitos junto)' : 'Excluir meta'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- página ----------
export default function Goals() {
  const { version } = useRefresh()
  const [goals, setGoals] = useState(null)
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(null) // null | 'new' | goal

  useEffect(() => {
    api.get('/goals').then(setGoals).catch((e) => setError(e.message))
  }, [version])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub="Objetivos de poupança com depósitos associados.">Metas</PageTitle>
        <button onClick={() => setPanel('new')}
                className="shrink-0 flex items-center gap-2 bg-primary text-white text-sm
                           font-medium px-4 py-2.5 rounded-lg hover:bg-primary/90">
          <Plus size={16} /> Nova meta
        </button>
      </div>

      {!goals && <p className="text-muted text-sm">Carregando…</p>}

      {goals && goals.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            Nenhuma meta ainda. Ex: "Notebook — R$ 7.000". Crie a primeira
            e registre depósitos conforme guardar dinheiro.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {goals?.map((g) => (
          <GoalCard key={g.id} goal={g} onOpen={() => setPanel(g)} />
        ))}
      </div>

      <GoalPanel open={panel != null} goal={panel === 'new' ? null : panel}
                 onClose={() => setPanel(null)} />
    </div>
  )
}
