// Componentes pequenos reutilizados em várias telas.
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

// Padrão "componente polimórfico": a prop `as` deixa o Card ser renderizado
// como outro elemento (ex: <button>) mantendo o visual. ...rest repassa
// onClick e afins. É o mesmo truque que bibliotecas como Radix/Chakra usam.
export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`rounded-card bg-card border border-border p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function StatCard({ label, value, changePct, icon: Icon, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/15 text-primary',
    income: 'bg-income/15 text-income',
    expense: 'bg-expense/15 text-expense',
    info: 'bg-info/15 text-info',
  }
  const positive = changePct != null && changePct >= 0
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted mb-1.5">{label}</p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {changePct != null && (
        <p className={`text-xs mt-2 flex items-center gap-0.5 ${positive ? 'text-income' : 'text-expense'}`}>
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(changePct)}% vs mês passado
        </p>
      )}
    </Card>
  )
}

export function PageTitle({ children, sub, className = 'mb-6' }) {
  return (
    <div className={className}>
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
    </div>
  )
}
