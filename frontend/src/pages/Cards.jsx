// Tela de Cartões — cada cartão mostra: limite, disponível, barra de uso,
// fatura aberta (com fechamento/vencimento), melhor dia de compra, dívida
// total, e ações: ver fatura (expande), pagar, editar.
import { useEffect, useState } from 'react'
import { Plus, CreditCard, Pencil, ChevronDown, ChevronUp, Repeat, X } from 'lucide-react'
import { api } from '../api/client'
import { useRefresh } from '../lib/refresh'
import { formatBRL, relativeDay } from '../lib/format'
import { Card, PageTitle } from '../components/shared'
import CardPanel from '../components/CardPanel'
import TransactionPanel from '../components/TransactionPanel'
import { parseBRL, centsToInput } from '../lib/money'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const shortDate = (iso) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

// ---------- mini painel de pagamento ----------
function PayPanel({ card, onClose }) {
  const { bump } = useRefresh()
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  // pré-preenche com a dívida total — o caminho feliz é "pagar tudo"
  const [amount, setAmount] = useState(centsToInput(Math.max(card.debt_total, 0)))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/accounts').then((accs) => {
      setAccounts(accs)
      if (accs[0]) setAccountId(String(accs[0].id))
    }).catch(() => {})
  }, [])

  const submit = async () => {
    const cents = parseBRL(amount)
    if (cents == null) return setError('Valor inválido — ex: 350,00')
    if (!accountId) return setError('Escolhe a conta de origem.')
    setSaving(true)
    setError(null)
    try {
      await api.post(`/cards/${card.id}/pay`, {
        account_id: Number(accountId), amount: cents,
      })
      bump()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
                 placeholder:text-muted focus:outline-none focus:border-primary/60`

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card border-t
                      border-border md:inset-auto md:top-1/2 md:left-1/2
                      md:-translate-x-1/2 md:-translate-y-1/2 md:w-[380px]
                      md:rounded-2xl md:border p-5
                      pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Pagar {card.name}</h2>
          <button onClick={onClose} className="text-muted hover:text-slate-200 p-1">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-muted mb-4">
          Sai da conta, abate a dívida — não conta como despesa nova
          (a despesa foi na compra).
        </p>
        <div className="space-y-3">
          <select className={input} value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input className={input} inputMode="decimal" value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error && <p className="text-expense text-xs mt-3">{error}</p>}
        <button onClick={submit} disabled={saving}
                className="w-full mt-4 py-3 rounded-lg bg-primary text-white text-sm
                           font-medium hover:bg-primary/90 disabled:opacity-60">
          {saving ? 'Pagando…' : 'Confirmar pagamento'}
        </button>
      </div>
    </div>
  )
}

// ---------- fatura expandida ----------
function InvoiceList({ cardId, onSelectTx }) {
  const { version } = useRefresh()
  const [invoice, setInvoice] = useState(null)

  useEffect(() => {
    api.get(`/cards/${cardId}/invoice`).then(setInvoice).catch(() => {})
  }, [cardId, version])

  if (!invoice) return <p className="text-xs text-muted mt-3">Carregando fatura…</p>

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted mb-2">
        Fatura aberta · {shortDate(invoice.period_start)} a {shortDate(invoice.period_end)}
        {' · '}fecha {shortDate(invoice.closes_at)} · vence {shortDate(invoice.due_at)}
      </p>
      {invoice.transactions.length === 0 && (
        <p className="text-xs text-muted">Nenhuma compra nesse ciclo ainda.</p>
      )}
      <ul className="divide-y divide-border">
        {invoice.transactions.map((tx) => (
          <li key={tx.id}>
            <button onClick={() => onSelectTx(tx)}
                    className="w-full text-left flex items-center gap-3 py-2 px-1 -mx-1
                               rounded-lg hover:bg-hover transition-colors">
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate flex items-center gap-1.5">
                  {tx.description}
                  {tx.installment_total > 1 && (
                    <span className="text-[10px] text-muted">
                      {tx.installment_number}/{tx.installment_total}
                    </span>
                  )}
                  {tx.is_recurring && <Repeat size={12} className="text-muted shrink-0" />}
                </p>
                <p className="text-xs text-muted">
                  {tx.category_name || 'Sem categoria'} · {relativeDay(tx.date)}
                </p>
              </div>
              <p className="text-sm font-medium">−{formatBRL(tx.amount)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- card visual ----------
function CreditCardCard({ card, onEdit, onPay, expanded, onToggle, onSelectTx }) {
  const usagePct = Math.min(
    Math.round((Math.max(card.debt_total, 0) / card.limit_amount) * 100), 100)
  const usageColor = usagePct >= 90 ? '#EF4444' : usagePct >= 70 ? '#F59E0B' : card.color

  return (
    <Card className="overflow-hidden">
      {/* "cabeçalho de cartão físico": faixa com gradiente da cor */}
      <div className="-m-5 mb-4 p-5 pb-4"
           style={{ background: `linear-gradient(135deg, ${card.color}33, transparent 70%)` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style={{ backgroundColor: card.color + '33', color: card.color }}>
            <CreditCard size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{card.name}</p>
            <p className="text-xs text-muted">
              Fecha dia {card.closing_day} · vence dia {card.due_day}
              {' · '}melhor dia: {card.best_buy_day}
            </p>
          </div>
          <button onClick={onEdit} aria-label="Editar cartão"
                  className="p-1.5 rounded-lg text-muted hover:bg-hover hover:text-slate-200">
            <Pencil size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs text-muted">Disponível</p>
        <p className="text-xs text-muted">Limite {formatBRL(card.limit_amount)}</p>
      </div>
      <p className="text-xl font-semibold mb-2">{formatBRL(card.available)}</p>
      <div className="h-2 rounded-full bg-bg overflow-hidden mb-4">
        <div className="h-full rounded-full transition-all"
             style={{ width: `${usagePct}%`, backgroundColor: usageColor }} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-center mb-4">
        <div className="rounded-lg bg-bg p-2.5">
          <p className="text-[10px] text-muted mb-0.5">Fatura aberta</p>
          <p className="text-sm font-medium">{formatBRL(card.open_invoice_total)}</p>
          <p className="text-[10px] text-muted">fecha {shortDate(card.next_closing)}</p>
        </div>
        <div className="rounded-lg bg-bg p-2.5">
          <p className="text-[10px] text-muted mb-0.5">Dívida total</p>
          <p className={`text-sm font-medium ${card.debt_total > 0 ? 'text-expense' : ''}`}>
            {formatBRL(card.debt_total)}
          </p>
          <p className="text-[10px] text-muted">vence {shortDate(card.next_due)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onPay} disabled={card.debt_total <= 0}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm
                           font-medium hover:bg-primary/90 disabled:opacity-40">
          Pagar
        </button>
        <button onClick={onToggle}
                className="flex-1 py-2 rounded-lg border border-border text-sm
                           text-slate-300 hover:bg-hover flex items-center
                           justify-center gap-1.5">
          Fatura {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && <InvoiceList cardId={card.id} onSelectTx={onSelectTx} />}
    </Card>
  )
}

// ---------- página ----------
export default function Cards() {
  const { version } = useRefresh()
  const [cards, setCards] = useState(null)
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(null)      // null | 'new' | card (CRUD)
  const [paying, setPaying] = useState(null)    // card sendo pago
  const [expanded, setExpanded] = useState(null) // id do card com fatura aberta
  const [selectedTx, setSelectedTx] = useState(null)

  useEffect(() => {
    api.get('/cards').then(setCards).catch((e) => setError(e.message))
  }, [version])

  if (error) {
    return <Card className="border-expense/40"><p className="text-sm">Erro: {error}</p></Card>
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <PageTitle sub="Limites, faturas e parcelamentos.">Cartões</PageTitle>
        <button onClick={() => setPanel('new')}
                className="shrink-0 flex items-center gap-2 bg-primary text-white text-sm
                           font-medium px-4 py-2.5 rounded-lg hover:bg-primary/90">
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {!cards && <p className="text-muted text-sm">Carregando…</p>}

      {cards && cards.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            Nenhum cartão ainda. Cadastre com limite, dia de fechamento e
            vencimento — as compras no cartão viram fatura, não saem da conta.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cards?.map((c) => (
          <CreditCardCard key={c.id} card={c}
                          onEdit={() => setPanel(c)}
                          onPay={() => setPaying(c)}
                          expanded={expanded === c.id}
                          onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                          onSelectTx={setSelectedTx} />
        ))}
      </div>

      <CardPanel open={panel != null} card={panel === 'new' ? null : panel}
                 onClose={() => setPanel(null)} />
      {paying && <PayPanel card={paying} onClose={() => setPaying(null)} />}
      <TransactionPanel open={selectedTx != null} transaction={selectedTx}
                        onClose={() => setSelectedTx(null)} />
    </div>
  )
}
