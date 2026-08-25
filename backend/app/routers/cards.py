"""Cartões de crédito: CRUD + fatura (ciclo) + pagamento.

O conceito central: FATURA NÃO É TABELA — é um recorte no tempo.
A fatura "julho/2026" de um cartão que fecha dia 5 contém as compras
de 05/jun (inclusive) a 05/jul (exclusive). Dado (year, month), o ciclo
é 100% derivável de closing_day. Zero estado extra pra manter.
"""
import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import (
    Account, Card, CardCreate, CardRead, CardUpdate,
    Transaction, TransactionType,
)
from .transactions import to_read as tx_to_read

router = APIRouter(prefix="/api/cards", tags=["cards"])


# ---------- matemática do ciclo ----------

def closing_date(card: Card, year: int, month: int) -> date:
    """Data de fechamento da fatura (year, month)."""
    day = min(card.closing_day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def cycle_bounds(card: Card, year: int, month: int) -> tuple[date, date]:
    """[início, fim) do ciclo da fatura (year, month): do fechamento
    anterior até o fechamento deste mês."""
    end = closing_date(card, year, month)
    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    start = closing_date(card, py, pm)
    return start, end

def current_invoice_month(card: Card, today: date | None = None) -> tuple[int, int]:
    """(year, month) da fatura ABERTA: a primeira cujo fechamento é > hoje."""
    today = today or date.today()
    y, m = today.year, today.month
    if closing_date(card, y, m) <= today:
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return y, m


def due_date_for(card: Card, year: int, month: int) -> date:
    """Vencimento da fatura (year, month): o due_day APÓS o fechamento
    (se due_day <= closing_day, cai no mês seguinte)."""
    if card.due_day > card.closing_day:
        return date(year, month, card.due_day)
    y, m = (year + 1, 1) if month == 12 else (year, month + 1)
    return date(y, m, min(card.due_day, calendar.monthrange(y, m)[1]))


# ---------- agregações ----------

def card_sums(session: Session, card_id: int) -> tuple[int, int]:
    """(total de compras, total de pagamentos) — 2 agregações no banco.

    Dívida = compras − pagamentos. Compra = expense com card_id.
    Pagamento = transfer com card_id (dinheiro saiu da conta pro cartão).
    """
    purchases = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.card_id == card_id,
            Transaction.type == TransactionType.expense,
            Transaction.date <= date.today(),  # parcelas futuras ainda não devem
        )
    ).one()
    payments = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.card_id == card_id,
            Transaction.type == TransactionType.transfer,
        )
    ).one()
    return purchases, payments


def to_read(session: Session, card: Card) -> CardRead:
    today = date.today()
    purchases, payments = card_sums(session, card.id)
    debt = purchases - payments

    inv_y, inv_m = current_invoice_month(card, today)
    start, end = cycle_bounds(card, inv_y, inv_m)
    open_total = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.card_id == card.id,
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
    ).one()

    return CardRead(
        **card.model_dump(),
        debt_total=debt,
        open_invoice_total=open_total,
        available=card.limit_amount - debt,
        next_closing=closing_date(card, inv_y, inv_m),
        next_due=due_date_for(card, inv_y, inv_m),
        # melhor dia: logo APÓS o fechamento — a compra cai no próximo ciclo
        # e você ganha ~40 dias de prazo até o vencimento dela
        best_buy_day=(card.closing_day % 28) + 1,
    )


# ---------- CRUD ----------

@router.get("", response_model=list[CardRead])
def list_cards(session: Session = Depends(get_session)):
    return [to_read(session, c) for c in session.exec(select(Card)).all()]


@router.post("", response_model=CardRead, status_code=201)
def create_card(data: CardCreate, session: Session = Depends(get_session)):
    if data.limit_amount <= 0:
        raise HTTPException(400, "Limite precisa ser positivo.")
    card = Card.model_validate(data)
    session.add(card)
    session.commit()
    session.refresh(card)
    return to_read(session, card)


@router.patch("/{card_id}", response_model=CardRead)
def update_card(
    card_id: int, data: CardUpdate, session: Session = Depends(get_session)
):
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Cartão não encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(card, key, value)
    session.add(card)
    session.commit()
    session.refresh(card)
    return to_read(session, card)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: int, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Cartão não encontrado")
    # RESTRICT, como contas: cartão com transações não some
    has_tx = session.exec(
        select(Transaction).where(Transaction.card_id == card_id).limit(1)
    ).first()
    if has_tx:
        raise HTTPException(
            409, "Esse cartão tem transações. Exclua ou mova elas primeiro."
        )
    session.delete(card)
    session.commit()


# ---------- fatura ----------

@router.get("/{card_id}/invoice")
def invoice(
    card_id: int,
    year: int | None = None,
    month: int | None = None,
    session: Session = Depends(get_session),
):
    """Fatura (year, month) do cartão: período + transações + total.
    Sem parâmetros, devolve a fatura aberta."""
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Cartão não encontrado")
    if year is None or month is None:
        year, month = current_invoice_month(card)
    start, end = cycle_bounds(card, year, month)

    txs = session.exec(
        select(Transaction)
        .where(
            Transaction.card_id == card_id,
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())  # type: ignore
    ).all()
    total = sum(t.amount for t in txs)
    today = date.today()

    return {
        "year": year,
        "month": month,
        "period_start": start.isoformat(),
        "period_end": (end - timedelta(days=1)).isoformat(),
        "closes_at": closing_date(card, year, month).isoformat(),
        "due_at": due_date_for(card, year, month).isoformat(),
        "is_open": closing_date(card, year, month) > today,
        "total": total,
        "transactions": [tx_to_read(t) for t in txs],
    }


# ---------- pagamento ----------

@router.post("/{card_id}/pay", status_code=201)
def pay_invoice(
    card_id: int,
    payload: dict,
    session: Session = Depends(get_session),
):
    """Pagar fatura = TRANSFER da conta pro cartão.

    Por que transfer e não expense? A despesa já foi contada quando você
    COMPROU (regime de competência). Se o pagamento também fosse expense,
    cada compra contaria DUAS vezes nas suas estatísticas. Transfer não
    entra em receita/despesa — só move: conta ↓, dívida do cartão ↓,
    patrimônio líquido inalterado.
    """
    card = session.get(Card, card_id)
    if not card:
        raise HTTPException(404, "Cartão não encontrado")
    account_id = payload.get("account_id")
    amount = payload.get("amount")
    if not account_id or not session.get(Account, account_id):
        raise HTTPException(422, "account_id inválido")
    if not isinstance(amount, int) or amount <= 0:
        raise HTTPException(422, "amount deve ser positivo (centavos)")

    tx = Transaction(
        description=f"Pagamento fatura {card.name}",
        amount=amount,
        type=TransactionType.transfer,
        date=date.fromisoformat(payload["date"]) if payload.get("date") else date.today(),
        account_id=account_id,
        card_id=card_id,
    )
    session.add(tx)
    session.commit()
    session.refresh(tx)
    return tx_to_read(tx)
