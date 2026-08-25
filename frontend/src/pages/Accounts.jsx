// Tela de Contas — cada conta é um card (spec): nome, tipo, saldo,
// última movimentação. Clicar no card abre o painel de edição.
import { useEffect, useState } from 'react'
import { Plus, Landmark, Wallet, PiggyBank, TrendingUp, Banknote } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import AccountPanel, { ACCOUNT_TYPES } from '../components/AccountPanel'

// nome do ícone (string vinda da API) → componente Lucide
const ICONS = {
  landmark: Landmark,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  banknote: Banknote,
}

function AccountCard({ account, onClick }) {
  const Icon = ICONS[account.icon] || Landmark
  const negative = account.balance < 0
  return (
    <Card
      as="button"
      onClick={onClick}
      className="w-full text-left hover:bg-hover transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: account.color + '26', color: account.color }}
        >
          <Icon size={19} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{account.name}</p>
          <p className="text-xs text-muted">
            {ACCOUNT_TYPES[account.type]?.label ?? account.type}
          </p>
        </div>
      </div>

      <p className={`text-xl font-semibold ${negative ? 'text-expense' : ''}`}>
        {formatBRL(account.balance)}
      </p>
      <p className="text-xs text-muted mt-1 truncate">
        {account.last_tx_description
          ? `Última: ${account.last_tx_description} · ${relativeDay(account.last_tx_date)}`
          : 'Sem movimentações ainda'}
      </p>
    </Card>
  )
}

export default function Accounts() {
  const { version } = useRefresh()
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)
  // null = painel fechado · 'new' = criando · objeto = editando
  const [panel, setPanel] = useState(null)

  useEffect(() => {
    api.get('/accounts').then(setAccounts).catch((e) => setError(e.message))
  }, [version])

  const total = accounts?.reduce((sum, a) => sum + a.balance, 0)

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub={accounts ? `Total: ${formatBRL(total)}` : ' '}>
          Contas
        </PageTitle>
        <button
          onClick={() => setPanel('new')}
          className="shrink-0 flex items-center gap-2 bg-primary text-white text-sm
                     font-medium px-4 py-2.5 rounded-lg hover:bg-primary/90
                     transition-colors"
        >
          <Plus size={16} /> Nova conta
        </button>
      </div>

      {!accounts && <p className="text-muted text-sm">Carregando…</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts?.map((a) => (
          <AccountCard key={a.id} account={a} onClick={() => setPanel(a)} />
        ))}
      </div>

      <AccountPanel
        open={panel != null}
        account={panel === 'new' ? null : panel}
        onClose={() => setPanel(null)}
      />
    </div>
  )
}
