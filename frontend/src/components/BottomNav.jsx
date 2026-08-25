// Barra de navegação inferior — só aparece no mobile (md:hidden).
// Espelha o mockup: Início · Transações · [+] · Relatórios · Mais.
// O botão central não navega: abre o painel de nova transação.
import { NavLink } from 'react-router-dom'
import { Home, ArrowLeftRight, Plus, BarChart3, Menu } from 'lucide-react'

const LEFT = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/transacoes', label: 'Transações', icon: ArrowLeftRight },
]
const RIGHT = [
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/mais', label: 'Mais', icon: Menu },
]

function Tab({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] ${
          isActive ? 'text-primary' : 'text-muted'
        }`
      }
    >
      <Icon size={20} strokeWidth={2} />
      {label}
    </NavLink>
  )
}

export default function BottomNav({ onNewTransaction }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar/95 backdrop-blur
                 border-t border-border flex items-stretch
                 pb-[env(safe-area-inset-bottom)]"
    >
      {LEFT.map((t) => <Tab key={t.to} {...t} />)}

      {/* Botão central: nova transação */}
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={onNewTransaction}
          aria-label="Nova transação"
          className="w-12 h-12 -mt-5 rounded-full bg-primary text-white shadow-lg
                     shadow-primary/40 flex items-center justify-center
                     active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {RIGHT.map((t) => <Tab key={t.to} {...t} />)}
    </nav>
  )
}
