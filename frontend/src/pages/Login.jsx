// Tela de login — dupla personalidade decidida pelo /auth/status:
//   has_password = false → primeiro uso: criar a senha (com confirmação)
//   has_password = true  → login normal
// Fora do <Layout /> de propósito: sem sidebar/nav antes de autenticar.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { api } from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState(null)      // null = carregando status
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/auth/status').then((s) => {
      if (s.authenticated) return navigate('/', { replace: true })
      setMode(s.has_password ? 'login' : 'setup')
      setTimeout(() => inputRef.current?.focus(), 50)
    }).catch((e) => setError(e.message))
  }, [navigate])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (mode === 'setup') {
      if (password.length < 8) return setError('Mínimo 8 caracteres.')
      if (password !== confirm) return setError('As senhas não conferem.')
    }
    setSending(true)
    try {
      await api.post(`/auth/${mode}`, { password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const input = `w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm
                 placeholder:text-muted focus:outline-none focus:border-primary/60`

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-bold text-white">
            M
          </div>
          <span className="font-semibold text-lg">MeuFin</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} className="text-primary" />
            <h1 className="text-base font-semibold">
              {mode === 'setup' ? 'Criar senha de acesso' : 'Entrar'}
            </h1>
          </div>
          <p className="text-xs text-muted mb-5">
            {mode === 'setup'
              ? 'Primeiro acesso: defina a senha única do app (mínimo 8 caracteres).'
              : 'Digite sua senha pra acessar suas finanças.'}
          </p>

          <form onSubmit={submit} className="space-y-3">
            <input
              ref={inputRef}
              type="password"
              className={input}
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            />
            {mode === 'setup' && (
              <input
                type="password"
                className={input}
                placeholder="Confirmar senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            )}

            {error && <p className="text-expense text-xs">{error}</p>}

            <button
              type="submit"
              disabled={sending || mode == null}
              className="w-full py-2.5 rounded-lg bg-primary text-white text-sm
                         font-medium hover:bg-primary/90 disabled:opacity-60
                         transition-colors"
            >
              {sending ? 'Entrando…' : mode === 'setup' ? 'Criar e entrar' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
