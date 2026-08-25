// Contexto de "refresh": quando uma transação é criada, as telas abertas
// precisam recarregar seus dados.
//
// Como funciona: um contador (`version`) vive aqui. Quem cria dados chama
// `bump()` → version incrementa → páginas que colocaram `version` nas
// dependências do useEffect re-executam o fetch. Simples e sem biblioteca.
// (Em apps maiores isso vira React Query / SWR — mesmo conceito, com cache.)
import { createContext, useContext, useState } from 'react'

const RefreshContext = createContext({ version: 0, bump: () => {} })

export function RefreshProvider({ children }) {
  const [version, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)
  return (
    <RefreshContext.Provider value={{ version, bump }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useRefresh() {
  return useContext(RefreshContext)
}
