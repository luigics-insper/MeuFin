from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from database import get_session
from models import Transacao

router = APIRouter(prefix="/transacoes", tags=["transacoes"])


@router.get("/")
def listar(
    mes: Optional[str] = Query(None, description="Formato YYYY-MM, ex: 2026-07"),
    tipo: Optional[str] = Query(None, description="gasto ou receita"),
    categoria_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(Transacao)
    if mes:
        ano, m = mes.split("-")
        inicio = date(int(ano), int(m), 1)
        fim = date(int(ano) + 1, 1, 1) if int(m) == 12 else date(int(ano), int(m) + 1, 1)
        query = query.where(Transacao.data >= inicio, Transacao.data < fim)
    if tipo:
        query = query.where(Transacao.tipo == tipo)
    if categoria_id:
        query = query.where(Transacao.categoria_id == categoria_id)
    return session.exec(query.order_by(Transacao.data.desc())).all()


@router.post("/", status_code=201)
def criar(transacao: Transacao, session: Session = Depends(get_session)):
    if transacao.tipo not in ("gasto", "receita"):
        raise HTTPException(422, "tipo deve ser 'gasto' ou 'receita'")
    session.add(transacao)
    session.commit()
    session.refresh(transacao)
    return transacao


@router.put("/{t_id}")
def atualizar(t_id: int, dados: Transacao, session: Session = Depends(get_session)):
    transacao = session.get(Transacao, t_id)
    if not transacao:
        raise HTTPException(404, "Transação não encontrada")
    transacao.valor = dados.valor
    transacao.tipo = dados.tipo
    transacao.descricao = dados.descricao
    transacao.data = dados.data
    transacao.categoria_id = dados.categoria_id
    session.commit()
    session.refresh(transacao)
    return transacao


@router.delete("/{t_id}", status_code=204)
def deletar(t_id: int, session: Session = Depends(get_session)):
    transacao = session.get(Transacao, t_id)
    if not transacao:
        raise HTTPException(404, "Transação não encontrada")
    session.delete(transacao)
    session.commit()