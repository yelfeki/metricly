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
        # v0.5 — scoring algorithm builder
        """CREATE TABLE IF NOT EXISTS scoring_algorithms (
            id VARCHAR(36) PRIMARY KEY,
            survey_id VARCHAR(36) NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            factor_id VARCHAR(36) REFERENCES survey_factors(id) ON DELETE CASCADE,
            min_possible FLOAT NOT NULL,
            max_possible FLOAT NOT NULL,
            normalized_min FLOAT NOT NULL DEFAULT 0,
            normalized_max FLOAT NOT NULL DEFAULT 100,
            labels TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_scoring_algorithms_survey_id ON scoring_algorithms (survey_id)",
        "CREATE INDEX IF NOT EXISTS ix_scoring_algorithms_factor_id ON scoring_algorithms (factor_id)",
        # v0.6 — demographic questions + answers
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_demographic BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS demographic_key TEXT",
        "ALTER TABLE answers ADD COLUMN IF NOT EXISTS demographic_value TEXT",
        # v0.7 — invite tracking + role-based access
        """CREATE TABLE IF NOT EXISTS survey_invites (
            id VARCHAR(36) PRIMARY KEY,
            survey_id VARCHAR(36) NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            token VARCHAR(36) NOT NULL UNIQUE,
            invited_at TIMESTAMP WITH TIME ZONE NOT NULL,
            responded_at TIMESTAMP WITH TIME ZONE
        )""",
        "CREATE INDEX IF NOT EXISTS ix_survey_invites_survey_id ON survey_invites (survey_id)",
        "CREATE INDEX IF NOT EXISTS ix_survey_invites_token ON survey_invites (token)",
        """CREATE TABLE IF NOT EXISTS user_roles (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL UNIQUE,
            role VARCHAR(20) NOT NULL DEFAULT 'client',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_user_roles_user_id ON user_roles (user_id)",
        # v1.0 — competency framework + gap analysis
        """CREATE TABLE IF NOT EXISTS frameworks (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            role_title VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_frameworks_user_id ON frameworks (user_id)",
        """CREATE TABLE IF NOT EXISTS competencies (
            id VARCHAR(36) PRIMARY KEY,
            framework_id VARCHAR(36) NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            order_index INTEGER NOT NULL DEFAULT 0
        )""",
        "CREATE INDEX IF NOT EXISTS ix_competencies_framework_id ON competencies (framework_id)",
        """CREATE TABLE IF NOT EXISTS proficiency_levels (
            id VARCHAR(36) PRIMARY KEY,
            framework_id VARCHAR(36) NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
            level INTEGER NOT NULL,
            label VARCHAR(100) NOT NULL,
            description TEXT,
            color VARCHAR(20)
        )""",
        "CREATE INDEX IF NOT EXISTS ix_proficiency_levels_framework_id ON proficiency_levels (framework_id)",
        """CREATE TABLE IF NOT EXISTS framework_surveys (
            id VARCHAR(36) PRIMARY KEY,
            framework_id VARCHAR(36) NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
            survey_id VARCHAR(36) NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            competency_id VARCHAR(36) NOT NULL REFERENCES competencies(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS ix_framework_surveys_framework_id ON framework_surveys (framework_id)",
        "CREATE INDEX IF NOT EXISTS ix_framework_surveys_competency_id ON framework_surveys (competency_id)",
        """CREATE TABLE IF NOT EXISTS employee_profiles (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36),
            framework_id VARCHAR(36) NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            department VARCHAR(255),
            role_title VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_employee_profiles_framework_id ON employee_profiles (framework_id)",
        "CREATE INDEX IF NOT EXISTS ix_employee_profiles_user_id ON employee_profiles (user_id)",
        """CREATE TABLE IF NOT EXISTS competency_scores (
            id VARCHAR(36) PRIMARY KEY,
            employee_profile_id VARCHAR(36) NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            competency_id VARCHAR(36) NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
            survey_response_id VARCHAR(36),
            normalized_score FLOAT NOT NULL,
            proficiency_level INTEGER,
            assessed_at TIMESTAMP WITH TIME ZONE NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_competency_scores_employee_id ON competency_scores (employee_profile_id)",
        "CREATE INDEX IF NOT EXISTS ix_competency_scores_competency_id ON competency_scores (competency_id)",
    ]
    for stmt in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass  # already applied or not applicable
