// Widgets de gráfico do dashboard (Recharts).
//
// Conceitos pra estudar:
// 1. ResponsiveContainer: o gráfico mede o pai e se redesenha — é o que
//    faz funcionar no mobile e no desktop sem código duplicado.
// 2. Os dados chegam em centavos e SÓ viram "R$ x,xx" nos formatters de
//    eixo/tooltip — a regra da borda vale até dentro do gráfico.
// 3. O donut é clicável: clicar numa fatia navega pra /transacoes?category_id=X.
//    Comunicação entre telas via URL — o filtro vira um link compartilhável.
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { formatBRL } from '../lib/format'
import { Card } from './shared'

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                   'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Tooltip customizado — o default do Recharts é branco, quebraria o tema
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-sidebar border border-border rounded-lg px-3 py-2 text-xs">
      {label != null && <p className="text-muted mb-0.5">{label}</p>}
      <p className="font-medium">{formatBRL(payload[0].value)}</p>
    </div>
  )
}

// ---------- Widget: evolução do patrimônio ----------
export function NetWorthChart({ points }) {
  const data = points.map((p) => ({
    label: `${MONTHS_PT[p.month - 1]}`,
    balance: p.balance,
  }))
  return (
    <Card>
      <h2 className="text-sm font-medium mb-1">Evolução do patrimônio</h2>
      <p className="text-xs text-muted mb-4">Últimos {points.length} meses</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              {/* gradiente roxo que esvai pra transparente, como no mockup */}
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C5CFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7C5CFF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1E2633" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#8B95A7', fontSize: 11 }}
                   axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8B95A7', fontSize: 11 }} axisLine={false}
                   tickLine={false} width={52}
                   tickFormatter={(v) => `${Math.round(v / 100000) / 10}k`} />
            <Tooltip content={<DarkTooltip />} />
            <Area type="monotone" dataKey="balance" stroke="#7C5CFF"
                  strokeWidth={2} fill="url(#netWorthFill)"
                  dot={{ r: 3, fill: '#7C5CFF', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ---------- Widget: gastos por categoria (donut clicável) ----------
export function CategoryDonut({ data }) {
  const navigate = useNavigate()

  const goToCategory = (item) => {
    // Filtro viaja pela URL: a tela de Transações lê ?category_id na chegada.
    // null (sem categoria) não filtra — só navega pra lista completa.
    navigate(item.category_id != null
      ? `/transacoes?category_id=${item.category_id}`
      : '/transacoes')
  }

  if (!data.items.length) {
    return (
      <Card>
        <h2 className="text-sm font-medium mb-2">Gastos por categoria</h2>
        <p className="text-xs text-muted">Nenhuma despesa este mês ainda.</p>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-sm font-medium mb-1">Gastos por categoria</h2>
      <p className="text-xs text-muted mb-2">Este mês · clique pra filtrar</p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Donut com o total no centro */}
        <div className="relative w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.items} dataKey="total" nameKey="name"
                   innerRadius={58} outerRadius={80} paddingAngle={2}
                   strokeWidth={0} onClick={goToCategory}
                   className="cursor-pointer">
                {data.items.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center
                          pointer-events-none">
            <p className="text-[10px] text-muted">Total</p>
            <p className="text-sm font-semibold">{formatBRL(data.total)}</p>
          </div>
        </div>

        {/* Legenda-lista ao lado (spec) — cada linha também é clicável */}
        <ul className="flex-1 w-full space-y-1">
          {data.items.map((item) => (
            <li key={item.name}>
              <button
                onClick={() => goToCategory(item)}
                className="w-full flex items-center gap-2 text-left rounded-lg
                           px-2 py-1.5 hover:bg-hover transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }} />
                <span className="text-xs flex-1 truncate">{item.name}</span>
                <span className="text-xs font-medium">{formatBRL(item.total)}</span>
                <span className="text-xs text-muted w-9 text-right">{item.pct}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
