"""CRUD de categorias."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import (
    Category, CategoryCreate, CategoryUpdate, CategoryRead,
    Transaction, TransactionType,
)


def spent_by_category(
    session: Session, year: int | None = None, month: int | None = None
) -> dict[int, int]:
    """Gasto de UM mês agrupado por categoria — em UMA query.

    A alternativa ingênua seria 1 query por categoria (problema N+1).
    Com GROUP BY, o banco devolve tudo de uma vez:
        SELECT category_id, SUM(amount) FROM transaction
        WHERE type='expense' AND date >= <início> AND date < <fim>
        GROUP BY category_id

    year/month opcionais (default: mês atual) — a tela de Orçamentos
    navega entre meses, então o "qual mês" virou parâmetro.
    """
    today = date.today()
    year, month = year or today.year, month or today.month
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    rows = session.exec(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.category_id.is_not(None),  # noqa: E711
        )
        .group_by(Transaction.category_id)
    ).all()
    return {cat_id: total for cat_id, total in rows}

router = APIRouter(prefix="/api/categories", tags=["categories"])


def validate_parent(
    session: Session, parent_id: int | None, self_id: int | None = None
):
    """Regras da hierarquia — decisão de produto: MÁXIMO 1 nível.

    Mãe → filha, sem neta. Isso mantém roll-up, selects e UI simples
    (nenhum app de finanças pessoais precisa de árvore infinita).
    Como toda regra de integridade, mora no backend: a UI pode nem
    oferecer a opção, mas um curl direto também não pode furar.
    """
    if parent_id is None:
        return
    if self_id is not None and parent_id == self_id:
        raise HTTPException(400, "Uma categoria não pode ser mãe de si mesma.")
    parent = session.get(Category, parent_id)
    if not parent:
        raise HTTPException(400, "Categoria mãe não existe.")
    if parent.parent_id is not None:
        raise HTTPException(
            400, f'"{parent.name}" já é subcategoria — máximo de 1 nível.'
        )
    if self_id is not None:
        has_children = session.exec(
            select(Category).where(Category.parent_id == self_id).limit(1)
        ).first()
        if has_children:
            raise HTTPException(
                400, "Essa categoria tem subcategorias — não pode virar filha."
            )


@router.get("", response_model=list[CategoryRead])
def list_categories(
    year: int | None = None,
    month: int | None = None,
    session: Session = Depends(get_session),
):
    spent = spent_by_category(session, year, month)
    cats = session.exec(select(Category)).all()
    # ROLL-UP: gasto da filha soma no total da mãe. A mãe mostra
    # próprio + filhas; a filha mostra só o dela (é o "detalhamento").
    rolled = dict(spent)
    for c in cats:
        if c.parent_id is not None:
            rolled[c.parent_id] = rolled.get(c.parent_id, 0) + spent.get(c.id, 0)
    return [
        CategoryRead(
            **c.model_dump(),
            spent_this_month=(
                rolled.get(c.id, 0) if c.parent_id is None else spent.get(c.id, 0)
            ),
        )
        for c in cats
    ]


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(data: CategoryCreate, session: Session = Depends(get_session)):
    validate_parent(session, data.parent_id)
    category = Category.model_validate(data)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, data: CategoryUpdate, session: Session = Depends(get_session)
):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Categoria não encontrada")
    payload = data.model_dump(exclude_unset=True)
    if "parent_id" in payload:
        validate_parent(session, payload["parent_id"], self_id=category_id)
    for key, value in payload.items():
        setattr(category, key, value)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, session: Session = Depends(get_session)):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Categoria não encontrada")

    # Estratégia SET NULL (compare com contas, que usam RESTRICT/409):
    # transação sem categoria é um estado VÁLIDO ("Sem categoria"),
    # então excluir a categoria só desvincula — não bloqueia nem apaga nada.
    for tx in session.exec(
        select(Transaction).where(Transaction.category_id == category_id)
    ).all():
        tx.category_id = None
        session.add(tx)

    # subcategorias apontando pra ela viram categorias raiz
    for child in session.exec(
        select(Category).where(Category.parent_id == category_id)
    ).all():
        child.parent_id = None
        session.add(child)

    session.delete(category)
    session.commit()


@router.get("/{category_id}/detail")
def category_detail(
    category_id: int,
    year: int | None = None,
    month: int | None = None,
    session: Session = Depends(get_session),
):
    """Tudo que a página de detalhe precisa, em UMA resposta.

    Mesmo padrão do /dashboard/summary: o backend agrega, o front exibe.

    Novidade técnica: o histórico de 6 meses usa func.strftime pra agrupar
    por mês DENTRO do SQL (GROUP BY strftime('%Y-%m', date)) — em vez de
    trazer as transações e agrupar em Python. Quanto mais perto do dado o
    agrupamento acontece, menos bytes trafegam.
    """
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Categoria não encontrada")

    # ROLL-UP: o detalhe da mãe inclui as filhas em tudo (total, histórico,
    # estabelecimentos, transações). ids = a própria + filhas; TODA query
    # daqui pra baixo filtra com in_(ids) em vez de == id.
    child_cats = session.exec(
        select(Category).where(Category.parent_id == category_id)
    ).all()
    ids = [category_id] + [c.id for c in child_cats]

    today = date.today()
    year, month = year or today.year, month or today.month
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    prev_start = date(year - 1, 12, 1) if month == 1 else date(year, month - 1, 1)

    def total_between(a: date, b: date) -> int:
        return session.exec(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.category_id.in_(ids),  # type: ignore
                Transaction.type == TransactionType.expense,
                Transaction.date >= a,
                Transaction.date < b,
            )
        ).one()

    spent = total_between(start, end)
    prev_spent = total_between(prev_start, start)

    # % do total de despesas do mês (todas as categorias)
    all_expenses = session.exec(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
    ).one()

    # ---- histórico: 6 meses agrupados pelo próprio SQLite ----
    hist_start = start
    for _ in range(5):
        hist_start = (date(hist_start.year - 1, 12, 1) if hist_start.month == 1
                      else date(hist_start.year, hist_start.month - 1, 1))
    month_key = func.strftime("%Y-%m", Transaction.date)
    rows = session.exec(
        select(month_key, func.sum(Transaction.amount))
        .where(
            Transaction.category_id.in_(ids),  # type: ignore
            Transaction.type == TransactionType.expense,
            Transaction.date >= hist_start,
            Transaction.date < end,
        )
        .group_by(month_key)
    ).all()
    by_month = dict(rows)
    history = []
    cursor = hist_start
    while cursor < end:
        key = f"{cursor.year:04d}-{cursor.month:02d}"
        history.append({"year": cursor.year, "month": cursor.month,
                        "total": by_month.get(key, 0)})
        cursor = (date(cursor.year + 1, 1, 1) if cursor.month == 12
                  else date(cursor.year, cursor.month + 1, 1))

    # ---- top estabelecimentos do mês: GROUP BY description ----
    merchant_rows = session.exec(
        select(
            Transaction.description,
            func.sum(Transaction.amount),
            func.count(Transaction.id),  # type: ignore
        )
        .where(
            Transaction.category_id.in_(ids),  # type: ignore
            Transaction.type == TransactionType.expense,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.description)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
    ).all()
    top_merchants = [
        {"name": name, "total": total, "count": count}
        for name, total, count in merchant_rows
    ]

    # ---- subcategorias (filhas) com gasto do mês ----
    spent_map = spent_by_category(session, year, month)
    children = [
        {**c.model_dump(), "spent_this_month": spent_map.get(c.id, 0)}
        for c in child_cats
    ]

    # ---- últimas transações da categoria ----
    from .transactions import to_read as tx_to_read
    recent = [
        tx_to_read(t) for t in session.exec(
            select(Transaction)
            .where(
                Transaction.category_id.in_(ids),  # type: ignore
                Transaction.date >= start,
                Transaction.date < end,
            )
            .order_by(Transaction.date.desc(), Transaction.id.desc())  # type: ignore
            .limit(8)
        ).all()
    ]

    return {
        "category": category.model_dump(),
        "spent": spent,
        "prev_spent": prev_spent,
        "pct_of_expenses": round(spent / all_expenses * 100) if all_expenses else 0,
        "history": history,
        "top_merchants": top_merchants,
        "children": children,
        "recent": recent,
    }
