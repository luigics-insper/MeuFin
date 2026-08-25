"""Popula o banco com dados de exemplo (os mesmos do mockup).

Rodar (de dentro da pasta backend/):
    python -m app.seed
"""
from datetime import date, timedelta

from sqlmodel import Session, select

from .database import create_db_and_tables, engine
from .models import Account, AccountType, Category, Transaction, TransactionType


def seed():
    create_db_and_tables()
    with Session(engine) as session:
        if session.exec(select(Account)).first():
            print("Banco já tem dados — nada a fazer. (apague meufin.db pra resetar)")
            return

        # Contas
        nubank = Account(name="Nubank", type=AccountType.checking,
                         initial_balance=1_200_00, color="#8A05BE", icon="landmark")
        carteira = Account(name="Carteira", type=AccountType.cash,
                           initial_balance=80_00, color="#22C55E", icon="wallet")
        invest = Account(name="Investimentos", type=AccountType.investment,
                         initial_balance=14_400_00, color="#7C5CFF", icon="trending-up")
        session.add_all([nubank, carteira, invest])
        session.commit()

        # Categorias (cores do mockup)
        cats = {
            "Alimentação": Category(name="Alimentação", icon="utensils",
                                    color="#EF4444", monthly_limit=1_450_00),
            "Transporte": Category(name="Transporte", icon="car", color="#F97316"),
            "Casa": Category(name="Casa", icon="home", color="#EAB308"),
            "Lazer": Category(name="Lazer", icon="gamepad-2",
                              color="#3B82F6", monthly_limit=500_00),
            "Saúde": Category(name="Saúde", icon="heart-pulse", color="#22C55E"),
            "Assinaturas": Category(name="Assinaturas", icon="repeat", color="#7C5CFF"),
            "Salário": Category(name="Salário", icon="banknote", color="#22C55E"),
        }
        session.add_all(cats.values())
        session.commit()

        today = date.today()
        first = today.replace(day=1)

        txs = [
            Transaction(description="Salário", amount=5_400_00,
                        type=TransactionType.income, date=first + timedelta(days=4),
                        account_id=nubank.id, category_id=cats["Salário"].id,
                        is_recurring=True),
            Transaction(description="Aluguel", amount=1_800_00,
                        type=TransactionType.expense, date=first + timedelta(days=9),
                        account_id=nubank.id, category_id=cats["Casa"].id,
                        is_recurring=True),
            Transaction(description="Netflix", amount=39_90,
                        type=TransactionType.expense, date=first + timedelta(days=9),
                        account_id=nubank.id, category_id=cats["Assinaturas"].id,
                        is_recurring=True),
            Transaction(description="Mercado Extra", amount=82_40,
                        type=TransactionType.expense, date=today,
                        account_id=nubank.id, category_id=cats["Alimentação"].id),
            Transaction(description="Uber", amount=18_50,
                        type=TransactionType.expense, date=today,
                        account_id=nubank.id, category_id=cats["Transporte"].id),
            Transaction(description="Steam", amount=79_99,
                        type=TransactionType.expense,
                        date=today - timedelta(days=1),
                        account_id=nubank.id, category_id=cats["Lazer"].id),
            Transaction(description="iFood", amount=45_80,
                        type=TransactionType.expense,
                        date=today - timedelta(days=2),
                        account_id=nubank.id, category_id=cats["Alimentação"].id),
            Transaction(description="Academia", amount=129_90,
                        type=TransactionType.expense,
                        date=first + timedelta(days=17),
                        account_id=nubank.id, category_id=cats["Saúde"].id,
                        is_recurring=True),
        ]
        session.add_all(txs)
        session.commit()
        print(f"Seed OK: 3 contas, {len(cats)} categorias, {len(txs)} transações.")


if __name__ == "__main__":
    seed()
