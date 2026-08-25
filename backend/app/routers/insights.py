"""Insights automáticos — SEM IA, como o spec pede.

Cada insight é uma REGRA sobre os dados: compara mês atual com anterior,
olha orçamentos, acha o maior gasto. A graça é que regras são explicáveis
("aumentou 42% porque R$X → R$Y") e determinísticas — o oposto de uma
caixa-preta. Pra dados estruturados como finanças, regras batem IA em
custo, latência e confiança.

Padrão de código: cada regra é uma função que devolve 0..N insights.
O endpoint só concatena. Regra nova = função nova na lista — aberto pra
extensão, fechado pra modificação (o "O" do SOLID, na prática).
"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import Account, Category, Transaction, TransactionType

router = APIRouter(prefix="/api/insights", tags=["insights"])


# ---------- helpers ----------

def month_range(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def expenses_between(session: Session, a: date, b: date) -> int:
    return session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= a, Transaction.date < b,
        )
    ).one()


def spent_by_root(session: Session, a: date, b: date) -> dict[int, int]:
    """Gasto por categoria RAIZ (filhas somam na mãe) num período."""
    cats = {c.id: c for c in session.exec(select(Category)).all()}
    rows = session.exec(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= a, Transaction.date < b,
            Transaction.category_id.is_not(None),  # noqa
        )
        .group_by(Transaction.category_id)
    ).all()
    merged: dict[int, int] = {}
    for cat_id, total in rows:
        cat = cats.get(cat_id)
        root = cat.parent_id if (cat and cat.parent_id) else cat_id
        merged[root] = merged.get(root, 0) + total
    return merged


def brl(cents: int) -> str:
    v = f"{abs(cents) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {v}"


# ---------- regras (cada uma devolve uma lista de insights) ----------

def rule_category_changes(session, today) -> list[dict]:
    """Categorias que mudaram ≥15% vs mês passado (mín. R$ 20 antes)."""
    cur_a, cur_b = month_range(today.year, today.month)
    py, pm = prev_month(today.year, today.month)
    prv_a, prv_b = month_range(py, pm)
    cur, prv = spent_by_root(session, cur_a, cur_b), spent_by_root(session, prv_a, prv_b)
    cats = {c.id: c for c in session.exec(select(Category)).all()}

    out = []
    for cat_id, prev_total in prv.items():
        if prev_total < 2000:  # base pequena gera % sem significado
            continue
        change = (cur.get(cat_id, 0) - prev_total) / prev_total * 100
        if abs(change) < 15:
            continue
        cat = cats.get(cat_id)
        if not cat:
            continue
        up = change > 0
        out.append({
            "icon": cat.icon, "color": "#EF4444" if up else "#22C55E",
            "text": f"Você gastou {abs(round(change))}% a "
                    f"{'mais' if up else 'menos'} em {cat.name}",
            "detail": f"{brl(prev_total)} → {brl(cur.get(cat_id, 0))} vs mês passado",
            "weight": abs(change),
        })
    out.sort(key=lambda i: -i["weight"])
    return out[:3]


def rule_savings(session, today) -> list[dict]:
    a, b = month_range(today.year, today.month)
    income = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.income,
            Transaction.date >= a, Transaction.date < b,
        )
    ).one()
    saved = income - expenses_between(session, a, b)
    if saved > 0:
        return [{"icon": "piggy-bank", "color": "#22C55E",
                 "text": f"Você economizou {brl(saved)} este mês",
                 "detail": "Receitas menos despesas até agora"}]
    if saved < 0:
        return [{"icon": "alert-triangle", "color": "#F59E0B",
                 "text": f"Você gastou {brl(saved)} a mais do que ganhou",
                 "detail": "Despesas acima das receitas este mês"}]
    return []


def rule_month_pace(session, today) -> list[dict]:
    """Compara o mês até HOJE com o anterior até o MESMO dia — comparar
    julho inteiro com 9 dias de agosto seria mentira estatística."""
    cur_a, _ = month_range(today.year, today.month)
    py, pm = prev_month(today.year, today.month)
    prv_a, prv_b = month_range(py, pm)
    same_day = min(today.day, (prv_b - prv_a).days)
    cur = expenses_between(session, cur_a, today.replace(day=today.day))
    prv = expenses_between(session, prv_a, date(py, pm, same_day))
    if prv < 2000:
        return []
    change = (cur - prv) / prv * 100
    if abs(change) < 5:
        return []
    cheaper = change < 0
    return [{"icon": "trending-down" if cheaper else "trending-up",
             "color": "#22C55E" if cheaper else "#F59E0B",
             "text": f"Este mês está {abs(round(change))}% mais "
                     f"{'barato' if cheaper else 'caro'} que o anterior",
             "detail": f"Até o dia {today.day} — {brl(prv)} → {brl(cur)}"}]


def rule_top_merchant(session, today) -> list[dict]:
    a, b = month_range(today.year, today.month)
    row = session.exec(
        select(Transaction.description, func.sum(Transaction.amount))
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= a, Transaction.date < b,
        )
        .group_by(Transaction.description)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(1)
    ).first()
    if not row:
        return []
    name, total = row
    return [{"icon": "crown", "color": "#7C5CFF",
             "text": f"Seu maior gasto do mês foi {name}",
             "detail": f"{brl(total)} no total"}]


def rule_budgets(session, today) -> list[dict]:
    a, b = month_range(today.year, today.month)
    spent = spent_by_root(session, a, b)
    out = []
    for c in session.exec(
        select(Category).where(Category.monthly_limit.is_not(None))  # noqa
    ).all():
        if c.parent_id is not None or not c.monthly_limit:
            continue
        pct = spent.get(c.id, 0) / c.monthly_limit * 100
        if pct >= 100:
            out.append({"icon": c.icon, "color": "#EF4444",
                        "text": f"Orçamento de {c.name} estourado ({round(pct)}%)",
                        "detail": f"{brl(spent.get(c.id, 0))} de {brl(c.monthly_limit)}",
                        "weight": pct})
        elif pct >= 80:
            out.append({"icon": c.icon, "color": "#F59E0B",
                        "text": f"Você já usou {round(pct)}% do orçamento de {c.name}",
                        "detail": f"{brl(spent.get(c.id, 0))} de {brl(c.monthly_limit)}",
                        "weight": pct})
    out.sort(key=lambda i: -i["weight"])
    return out[:2]


def rule_net_worth(session, today) -> list[dict]:
    """Patrimônio agora vs fim do mês passado (mesma lógica do histórico)."""
    base = sum(a.initial_balance for a in session.exec(select(Account)).all())
    cur_a, _ = month_range(today.year, today.month)

    def net_until(cutoff: date) -> int:
        txs = session.exec(
            select(Transaction.type, func.sum(Transaction.amount))
            .where(Transaction.date < cutoff)
            .group_by(Transaction.type)
        ).all()
        total = base
        for t, amount in txs:
            if t == TransactionType.income:
                total += amount
            elif t == TransactionType.expense:
                total -= amount
        return total

    prev = net_until(cur_a)
    now = net_until(date(today.year, today.month, today.day)) + 0
    if prev <= 0:
        return []
    change = (now - prev) / prev * 100
    if abs(change) < 1:
        return []
    up = change > 0
    return [{"icon": "line-chart", "color": "#22C55E" if up else "#EF4444",
             "text": f"Seu patrimônio {'cresceu' if up else 'caiu'} "
                     f"{abs(round(change, 1))}% este mês",
             "detail": f"{brl(prev)} → {brl(now)}"}]


RULES = [rule_budgets, rule_category_changes, rule_month_pace,
         rule_savings, rule_net_worth, rule_top_merchant]


@router.get("")
def list_insights(session: Session = Depends(get_session)):
    today = date.today()
    insights = []
    for rule in RULES:
        insights.extend(rule(session, today))
    for i in insights:
        i.pop("weight", None)
    return insights
