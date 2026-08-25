// Calendário — grade do mês com receitas/despesas por dia.
// Clicar num dia carrega as transações daquele dia embaixo da grade.
//
// Conceito de dados pra estudar: a grade usa o endpoint agregado
// (/dashboard/calendar → totais por dia, leve), e SÓ ao clicar num dia
// a tela busca as transações dele (/transactions?start&end). Carregar
// leve primeiro, detalhar sob demanda — o mesmo princípio de lazy loading
// que você vê em feed infinito, só que aplicado a um calendário.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import TransactionPanel from '../components/TransactionPanel'

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// abreviação compacta pros dias: 1450,00 → "1,4k"
function compact(cents) {
  const v = cents / 100
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`
  return Math.round(v).toString()
}

export default function Calendar() {
  const { version } = useRefresh()
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [days, setDays] = useState(null)       // agregados por dia
  const [selected, setSelected] = useState(null) // "YYYY-MM-DD" do dia clicado
  const [dayTxs, setDayTxs] = useState(null)   // transações do dia clicado
  const [selectedTx, setSelectedTx] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/dashboard/calendar?year=${ym.year}&month=${ym.month}`)
      .then(setDays)
      .catch((e) => setError(e.message))
  }, [ym, version])

  // detalhe do dia — sob demanda
  useEffect(() => {
    if (!selected) { setDayTxs(null); return }
    api.get(`/transactions?start=${selected}&end=${selected}`)
      .then(setDayTxs)
      .catch(() => setDayTxs([]))
  }, [selected, version])

  const shiftMonth = (delta) => {
    setSelected(null)
    setYm(({ year, month }) => {
      let m = month + delta, y = year
      if (m < 1) { m = 12; y-- }
      if (m > 12) { m = 1; y++ }
      return { year: y, month: m }
    })
  }

  // monta a grade: células vazias até o 1º dia + um item por dia do mês
  const grid = useMemo(() => {
    const byDate = new Map((days ?? []).map((d) => [d.date, d]))
    const first = new Date(ym.year, ym.month - 1, 1)
    const daysInMonth = new Date(ym.year, ym.month, 0).getDate()
    const cells = Array.from({ length: first.getDay() }, () => null)
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, iso, data: byDate.get(iso) })
    }
    return cells
  }, [days, ym])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-4xl">
      <PageTitle sub="Receitas e despesas dia a dia.">Calendário</PageTitle>

      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior"
                className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium w-40 text-center">
          {MONTHS_PT[ym.month - 1]} de {ym.year}
        </p>
        <button onClick={() => shiftMonth(1)} aria-label="Próximo mês"
                className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
          <ChevronRight size={18} />
        </button>
      </div>

      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <p key={w} className="text-[10px] text-muted text-center font-medium py-1">
              {w}
            </p>
          ))}

          {grid.map((cell, i) =>
            cell === null ? (
              <div key={`blank-${i}`} />
            ) : (
              <button
                key={cell.iso}
                onClick={() => setSelected(cell.iso === selected ? null : cell.iso)}
                className={`min-h-14 sm:min-h-20 rounded-lg border p-1 sm:p-1.5 text-left
                            transition-colors flex flex-col ${
                  selected === cell.iso
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:bg-hover'
                }`}
              >
                <span className={`text-[11px] sm:text-xs leading-none mb-auto ${
                  cell.iso === todayISO
                    ? 'w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center font-medium'
                    : 'text-muted'
                }`}>
                  {cell.day}
                </span>
                {cell.data?.income > 0 && (
                  <span className="text-[9px] sm:text-[10px] text-income leading-tight">
                    +{compact(cell.data.income)}
                  </span>
                )}
                {cell.data?.expense > 0 && (
                  <span className="text-[9px] sm:text-[10px] text-expense leading-tight">
                    −{compact(cell.data.expense)}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </Card>

      {/* detalhe do dia selecionado */}
      {selected && (
        <Card className="mt-4">
          <h2 className="text-sm font-medium mb-3">
            Dia {Number(selected.slice(8))} de {MONTHS_PT[ym.month - 1]}
          </h2>
          {!dayTxs && <p className="text-xs text-muted">Carregando…</p>}
          {dayTxs?.length === 0 && (
            <p className="text-xs text-muted">Nenhuma transação nesse dia.</p>
          )}
          <ul className="divide-y divide-border">
            {dayTxs?.map((tx) => (
              <li key={tx.id}>
                <button onClick={() => setSelectedTx(tx)}
                        className="w-full text-left flex items-center gap-3 py-2.5 px-1 -mx-1
                                   rounded-lg hover:bg-hover transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate flex items-center gap-1.5">
                      {tx.description}
                      {tx.is_recurring && <Repeat size={12} className="text-muted shrink-0" />}
                    </p>
                    <p className="text-xs text-muted">
                      {tx.category_name || 'Sem categoria'}
                      {tx.category_parent_name && ` (${tx.category_parent_name})`}
                      {' · '}{tx.account_name ?? tx.card_name}
                    </p>
                  </div>
                  <p className={`text-sm font-medium ${
                    tx.type === 'income' ? 'text-income' : 'text-slate-200'}`}>
                    {tx.type === 'income' ? '+' : '−'}{formatBRL(tx.amount)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TransactionPanel open={selectedTx != null} transaction={selectedTx}
                        onClose={() => setSelectedTx(null)} />
    </div>
  )
}
