import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, FolderOpen, Landmark, CreditCard,
  Target, Flag, Calendar, BarChart3, Lightbulb, Calculator, Settings,
  TrendingUp, LogOut,
} from 'lucide-react'
import { api } from '../api/client'
import { formatBRL } from '../lib/format'

async function logout() {
  await api.post('/auth/logout').catch(() => {})
  window.location.href = '/login'  // reload total: zera qualquer estado em memória
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
  { to: '/categorias', label: 'Categorias', icon: FolderOpen },
  { to: '/contas', label: 'Contas', icon: Landmark },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/orcamentos', label: 'Orçamentos', icon: Target },
  { to: '/metas', label: 'Metas', icon: Flag },
  { to: '/calendario', label: 'Calendário', icon: Calendar },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/simulacoes', label: 'Simulações', icon: Calculator },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Sidebar({ netWorth }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar border-r border-border h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-sm">
          M
        </div>
        <span className="font-semibold text-[15px]">MeuFin</span>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-slate-400 hover:bg-hover hover:text-slate-200'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Patrimônio líquido — sempre visível (spec) */}
      <div className="p-4 border-t border-border">
        <div className="rounded-card bg-card border border-border p-3">
          <p className="text-xs text-muted mb-1">Patrimônio líquido</p>
          <p className="text-lg font-semibold text-income">
            {netWorth != null ? formatBRL(netWorth) : '—'}
          </p>
          <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
            <TrendingUp size={12} /> atualizado agora
          </p>
        </div>
        <button
          onClick={logout}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg
                     text-sm text-slate-400 hover:bg-hover hover:text-slate-200
                     transition-colors"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </aside>
  )
}
