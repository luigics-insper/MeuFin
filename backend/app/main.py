"""MeuFin API — ponto de entrada.

Rodar (de dentro da pasta backend/):
    uvicorn app.main:app --reload

Docs interativas: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session

from .database import create_db_and_tables, engine
from .routers import accounts, auth, cards, categories, dashboard, goals, insights, reports, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cria as tabelas na inicialização (em produção usaria migrations/Alembic)
    create_db_and_tables()
    yield


app = FastAPI(title="MeuFin API", version="0.1.0", lifespan=lifespan)

# Rotas que funcionam SEM sessão — todo o resto da API exige login.
# Allowlist (nega por padrão) > denylist: rota nova nasce protegida.
PUBLIC_PATHS = {"/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/health"}


@app.middleware("http")
async def require_auth(request, call_next):
    path = request.url.path
    if path.startswith("/api") and path not in PUBLIC_PATHS:
        with Session(engine) as db:
            if not auth.get_valid_session(db, request.cookies.get(auth.COOKIE_NAME)):
                return JSONResponse({"detail": "Não autenticado"}, status_code=401)
    return await call_next(request)

# CORS liberado pro dev server do Vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(dashboard.router)
app.include_router(goals.router)
app.include_router(insights.router)
app.include_router(reports.router)
app.include_router(cards.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
