"""Modelos do banco — Fase 1 (MVP).

Duas decisões de design importantes pra você estudar:

1. O saldo de uma conta NÃO é armazenado como um número que a gente atualiza.
   Guardamos o `initial_balance` e o saldo atual é sempre CALCULADO:
       saldo = initial_balance + soma(receitas) - soma(despesas)
   Isso elimina uma classe inteira de bugs de "saldo dessincronizado".
   (Trade-off: custo de query. Pra uso pessoal, irrelevante.)

2. Valores monetários são armazenados em CENTAVOS (int), nunca float.
   Float causa erros de arredondamento (0.1 + 0.2 != 0.30000000000000004).
   R$ 82,40 => 8240. A conversão pra exibição é responsabilidade do frontend.
"""
from datetime import date, datetime
from datetime import date as date_type  # alias pra campos CHAMADOS "date" (ver GoalDeposit)
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class AccountType(str, Enum):
    checking = "checking"      # conta corrente
    wallet = "wallet"          # carteira digital
    savings = "savings"        # poupança
    investment = "investment"  # investimento
    cash = "cash"              # dinheiro físico


class TransactionType(str, Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------
class AccountBase(SQLModel):
    name: str
    type: AccountType = AccountType.checking
    initial_balance: int = 0  # em centavos
    color: str = "#7C5CFF"
    icon: str = "landmark"    # nome do ícone Lucide


class Account(AccountBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)

    transactions: list["Transaction"] = Relationship(
        back_populates="account",
        # só as transações onde a conta é ORIGEM (ver Transaction.to_account)
        sa_relationship_kwargs={"foreign_keys": "[Transaction.account_id]"},
    )


class AccountCreate(AccountBase):
    pass


class AccountUpdate(SQLModel):
    """PATCH parcial: tudo opcional. Create exige os campos obrigatórios;
    Update não pode exigir nada — o cliente manda SÓ o que quer mudar,
    e o exclude_unset no router ignora o que não veio."""
    name: Optional[str] = None
    type: Optional[AccountType] = None
    initial_balance: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountRead(AccountBase):
    id: int
    balance: int  # calculado na hora, não vem do banco
    # última movimentação (pro card de conta) — também calculado no read
    last_tx_description: Optional[str] = None
    last_tx_date: Optional[date] = None


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------
class CategoryBase(SQLModel):
    name: str
    icon: str = "tag"
    color: str = "#7C5CFF"
    monthly_limit: Optional[int] = None  # centavos; None = sem limite
    parent_id: Optional[int] = Field(default=None, foreign_key="category.id")


class Category(CategoryBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    transactions: list["Transaction"] = Relationship(back_populates="category")
    # Relacionamento AUTO-REFERENCIAL: a tabela aponta pra ela mesma.
    # remote_side diz ao SQLAlchemy qual lado é a "mãe" (senão ele não sabe
    # distinguir os dois lados de uma FK que liga a tabela a si própria).
    parent: Optional["Category"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={"remote_side": "Category.id"},
    )
    children: list["Category"] = Relationship(back_populates="parent")


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(SQLModel):
    """PATCH parcial (ver AccountUpdate). Detalhe: monthly_limit=null
    enviado EXPLICITAMENTE remove o limite — exclude_unset distingue
    "não mandou o campo" de "mandou null"."""
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    monthly_limit: Optional[int] = None
    parent_id: Optional[int] = None


class CategoryRead(CategoryBase):
    id: int
    # quanto já foi gasto nessa categoria NO MÊS ATUAL (centavos).
    # Calculado no read — dá vida ao monthly_limit já na listagem.
    spent_this_month: int = 0


# ---------------------------------------------------------------------------
# Card (cartão de crédito)
# ---------------------------------------------------------------------------
class CardBase(SQLModel):
    """Cartão de crédito. A "fatura" NÃO é uma tabela — é um RECORTE no tempo:
    o ciclo entre dois fechamentos. Compras no cartão são Transactions com
    card_id (e SEM account_id: viram dívida, não saem de conta nenhuma).
    Pagar a fatura é um transfer conta → cartão.

    closing_day/due_day limitados a 1–28: evita o inferno de "dia 31 em
    fevereiro" na regra de negócio (bancos reais fazem o mesmo clamp).
    """
    name: str
    limit_amount: int               # centavos
    closing_day: int = Field(ge=1, le=28)   # dia do fechamento
    due_day: int = Field(ge=1, le=28)       # dia do vencimento
    color: str = "#7C5CFF"


class Card(CardBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)

    transactions: list["Transaction"] = Relationship(back_populates="card")


class CardCreate(CardBase):
    pass


class CardUpdate(SQLModel):
    name: Optional[str] = None
    limit_amount: Optional[int] = None
    closing_day: Optional[int] = Field(default=None, ge=1, le=28)
    due_day: Optional[int] = Field(default=None, ge=1, le=28)
    color: Optional[str] = None


class CardRead(CardBase):
    id: int
    # tudo calculado na hora (regra do saldo-nunca-armazenado, de novo):
    debt_total: int = 0             # tudo que deve (compras − pagamentos)
    open_invoice_total: int = 0     # fatura em aberto (ciclo atual)
    available: int = 0              # limit − debt_total
    next_closing: Optional[date] = None
    next_due: Optional[date] = None
    best_buy_day: int = 0           # dia seguinte ao fechamento


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------
class TransactionBase(SQLModel):
    description: str
    amount: int  # centavos, SEMPRE positivo; o sinal vem do `type`
    type: TransactionType
    date: date
    # Conta OU cartão (exatamente um, para despesas — validado no router):
    # compra no cartão não sai de conta nenhuma, vira dívida do cartão.
    account_id: Optional[int] = Field(default=None, foreign_key="account.id")
    card_id: Optional[int] = Field(default=None, foreign_key="card.id")
    # Transferência conta→conta: account_id = origem, to_account_id = destino.
    # Transfer com card_id continua sendo pagamento de fatura (exclusivos).
    to_account_id: Optional[int] = Field(default=None, foreign_key="account.id")
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    notes: Optional[str] = None
    is_recurring: bool = False
    # Parcelamento: "3/10" = installment_number=3, installment_total=10.
    # Cada parcela é uma Transaction própria, com data no seu ciclo.
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None


class Transaction(TransactionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)

    # DUAS FKs pra account (origem e destino) → o SQLAlchemy não adivinha
    # qual coluna cada relationship usa; foreign_keys desambigua.
    account: Optional[Account] = Relationship(
        back_populates="transactions",
        sa_relationship_kwargs={"foreign_keys": "[Transaction.account_id]"},
    )
    to_account: Optional[Account] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Transaction.to_account_id]"},
    )
    card: Optional["Card"] = Relationship(back_populates="transactions")
    category: Optional[Category] = Relationship(back_populates="transactions")


