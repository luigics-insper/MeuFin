// Conversões dinheiro ↔ texto. Regra do projeto: dinheiro trafega e é
// armazenado em CENTAVOS (int). Texto humano ("82,40") só existe na borda
// da UI — e estas duas funções SÃO essa borda.

// "82,40" | "82.40" | "1.234,56" | "82" → centavos (int) ou null se inválido.
// opts.allowNonPositive: contas podem ter saldo inicial 0 ou negativo (dívida);
// transações não (o sinal vem do type, não do número).
export function parseBRL(text, opts = {}) {
  const clean = String(text).trim().replace(/\s|R\$/g, '')
  if (!clean) return null
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  if (!opts.allowNonPositive && value <= 0) return null
  return Math.round(value * 100)
}

// centavos (8240) → "82,40" — o caminho inverso, pra preencher formulários
export function centsToInput(cents) {
  return (cents / 100).toFixed(2).replace('.', ',')
}
