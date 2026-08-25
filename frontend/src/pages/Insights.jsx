// Insights — observações automáticas geradas por REGRAS no backend.
// A tela é burra de propósito: recebe {icon, color, text, detail} prontos.
// Regras novas aparecem aqui sem mudar uma linha de front.
import { useEffect, useState } from 'react'
import {
  Lightbulb, PiggyBank, AlertTriangle, TrendingUp, TrendingDown,
  Crown, LineChart, Tag,
} from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { Card, PageTitle } from '../components/shared'
import { CATEGORY_ICONS } from '../components/CategoryPanel'

// ícones fixos das regras + os de categoria (o backend manda o NOME lucide)
const EXTRA_ICONS = {
  'piggy-bank': PiggyBank,
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  crown: Crown,
  'line-chart': LineChart,
}

export default function Insights() {
  const { version } = useRefresh()
  const [insights, setInsights] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/insights').then(setInsights).catch((e) => setError(e.message))
  }, [version])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-2xl">
      <PageTitle sub="Observações automáticas sobre o seu mês — sem IA, só matemática.">
        Insights
      </PageTitle>

      {!insights && <p className="text-muted text-sm">Carregando…</p>}

      {insights && insights.length === 0 && (
        <Card>
          <p className="text-sm text-muted flex items-center gap-2">
            <Lightbulb size={15} />
            Ainda não há dados suficientes pra gerar insights — use o app
            por algumas semanas e volte aqui.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {insights?.map((ins, i) => {
          const Icon = EXTRA_ICONS[ins.icon] || CATEGORY_ICONS[ins.icon] || Tag
          return (
            <Card key={i} className="flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                   style={{ backgroundColor: ins.color + '26', color: ins.color }}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{ins.text}</p>
                {ins.detail && <p className="text-xs text-muted mt-0.5">{ins.detail}</p>}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
