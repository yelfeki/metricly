"""
JWT validation for Supabase-issued access tokens.

Every protected endpoint declares `current_user: AuthUser = Depends(require_user)`.
The respond-survey endpoint uses `optional_user: AuthUser | None = Depends(optional_user_dep)`.
"""

from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import settings


@dataclass
class AuthUser:
    user_id: str   # Supabase UUID (auth.users.id)
    email: str | None = None


def _decode(token: str) -> AuthUser:
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return AuthUser(user_id=payload["sub"], email=payload.get("email"))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")


async def require_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> AuthUser:
    """FastAPI dependency — raises 401 if no valid bearer token is present."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode(authorization.removeprefix("Bearer ").strip())


async def optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> Optional[AuthUser]:
    """FastAPI dependency — returns None instead of raising when no token is present."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return _decode(authorization.removeprefix("Bearer ").strip())
    except HTTPException:
        return None
