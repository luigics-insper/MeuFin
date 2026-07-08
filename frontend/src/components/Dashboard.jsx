import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function fmt(v) {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function Card({ titulo, valor, cor, variacao }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className={`text-lg font-bold ${cor}`}>{fmt(valor)}</p>
      {variacao != null && (
        <p className={`text-xs ${variacao > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {variacao > 0 ? '▲' : '▼'} {Math.abs(variacao)}% vs mês anterior
        </p>
      )}
    </div>
  )
}

export default function Dashboard({ resumoMensal, resumoCategorias }) {
  if (!resumoMensal) return null
  const { atual, anterior, variacao_gastos_pct } = resumoMensal

  const dadosBarras = [
    { nome: anterior.mes, Gastos: anterior.gastos, Receitas: anterior.receitas },
    { nome: atual.mes, Gastos: atual.gastos, Receitas: atual.receitas },
  ]

  return (
    <div className="space-y-4 mb-6">
      {/* Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card titulo="Gastos" valor={atual.gastos} cor="text-red-400" variacao={variacao_gastos_pct} />
        <Card titulo="Receitas" valor={atual.receitas} cor="text-green-400" />
        <Card titulo="Saldo" valor={atual.saldo} cor={atual.saldo >= 0 ? 'text-gray-100' : 'text-red-400'} />
      </div>

      {/* Pizza por categoria */}
      {resumoCategorias.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm font-semibold mb-2">Gastos por categoria</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={resumoCategorias}
                dataKey="total"
                nameKey="categoria"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {resumoCategorias.map(c => (
                  <Cell key={c.categoria} fill={c.cor} />
                ))}
              </Pie>
              <Tooltip
                formatter={v => fmt(v)}
                contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: 8 }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comparação mensal */}
      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-sm font-semibold mb-2">Comparação mensal</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dadosBarras}>
            <XAxis dataKey="nome" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip
              formatter={v => fmt(v)}
              contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: 8 }}
              cursor={{ fill: '#ffffff10' }}
            />
            <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}