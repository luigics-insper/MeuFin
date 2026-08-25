// O backend trabalha em CENTAVOS (int). Aqui é a fronteira de conversão.
export function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// "hoje" / "ontem" / data — usado na timeline de transações
export function relativeDay(isoDate) {
  const d = new Date(isoDate + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return formatDate(isoDate)
}
