"""CRUD de transações com filtros (o coração do app)."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Card,
    Category, Account,
    Transaction, TransactionCreate, TransactionUpdate, TransactionRead, TransactionType,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

def _add_month(d: date) -> date:
    import calendar
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def validate_payment_source(session: Session, data) -> None:
    """Regras de origem do dinheiro — a tabela-verdade do modelo:

        despesa  → conta XOR cartão (exatamente um)
        receita  → conta obrigatória, cartão proibido
        transfer → conta de origem + destino XOR cartão
                   (destino = outra conta; cartão = pagamento de fatura)
    """
    has_acc = data.account_id is not None
    has_card = getattr(data, "card_id", None) is not None
    has_dest = getattr(data, "to_account_id", None) is not None
    if data.type == TransactionType.expense:
        if has_acc == has_card:  # os dois ou nenhum
            raise HTTPException(
                422, "Despesa precisa de conta OU cartão (exatamente um)."
            )
        if has_dest:
            raise HTTPException(422, "Despesa não tem conta de destino.")
    elif data.type == TransactionType.income:
        if not has_acc or has_card or has_dest:
            raise HTTPException(422, "Receita entra numa conta, não em cartão.")
    else:  # transfer
        if not has_acc:
            raise HTTPException(422, "Transferência precisa da conta de origem.")
        if has_dest == has_card:  # os dois ou nenhum
            raise HTTPException(
                422, "Transferência precisa de destino: outra conta OU cartão."
            )
        if has_dest and data.to_account_id == data.account_id:
            raise HTTPException(422, "Origem e destino não podem ser a mesma conta.")
    if has_acc and not session.get(Account, data.account_id):
        raise HTTPException(422, "account_id inválido")
    if has_dest and not session.get(Account, data.to_account_id):
        raise HTTPException(422, "to_account_id inválido")
    if has_card and not session.get(Card, data.card_id):
        raise HTTPException(422, "card_id inválido")


def to_read(tx: Transaction) -> TransactionRead:
    return TransactionRead(
        **tx.model_dump(),
        category_name=tx.category.name if tx.category else None,
        category_parent_name=(
            tx.category.parent.name
            if tx.category and tx.category.parent_id is not None
            else None
        ),
        category_icon=tx.category.icon if tx.category else None,
        category_color=tx.category.color if tx.category else None,
        account_name=tx.account.name if tx.account else None,
        card_name=tx.card.name if tx.card else None,
        to_account_name=tx.to_account.name if tx.to_account else None,
    )


@router.get("", response_model=list[TransactionRead])
def list_transactions(
    session: Session = Depends(get_session),
    # Filtros — todos opcionais, combináveis
    start: Optional[date] = None,
    end: Optional[date] = None,
    category_id: Optional[int] = None,
    account_id: Optional[int] = None,
    card_id: Optional[int] = None,
    type: Optional[TransactionType] = None,
    recurring: Optional[bool] = None,
    q: Optional[str] = Query(None, description="busca na descrição"),
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    stmt = select(Transaction)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if account_id:
        # filtro por conta pega origem E destino: transferência recebida
        # também é movimentação daquela conta
        from sqlmodel import or_
        stmt = stmt.where(or_(
            Transaction.account_id == account_id,
            Transaction.to_account_id == account_id,
        ))
    if type:
        stmt = stmt.where(Transaction.type == type)
    if recurring is not None:
        stmt = stmt.where(Transaction.is_recurring == recurring)
    if q:
        stmt = stmt.where(Transaction.description.contains(q))  # type: ignore
    stmt = (
        stmt.order_by(Transaction.date.desc(), Transaction.id.desc())  # type: ignore
        .limit(limit)
        .offset(offset)
    )
    return [to_read(tx) for tx in session.exec(stmt).all()]


@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(
    data: TransactionCreate, session: Session = Depends(get_session)
):
    if data.amount <= 0:
        raise HTTPException(422, "amount deve ser positivo (em centavos)")
    validate_payment_source(session, data)
    if data.category_id and not session.get(Category, data.category_id):
        raise HTTPException(422, "category_id inválido")

    n = data.installments or 1
    payload = data.model_dump(exclude={"installments"})

    if n == 1:
        tx = Transaction(**payload)
        session.add(tx)
        session.commit()
        session.refresh(tx)
        return to_read(tx)

    # ---- PARCELAMENTO: o request diz "900 em 3x"; o banco recebe ----
    # ---- 3 Transactions de 300, uma por ciclo (datas +1 mês).      ----
    if not data.card_id:
        raise HTTPException(422, "Parcelamento só em compras no cartão.")
    total = payload["amount"]
    base = total // n
    first_tx = None
    tx_date = payload["date"]
    for i in range(1, n + 1):
        # arredondamento: a 1ª parcela absorve a sobra (300+300+300 ✓;
        # 1000 em 3x = 334+333+333, soma bate com o total SEMPRE)
        amount_i = base + (total - base * n) if i == 1 else base
        tx = Transaction(**{
            **payload,
            "amount": amount_i,
            "date": tx_date,
            "installment_number": i,
            "installment_total": n,
        })
        session.add(tx)
        if i == 1:
            first_tx = tx
        tx_date = _add_month(tx_date)
    session.commit()
    session.refresh(first_tx)
    return to_read(first_tx)


@router.get("/{tx_id}", response_model=TransactionRead)
def get_transaction(tx_id: int, session: Session = Depends(get_session)):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    return to_read(tx)


@router.patch("/{tx_id}", response_model=TransactionRead)
def update_transaction(
    tx_id: int, data: TransactionUpdate, session: Session = Depends(get_session)
):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    if data.amount is not None and data.amount <= 0:
        raise HTTPException(422, "amount deve ser positivo (em centavos)")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tx, key, value)
    # valida o estado FINAL (edição também não pode violar a tabela-verdade)
    validate_payment_source(session, tx)
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return to_read(tx)


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, session: Session = Depends(get_session)):
    tx = session.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    session.delete(tx)
    session.commit()
