"""
JWT validation for Supabase-issued access tokens.

Supabase signs JWTs with ES256 (ECDSA P-256). The public key is published
at the project's JWKS endpoint and looked up by the kid in the token header.
The JWKS is fetched once on first use and cached in memory for the process
lifetime (keys rotate rarely; restart the server if a new key is deployed).
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import settings

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JWKS cache  (kid → public key object)
# ---------------------------------------------------------------------------

_key_cache: dict[str, Any] = {}


async def _fetch_jwks() -> None:
    """Download the JWKS and populate _key_cache for every key found."""
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    log.info("JWKS: fetching %s", url)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    for key_data in resp.json().get("keys", []):
        kid = key_data.get("kid")
        kty = key_data.get("kty")
        if not kid or not kty:
            continue
        try:
            if kty == "EC":
                pub = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key_data))
            elif kty == "RSA":
                pub = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
            else:
                log.warning("JWKS: unsupported kty=%s kid=%s", kty, kid)
                continue
            _key_cache[kid] = pub
            log.info("JWKS: cached kid=%s alg=%s", kid, key_data.get("alg"))
        except Exception as exc:
            log.error("JWKS: failed to parse key kid=%s: %s", kid, exc)


async def _get_public_key(kid: str) -> Any:
    """Return the cached public key for kid, fetching JWKS if necessary."""
    if kid not in _key_cache:
        await _fetch_jwks()
    if kid not in _key_cache:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"No public key found for kid={kid!r}. "
                   "If this key is new, restart the server to refresh the JWKS cache.",
        )
    return _key_cache[kid]


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


@dataclass
class AuthUser:
    user_id: str        # Supabase auth.users UUID
    email: str | None = None


async def _decode(token: str) -> AuthUser:
    # ── 1. Read the kid from the unverified header ───────────────────────────
    try:
        header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as exc:
        log.warning("AUTH fail: malformed token header — %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token: {exc}",
        )

    kid = header.get("kid", "")
    alg = header.get("alg", "")
    log.debug("AUTH attempt: alg=%s kid=%s", alg, kid)

    # ── 2. Look up the matching public key ───────────────────────────────────
    public_key = await _get_public_key(kid)

    # ── 3. Verify signature + standard claims ───────────────────────────────
    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["ES256", "RS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        )
    except jwt.DecodeError as exc:
        log.warning("AUTH fail: DecodeError — %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token decode error: {exc}",
        )
    except jwt.InvalidTokenError as exc:
        log.warning("AUTH fail: %s — %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token invalid ({type(exc).__name__}): {exc}",
        )

    # ── 4. Confirm this is an authenticated-user token (not anon/service) ───
    role = payload.get("role")
    if role != "authenticated":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token role check failed: expected 'authenticated', got {role!r}",
        )

    log.debug("AUTH ok: sub=%s email=%s", payload.get("sub"), payload.get("email"))
    return AuthUser(user_id=payload["sub"], email=payload.get("email"))


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
    return await _decode(authorization.removeprefix("Bearer ").strip())


async def optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> Optional[AuthUser]:
    """FastAPI dependency — returns None instead of raising when no token is present."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await _decode(authorization.removeprefix("Bearer ").strip())
    except HTTPException:
        return None
