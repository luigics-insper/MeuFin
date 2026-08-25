// Widget "Próximas contas" — a lista Netflix · 10 Jul do mockup.
// Os dados são PREVISÕES derivadas das recorrências (ver o endpoint
// /dashboard/upcoming-bills): nenhuma tabela nova, só inferência.
import { Tag } from 'lucide-react'
import { formatBRL } from '../lib/format'
import { Card } from './shared'
import { CATEGORY_ICONS } from './CategoryPanel'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

export default function UpcomingBills({ bills }) {
  return (
    <Card>
      <h2 className="text-sm font-medium mb-1">Próximas contas</h2>
      <p className="text-xs text-muted mb-3">
        Previstas a partir das suas recorrências
      </p>

      {bills.length === 0 && (
        <p className="text-xs text-muted">
          Nada previsto pros próximos 40 dias. Marque despesas fixas como
          "recorrente" e elas aparecem aqui.
        </p>
      )}

      <ul className="divide-y divide-border">
        {bills.map((b) => {
          const Icon = CATEGORY_ICONS[b.category_icon] || Tag
          return (
            <li key={b.description + b.due_date}
                className="flex items-center gap-3 py-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: b.category_color + '26',
                         color: b.category_color }}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{b.description}</p>
                <p className={`text-xs ${b.overdue ? 'text-warn font-medium' : 'text-muted'}`}>
                  {b.overdue ? `Pendente · era ${shortDate(b.due_date)}` : shortDate(b.due_date)}
                </p>
              </div>
              <p className="text-sm font-medium shrink-0">−{formatBRL(b.amount)}</p>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
