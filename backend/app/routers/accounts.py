"""CRUD de contas + cálculo de saldo."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    Account, AccountCreate, AccountUpdate, AccountRead,
    Transaction, TransactionType,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def compute_balance(session: Session, account: Account) -> int:
    """saldo = initial_balance + receitas - despesas (tudo em centavos)."""
    txs = session.exec(
        select(Transaction).where(Transaction.account_id == account.id)
    ).all()
    balance = account.initial_balance
    for tx in txs:
        if tx.type == TransactionType.income:
            balance += tx.amount
        elif tx.type == TransactionType.expense:
            balance -= tx.amount
        elif tx.type == TransactionType.transfer:
            # a conta é a ORIGEM: dinheiro sai, seja pra pagar fatura
            # (card_id) ou pra outra conta (to_account_id)
            balance -= tx.amount
    # transferências RECEBIDAS (esta conta como destino) somam
    from sqlmodel import func
    received = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.to_account_id == account.id,
            Transaction.type == TransactionType.transfer,
        )
    ).one()
    return balance + received


def to_read(session: Session, account: Account) -> AccountRead:
    # Última movimentação: 1 query com ORDER BY + LIMIT 1 — o banco faz o
    # trabalho, não o Python. Desc por data e, no empate, por id (mais recente).
    from sqlmodel import or_
    last = session.exec(
        select(Transaction)
        .where(or_(
            Transaction.account_id == account.id,
            Transaction.to_account_id == account.id,  # recebida também conta
        ))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(1)
    ).first()
    return AccountRead(
        **account.model_dump(),
        balance=compute_balance(session, account),
        last_tx_description=last.description if last else None,
        last_tx_date=last.date if last else None,
    )


@router.get("", response_model=list[AccountRead])
def list_accounts(session: Session = Depends(get_session)):
    accounts = session.exec(select(Account)).all()
    return [to_read(session, a) for a in accounts]


@router.post("", response_model=AccountRead, status_code=201)
def create_account(data: AccountCreate, session: Session = Depends(get_session)):
    account = Account.model_validate(data)
    session.add(account)
    session.commit()
    session.refresh(account)
    return to_read(session, account)


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Conta não encontrada")
    return to_read(session, account)


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int, data: AccountUpdate, session: Session = Depends(get_session)
):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Conta não encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return to_read(session, account)


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, session: Session = Depends(get_session)):
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Conta não encontrada")
    # Integridade: conta com transações não pode ser excluída — as transações
    # ficariam apontando pra um id que não existe (órfãs). 409 = Conflict.
    from sqlmodel import or_
    has_tx = session.exec(
        select(Transaction).where(or_(
            Transaction.account_id == account_id,
            Transaction.to_account_id == account_id,  # destino também referencia
        )).limit(1)
    ).first()
    if has_tx:
        raise HTTPException(
            409, "Essa conta tem transações. Mova ou exclua elas primeiro."
        )
    session.delete(account)
    session.commit()
