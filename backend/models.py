from datetime import date
from sqlmodel import SQLModel, Field
from typing import Optional


class Categoria(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nome: str = Field(index=True, unique=True)
    cor: str = "#6366f1"  # pros gráficos depois


class Gasto(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    valor: float
    descricao: Optional[str] = None
    data: date = Field(default_factory=date.today, index=True)
    categoria_id: int = Field(foreign_key="categoria.id")