class TransactionCreate(TransactionBase):
    # Campo SÓ de request (não existe na tabela): "parcele em N vezes".
    # O router explode isso em N Transactions — o banco nunca vê "installments".
    installments: Optional[int] = Field(default=None, ge=1, le=48)


class TransactionUpdate(SQLModel):
    """PATCH parcial (ver AccountUpdate)."""
    description: Optional[str] = None
    amount: Optional[int] = None
    type: Optional[TransactionType] = None
    # date_type, não date: com "= None", o nome `date` vira atributo da classe
    # e a annotation resolveria pra ele (None) em vez do tipo → só aceitaria None
    date: Optional[date_type] = None
    notes: Optional[str] = None
    is_recurring: Optional[bool] = None
    account_id: Optional[int] = None
    card_id: Optional[int] = None
    to_account_id: Optional[int] = None
    category_id: Optional[int] = None


class TransactionRead(TransactionBase):
    """O que a API devolve: a transação + campos "achatados" da categoria/conta.

    Isso evita que o frontend precise fazer N requests extras pra montar a
    lista de transações (padrão: denormalizar no read model).
    """
    id: int
    category_name: Optional[str] = None
    # se a categoria for subcategoria, o nome da mãe vem junto —
    # a UI mostra "Delivery (Alimentação)" sem request extra
    category_parent_name: Optional[str] = None
    category_icon: Optional[str] = None
    category_color: Optional[str] = None
    account_name: Optional[str] = None
    card_name: Optional[str] = None
    to_account_name: Optional[str] = None  # destino, se transferência


# ---------- Metas ----------

class GoalBase(SQLModel):
    """Meta de poupança: "Notebook, R$ 7.000". O progresso vem dos depósitos.

    Decisão de modelagem: depósito de meta NÃO é uma Transaction. Guardar
    dinheiro pra meta não é gasto nem receita — o dinheiro continua seu,
    só está "carimbado". Misturar com transações poluiria receitas/despesas
    e o fluxo de caixa. Entidade nova só quando o conceito é novo — e aqui é.
    """
    name: str
    target_amount: int              # centavos
    icon: str = "flag"
    color: str = "#7C5CFF"


class Goal(GoalBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)

    deposits: list["GoalDeposit"] = Relationship(
        back_populates="goal",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
        # cascade: excluir a meta LEVA os depósitos junto — eles não têm
        # sentido órfãos (compare com as 3 estratégias que você já viu:
        # RESTRICT nas contas, SET NULL nas categorias, CASCADE aqui)
    )


class GoalDeposit(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    goal_id: int = Field(foreign_key="goal.id", index=True)
    amount: int                     # centavos
    # anotação PURA de propósito: "date: date = Field(...)" estoura a colisão
    # nome-do-campo × tipo no Pydantic 2.13 (unevaluable-type-annotation).
    # Sem valor atribuído, funciona — igual ao TransactionBase. O default
    # "hoje" é aplicado no router, não no model.
    date: date
    note: Optional[str] = None

    goal: Goal = Relationship(back_populates="deposits")


class GoalCreate(GoalBase):
    pass


class GoalUpdate(SQLModel):
    name: Optional[str] = None
    target_amount: Optional[int] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class GoalRead(GoalBase):
    id: int
    saved_amount: int = 0           # calculado: soma dos depósitos
    deposit_count: int = 0


class GoalDepositCreate(SQLModel):
    amount: int
    date: Optional[date_type] = None  # mesma colisão do TransactionUpdate
    note: Optional[str] = None


# ---------- Autenticação (usuário único) ----------

class AuthCredential(SQLModel, table=True):
    """A senha do app — UMA linha só (usuário único, sem tabela de users).

    Guardamos o HASH bcrypt, nunca a senha. bcrypt embute o salt no próprio
    hash e é deliberadamente lento — força bruta offline fica cara.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.now)


class AuthSession(SQLModel, table=True):
    """Sessão server-side: o navegador guarda um token opaco (cookie HttpOnly);
    o banco guarda só o SHA-256 do token. Se o banco vazar, os hashes não
    servem pra montar um cookie válido (mesma lógica de não guardar senha).
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime
    user_agent: Optional[str] = None  # pra tela "sessões ativas" depois
