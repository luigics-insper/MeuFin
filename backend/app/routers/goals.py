"""CRUD de metas + depósitos."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from ..database import get_session
from ..models import (
    Goal, GoalCreate, GoalDeposit, GoalDepositCreate, GoalRead, GoalUpdate,
)

router = APIRouter(prefix="/api/goals", tags=["goals"])


def saved_by_goal(session: Session) -> dict[int, tuple[int, int]]:
    """{goal_id: (total_depositado, qtd_depósitos)} — uma query, GROUP BY.

    Mesmo anti-N+1 de sempre: a listagem de metas precisa do progresso
    de todas, então o banco agrega tudo de uma vez.
    """
    rows = session.exec(
        select(
            GoalDeposit.goal_id,
            func.coalesce(func.sum(GoalDeposit.amount), 0),
            func.count(GoalDeposit.id),  # type: ignore
        ).group_by(GoalDeposit.goal_id)
    ).all()
    return {goal_id: (total, count) for goal_id, total, count in rows}


def to_read(goal: Goal, saved: tuple[int, int]) -> GoalRead:
    total, count = saved
    return GoalRead(**goal.model_dump(), saved_amount=total, deposit_count=count)


@router.get("", response_model=list[GoalRead])
def list_goals(session: Session = Depends(get_session)):
    saved = saved_by_goal(session)
    return [
        to_read(g, saved.get(g.id, (0, 0)))
        for g in session.exec(select(Goal)).all()
    ]


@router.post("", response_model=GoalRead, status_code=201)
def create_goal(data: GoalCreate, session: Session = Depends(get_session)):
    if data.target_amount <= 0:
        raise HTTPException(400, "A meta precisa de um valor alvo positivo.")
    goal = Goal.model_validate(data)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return to_read(goal, (0, 0))


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal(
    goal_id: int, data: GoalUpdate, session: Session = Depends(get_session)
):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Meta não encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, key, value)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return to_read(goal, saved_by_goal(session).get(goal_id, (0, 0)))


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, session: Session = Depends(get_session)):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Meta não encontrada")
    # cascade no relacionamento: os depósitos vão junto (3ª estratégia
    # de exclusão do app — RESTRICT em contas, SET NULL em categorias,
    # CASCADE aqui, porque depósito órfão não significa nada)
    session.delete(goal)
    session.commit()


# ---------- depósitos ----------

@router.get("/{goal_id}/deposits", response_model=list[GoalDeposit])
def list_deposits(goal_id: int, session: Session = Depends(get_session)):
    if not session.get(Goal, goal_id):
        raise HTTPException(404, "Meta não encontrada")
    return session.exec(
        select(GoalDeposit)
        .where(GoalDeposit.goal_id == goal_id)
        .order_by(GoalDeposit.date.desc(), GoalDeposit.id.desc())  # type: ignore
    ).all()


@router.post("/{goal_id}/deposits", response_model=GoalDeposit, status_code=201)
def create_deposit(
    goal_id: int, data: GoalDepositCreate, session: Session = Depends(get_session)
):
    if not session.get(Goal, goal_id):
        raise HTTPException(404, "Meta não encontrada")
    if data.amount == 0:
        raise HTTPException(400, "Depósito não pode ser zero.")
    # valor NEGATIVO é permitido de propósito: é "retirar da meta"
    # (mudou de ideia, precisou do dinheiro). O progresso é a soma.
    deposit = GoalDeposit(
        goal_id=goal_id,
        amount=data.amount,
        date=data.date or date.today(),  # default "hoje" mora aqui (ver models)
        note=data.note,
    )
    session.add(deposit)
    session.commit()
    session.refresh(deposit)
    return deposit


@router.delete("/{goal_id}/deposits/{deposit_id}", status_code=204)
def delete_deposit(
    goal_id: int, deposit_id: int, session: Session = Depends(get_session)
):
    deposit = session.get(GoalDeposit, deposit_id)
    if not deposit or deposit.goal_id != goal_id:
        raise HTTPException(404, "Depósito não encontrado")
    session.delete(deposit)
    session.commit()
