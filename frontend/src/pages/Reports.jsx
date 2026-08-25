// Relatórios — abas Mensal e Anual + export CSV.
//
// O botão de export é um <a href> pro endpoint, não um fetch: o navegador
// cuida do download (barra de progresso, pasta de downloads, nome do
// arquivo via Content-Disposition). Baixar arquivo é trabalho de
// navegador, não de JavaScript.
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { Card, PageTitle } from '../components/shared'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-sidebar border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  )
}

function SummaryCards({ totals }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <Card className="py-4">
        <p className="text-xs text-muted mb-1">Receitas no período</p>
        <p className="text-xl font-semibold text-income">{formatBRL(totals.income)}</p>
      </Card>
      <Card className="py-4">
        <p className="text-xs text-muted mb-1">Despesas no período</p>
        <p className="text-xl font-semibold text-expense">{formatBRL(totals.expense)}</p>
      </Card>
      <Card className="py-4">
        <p className="text-xs text-muted mb-1">Saldo do período</p>
        <p className={`text-xl font-semibold ${
          totals.net >= 0 ? 'text-primary' : 'text-expense'}`}>
          {totals.net >= 0 ? '+' : ''}{formatBRL(totals.net)}
        </p>
      </Card>
    </div>
  )
}

function IncomeExpenseChart({ data, xKey }) {
  return (
    <Card>
      <h2 className="text-sm font-medium mb-4">Receitas × despesas</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey={xKey} tick={{ fill: '#8B95A7', fontSize: 11 }}
                   axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8B95A7', fontSize: 11 }} axisLine={false}
                   tickLine={false} width={52}
                   tickFormatter={(v) => `${Math.round(v / 100000) / 10}k`} />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: '#1B2432' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Receitas" fill="#22C55E"
                 radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="#EF4444"
                 radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export default function Reports() {
  const { version } = useRefresh()
  const [tab, setTab] = useState('monthly')       // 'monthly' | 'yearly'
  const [months, setMonths] = useState(6)
  const [period, setPeriod] = useState(null)
  const [yearly, setYearly] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/reports/period?months=${months}`)
      .then(setPeriod).catch((e) => setError(e.message))
    api.get('/reports/yearly')
      .then(setYearly).catch(() => {})
  }, [months, version])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  const monthlyData = period?.months.map((m) => ({
    label: `${MONTHS_SHORT[m.month - 1]}${m.month === 1 ? `/${String(m.year).slice(2)}` : ''}`,
    income: m.income,
    expense: m.expense,
  }))

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle sub="Análise por período — e seus dados pra fora quando quiser.">
          Relatórios
        </PageTitle>
        {/* download via <a>: o navegador faz o trabalho */}
        <a href="/api/reports/export.csv" download
           className="shrink-0 flex items-center gap-2 border border-border text-sm
                      px-4 py-2.5 rounded-lg text-slate-300 hover:bg-hover">
          <Download size={15} /> Exportar CSV
        </a>
      </div>

      {/* abas + seletor de período */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[['monthly', 'Mensal'], ['yearly', 'Anual']].map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    tab === value
                      ? 'bg-primary/15 border-primary/50 text-primary font-medium'
                      : 'border-border text-muted hover:bg-hover'}`}>
            {label}
          </button>
        ))}
        {tab === 'monthly' && (
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
                  className="ml-auto bg-card border border-border rounded-lg px-3 py-2
                             text-sm text-slate-200 focus:outline-none
                             focus:border-primary/60 cursor-pointer">
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
        )}
      </div>

      {tab === 'monthly' && period && (
        <>
          <SummaryCards totals={period.totals} />
          <IncomeExpenseChart data={monthlyData} xKey="label" />

          <Card className="mt-4">
            <h2 className="text-sm font-medium mb-4">Top categorias no período</h2>
            {period.by_category.length === 0 && (
              <p className="text-xs text-muted">Sem despesas no período.</p>
            )}
            <div className="space-y-3">
              {period.by_category.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{c.name}</span>
                    <span className="text-muted">
                      {formatBRL(c.total)} · {c.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'yearly' && yearly && (
        <>
          <IncomeExpenseChart
            data={yearly.map((y) => ({ ...y, label: String(y.year) }))}
            xKey="label" />
          <Card className="mt-4 p-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {yearly.map((y) => (
                <li key={y.year} className="flex items-center px-4 py-3 text-sm">
                  <span className="font-medium w-16">{y.year}</span>
                  <span className="text-income flex-1">+{formatBRL(y.income)}</span>
                  <span className="text-expense flex-1">−{formatBRL(y.expense)}</span>
                  <span className={`font-medium ${
                    y.net >= 0 ? 'text-primary' : 'text-expense'}`}>
                    {y.net >= 0 ? '+' : ''}{formatBRL(y.net)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
