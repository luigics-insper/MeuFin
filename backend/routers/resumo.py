from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select
from sqlalchemy import func
from database import get_session
from models import Transacao, Categoria

router = APIRouter(prefix="/resumo", tags=["resumo"])


def limites_do_mes(mes: str):
    ano, m = map(int, mes.split("-"))
    inicio = date(ano, m, 1)
    fim = date(ano + 1, 1, 1) if m == 12 else date(ano, m + 1, 1)
    return inicio, fim


def mes_anterior(mes: str) -> str:
    ano, m = map(int, mes.split("-"))
    return f"{ano - 1}-12" if m == 1 else f"{ano}-{m - 1:02d}"


@router.get("/categorias")
def por_categoria(
    mes: str = Query(..., description="YYYY-MM"),
    session: Session = Depends(get_session),
):
    """Total de gastos por categoria no mês → gráfico de pizza."""
    inicio, fim = limites_do_mes(mes)
    stmt = (
        select(Categoria.nome, Categoria.cor, func.sum(Transacao.valor).label("total"))
        .join(Transacao, Transacao.categoria_id == Categoria.id)
        .where(Transacao.tipo == "gasto", Transacao.data >= inicio, Transacao.data < fim)
        .group_by(Categoria.id)
        .order_by(func.sum(Transacao.valor).desc())
    )
    return [
        {"categoria": nome, "cor": cor, "total": round(total, 2)}
        for nome, cor, total in session.exec(stmt).all()
    ]


@router.get("/mensal")
def comparacao_mensal(
    mes: str = Query(..., description="YYYY-MM"),
    session: Session = Depends(get_session),
):
    """Mês atual vs anterior + saldo → cards e gráfico de barras."""
    resultado = {}
    for label, m in [("atual", mes), ("anterior", mes_anterior(mes))]:
        inicio, fim = limites_do_mes(m)
        dados = {}
        for tipo in ("gasto", "receita"):
            stmt = select(func.coalesce(func.sum(Transacao.valor), 0)).where(
                Transacao.tipo == tipo,
                Transacao.data >= inicio,
                Transacao.data < fim,
            )
            dados[tipo + "s"] = round(session.exec(stmt).one(), 2)
        dados["saldo"] = round(dados["receitas"] - dados["gastos"], 2)
        resultado[label] = {"mes": m, **dados}

    gastos_atual = resultado["atual"]["gastos"]
    gastos_ant = resultado["anterior"]["gastos"]
    resultado["variacao_gastos_pct"] = (
        round((gastos_atual - gastos_ant) / gastos_ant * 100, 1) if gastos_ant else None
    )
    return resultado