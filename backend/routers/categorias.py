from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import Categoria

router = APIRouter(prefix="/categorias", tags=["categorias"])


@router.get("/")
def listar(session: Session = Depends(get_session)):
    return session.exec(select(Categoria)).all()


@router.post("/", status_code=201)
def criar(categoria: Categoria, session: Session = Depends(get_session)):
    session.add(categoria)
    session.commit()
    session.refresh(categoria)
    return categoria


@router.delete("/{cat_id}", status_code=204)
def deletar(cat_id: int, session: Session = Depends(get_session)):
    cat = session.get(Categoria, cat_id)
    if not cat:
        raise HTTPException(404, "Categoria não encontrada")
    session.delete(cat)
    session.commit()