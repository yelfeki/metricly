from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.reliability import router as reliability_router
from .api.omega import router as omega_router
from .api.efa import router as efa_router
from .api.dif import router as dif_router
from .api.surveys import survey_router, question_router
from .api.import_survey import import_router
from .api.users import users_router
from .api.frameworks import framework_router
from .api.employees import employee_router
from .api.library import library_router
from .api.reports import reports_router
from .api.skills_explorer import skills_explorer_router
from .api.competencies import competencies_router
from .core.auth import _fetch_jwks
from .core.database import AsyncSessionLocal, Base, engine, run_migrations
from .models import survey as _survey_models  # noqa: F401 — registers ORM metadata
from .models import framework as _framework_models  # noqa: F401 — registers ORM metadata
from .models import library as _library_models  # noqa: F401 — registers ORM metadata
from .models import report as _report_models  # noqa: F401 — registers ORM metadata
from .models import competency as _competency_models  # noqa: F401 — registers ORM metadata
from .services.library_seed import seed_library
from .services.competency_seed import seed_competency_frameworks
from .services.instrument_competency_mapper import seed_instrument_competency_mappings
from .services.industry_library_seed import seed_industry_library


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Apply incremental schema migrations (idempotent, safe to re-run)
    await run_migrations()
    # 2. Create any tables that don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 3. Pre-warm the JWKS cache so the first authenticated request is fast
    try:
        await _fetch_jwks()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("JWKS pre-fetch failed (will retry on first request): %s", exc)
    # 4. Seed the assessment library (idempotent)
    try:
        async with AsyncSessionLocal() as session:
            await seed_library(session)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Library seed failed: %s", exc)
    # 5. Seed competency framework database (idempotent)
    try:
        async with AsyncSessionLocal() as session:
            await seed_competency_frameworks(session)
        async with AsyncSessionLocal() as session:
            await seed_instrument_competency_mappings(session)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Competency seed failed: %s", exc)
    # 6. Seed industry-specific psychological scale library (idempotent)
    try:
        async with AsyncSessionLocal() as session:
            await seed_industry_library(session)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Industry library seed failed: %s", exc)
    yield
    await engine.dispose()


app = FastAPI(
    title="Metricly API",
    description="Psychometric platform for the Arab world",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # includes Authorization
)

app.include_router(reliability_router, prefix="/api/v1")
app.include_router(omega_router, prefix="/api/v1")
app.include_router(efa_router, prefix="/api/v1")
app.include_router(dif_router, prefix="/api/v1")
app.include_router(import_router, prefix="/api/v1")   # must be before survey_router (avoids /{survey_id} conflict)
app.include_router(survey_router, prefix="/api/v1")
app.include_router(question_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(framework_router, prefix="/api/v1")
app.include_router(employee_router, prefix="/api/v1")
app.include_router(library_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(skills_explorer_router, prefix="/api/v1")
app.include_router(competencies_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
