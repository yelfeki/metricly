from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from .config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    # statement_cache_size=0 is required when using Supabase's Transaction Pooler
    # (PgBouncer in transaction mode), which does not support prepared statements.
    connect_args={"ssl": "require", "statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def run_migrations() -> None:
    """
    Idempotent schema migrations. Each ALTER runs in its own transaction so a
    no-op (column already exists) doesn't roll back the others.
    """
    migrations = [
        # v0.2 — survey builder columns
        "ALTER TABLE surveys ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) NOT NULL DEFAULT 'likert_5'",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS options TEXT",
        "ALTER TABLE answers ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE answers ALTER COLUMN score DROP NOT NULL",
        # v0.3 — per-user survey ownership (references auth.users via UUID stored as text)
        "ALTER TABLE surveys ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)",
        "CREATE INDEX IF NOT EXISTS ix_surveys_user_id ON surveys (user_id)",
        # v0.4 — psychometric scoring + factor structure
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS factor TEXT",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS reverse_scored BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS score_weight FLOAT NOT NULL DEFAULT 1.0",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_scores TEXT",
        "ALTER TABLE answers ADD COLUMN IF NOT EXISTS numeric_score FLOAT",
        """CREATE TABLE IF NOT EXISTS survey_factors (
            id VARCHAR(36) PRIMARY KEY,
            survey_id VARCHAR(36) NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT
        )""",
        "CREATE INDEX IF NOT EXISTS ix_survey_factors_survey_id ON survey_factors (survey_id)",
    ]
    for stmt in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass  # already applied or not applicable
