// Página "Mais" — só faz sentido no mobile: as seções que não cabem
// na bottom bar viram uma lista aqui (mesmo padrão de apps de banco).
import { Link } from 'react-router-dom'
import {
  FolderOpen, Landmark, CreditCard, Target, Flag, Calendar,
  Lightbulb, Calculator, Settings, ChevronRight, LogOut,
} from 'lucide-react'
import { api } from '../api/client'
import { PageTitle, Card } from '../components/shared'

async function logout() {
  await api.post('/auth/logout').catch(() => {})
  window.location.href = '/login'
}

const SECTIONS = [
  { to: '/categorias', label: 'Categorias', icon: FolderOpen },
  { to: '/contas', label: 'Contas', icon: Landmark },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/orcamentos', label: 'Orçamentos', icon: Target },
  { to: '/metas', label: 'Metas', icon: Flag },
  { to: '/calendario', label: 'Calendário', icon: Calendar },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/simulacoes', label: 'Simulações', icon: Calculator },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function More() {
  return (
    <div className="max-w-md">
      <PageTitle>Mais</PageTitle>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                <Icon size={18} className="text-muted" />
                <span className="text-sm flex-1">{label}</span>
                <ChevronRight size={16} className="text-muted" />
              </Link>
            </li>
          ))}
          <li>
            <button onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-3.5
                               hover:bg-hover text-left">
              <LogOut size={18} className="text-expense" />
              <span className="text-sm flex-1 text-expense">Sair</span>
            </button>
          </li>
        </ul>
      </Card>
    </div>
  )
}
