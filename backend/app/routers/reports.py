"""Relatórios: agregações por período + export CSV.

O export é a parte mais importante da tela: SEUS DADOS SAEM DO APP.
Qualquer sistema que guarda dados seus deve ter uma porta de saída —
backup, Excel, imposto de renda, migração futura. Dado preso é refém.
"""
import csv
import io
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import Card, Category, Transaction, TransactionType

router = APIRouter(prefix="/api/reports", tags=["reports"])


def months_back(n: int) -> date:
    """Primeiro dia do mês, n-1 meses atrás (inclui o mês atual)."""
    today = date.today()
    y, m = today.year, today.month - (n - 1)
    while m <= 0:
        y, m = y - 1, m + 12
    return date(y, m, 1)


@router.get("/period")
def period_report(months: int = 6, session: Session = Depends(get_session)):
    """Tudo da aba Mensal em uma resposta: série mensal de receitas ×
    despesas + ranking de categorias (com roll-up) + totais do período."""
    start = months_back(months)
    # fim EXCLUSIVO = 1º dia do mês seguinte ao atual. Sem esse teto,
    # parcelas futuras (datas em meses à frente) entrariam no ranking
    # mas não na série mensal — números inconsistentes na mesma tela.
    today = date.today()
    end = (date(today.year + 1, 1, 1) if today.month == 12
           else date(today.year, today.month + 1, 1))
    month_key = func.strftime("%Y-%m", Transaction.date)

    # série mensal: um GROUP BY (mês, tipo) resolve receitas E despesas
    rows = session.exec(
        select(month_key, Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(month_key, Transaction.type)
    ).all()
    by_month: dict[str, dict] = {}
    for key, tx_type, total in rows:
        entry = by_month.setdefault(key, {"income": 0, "expense": 0})
        if tx_type == TransactionType.income:
            entry["income"] = total
        elif tx_type == TransactionType.expense:
            entry["expense"] = total

    series = []
    cursor = start
    while cursor <= today.replace(day=1):
        key = f"{cursor.year:04d}-{cursor.month:02d}"
        entry = by_month.get(key, {"income": 0, "expense": 0})
        series.append({"year": cursor.year, "month": cursor.month, **entry})
        cursor = (date(cursor.year + 1, 1, 1) if cursor.month == 12
                  else date(cursor.year, cursor.month + 1, 1))

    # ranking de categorias no período inteiro, com roll-up nas raízes
    cats = {c.id: c for c in session.exec(select(Category)).all()}
    cat_rows = session.exec(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category_id)
    ).all()
    merged: dict[int | None, int] = {}
    for cat_id, total in cat_rows:
        cat = cats.get(cat_id)
        root = cat.parent_id if (cat and cat.parent_id) else cat_id
        merged[root] = merged.get(root, 0) + total
    total_expense = sum(merged.values())
    by_category = sorted(
        (
            {
                "name": cats[k].name if k in cats else "Sem categoria",
                "color": cats[k].color if k in cats else "#8B95A7",
                "total": v,
                "pct": round(v / total_expense * 100) if total_expense else 0,
            }
            for k, v in merged.items()
        ),
        key=lambda r: -r["total"],
    )

    total_income = sum(m["income"] for m in series)
    return {
        "months": series,
        "by_category": by_category[:8],
        "totals": {
            "income": total_income,
            "expense": total_expense,
            "net": total_income - total_expense,
        },
    }


@router.get("/yearly")
def yearly_report(session: Session = Depends(get_session)):
    """Aba Anual: receitas × despesas agrupadas por ano."""
    year_key = func.strftime("%Y", Transaction.date)
    rows = session.exec(
        select(year_key, Transaction.type, func.sum(Transaction.amount))
        .group_by(year_key, Transaction.type)
    ).all()
    by_year: dict[str, dict] = {}
    for year, tx_type, total in rows:
        entry = by_year.setdefault(year, {"income": 0, "expense": 0})
        if tx_type == TransactionType.income:
            entry["income"] = total
        elif tx_type == TransactionType.expense:
            entry["expense"] = total
    return [
        {"year": int(y), **v, "net": v["income"] - v["expense"]}
        for y, v in sorted(by_year.items())
    ]


@router.get("/export.csv")
def export_csv(
    start: date | None = None,
    end: date | None = None,
    session: Session = Depends(get_session),
):
    """Exporta transações em CSV.

    Detalhes pensados pro SEU Excel (pt-BR):
    - separador ';' e decimal com vírgula — o Excel brasileiro abre direto
    - valores em reais legíveis (82,40), não em centavos: CSV é interface
      pra HUMANO/Excel; centavos-int é formato INTERNO. Na fronteira de
      exportação, converte — mesma regra do parseBRL, na outra direção.
    - StreamingResponse: o arquivo é gerado sob demanda, não fica em disco
    """
    stmt = select(Transaction).order_by(Transaction.date)  # type: ignore
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    txs = session.exec(stmt).all()

    cats = {c.id: c for c in session.exec(select(Category)).all()}
    cards = {c.id: c for c in session.exec(select(Card)).all()}
    from ..models import Account
    accounts = {a.id: a for a in session.exec(select(Account)).all()}

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([
        "data", "descricao", "tipo", "valor", "categoria", "categoria_mae",
        "conta", "cartao", "recorrente", "parcela", "notas",
    ])
    type_pt = {"income": "receita", "expense": "despesa", "transfer": "transferencia"}
    for t in txs:
        cat = cats.get(t.category_id) if t.category_id else None
        parent = cats.get(cat.parent_id) if (cat and cat.parent_id) else None
        writer.writerow([
            t.date.isoformat(),
            t.description,
            type_pt.get(t.type, t.type),
            f"{t.amount / 100:.2f}".replace(".", ","),
            cat.name if cat else "",
            parent.name if parent else "",
            accounts[t.account_id].name if t.account_id in accounts else "",
            cards[t.card_id].name if t.card_id and t.card_id in cards else "",
            "sim" if t.is_recurring else "nao",
            (f"{t.installment_number}/{t.installment_total}"
             if t.installment_total and t.installment_total > 1 else ""),
            t.notes or "",
        ])

    buf.seek(0)
    filename = f"meufin-transacoes-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
