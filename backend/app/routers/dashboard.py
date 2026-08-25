"""Endpoint agregado que alimenta a tela principal.

Padrão importante: em vez do frontend fazer 5 requests e agregar,
o backend expõe UM endpoint que responde as perguntas do dashboard.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import Account, Transaction, TransactionType
from .accounts import compute_balance
from .transactions import to_read as tx_to_read

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def total_card_debt(session: Session) -> int:
    """Dívida total dos cartões: compras (até hoje) − pagamentos."""
    purchases = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.card_id.is_not(None),  # noqa: E711
            Transaction.type == TransactionType.expense,
            Transaction.date <= date.today(),
        )
    ).one()
    payments = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.card_id.is_not(None),  # noqa: E711
            Transaction.type == TransactionType.transfer,
        )
    ).one()
    return purchases - payments


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def month_totals(session: Session, year: int, month: int) -> dict:
    start, end = month_bounds(year, month)
    txs = session.exec(
        select(Transaction).where(Transaction.date >= start, Transaction.date < end)
    ).all()
    income = sum(t.amount for t in txs if t.type == TransactionType.income)
    expense = sum(t.amount for t in txs if t.type == TransactionType.expense)
    return {"income": income, "expense": expense, "savings": income - expense}


def pct_change(current: int, previous: int) -> Optional[float]:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


@router.get("/summary")
def summary(
    year: Optional[int] = None,
    month: Optional[int] = None,
    session: Session = Depends(get_session),
):
    today = date.today()
    year = year or today.year
    month = month or today.month

    # Patrimônio = soma dos saldos das contas − dívida dos cartões.
    # A dívida entra NEGATIVA: comprou no cartão, o patrimônio já caiu
    # (regime de competência) — pagar a fatura depois não muda nada.
    accounts = session.exec(select(Account)).all()
    total_balance = sum(compute_balance(session, a) for a in accounts)
    total_balance -= total_card_debt(session)

    current = month_totals(session, year, month)
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    previous = month_totals(session, prev_year, prev_month)

    recent = session.exec(
        select(Transaction)
        .order_by(Transaction.date.desc(), Transaction.id.desc())  # type: ignore
        .limit(8)
    ).all()

    return {
        "total_balance": total_balance,
        "income": current["income"],
        "expense": current["expense"],
        "savings": current["savings"],
        "income_change_pct": pct_change(current["income"], previous["income"]),
        "expense_change_pct": pct_change(current["expense"], previous["expense"]),
        "savings_change_pct": pct_change(current["savings"], previous["savings"]),
        "recent_transactions": [tx_to_read(t).model_dump(mode="json") for t in recent],
    }


@router.get("/by-category")
def spending_by_category(
    year: Optional[int] = None,
    month: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """Gastos do mês agrupados por categoria — alimenta o donut.

    Mesma técnica anti-N+1 da tela de categorias (GROUP BY), mas aqui
    devolvendo também nome/cor/ícone prontos pro gráfico, e incluindo
    transações sem categoria como fatia "Sem categoria".
    """
    from sqlmodel import func

    from ..models import Category

    today = date.today()
    start, end = month_bounds(year or today.year, month or today.month)

    rows = session.exec(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category_id)
    ).all()

    categories = {c.id: c for c in session.exec(select(Category)).all()}
    # ROLL-UP: gasto em subcategoria conta na fatia da MÃE.
    # O donut responde "o que consome meu dinheiro" — nesse zoom,
    # Delivery É Alimentação. O detalhamento vive na página da categoria.
    merged: dict[int | None, int] = {}
    for cat_id, total in rows:
        cat = categories.get(cat_id)
        root_id = cat.parent_id if (cat and cat.parent_id is not None) else cat_id
        merged[root_id] = merged.get(root_id, 0) + total
    result = []
    for root_id, total in merged.items():
        cat = categories.get(root_id)
        result.append({
            "category_id": root_id,
            "name": cat.name if cat else "Sem categoria",
            "color": cat.color if cat else "#8B95A7",
            "icon": cat.icon if cat else "tag",
            "total": total,
        })
    # maior fatia primeiro — ordem que o donut e a legenda vão exibir
    result.sort(key=lambda r: r["total"], reverse=True)
    grand_total = sum(r["total"] for r in result)
    for r in result:
        r["pct"] = round(r["total"] / grand_total * 100) if grand_total else 0
    return {"total": grand_total, "items": result}


@router.get("/net-worth-history")
def net_worth_history(months: int = 12, session: Session = Depends(get_session)):
    """Patrimônio líquido no fim de cada um dos últimos N meses.

    Como o saldo é sempre CALCULADO (nunca armazenado), reconstruir o
    passado é trivial: patrimônio no fim do mês M = saldos iniciais +
    soma líquida de TODAS as transações com date <= fim de M.
    Se o saldo fosse armazenado, precisaríamos de snapshots históricos.

    Implementação: uma query só, varredura cumulativa em Python.
    Transações vêm ordenadas por data; um ponteiro avança por elas uma
    única vez enquanto os meses avançam (two pointers, O(n + meses)).
    """
    accounts = session.exec(select(Account)).all()
    base = sum(a.initial_balance for a in accounts)

    txs = session.exec(
        select(Transaction).order_by(Transaction.date)  # type: ignore
    ).all()

    today = date.today()
    points = []
    running = base
    tx_index = 0
    # gera os N meses do mais antigo pro mais recente
    for offset in range(months - 1, -1, -1):
        y, m = today.year, today.month - offset
        while m <= 0:
            y, m = y - 1, m + 12
        _, month_end_exclusive = month_bounds(y, m)
        # avança o ponteiro consumindo transações até o fim desse mês
        while tx_index < len(txs) and txs[tx_index].date < month_end_exclusive:
            t = txs[tx_index]
            if t.type == TransactionType.income:
                running += t.amount
            elif t.type == TransactionType.expense:
                # vale pra conta E cartão: compra no cartão já derruba o
                # patrimônio na hora (é dívida). O pagamento da fatura é
                # transfer → cai no else implícito e não altera nada:
                # conta ↓ e dívida ↓ se cancelam. Contabilidade fechada.
                running -= t.amount
            tx_index += 1
        points.append({"year": y, "month": m, "balance": running})
    return points


def add_month(d: date) -> date:
    """Soma 1 mês com clamp de fim de mês: 31/Jan + 1 mês = 28/Fev (não 03/Mar).

    O caso 29/30/31 é o clássico que quebra código de datas ingênuo —
    calendar.monthrange devolve quantos dias o mês destino tem.
    """
    import calendar

    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


@router.get("/upcoming-bills")
def upcoming_bills(session: Session = Depends(get_session)):
    """Próximas contas a pagar, PREVISTAS a partir das recorrências.

    Não existe tabela de "contas futuras": a previsão deriva dos dados.
    Regra: para cada despesa marcada como recorrente, pega a ocorrência
    mais recente (agrupando por descrição) e projeta a próxima pra
    +1 mês. Se a projeção já passou e você ainda não registrou, ela
    aparece como pendente (overdue=True) — o app te lembra, não cobra.
    """
    from ..models import Category

    rows = session.exec(
        select(Transaction)
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.is_recurring == True,  # noqa: E712
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())  # type: ignore
    ).all()

    # mais recente por descrição: como a lista vem ordenada desc,
    # a primeira vez que uma descrição aparece É a mais recente
    latest: dict[str, Transaction] = {}
    for tx in rows:
        key = tx.description.strip().lower()
        if key not in latest:
            latest[key] = tx

    categories = {c.id: c for c in session.exec(select(Category)).all()}
    today = date.today()
    horizon = today + timedelta(days=40)

    bills = []
    for tx in latest.values():
        due = add_month(tx.date)
        # projeção muito antiga (recorrência abandonada há meses) não entra
        if due < today - timedelta(days=14) or due > horizon:
            continue
        cat = categories.get(tx.category_id) if tx.category_id else None
        bills.append({
            "description": tx.description,
            "amount": tx.amount,
            "due_date": due.isoformat(),
            "overdue": due < today,
            "category_name": cat.name if cat else None,
            "category_icon": cat.icon if cat else "tag",
            "category_color": cat.color if cat else "#8B95A7",
        })
    bills.sort(key=lambda b: b["due_date"])
    return bills


@router.get("/calendar")
def calendar_month(
    year: int,
    month: int,
    session: Session = Depends(get_session),
):
    """Agregado POR DIA de um mês — alimenta a grade do calendário.

    GROUP BY date direto: cada dia vira {income, expense, count}.
    O front NÃO recebe as transações aqui — só os totais. Quando o
    usuário clica num dia, aí sim a tela busca /transactions?start&end
    daquele dia. Carregar leve primeiro, detalhar sob demanda.
    """
    start, end = month_bounds(year, month)
    rows = session.exec(
        select(
            Transaction.date,
            Transaction.type,
            func.sum(Transaction.amount),
            func.count(Transaction.id),  # type: ignore
        )
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(Transaction.date, Transaction.type)
    ).all()

    days: dict[str, dict] = {}
    for d, tx_type, total, count in rows:
        key = d.isoformat()
        day = days.setdefault(key, {"date": key, "income": 0, "expense": 0, "count": 0})
        if tx_type == TransactionType.income:
            day["income"] += total
        elif tx_type == TransactionType.expense:
            day["expense"] += total
        day["count"] += count
    return sorted(days.values(), key=lambda d: d["date"])
