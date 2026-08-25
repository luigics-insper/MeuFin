import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Budgets from './pages/Budgets'
import CategoryDetail from './pages/CategoryDetail'
import Calendar from './pages/Calendar'
import Goals from './pages/Goals'
import Cards from './pages/Cards'
import Insights from './pages/Insights'
import Simulations from './pages/Simulations'
import Reports from './pages/Reports'
import More from './pages/More'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'

const PLACEHOLDERS = [
  ['/configuracoes', 'Configurações'],
]

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* fora do Layout: login não tem sidebar/nav */}
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transacoes" element={<Transactions />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/categorias/:id" element={<CategoryDetail />} />
          <Route path="/orcamentos" element={<Budgets />} />
          <Route path="/metas" element={<Goals />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/simulacoes" element={<Simulations />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/contas" element={<Accounts />} />
          <Route path="/cartoes" element={<Cards />} />
          <Route path="/mais" element={<More />} />
          {PLACEHOLDERS.map(([path, title]) => (
            <Route key={path} path={path} element={<Placeholder title={title} />} />
          ))}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
