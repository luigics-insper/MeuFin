from fastapi import FastAPI
from sqlmodel import Session, select
from database import create_db, engine
from models import Categoria
from routers import categorias, transacoes, resumo
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Finanças API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(categorias.router)
app.include_router(transacoes.router)
app.include_router(resumo.router)

PADRAO = [
    ("Alimentação", "#ef4444"),
    ("Transporte", "#3b82f6"),
    ("Lazer", "#a855f7"),
    ("Moradia", "#f59e0b"),
    ("Saúde", "#10b981"),
    ("Educação", "#06b6d4"),
    ("Salário", "#22c55e"),
    ("Outros", "#6b7280"),
]


@app.on_event("startup")
def startup():
    create_db()
    with Session(engine) as session:
        if not session.exec(select(Categoria)).first():
            for nome, cor in PADRAO:
                session.add(Categoria(nome=nome, cor=cor))
            session.commit()


@app.get("/")
def health():
    return {"status": "ok"}