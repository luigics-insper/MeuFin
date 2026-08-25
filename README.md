# MeuFin 💜

**Painel de controle financeiro pessoal** — dark mode, inspirado em Linear /
Raycast / Notion. Projeto full-stack solo, do modelo de dados ao deploy em
produção.

![Python](https://img.shields.io/badge/Python-FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/DB-SQLite-003B57?logo=sqlite&logoColor=white)
![Tailwind](https://img.shields.io/badge/CSS-Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white)

> A maioria dos apps de finanças pede pra você "registrar gastos". O MeuFin
> responde três perguntas em menos de 10 segundos: **quanto eu tenho, quanto
> posso gastar, e estou melhor que mês passado?**

## Sobre o projeto

Construí o MeuFin pra resolver um problema real (organizar minhas próprias
finanças) e, no processo, praticar decisões de engenharia que normalmente só
aparecem em produtos "de verdade": modelagem de dinheiro sem erros de
arredondamento, autenticação com defesa em profundidade, agregações pensadas
pra não sobrecarregar o frontend, e deploy próprio numa VM (Oracle Cloud +
systemd + Caddy).

**Destaques técnicos:**

- 💰 **Zero float em valores monetários** — tudo em centavos (`int`), conversão
  só na borda de exibição
- 🔒 **Autenticação allowlist** — nega por padrão; toda rota nova nasce
  protegida, sem precisar lembrar de proteger cada endpoint manualmente
- 🧮 **Saldo sempre derivado**, nunca armazenado — impossível dessincronizar
- 📊 **9 domínios de API** (contas, categorias, transações, cartões, metas,
  orçamentos, dashboard, insights, relatórios) com ~40 endpoints
- 🧠 **Motor de insights** — regras heurísticas que leem o histórico e geram
  alertas tipo "você gastou 30% a mais em Delivery esse mês"
- 🚀 **Deploy real**: VM Linux, serviço systemd, reverse proxy Caddy

## Funcionalidades

| Área | O que faz |
|---|---|
| **Dashboard** | Saldo, receitas, despesas e economia (com variação % vs. mês anterior); donut de gastos por categoria; evolução de patrimônio em 12 meses |
| **Transações** | Timeline agrupada por dia, filtros combináveis, atalho `N` pra criar, editar/duplicar/excluir com undo |
| **Categorias** | Subcategorias (1 nível), roll-up automático de totais e orçamentos pra categoria-mãe |
| **Cartões** | Limite, fechamento, vencimento, fatura com ciclo derivado, parcelamentos, pagamento como transferência |
| **Contas** | Transferências entre contas com validação de origem/destino |
| **Orçamentos & metas** | Barras de progresso (alerta em 80%/100%), metas com depósitos associados |
| **Calendário** | Visão mensal de receitas/despesas com detalhe por dia |
| **Busca & comandos** | `Ctrl+K` busca global; `+ mercado 82` cria transação direto na palette |
| **Simulações** | "E se eu cancelar essa assinatura?", "e se eu guardar X/mês pra essa meta?" |
| **Relatórios** | Visão mensal/anual, ranking por período, export CSV |
| **Autenticação** | bcrypt + sessão em cookie `HttpOnly`/`SameSite=Lax`, rate limit no login |
| **PWA** | Instalável, service worker (API nunca cacheada) |

## Stack

| Camada | Tecnologias |
|---|---|
| Backend | FastAPI · SQLModel · SQLite |
| Frontend | React 19 · Vite · Tailwind · Recharts · React Router |
| Infra | Systemd · Caddy (reverse proxy + TLS automático) |

## Decisões de arquitetura

1. **Dinheiro em centavos (`int`), nunca float.** `R$ 82,40` → `8240`.
   Conversão pra exibição só na fronteira (`frontend/src/lib/format.js`).
2. **Saldo é sempre calculado**, nunca armazenado — `initial_balance +
   receitas − despesas − transferências`. Elimina bugs de dessincronização.
3. **Read models denormalizados.** Ex.: `TransactionRead` já vem com nome/cor
   da categoria, evitando N requests extras no frontend.
4. **Dashboard = 1 endpoint agregado** (`/api/dashboard/summary`), não vários
   requests que o frontend precisaria juntar.
5. **Autenticação allowlist, nega por padrão.** Middleware bloqueia toda rota
   `/api/*` exceto uma lista explícita de rotas públicas.

## Estrutura

```
backend/
  app/
    main.py        ← entrada, CORS, middleware de auth
    database.py    ← engine SQLite + sessão
    models.py      ← Account, Category, Transaction, Card, Goal...
    seed.py        ← dados de exemplo
    routers/        ← um arquivo por recurso (accounts, auth, cards, ...)
frontend/
  src/
    api/client.js  ← único lugar que chama fetch()
    lib/format.js  ← centavos → R$, datas relativas
    components/    ← Sidebar, Layout, painéis, gráficos, command palette
    pages/         ← Dashboard, Transações, Contas, Categorias, Relatórios...
```

## Rodando localmente

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed              # popula com dados de exemplo
uvicorn app.main:app --reload
```

API em `http://localhost:8000` — docs interativas em `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App em `http://localhost:5173` (proxy do Vite encaminha `/api/*` pro backend).

### Resetar o banco

```bash
cd backend && rm meufin.db && python -m app.seed
```

## Roadmap

Histórico completo de fases de desenvolvimento em [ROADMAP.md](ROADMAP.md).
