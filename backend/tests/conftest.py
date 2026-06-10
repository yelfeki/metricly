"""Shared fixtures for DB-backed integration tests.

Provides:
  - `db_session`: an in-memory aiosqlite session, fresh per test
  - `client`:    an httpx AsyncClient against the FastAPI app, with `get_db`
                 and `require_user` overridden so endpoints can be exercised
                 without hitting Supabase or requiring real JWTs.

`client` defaults to acting as user 'user-alpha'. Use `client.set_user(uid)`
mid-test to switch identity (for visibility tests that need to act as a
second org).

The existing stateless tests (test_omega.py, test_reliability.py, etc.) use
`TestClient(app)` directly and do not need these fixtures — they remain
unchanged. These fixtures are additive.
"""

from __future__ import annotations

from typing import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.auth import AuthUser, require_user
from app.core.database import Base, get_db
from app.main import app  # importing also registers all ORM models with Base


# ---------------------------------------------------------------------------
# In-memory aiosqlite DB — fresh per test for clean isolation
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def test_engine():
    """Fresh in-memory SQLite engine + schema per test (fast: ~50ms)."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncIterator[AsyncSession]:
    Session = async_sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with Session() as session:
        yield session


# ---------------------------------------------------------------------------
# FastAPI client with overridden auth + DB
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session) -> AsyncIterator[AsyncClient]:
    """HTTP client acting as 'user-alpha' by default.

    Call `client.set_user(uid)` mid-test to switch the authenticated identity.
    """
    current = {"user_id": "user-alpha"}

    async def _override_db():
        yield db_session

    def _override_user() -> AuthUser:
        return AuthUser(
            user_id=current["user_id"],
            email=f"{current['user_id']}@test.local",
        )

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[require_user] = _override_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Attach a set_user helper so tests can flip identity without
        # rebuilding the client (the override closure reads `current`).
        ac.set_user = lambda uid: current.update(user_id=uid)  # type: ignore[attr-defined]
        yield ac

    app.dependency_overrides.clear()
