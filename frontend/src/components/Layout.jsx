// Layout raiz: sidebar (desktop) + bottom bar (mobile) + painel de nova
// transação + atalho de teclado N. Tudo que é "global" da UI mora aqui.
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import TransactionPanel from './TransactionPanel'
import CommandPalette from './CommandPalette'
import { RefreshProvider, useRefresh } from '../lib/refresh'
import { ToastProvider } from '../lib/toast'
import { api } from '../api/client'

function Shell() {
  const [netWorth, setNetWorth] = useState(null)
  const [newTxOpen, setNewTxOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [editTx, setEditTx] = useState(null)  // transação aberta via palette
  const { version } = useRefresh()

  // version nas deps: criou transação → patrimônio na sidebar atualiza também
  useEffect(() => {
    api.get('/dashboard/summary')
      .then((d) => setNetWorth(d.total_balance))
      .catch(() => {})
  }, [version])

  // Atalhos globais (spec): N nova transação · / ou Ctrl+K pesquisa.
  // Ctrl+K funciona SEMPRE (até digitando — é o padrão Linear/Raycast);
  // N e / só fora de campos de texto, senão escrever "banana" ou uma
  // fração "1/2" dispararia atalho sem querer.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setNewTxOpen(true)
      }
      if (e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar netWorth={netWorth} />
      {/* pb-28 no mobile: espaço pra bottom bar não cobrir o conteúdo */}
      <main className="flex-1 min-w-0 p-4 pb-28 md:p-8 md:pb-8">
        <Outlet />
      </main>

      <BottomNav onNewTransaction={() => setNewTxOpen(true)} />
      <TransactionPanel open={newTxOpen} onClose={() => setNewTxOpen(false)} />
      <TransactionPanel open={editTx != null} transaction={editTx}
                        onClose={() => setEditTx(null)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
                      onSelectTx={setEditTx} />
    </div>
  )
}

export default function Layout() {
  return (
    <RefreshProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </RefreshProvider>
  )
}
