"""Assessment Library API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.library import (
    Instrument,
    InstrumentCategory,
    InstrumentItem,
    LibraryDeployment,
)
from ..models.survey import (
    Question,
    ScoringAlgorithm,
    Survey,
    SurveyFactor,
    UserRole,
)
from ..schemas.library import (
    DeployRequest,
    DeployResponse,
    InstrumentCreate,
    InstrumentItemCreate,
    InstrumentOut,
    LibraryGrouped,
)
from ..services.library import build_library_grouped, build_survey_spec, psychometric_warning

library_router = APIRouter(prefix="/library", tags=["library"])


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _require_admin(
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    stmt = select(UserRole).where(UserRole.user_id == current_user.user_id)
    role = (await db.execute(stmt)).scalar_one_or_none()
    if role is None or role.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# ---------------------------------------------------------------------------
# Helper — load instrument with relationships
# ---------------------------------------------------------------------------


async def _get_instrument_or_404(instrument_id: str, db: AsyncSession) -> Instrument:
    stmt = (
        select(Instrument)
        .options(
            selectinload(Instrument.category),
            selectinload(Instrument.subscales),
            selectinload(Instrument.items),
        )
        .where(Instrument.id == instrument_id, Instrument.is_active == True)  # noqa: E712
    )
    inst = (await db.execute(stmt)).scalar_one_or_none()
    if inst is None:
        raise HTTPException(status_code=404, detail="Instrument not found.")
    return inst


# ---------------------------------------------------------------------------
# GET /library — browse all instruments grouped by category
# ---------------------------------------------------------------------------


@library_router.get("", response_model=LibraryGrouped)
async def browse_library(
    search: str | None = Query(None, description="Search instruments by name or construct"),
    category_id: str | None = Query(None, description="Filter by category ID"),
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> LibraryGrouped:
    stmt = (
        select(Instrument)
        .options(
            selectinload(Instrument.category),
            selectinload(Instrument.subscales),
        )
        .where(Instrument.is_active == True)  # noqa: E712
        .order_by(Instrument.name)
    )
    instruments = list((await db.execute(stmt)).scalars().all())

    if category_id:
        instruments = [i for i in instruments if i.category_id == category_id]

    if search:
        q = search.lower()
        instruments = [
            i for i in instruments
            if q in i.name.lower()
            or (i.construct_measured and q in i.construct_measured.lower())
            or (i.description and q in i.description.lower())
        ]

    return build_library_grouped(instruments)


# ---------------------------------------------------------------------------
# GET /library/categories
# ---------------------------------------------------------------------------


@library_router.get("/categories", response_model=list[dict])
async def list_categories(
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    stmt = select(InstrumentCategory).order_by(InstrumentCategory.order_index)
    cats = list((await db.execute(stmt)).scalars().all())
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "icon_name": c.icon_name,
            "order_index": c.order_index,
        }
        for c in cats
    ]


# ---------------------------------------------------------------------------
# GET /library/instruments/{id} — full detail
# ---------------------------------------------------------------------------


@library_router.get("/instruments/{instrument_id}", response_model=InstrumentOut)
async def get_instrument(
    instrument_id: str,
    _: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> Instrument:
    return await _get_instrument_or_404(instrument_id, db)


# ---------------------------------------------------------------------------
# POST /library/instruments/{id}/deploy — create survey from instrument
# ---------------------------------------------------------------------------


@library_router.post(
    "/instruments/{instrument_id}/deploy",
    response_model=DeployResponse,
    status_code=201,
)
async def deploy_instrument(
    instrument_id: str,
    body: DeployRequest,
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> DeployResponse:
    instrument = await _get_instrument_or_404(instrument_id, db)

    # Build pure spec (no DB writes)
    spec = build_survey_spec(
        instrument=instrument,
        items=instrument.items,
        subscales=instrument.subscales,
        item_ids=body.item_ids,
    )

    # Count selected items across all factors
    total_selected = sum(len(f["items"]) for f in spec["factors"])

    # 1. Create Survey — draft so the user can review before publishing
    survey = Survey(
        name=spec["survey_name"],
        description=spec["survey_description"],
        status="draft",
        user_id=current_user.user_id,
    )
    db.add(survey)
    await db.flush()

    factors_created = 0

    # 2. Create factors + questions + scoring algorithms
    for factor_spec in spec["factors"]:
        factor = SurveyFactor(
            survey_id=survey.id,
            name=factor_spec["name"],
            description=factor_spec["description"],
        )
        db.add(factor)
        await db.flush()
        factors_created += 1

        for item_spec in factor_spec["items"]:
            question = Question(
                survey_id=survey.id,
                text=item_spec["text"],
                question_type=spec["question_type"],
                position=item_spec["position"],
                factor=factor_spec["name"],
                reverse_scored=item_spec["reverse_scored"],
                score_weight=1.0,
            )
            db.add(question)

        algo = ScoringAlgorithm(
            survey_id=survey.id,
            factor_id=factor.id,
            min_possible=factor_spec["min_possible"],
            max_possible=factor_spec["max_possible"],
            normalized_min=0.0,
            normalized_max=100.0,
        )
        db.add(algo)

    # 3. Record deployment
    deployment = LibraryDeployment(
        user_id=current_user.user_id,
        instrument_id=instrument_id,
        survey_id=survey.id,
        customization_notes=body.customization_notes,
        items_included=(
            str(body.item_ids) if body.item_ids is not None else None
        ),
    )
    db.add(deployment)
    await db.commit()

    return DeployResponse(
        deployment_id=deployment.id,
        survey_id=survey.id,
        instrument_id=instrument_id,
        instrument_name=instrument.name,
        items_deployed=total_selected,
        factors_created=factors_created,
    )


# ---------------------------------------------------------------------------
# POST /library/instruments — admin: create instrument
# ---------------------------------------------------------------------------


@library_router.post(
    "/instruments",
    response_model=InstrumentOut,
    status_code=201,
)
async def create_instrument(
    body: InstrumentCreate,
    _: AuthUser = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> Instrument:
    # Check short_name uniqueness
    existing = (
        await db.execute(select(Instrument).where(Instrument.short_name == body.short_name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="An instrument with this short_name already exists.")

    inst = Instrument(
        category_id=body.category_id,
        name=body.name,
        short_name=body.short_name,
        description=body.description,
        construct_measured=body.construct_measured,
        theoretical_framework=body.theoretical_framework,
        source_citation=body.source_citation,
        source_url=body.source_url,
        license_type=body.license_type,
        is_proprietary=body.is_proprietary,
        total_items=body.total_items,
        estimated_minutes=body.estimated_minutes,
        scoring_type=body.scoring_type,
        response_format=body.response_format,
        validated_populations=body.validated_populations,
        languages=body.languages,
        reliability_alpha=body.reliability_alpha,
    )
    db.add(inst)
    await db.commit()
    return await _get_instrument_or_404(inst.id, db)


# ---------------------------------------------------------------------------
# POST /library/instruments/{id}/items — admin: add items
# ---------------------------------------------------------------------------


@library_router.post(
    "/instruments/{instrument_id}/items",
    response_model=InstrumentOut,
    status_code=201,
)
async def add_instrument_items(
    instrument_id: str,
    items: list[InstrumentItemCreate],
    _: AuthUser = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> Instrument:
    instrument = await _get_instrument_or_404(instrument_id, db)

    # Find current max order_index
    existing_items = list((
        await db.execute(
            select(InstrumentItem)
            .where(InstrumentItem.instrument_id == instrument_id)
            .order_by(InstrumentItem.order_index.desc())
        )
    ).scalars().all())
    next_idx = (existing_items[0].order_index + 1) if existing_items else 1

    for item_data in items:
        item = InstrumentItem(
            instrument_id=instrument_id,
            subscale_id=item_data.subscale_id,
            item_text=item_data.item_text,
            item_text_ar=item_data.item_text_ar,
            order_index=item_data.order_index if item_data.order_index > 0 else next_idx,
            is_reverse_scored=item_data.is_reverse_scored,
            scoring_key=item_data.scoring_key,
        )
        db.add(item)
        next_idx += 1

    instrument.total_items = len(existing_items) + len(items)
    await db.commit()
    return await _get_instrument_or_404(instrument_id, db)
