"""Conexão com o banco (SQLite via SQLModel).

SQLite = zero infra. O arquivo meufin.db é criado na pasta backend/.
Para resetar o banco durante o dev, basta apagar o arquivo e rodar o seed de novo.
"""
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = "sqlite:///./meufin.db"

# check_same_thread=False é necessário porque o FastAPI usa threads
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def migrate(engine) -> None:
    """Migração de schema — necessária porque create_all só CRIA tabelas
    que faltam; ele nunca ALTERA uma tabela existente.

    A Fase 3 (cartões) mudou a tabela transaction: colunas novas (card_id,
    installment_*) E account_id deixou de ser NOT NULL. SQLite não sabe
    relaxar NOT NULL com ALTER TABLE — o jeito oficial (docs do SQLite) é
    o REBUILD: renomeia a antiga → create_all cria a nova → copia os dados
    → dropa a antiga. Colunas novas ficam NULL nas linhas copiadas.

    Em produção isso seria um Alembic da vida; a mecânica por baixo é
    exatamente esta.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "transaction" not in inspector.get_table_names():
        return  # banco novo: create_all resolve sozinho
    cols = {c["name"] for c in inspector.get_columns("transaction")}

    # Migração 2 (transferências): coluna nova NULLABLE → ADD COLUMN direto,
    # sem precisar do rebuild (SQLite só exige rebuild pra mudar constraint)
    if "to_account_id" not in cols:
        print("[migrate] adicionando transaction.to_account_id…")
        with engine.begin() as conn:
            conn.execute(text(
                'ALTER TABLE "transaction" '
                "ADD COLUMN to_account_id INTEGER REFERENCES account(id)"
            ))

    if "card_id" in cols:
        return  # migração 1 (cartões) já feita

    # garante que a metadata conhece TODAS as tabelas: quem popula
    # SQLModel.metadata é o import de models — sem isso, create_all cria
    # nada e a migração quebraria no meio (aprendido em teste!)
    from . import models  # noqa: F401

    print("[migrate] atualizando tabela transaction (cartões)…")
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "transaction" RENAME TO transaction_old'))
    try:
        SQLModel.metadata.create_all(engine)  # cria a transaction nova (e card)
        if "transaction" not in inspect(engine).get_table_names():
            raise RuntimeError("create_all não criou a tabela transaction")
        shared = ", ".join(sorted(cols))      # só as colunas que existiam antes
        with engine.begin() as conn:
            conn.execute(text(
                f'INSERT INTO "transaction" ({shared}) '
                f"SELECT {shared} FROM transaction_old"
            ))
            conn.execute(text("DROP TABLE transaction_old"))
    except Exception:
        # PLANO B: migração falhou no meio → desfaz o rename pra devolver
        # o banco ao estado original. Migração nunca pode deixar o banco
        # num estado intermediário — ou completa, ou intacto.
        with engine.begin() as conn:
            names = inspect(engine).get_table_names()
            if "transaction" not in names and "transaction_old" in names:
                conn.execute(text(
                    'ALTER TABLE transaction_old RENAME TO "transaction"'
                ))
        raise
    print("[migrate] ok")


def create_db_and_tables() -> None:
    migrate(engine)
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency do FastAPI: abre uma sessão por request e fecha no final."""
    with Session(engine) as session:
        yield session
