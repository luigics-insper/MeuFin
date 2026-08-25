// Simulações — "e se?" interativo. A página inteira é MATEMÁTICA NO
// CLIENTE sobre dados que já existem: nenhum resultado é salvo, nenhum
// endpoint novo foi criado (só um filtro). Simular é barato porque os
// dados certos já estavam lá — o mesmo tema do projeto inteiro.
//
// Padrão de UI: cada simulador é um Card com controles (select, slider,
// input) e um RESULTADO que reage na hora via useMemo. Sem botão
// "calcular" — feedback imediato é o que faz simulação ser divertida.
import { useEffect, useMemo, useState } from 'react'
import { Tv, PiggyBank, Percent, CreditCard } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import { parseBRL } from '../lib/money'

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                   'jul', 'ago', 'set', 'out', 'nov', 'dez']

const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
               placeholder:text-muted focus:outline-none focus:border-primary/60`

function SimCard({ icon: Icon, color, title, children }) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
             style={{ backgroundColor: color + '26', color }}>
          <Icon size={17} />
        </div>
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

function Result({ children }) {
  return (
    <div className="mt-4 rounded-lg bg-bg p-3.5 text-sm leading-relaxed">
      {children}
    </div>
  )
}

// ---------- 1. cancelar assinatura ----------
function CancelSubscription({ subs }) {
  const [id, setId] = useState('')
  useEffect(() => { if (subs[0]) setId(String(subs[0].id)) }, [subs])
  const sub = subs.find((s) => String(s.id) === id)

  return (
    <SimCard icon={Tv} color="#EF4444" title="Cancelar uma assinatura">
      {subs.length === 0 ? (
        <p className="text-xs text-muted">
          Nenhuma despesa recorrente cadastrada — marque assinaturas como
          "recorrente" e elas aparecem aqui.
        </p>
      ) : (
        <>
          <select className={input} value={id} onChange={(e) => setId(e.target.value)}>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.description} — {formatBRL(s.amount)}/mês
              </option>
            ))}
          </select>
          {sub && (
            <Result>
              Cancelando <strong>{sub.description}</strong> você economiza{' '}
              <strong className="text-income">{formatBRL(sub.amount * 12)}</strong> por ano.
              <span className="text-muted"> Em 5 anos: {formatBRL(sub.amount * 60)}.</span>
            </Result>
          )}
        </>
      )}
    </SimCard>
  )
}

// ---------- 2. guardar todo mês → quando atinge a meta ----------
function MonthlySaving({ goals }) {
  const [goalId, setGoalId] = useState('')
  const [monthly, setMonthly] = useState('500')
  useEffect(() => { if (goals[0]) setGoalId(String(goals[0].id)) }, [goals])

  const result = useMemo(() => {
    const goal = goals.find((g) => String(g.id) === goalId)
    const cents = parseBRL(monthly)
    if (!goal || !cents) return null
    const remaining = goal.target_amount - goal.saved_amount
    if (remaining <= 0) return { done: true, goal }
    const months = Math.ceil(remaining / cents)
    const when = new Date()
    when.setMonth(when.getMonth() + months)
    return { goal, months, remaining,
             label: `${MONTHS_PT[when.getMonth()]}/${when.getFullYear()}` }
  }, [goals, goalId, monthly])

  return (
    <SimCard icon={PiggyBank} color="#22C55E" title="Guardar todo mês">
      {goals.length === 0 ? (
        <p className="text-xs text-muted">
          Crie uma meta na aba Metas pra simular quando você chega lá.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <select className={input} value={goalId}
                    onChange={(e) => setGoalId(e.target.value)}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} — falta {formatBRL(Math.max(g.target_amount - g.saved_amount, 0))}
                </option>
              ))}
            </select>
            <input className={input} inputMode="decimal" value={monthly}
                   placeholder="Quanto guardar por mês (ex: 500)"
                   onChange={(e) => setMonthly(e.target.value)} />
          </div>
          {result?.done && (
            <Result>🎉 <strong>{result.goal.name}</strong> já está completa!</Result>
          )}
          {result && !result.done && (
            <Result>
              Guardando <strong>{formatBRL(parseBRL(monthly))}</strong>/mês, você
              atinge <strong>{result.goal.name}</strong> em{' '}
              <strong className="text-income">
                {result.months} {result.months === 1 ? 'mês' : 'meses'}
              </strong>
              <span className="text-muted"> ({result.label})</span>.
            </Result>
          )}
        </>
      )}
    </SimCard>
  )
}

// ---------- 3. reduzir uma categoria ----------
function ReduceCategory({ categories }) {
  const roots = categories.filter((c) => c.parent_id == null && c.avg > 0)
  const [catId, setCatId] = useState('')
  const [pct, setPct] = useState(20)
  useEffect(() => { if (roots[0]) setCatId(String(roots[0].id)) }, [categories]) // eslint-disable-line

  const cat = roots.find((c) => String(c.id) === catId)
  const monthly = cat ? Math.round(cat.avg * (pct / 100)) : 0

  return (
    <SimCard icon={Percent} color="#F59E0B" title="Reduzir uma categoria">
      {roots.length === 0 ? (
        <p className="text-xs text-muted">Sem gastos por categoria ainda.</p>
      ) : (
        <>
          <select className={input} value={catId}
                  onChange={(e) => setCatId(e.target.value)}>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — média {formatBRL(c.avg)}/mês
              </option>
            ))}
          </select>
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min="5" max="50" step="5" value={pct}
                   onChange={(e) => setPct(Number(e.target.value))}
                   className="flex-1 accent-[#7C5CFF]" />
            <span className="text-sm font-medium w-12 text-right">−{pct}%</span>
          </div>
          {cat && (
            <Result>
              Reduzindo <strong>{cat.name}</strong> em {pct}%, sobra{' '}
              <strong className="text-income">{formatBRL(monthly)}</strong>/mês —{' '}
              <strong>{formatBRL(monthly * 12)}</strong> por ano.
              <span className="text-muted"> (média dos últimos 3 meses)</span>
            </Result>
          )}
        </>
      )}
    </SimCard>
  )
}

// ---------- 4. quitar cartão hoje ----------
function PayOffCard({ cards, accounts }) {
  const withDebt = cards.filter((c) => c.debt_total > 0)
  const [cardId, setCardId] = useState('')
  const [accountId, setAccountId] = useState('')
  useEffect(() => { if (withDebt[0]) setCardId(String(withDebt[0].id)) }, [cards]) // eslint-disable-line
  useEffect(() => { if (accounts[0]) setAccountId(String(accounts[0].id)) }, [accounts])

  const card = withDebt.find((c) => String(c.id) === cardId)
  const account = accounts.find((a) => String(a.id) === accountId)
  const after = card && account ? account.balance - card.debt_total : null

  return (
    <SimCard icon={CreditCard} color="#7C5CFF" title="Quitar cartão hoje">
      {withDebt.length === 0 ? (
        <p className="text-xs text-muted">Nenhum cartão com dívida. 🎉</p>
      ) : (
        <>
          <div className="space-y-2">
            <select className={input} value={cardId}
                    onChange={(e) => setCardId(e.target.value)}>
              {withDebt.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — dívida {formatBRL(c.debt_total)}
                </option>
              ))}
            </select>
            <select className={input} value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — saldo {formatBRL(a.balance)}
                </option>
              ))}
            </select>
          </div>
          {after != null && (
            <Result>
              Quitando <strong>{card.name}</strong> ({formatBRL(card.debt_total)}) pela{' '}
              <strong>{account.name}</strong>, a conta fica com{' '}
              <strong className={after < 0 ? 'text-expense' : 'text-income'}>
                {formatBRL(after)}
              </strong>.
              {after < 0 && (
                <span className="text-muted"> Saldo insuficiente — considere quitar parcialmente.</span>
              )}
              <span className="text-muted"> Cartão liberaria {formatBRL(card.limit_amount)} de limite.</span>
            </Result>
          )}
        </>
      )}
    </SimCard>
  )
}

// ---------- página ----------
export default function Simulations() {
  const { version } = useRefresh()
  const [subs, setSubs] = useState([])
  const [goals, setGoals] = useState([])
  const [categories, setCategories] = useState([])
  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    // assinaturas: recorrentes dedupe por descrição (a mais recente vence)
    api.get('/transactions?recurring=true&type=expense&limit=100').then((txs) => {
      const seen = new Map()
      for (const t of txs) {
        const key = t.description.trim().toLowerCase()
        if (!seen.has(key)) seen.set(key, t)
      }
      setSubs([...seen.values()])
    }).catch(() => {})

    api.get('/goals').then(setGoals).catch(() => {})
    api.get('/cards').then(setCards).catch(() => {})
    api.get('/accounts').then(setAccounts).catch(() => {})

    // média de 3 meses por categoria: 3 chamadas em paralelo, média no cliente
    const now = new Date()
    const months = [0, 1, 2].map((back) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
      return { y: d.getFullYear(), m: d.getMonth() + 1 }
    })
    Promise.all(months.map(({ y, m }) => api.get(`/categories?year=${y}&month=${m}`)))
      .then(([cur, m1, m2]) => {
        const spent = (list, id) =>
          list.find((c) => c.id === id)?.spent_this_month ?? 0
        setCategories(cur.map((c) => ({
          ...c,
          avg: Math.round(
            (spent(cur, c.id) + spent(m1, c.id) + spent(m2, c.id)) / 3),
        })))
      })
      .catch(() => {})
  }, [version])

  return (
    <div className="max-w-4xl">
      <PageTitle sub='Brincar de "e se" com os seus números — nada aqui altera seus dados.'>
        Simulações
      </PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <CancelSubscription subs={subs} />
        <MonthlySaving goals={goals} />
        <ReduceCategory categories={categories} />
        <PayOffCard cards={cards} accounts={accounts} />
      </div>
    </div>
  )
}
