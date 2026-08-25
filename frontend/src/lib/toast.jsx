// Toast global com ação de Desfazer.
//
// O padrão UNDO pra estudar: em vez de pedir confirmação ANTES (fricção
// em toda exclusão), deixa excluir na hora e oferece desfazer DEPOIS.
// O "desfazer" aqui não é mágica: o componente que excluiu guarda o
// objeto completo e o undo simplesmente RECRIA via POST. O dado ganha
// um id novo — pro usuário, indistinguível de "voltou".
//
// Mesma mecânica de Context do refresh: provider no topo, hook pra usar.
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'

const ToastContext = createContext({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null) // { message, onUndo }
  const timer = useRef(null)

  const show = useCallback((message, { onUndo } = {}) => {
    clearTimeout(timer.current)
    setToast({ message, onUndo })
    timer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  const undo = async () => {
    clearTimeout(timer.current)
    const action = toast?.onUndo
    setToast(null)
    if (action) await action()
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="fixed z-[60] left-1/2 -translate-x-1/2
                        bottom-24 md:bottom-6
                        flex items-center gap-3 bg-sidebar border border-border
                        rounded-xl shadow-2xl px-4 py-3">
          <p className="text-sm">{toast.message}</p>
          {toast.onUndo && (
            <button onClick={undo}
                    className="flex items-center gap-1.5 text-sm font-medium
                               text-primary hover:underline shrink-0">
              <Undo2 size={14} /> Desfazer
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
