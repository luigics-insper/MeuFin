"""Autenticação de usuário único: senha → sessão em cookie HttpOnly.

Conceitos de segurança aplicados aqui (bom material de estudo):

1. bcrypt pro hash da senha — lento de propósito, salt embutido.
2. Token de sessão opaco (32 bytes de secrets) — o banco guarda só o
   SHA-256; o cookie é HttpOnly (JS não lê → XSS não rouba a sessão).
3. SameSite=Lax — outros sites não conseguem disparar POSTs autenticados
   (mitiga CSRF sem precisar de token extra num app de origem única).
4. Rate limit no login — 5 erros → 15 min de bloqueio por IP. Sem isso,
   força bruta online é trivial (teste com Hydra depois do deploy!).
5. Comparações em tempo constante ficam por conta do bcrypt.checkpw.
"""
import hashlib
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session, SQLModel, select

from ..database import get_session
from ..models import AuthCredential, AuthSession

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "meufin_session"
SESSION_DAYS = 30
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60

# Rate limit em memória: {ip: (falhas, timestamp_do_bloqueio)}.
# Em memória = zera no restart. Suficiente pra 1 usuário; num app multiusuário
# de verdade isso viria de Redis pra sobreviver a restarts e múltiplos workers.
_failures: dict[str, tuple[int, float]] = {}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def _check_rate_limit(ip: str) -> None:
    count, locked_at = _failures.get(ip, (0, 0.0))
    if count >= MAX_FAILURES:
        remaining = LOCKOUT_SECONDS - (time.time() - locked_at)
        if remaining > 0:
            raise HTTPException(
                429, f"Muitas tentativas. Tente de novo em {int(remaining // 60) + 1} min."
            )
        _failures.pop(ip, None)  # bloqueio expirou: zera


def _register_failure(ip: str) -> None:
    count, _ = _failures.get(ip, (0, 0.0))
    _failures[ip] = (count + 1, time.time())


def _set_cookie(response: Response, token: str, request: Request) -> None:
    # secure=True exige HTTPS — em localhost (dev) o cookie não funcionaria.
    # Heurística: só marca secure quando a request chegou via https (deploy).
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 3600,
        httponly=True,               # JS não lê → XSS não exfiltra a sessão
        samesite="lax",              # cookie não vai em POST cross-site (CSRF)
        secure=request.url.scheme == "https",
        path="/",
    )


def _create_session(session: Session, request: Request, response: Response) -> None:
    token = secrets.token_urlsafe(32)  # CSPRNG — nunca random.random pra segredo
    session.add(AuthSession(
        token_hash=_hash_token(token),
        expires_at=datetime.now() + timedelta(days=SESSION_DAYS),
        user_agent=(request.headers.get("user-agent") or "")[:200],
    ))
    session.commit()
    _set_cookie(response, token, request)


def get_valid_session(session: Session, token: Optional[str]) -> Optional[AuthSession]:
    """Token do cookie → sessão válida (existe e não expirou) ou None."""
    if not token:
        return None
    auth = session.exec(
        select(AuthSession).where(AuthSession.token_hash == _hash_token(token))
    ).first()
    if auth and auth.expires_at > datetime.now():
        return auth
    return None


# ---------- payloads ----------

class PasswordIn(SQLModel):
    password: str


class ChangePasswordIn(SQLModel):
    current_password: str
    new_password: str


def _validate_strength(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(422, "Senha muito curta — mínimo 8 caracteres.")


def _get_credential(session: Session) -> Optional[AuthCredential]:
    return session.exec(select(AuthCredential)).first()


# ---------- endpoints ----------

@router.get("/status")
def status(request: Request, session: Session = Depends(get_session)):
    """Público: o front decide entre 'criar senha' e 'entrar' com isso."""
    return {
        "has_password": _get_credential(session) is not None,
        "authenticated": get_valid_session(
            session, request.cookies.get(COOKIE_NAME)) is not None,
    }


@router.post("/setup", status_code=201)
def setup(
    data: PasswordIn, request: Request, response: Response,
    session: Session = Depends(get_session),
):
    """Primeiro uso: cria A senha do app (e já loga). Só funciona uma vez."""
    if _get_credential(session):
        raise HTTPException(409, "Senha já configurada. Use o login.")
    _validate_strength(data.password)
    session.add(AuthCredential(
        password_hash=bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    ))
    _create_session(session, request, response)
    return {"ok": True}


@router.post("/login")
def login(
    data: PasswordIn, request: Request, response: Response,
    session: Session = Depends(get_session),
):
    ip = _client_ip(request)
    _check_rate_limit(ip)
    cred = _get_credential(session)
    if not cred:
        raise HTTPException(409, "Nenhuma senha configurada ainda.")
    if not bcrypt.checkpw(data.password.encode(), cred.password_hash.encode()):
        _register_failure(ip)
        raise HTTPException(401, "Senha incorreta.")
    _failures.pop(ip, None)
    # higiene: aproveita o login pra descartar sessões expiradas
    for s in session.exec(
        select(AuthSession).where(AuthSession.expires_at < datetime.now())
    ).all():
        session.delete(s)
    _create_session(session, request, response)
    return {"ok": True}


@router.post("/logout")
def logout(
    request: Request, response: Response, session: Session = Depends(get_session)
):
    auth = get_valid_session(session, request.cookies.get(COOKIE_NAME))
    if auth:
        session.delete(auth)   # server-side: o token morre DE VERDADE
        session.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/change-password")
def change_password(
    data: ChangePasswordIn, request: Request, response: Response,
    session: Session = Depends(get_session),
):
    cred = _get_credential(session)
    if not cred:
        raise HTTPException(409, "Nenhuma senha configurada ainda.")
    # exigir a senha atual: cookie roubado não basta pra trocar a fechadura
    if not bcrypt.checkpw(data.current_password.encode(), cred.password_hash.encode()):
        raise HTTPException(401, "Senha atual incorreta.")
    _validate_strength(data.new_password)
    cred.password_hash = bcrypt.hashpw(
        data.new_password.encode(), bcrypt.gensalt()).decode()
    session.add(cred)
    # troca de senha INVALIDA todas as sessões (menos a nova, criada abaixo) —
    # se alguém tinha um cookie roubado, ele morre aqui
    for s in session.exec(select(AuthSession)).all():
        session.delete(s)
    _create_session(session, request, response)
    return {"ok": True}
