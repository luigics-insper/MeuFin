import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

export default function App() {
  const [categorias, setCategorias] = useState([])

  useEffect(() => {
    fetch(`${API}/categorias/`)
      .then(r => r.json())
      .then(setCategorias)
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">💰 Finanças</h1>
      <div className="flex flex-wrap gap-2">
        {categorias.map(c => (
          <span
            key={c.id}
            className="px-3 py-1 rounded-full text-sm font-medium"
            style={{ backgroundColor: c.cor + '33', color: c.cor }}
          >
            {c.nome}
          </span>
        ))}
      </div>
    </div>
  )
}