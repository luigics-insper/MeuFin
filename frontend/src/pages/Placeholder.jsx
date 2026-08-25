import { useLocation } from 'react-router-dom'
import { Card, PageTitle } from '../components/shared'

// Página genérica pras rotas que ainda não foram construídas.
// Cada uma vira uma tela de verdade nas próximas fases (ver ROADMAP.md).
export default function Placeholder({ title }) {
  const { pathname } = useLocation()
  return (
    <div className="max-w-6xl">
      <PageTitle>{title}</PageTitle>
      <Card>
        <p className="text-sm text-muted">
          Em construção — rota <code className="text-primary">{pathname}</code>.
          Consulte o ROADMAP.md pra ver em qual fase essa tela entra.
        </p>
      </Card>
    </div>
  )
}
