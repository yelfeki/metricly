"""Competency framework CRUD, employee profiles, gap analysis, benchmarks, and pulse schedules."""

import calendar
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.competency import (
    CompetencyDefinition,
    CompetencyFramework,
    CompetencyProficiencyLevel,
)
from ..models.framework import (
    Benchmark,
    Competency,
    CompetencyScore,
    EmployeeProfile,
    Framework,
    FrameworkSurvey,
    ProficiencyLevel,
    PulseSchedule,
)
from ..schemas.framework import (
    BenchmarkComparison,
    BenchmarkCreate,
    BenchmarkOut,
    BenchmarkUpdate,
    CompetencyCreate,
    CompetencyDetailView,
    CompetencyLevelView,
    CompetencyOut,
    CompetencyScoreCreate,
    CompetencyScoreOut,
    CompetencyUpdate,
    EmployeeProfileCreate,
    EmployeeProfileOut,
    FrameworkCreate,
    FrameworkFromLibraryRequest,
    FrameworkListItem,
    FrameworkOut,
    FrameworkSurveyOut,
    FrameworkUpdate,
    GapReport,
    ImportFromLibraryRequest,
    LinkedSurveyView,
    LinkSurveyRequest,
    PickerCandidate,
    ProficiencyLevelCreate,
    ProficiencyLevelOut,
    ProficiencyLevelUpdate,
    PulseScheduleCreate,
    PulseScheduleOut,
    PulseScheduleUpdate,
    TeamBenchmarkSummary,
    TeamGapReport,
)
from ..services.benchmarking import compare_to_benchmark, team_benchmark_summary
from ..services.gap_analysis import _level_for_score, compute_gap, team_gap_summary

framework_router = APIRouter(prefix="/frameworks", tags=["frameworks"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_framework_or_404(framework_id: str, db: AsyncSession) -> Framework:
    stmt = (
        select(Framework)
        .options(
            selectinload(Framework.competencies),
            selectinload(Framework.proficiency_levels),
            selectinload(Framework.survey_links),
        )
        .where(Framework.id == framework_id)
    )
    fw = (await db.execute(stmt)).scalar_one_or_none()
    if fw is None:
        raise HTTPException(status_code=404, detail="Framework not found")
    return fw


def _assert_owner(framework: Framework, user_id: str) -> None:
    if framework.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this framework.")


def _required_level(proficiency_levels: list[ProficiencyLevel]) -> tuple[int, int]:
    """Return (required_level, max_level) based on the framework's defined levels."""
    if not proficiency_levels:
        return 3, 5  # sensible defaults
    max_level = max(lv.level for lv in proficiency_levels)
    # Target = 60th percentile of the scale, minimum level 1
    req = max(1, round(max_level * 0.6))
    return req, max_level


# ---------------------------------------------------------------------------
# Framework CRUD
# ---------------------------------------------------------------------------


@framework_router.get("", response_model=list[FrameworkListItem])
async def list_frameworks(
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[FrameworkListItem]:
    stmt = (
        select(Framework)
        .options(selectinload(Framework.competencies))
        .where(Framework.user_id == current_user.user_id)
        .order_by(Framework.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        FrameworkListItem(
            id=fw.id,
            title=fw.title,
            description=fw.description,
            role_title=fw.role_title,
            created_at=fw.created_at,
            competency_count=len(fw.competencies),
        )
        for fw in rows
    ]


@framework_router.post("", response_model=FrameworkOut, status_code=201)
async def create_framework(
    body: FrameworkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FrameworkOut:
    fw = Framework(
        title=body.title,
        description=body.description,
        role_title=body.role_title,
        user_id=current_user.user_id,
    )
    db.add(fw)
    await db.commit()
    await db.refresh(fw)
    return await _get_framework_or_404(fw.id, db)


@framework_router.get("/{framework_id}", response_model=FrameworkOut)
async def get_framework(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FrameworkOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    return fw


@framework_router.patch("/{framework_id}", response_model=FrameworkOut)
async def update_framework(
    framework_id: str,
    body: FrameworkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FrameworkOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    if body.title is not None:
        fw.title = body.title
    if body.description is not None:
        fw.description = body.description
    if body.role_title is not None:
        fw.role_title = body.role_title
    await db.commit()
    return await _get_framework_or_404(framework_id, db)


@framework_router.delete("/{framework_id}", status_code=204)
async def delete_framework(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    await db.delete(fw)
    await db.commit()


# ---------------------------------------------------------------------------
# Competencies
# ---------------------------------------------------------------------------


@framework_router.post(
    "/{framework_id}/competencies", response_model=CompetencyOut, status_code=201
)
async def add_competency(
    framework_id: str,
    body: CompetencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CompetencyOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    comp = Competency(
        framework_id=framework_id,
        name=body.name,
        description=body.description,
        order_index=body.order_index,
        cluster=body.cluster,
    )
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return comp


@framework_router.patch(
    "/{framework_id}/competencies/{competency_id}", response_model=CompetencyOut
)
async def update_competency(
    framework_id: str,
    competency_id: str,
    body: CompetencyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CompetencyOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(Competency).where(
        Competency.id == competency_id, Competency.framework_id == framework_id
    )
    comp = (await db.execute(stmt)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status_code=404, detail="Competency not found")
    if body.name is not None:
        comp.name = body.name
    if body.description is not None:
        comp.description = body.description
    if body.order_index is not None:
        comp.order_index = body.order_index
    if body.cluster is not None:
        comp.cluster = body.cluster
    await db.commit()
    await db.refresh(comp)
    return comp


@framework_router.delete("/{framework_id}/competencies/{competency_id}", status_code=204)
async def delete_competency(
    framework_id: str,
    competency_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(Competency).where(
        Competency.id == competency_id, Competency.framework_id == framework_id
    )
    comp = (await db.execute(stmt)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status_code=404, detail="Competency not found")
    await db.delete(comp)
    await db.commit()


# ---------------------------------------------------------------------------
# Library import / dashboard helpers
# ---------------------------------------------------------------------------


# Defaults match the existing wizard at frontend/app/frameworks/new/page.tsx
_DEFAULT_PROFICIENCY_LEVELS: list[dict] = [
    {"level": 1, "label": "Novice", "description": "Limited exposure; needs close guidance.", "color": "#ef4444"},
    {"level": 2, "label": "Developing", "description": "Basic understanding; can perform with support.", "color": "#f59e0b"},
    {"level": 3, "label": "Proficient", "description": "Solid competency; works independently.", "color": "#3b82f6"},
    {"level": 4, "label": "Advanced", "description": "Deep expertise; guides others.", "color": "#8b5cf6"},
    {"level": 5, "label": "Expert", "description": "Mastery; recognized authority; drives best practice.", "color": "#059669"},
]


def _parse_json_list(raw: str | None) -> list[str]:
    """Parse a TEXT-stored JSON array; return [] on any error."""
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except (ValueError, TypeError):
        return []


async def _seed_default_proficiency_levels(db: AsyncSession, framework_id: str) -> None:
    """Seed the framework with the standard Novice–Expert 5-level scale."""
    for lvl in _DEFAULT_PROFICIENCY_LEVELS:
        db.add(
            ProficiencyLevel(
                framework_id=framework_id,
                level=lvl["level"],
                label=lvl["label"],
                description=lvl["description"],
                color=lvl["color"],
            )
        )


async def _load_library_competency(
    db: AsyncSession, library_competency_id: str
) -> CompetencyDefinition:
    """Load a library CompetencyDefinition with its proficiency levels eager-loaded."""
    stmt = (
        select(CompetencyDefinition)
        .where(CompetencyDefinition.id == library_competency_id)
        .options(
            selectinload(CompetencyDefinition.proficiency_levels),
            selectinload(CompetencyDefinition.framework),
        )
    )
    lib = (await db.execute(stmt)).scalar_one_or_none()
    if lib is None:
        raise HTTPException(
            status_code=404,
            detail=f"Library competency {library_competency_id} not found",
        )
    return lib


# Benchmark seed defaults
# - Used when a library import flow doesn't pass a per-competency suggested level.
# - 3 matches the guided-flow "Team Lead" / IC mid mapping in competency_ranker.SUGGESTED_LEVEL.
_DEFAULT_BENCHMARK_LEVEL = 3
_MAX_PROFICIENCY_LEVELS = 5  # matches _DEFAULT_PROFICIENCY_LEVELS above


def _level_to_required_score(level: int) -> float:
    """Map a 1..N proficiency level to a 0–100 required_score band."""
    return round(level * (100.0 / _MAX_PROFICIENCY_LEVELS), 2)


@framework_router.post("/from-library", response_model=FrameworkOut, status_code=201)
async def create_framework_from_library(
    body: FrameworkFromLibraryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FrameworkOut:
    """Create a new framework and bulk-import library competencies into it.

    Used by the guided-flow proposal screen's "Continue to dashboard" button.
    Seeds the default 5-level proficiency scale AND a Benchmark per competency
    using item.suggested_proficiency_level (falling back to L3 if unset).
    """
    fw = Framework(
        title=body.title,
        description=body.description,
        role_title=body.role_title,
        user_id=current_user.user_id,
    )
    db.add(fw)
    await db.flush()  # get fw.id

    # Seed the default scale
    await _seed_default_proficiency_levels(db, fw.id)

    # Import each library competency + seed its benchmark
    for item in body.competencies:
        lib = await _load_library_competency(db, item.library_competency_id)
        comp = Competency(
            framework_id=fw.id,
            name=lib.name,
            description=lib.definition,
            order_index=item.order_index,
            cluster=lib.cluster,
            library_competency_id=lib.id,
        )
        db.add(comp)
        await db.flush()  # get comp.id

        target_level = item.suggested_proficiency_level or _DEFAULT_BENCHMARK_LEVEL
        db.add(
            Benchmark(
                framework_id=fw.id,
                competency_id=comp.id,
                required_level=target_level,
                required_score=_level_to_required_score(target_level),
            )
        )

    await db.commit()
    return await _get_framework_or_404(fw.id, db)


@framework_router.post(
    "/{framework_id}/competencies/import-from-library",
    response_model=CompetencyOut,
    status_code=201,
)
async def import_competency_from_library(
    framework_id: str,
    body: ImportFromLibraryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CompetencyOut:
    """Add a single library competency to an existing framework (picker write path)."""
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    # Reject if this library competency is already in the framework
    dup_stmt = select(Competency).where(
        Competency.framework_id == framework_id,
        Competency.library_competency_id == body.library_competency_id,
    )
    dup = (await db.execute(dup_stmt)).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status_code=409,
            detail="This library competency is already in the framework.",
        )

    lib = await _load_library_competency(db, body.library_competency_id)
    comp = Competency(
        framework_id=framework_id,
        name=lib.name,
        description=lib.definition,
        order_index=body.order_index,
        cluster=lib.cluster,
        library_competency_id=lib.id,
    )
    db.add(comp)
    await db.flush()  # get comp.id

    # Seed benchmark — uses caller-provided suggested level, else neutral L3 default
    target_level = body.suggested_proficiency_level or _DEFAULT_BENCHMARK_LEVEL
    db.add(
        Benchmark(
            framework_id=framework_id,
            competency_id=comp.id,
            required_level=target_level,
            required_score=_level_to_required_score(target_level),
        )
    )

    await db.commit()
    await db.refresh(comp)
    return comp


@framework_router.get(
    "/{framework_id}/competencies/picker-candidates",
    response_model=list[PickerCandidate],
)
async def picker_candidates(
    framework_id: str,
    role_family: str | None = Query(None),
    cluster: str | None = Query(None),
    q: str | None = Query(None, description="Substring search on name + definition"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[PickerCandidate]:
    """Library competencies eligible to add to this framework.

    Excludes competencies whose library_competency_id is already present in the
    framework. Supports filtering by role_family / cluster and a substring
    search (case-insensitive) on name + definition.
    """
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    # IDs of library competencies already in this framework
    existing_stmt = select(Competency.library_competency_id).where(
        Competency.framework_id == framework_id,
        Competency.library_competency_id.is_not(None),
    )
    existing_ids = {
        row[0] for row in (await db.execute(existing_stmt)).all() if row[0]
    }

    # Filtered library query — visibility helper applied so user sees seeded
    # competencies + custom competencies their org has created.
    from ..services.competency_visibility import visible_competencies_stmt

    stmt = visible_competencies_stmt(current_user.user_id).options(
        selectinload(CompetencyDefinition.framework)
    )
    if existing_ids:
        stmt = stmt.where(CompetencyDefinition.id.not_in(existing_ids))
    if role_family:
        stmt = stmt.where(CompetencyDefinition.role_family == role_family)
    if cluster:
        stmt = stmt.where(CompetencyDefinition.cluster == cluster)
    if q:
        pattern = f"%{q.lower()}%"
        # SQLite lacks ILIKE; SQLAlchemy's .ilike maps to LOWER(col) LIKE in that case.
        stmt = stmt.where(
            CompetencyDefinition.name.ilike(pattern)
            | CompetencyDefinition.definition.ilike(pattern)
        )

    rows = (await db.execute(stmt)).scalars().all()
    return [
        PickerCandidate(
            library_competency_id=c.id,
            name=c.name,
            definition=c.definition,
            role_family=c.role_family,
            cluster=c.cluster,
            framework_source=c.framework_source,
            framework_name=c.framework.name if c.framework else "",
            is_custom=c.is_custom,
            status=c.status,
        )
        for c in rows
    ]


@framework_router.get(
    "/{framework_id}/competencies/{competency_id}/detail",
    response_model=CompetencyDetailView,
)
async def get_competency_detail(
    framework_id: str,
    competency_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CompetencyDetailView:
    """Full detail for the side panel: 5 levels with descriptors + indicators,
    library provenance, linked survey. Read-only — editing lands in a later task.

    Level data is sourced from the library when this competency was imported
    (descriptor + indicators per-level). For from-scratch competencies, falls
    back to the framework-level ProficiencyLevel descriptors with empty
    indicator lists.
    """
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    stmt = (
        select(Competency)
        .where(Competency.id == competency_id, Competency.framework_id == framework_id)
        .options(selectinload(Competency.survey_links))
    )
    comp = (await db.execute(stmt)).scalar_one_or_none()
    if comp is None:
        raise HTTPException(status_code=404, detail="Competency not found")

    # Library overlay (if imported)
    library_framework_source: str | None = None
    library_role_family: str | None = None
    library_framework_name: str | None = None
    library_is_custom: bool = False
    library_status: str = "active"
    library_organization_id: str | None = None
    levels: list[CompetencyLevelView] = []

    if comp.library_competency_id:
        lib_stmt = (
            select(CompetencyDefinition)
            .where(CompetencyDefinition.id == comp.library_competency_id)
            .options(
                selectinload(CompetencyDefinition.proficiency_levels),
                selectinload(CompetencyDefinition.framework),
            )
        )
        lib = (await db.execute(lib_stmt)).scalar_one_or_none()
        if lib is not None:
            library_framework_source = lib.framework_source
            library_role_family = lib.role_family
            library_framework_name = lib.framework.name if lib.framework else None
            library_is_custom = lib.is_custom
            library_status = lib.status
            library_organization_id = lib.organization_id
            for pl in sorted(lib.proficiency_levels, key=lambda p: p.level):
                levels.append(
                    CompetencyLevelView(
                        level=pl.level,
                        label=pl.label,
                        descriptor=pl.descriptor,
                        behavioral_indicators=_parse_json_list(pl.behavioral_indicators),
                        example_behaviors=_parse_json_list(pl.example_behaviors),
                    )
                )

    # Fall back to the framework-level proficiency scale if no library data
    if not levels:
        fw_levels = sorted(fw.proficiency_levels, key=lambda p: p.level)
        levels = [
            CompetencyLevelView(
                level=pl.level,
                label=pl.label,
                descriptor=pl.description,
                behavioral_indicators=[],
                example_behaviors=[],
            )
            for pl in fw_levels
        ]

    # Linked survey (at most one per competency by FrameworkSurvey upsert design)
    linked_survey: LinkedSurveyView | None = None
    if comp.survey_links:
        sl = comp.survey_links[0]
        linked_survey = LinkedSurveyView(survey_id=sl.survey_id, survey_name=None)

    return CompetencyDetailView(
        id=comp.id,
        framework_id=comp.framework_id,
        name=comp.name,
        description=comp.description,
        cluster=comp.cluster,
        order_index=comp.order_index,
        library_competency_id=comp.library_competency_id,
        library_framework_source=library_framework_source,
        library_role_family=library_role_family,
        library_framework_name=library_framework_name,
        library_is_custom=library_is_custom,
        library_status=library_status,
        library_organization_id=library_organization_id,
        levels=levels,
        linked_survey=linked_survey,
    )


# ---------------------------------------------------------------------------
# Proficiency Levels
# ---------------------------------------------------------------------------


@framework_router.post(
    "/{framework_id}/proficiency-levels", response_model=ProficiencyLevelOut, status_code=201
)
async def add_proficiency_level(
    framework_id: str,
    body: ProficiencyLevelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> ProficiencyLevelOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    lvl = ProficiencyLevel(
        framework_id=framework_id,
        level=body.level,
        label=body.label,
        description=body.description,
        color=body.color,
    )
    db.add(lvl)
    await db.commit()
    await db.refresh(lvl)
    return lvl


@framework_router.patch(
    "/{framework_id}/proficiency-levels/{level_id}", response_model=ProficiencyLevelOut
)
async def update_proficiency_level(
    framework_id: str,
    level_id: str,
    body: ProficiencyLevelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> ProficiencyLevelOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(ProficiencyLevel).where(
        ProficiencyLevel.id == level_id, ProficiencyLevel.framework_id == framework_id
    )
    lvl = (await db.execute(stmt)).scalar_one_or_none()
    if lvl is None:
        raise HTTPException(status_code=404, detail="Proficiency level not found")
    if body.label is not None:
        lvl.label = body.label
    if body.description is not None:
        lvl.description = body.description
    if body.color is not None:
        lvl.color = body.color
    await db.commit()
    await db.refresh(lvl)
    return lvl


@framework_router.delete("/{framework_id}/proficiency-levels/{level_id}", status_code=204)
async def delete_proficiency_level(
    framework_id: str,
    level_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(ProficiencyLevel).where(
        ProficiencyLevel.id == level_id, ProficiencyLevel.framework_id == framework_id
    )
    lvl = (await db.execute(stmt)).scalar_one_or_none()
    if lvl is None:
        raise HTTPException(status_code=404, detail="Proficiency level not found")
    await db.delete(lvl)
    await db.commit()


# ---------------------------------------------------------------------------
# Survey linking
# ---------------------------------------------------------------------------


@framework_router.post(
    "/{framework_id}/link-survey", response_model=FrameworkSurveyOut, status_code=201
)
async def link_survey(
    framework_id: str,
    body: LinkSurveyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FrameworkSurveyOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    # Block linking when the underlying library competency is still a draft.
    # Drafts ARE usable in frameworks (per product spec) but cannot be wired
    # to an assessment until they reach status='active'.
    target_comp = (
        await db.execute(
            select(Competency).where(
                Competency.id == body.competency_id,
                Competency.framework_id == framework_id,
            )
        )
    ).scalar_one_or_none()
    if target_comp is not None and target_comp.library_competency_id is not None:
        lib = (
            await db.execute(
                select(CompetencyDefinition).where(
                    CompetencyDefinition.id == target_comp.library_competency_id
                )
            )
        ).scalar_one_or_none()
        if lib is not None and lib.status == "draft":
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot link an assessment to a draft competency. "
                    "Complete the competency (add proficiency levels and indicators) first."
                ),
            )

    # Upsert — remove existing link for this competency first
    existing_stmt = select(FrameworkSurvey).where(
        FrameworkSurvey.framework_id == framework_id,
        FrameworkSurvey.competency_id == body.competency_id,
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        await db.delete(existing)

    link = FrameworkSurvey(
        framework_id=framework_id,
        survey_id=body.survey_id,
        competency_id=body.competency_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@framework_router.delete("/{framework_id}/link-survey/{competency_id}", status_code=204)
async def unlink_survey(
    framework_id: str,
    competency_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(FrameworkSurvey).where(
        FrameworkSurvey.framework_id == framework_id,
        FrameworkSurvey.competency_id == competency_id,
    )
    link = (await db.execute(stmt)).scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.commit()


# ---------------------------------------------------------------------------
# Employee Profiles
# ---------------------------------------------------------------------------


@framework_router.get("/{framework_id}/employees", response_model=list[EmployeeProfileOut])
async def list_employees(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[EmployeeProfileOut]:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = (
        select(EmployeeProfile)
        .where(EmployeeProfile.framework_id == framework_id)
        .order_by(EmployeeProfile.name)
    )
    return list((await db.execute(stmt)).scalars().all())


@framework_router.post(
    "/{framework_id}/employees", response_model=EmployeeProfileOut, status_code=201
)
async def create_employee(
    framework_id: str,
    body: EmployeeProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> EmployeeProfileOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    emp = EmployeeProfile(
        framework_id=framework_id,
        user_id=current_user.user_id,
        name=body.name,
        email=body.email,
        department=body.department,
        role_title=body.role_title,
    )
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp


@framework_router.delete("/{framework_id}/employees/{employee_id}", status_code=204)
async def delete_employee(
    framework_id: str,
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(EmployeeProfile).where(
        EmployeeProfile.id == employee_id, EmployeeProfile.framework_id == framework_id
    )
    emp = (await db.execute(stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(emp)
    await db.commit()


# ---------------------------------------------------------------------------
# Competency Scores
# ---------------------------------------------------------------------------


@framework_router.post(
    "/{framework_id}/employees/{employee_id}/scores",
    response_model=CompetencyScoreOut,
    status_code=201,
)
async def submit_score(
    framework_id: str,
    employee_id: str,
    body: CompetencyScoreCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CompetencyScoreOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    emp_stmt = select(EmployeeProfile).where(
        EmployeeProfile.id == employee_id, EmployeeProfile.framework_id == framework_id
    )
    emp = (await db.execute(emp_stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    _, max_level = _required_level(fw.proficiency_levels)
    proficiency_level = _level_for_score(body.normalized_score, max_level)

    score = CompetencyScore(
        employee_profile_id=employee_id,
        competency_id=body.competency_id,
        survey_response_id=body.survey_response_id,
        normalized_score=body.normalized_score,
        proficiency_level=proficiency_level,
    )
    db.add(score)
    await db.commit()
    await db.refresh(score)
    return score


@framework_router.get(
    "/{framework_id}/employees/{employee_id}/scores",
    response_model=list[CompetencyScoreOut],
)
async def list_scores(
    framework_id: str,
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[CompetencyScoreOut]:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = (
        select(CompetencyScore)
        .where(CompetencyScore.employee_profile_id == employee_id)
        .order_by(CompetencyScore.assessed_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# Gap Reports
# ---------------------------------------------------------------------------


@framework_router.get("/{framework_id}/gap-report", response_model=GapReport)
async def get_gap_report(
    framework_id: str,
    employee_id: str = Query(..., description="Employee profile ID"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> GapReport:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    emp_stmt = select(EmployeeProfile).where(
        EmployeeProfile.id == employee_id, EmployeeProfile.framework_id == framework_id
    )
    emp = (await db.execute(emp_stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    scores_stmt = select(CompetencyScore).where(
        CompetencyScore.employee_profile_id == employee_id
    )
    all_scores = (await db.execute(scores_stmt)).scalars().all()

    # Latest score per competency
    latest_scores: dict[str, float | None] = {}
    for comp in fw.competencies:
        comp_scores = [s for s in all_scores if s.competency_id == comp.id]
        latest_scores[comp.id] = (
            max(comp_scores, key=lambda s: s.assessed_at).normalized_score
            if comp_scores
            else None
        )

    req_level, max_level = _required_level(fw.proficiency_levels)
    return compute_gap(
        employee_profile_id=employee_id,
        framework_id=framework_id,
        competency_names={c.id: c.name for c in fw.competencies},
        proficiency_count=max_level,
        required_level=req_level,
        scores=latest_scores,
        employee_name=emp.name,
        framework_title=fw.title,
    )


# ---------------------------------------------------------------------------
# Pulse Schedules
# ---------------------------------------------------------------------------


def _next_assessment_date(ps: PulseSchedule) -> date | None:
    """Compute the next scheduled assessment date from today."""
    today = date.today()
    if not ps.is_active:
        return None
    start = ps.start_date
    if ps.end_date and ps.end_date < today:
        return None  # schedule has ended
    if start >= today:
        return start
    current = start
    if ps.frequency == "weekly":
        while current < today:
            current += timedelta(weeks=1)
    elif ps.frequency == "biweekly":
        while current < today:
            current += timedelta(weeks=2)
    else:  # monthly
        while current < today:
            month = current.month + 1
            year = current.year
            if month > 12:
                month = 1
                year += 1
            day = min(current.day, calendar.monthrange(year, month)[1])
            current = date(year, month, day)
    if ps.end_date and current > ps.end_date:
        return None
    return current


def _pulse_out(ps: PulseSchedule) -> dict:
    return {
        "id": ps.id,
        "framework_id": ps.framework_id,
        "survey_id": ps.survey_id,
        "frequency": ps.frequency,
        "start_date": ps.start_date,
        "end_date": ps.end_date,
        "is_active": ps.is_active,
        "created_at": ps.created_at,
        "next_assessment_date": _next_assessment_date(ps),
    }


@framework_router.get(
    "/{framework_id}/pulse-schedules", response_model=list[PulseScheduleOut]
)
async def list_pulse_schedules(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[dict]:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = (
        select(PulseSchedule)
        .where(PulseSchedule.framework_id == framework_id)
        .order_by(PulseSchedule.created_at.desc())
    )
    schedules = (await db.execute(stmt)).scalars().all()
    return [_pulse_out(ps) for ps in schedules]


@framework_router.post(
    "/{framework_id}/pulse-schedules", response_model=PulseScheduleOut, status_code=201
)
async def create_pulse_schedule(
    framework_id: str,
    body: PulseScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> dict:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    ps = PulseSchedule(
        framework_id=framework_id,
        survey_id=body.survey_id,
        frequency=body.frequency,
        start_date=body.start_date,
        end_date=body.end_date,
        is_active=body.is_active,
    )
    db.add(ps)
    await db.commit()
    await db.refresh(ps)
    return _pulse_out(ps)


@framework_router.patch(
    "/{framework_id}/pulse-schedules/{schedule_id}", response_model=PulseScheduleOut
)
async def update_pulse_schedule(
    framework_id: str,
    schedule_id: str,
    body: PulseScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> dict:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(PulseSchedule).where(
        PulseSchedule.id == schedule_id, PulseSchedule.framework_id == framework_id
    )
    ps = (await db.execute(stmt)).scalar_one_or_none()
    if ps is None:
        raise HTTPException(status_code=404, detail="Pulse schedule not found")
    if body.frequency is not None:
        ps.frequency = body.frequency
    if body.start_date is not None:
        ps.start_date = body.start_date
    if body.end_date is not None:
        ps.end_date = body.end_date
    if body.is_active is not None:
        ps.is_active = body.is_active
    await db.commit()
    await db.refresh(ps)
    return _pulse_out(ps)


@framework_router.delete(
    "/{framework_id}/pulse-schedules/{schedule_id}", status_code=204
)
async def delete_pulse_schedule(
    framework_id: str,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(PulseSchedule).where(
        PulseSchedule.id == schedule_id, PulseSchedule.framework_id == framework_id
    )
    ps = (await db.execute(stmt)).scalar_one_or_none()
    if ps is None:
        raise HTTPException(status_code=404, detail="Pulse schedule not found")
    await db.delete(ps)
    await db.commit()


# ---------------------------------------------------------------------------
# Benchmarks
# ---------------------------------------------------------------------------


@framework_router.get("/{framework_id}/benchmarks", response_model=list[BenchmarkOut])
async def list_benchmarks(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[BenchmarkOut]:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(Benchmark).where(Benchmark.framework_id == framework_id)
    return list((await db.execute(stmt)).scalars().all())


@framework_router.post(
    "/{framework_id}/benchmarks", response_model=BenchmarkOut, status_code=201
)
async def upsert_benchmark(
    framework_id: str,
    body: BenchmarkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> BenchmarkOut:
    """Create or replace the benchmark for a competency (upsert by competency_id)."""
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    existing_stmt = select(Benchmark).where(
        Benchmark.framework_id == framework_id,
        Benchmark.competency_id == body.competency_id,
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        existing.required_score = body.required_score
        existing.required_level = body.required_level
        await db.commit()
        await db.refresh(existing)
        return existing

    bm = Benchmark(
        framework_id=framework_id,
        competency_id=body.competency_id,
        required_score=body.required_score,
        required_level=body.required_level,
    )
    db.add(bm)
    await db.commit()
    await db.refresh(bm)
    return bm


@framework_router.patch(
    "/{framework_id}/benchmarks/{benchmark_id}", response_model=BenchmarkOut
)
async def update_benchmark(
    framework_id: str,
    benchmark_id: str,
    body: BenchmarkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> BenchmarkOut:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)
    stmt = select(Benchmark).where(
        Benchmark.id == benchmark_id, Benchmark.framework_id == framework_id
    )
    bm = (await db.execute(stmt)).scalar_one_or_none()
    if bm is None:
        raise HTTPException(status_code=404, detail="Benchmark not found")
    if body.required_score is not None:
        bm.required_score = body.required_score
    if body.required_level is not None:
        bm.required_level = body.required_level
    await db.commit()
    await db.refresh(bm)
    return bm


# ---------------------------------------------------------------------------
# Benchmark reports
# ---------------------------------------------------------------------------


@framework_router.get("/{framework_id}/benchmark-report", response_model=BenchmarkComparison)
async def get_benchmark_report(
    framework_id: str,
    employee_id: str = Query(..., description="Employee profile ID"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> BenchmarkComparison:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    emp_stmt = select(EmployeeProfile).where(
        EmployeeProfile.id == employee_id, EmployeeProfile.framework_id == framework_id
    )
    emp = (await db.execute(emp_stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    scores_stmt = select(CompetencyScore).where(
        CompetencyScore.employee_profile_id == employee_id
    )
    all_scores = (await db.execute(scores_stmt)).scalars().all()
    latest_scores: dict[str, float | None] = {}
    for comp in fw.competencies:
        comp_scores = [s for s in all_scores if s.competency_id == comp.id]
        latest_scores[comp.id] = (
            max(comp_scores, key=lambda s: s.assessed_at).normalized_score
            if comp_scores else None
        )

    bench_stmt = select(Benchmark).where(Benchmark.framework_id == framework_id)
    bench_map = {
        b.competency_id: b.required_score
        for b in (await db.execute(bench_stmt)).scalars().all()
    }

    return compare_to_benchmark(
        employee_profile_id=employee_id,
        framework_id=framework_id,
        competency_names={c.id: c.name for c in fw.competencies},
        benchmarks=bench_map,
        scores=latest_scores,
        employee_name=emp.name,
        framework_title=fw.title,
    )


@framework_router.get(
    "/{framework_id}/team-benchmark-report", response_model=TeamBenchmarkSummary
)
async def get_team_benchmark_report(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> TeamBenchmarkSummary:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    emp_stmt = (
        select(EmployeeProfile)
        .where(EmployeeProfile.framework_id == framework_id)
        .order_by(EmployeeProfile.name)
    )
    employees = (await db.execute(emp_stmt)).scalars().all()

    emp_ids = [e.id for e in employees]
    scores_stmt = select(CompetencyScore).where(
        CompetencyScore.employee_profile_id.in_(emp_ids)
    )
    all_scores = (await db.execute(scores_stmt)).scalars().all()

    employee_scores: dict[str, dict[str, float | None]] = {}
    employee_names: dict[str, str] = {}
    for emp in employees:
        employee_names[emp.id] = emp.name
        emp_map: dict[str, float | None] = {}
        for comp in fw.competencies:
            comp_scores = [
                s for s in all_scores
                if s.employee_profile_id == emp.id and s.competency_id == comp.id
            ]
            emp_map[comp.id] = (
                max(comp_scores, key=lambda s: s.assessed_at).normalized_score
                if comp_scores else None
            )
        employee_scores[emp.id] = emp_map

    bench_stmt = select(Benchmark).where(Benchmark.framework_id == framework_id)
    bench_map = {
        b.competency_id: b.required_score
        for b in (await db.execute(bench_stmt)).scalars().all()
    }

    return team_benchmark_summary(
        framework_id=framework_id,
        framework_title=fw.title,
        competency_names={c.id: c.name for c in fw.competencies},
        benchmarks=bench_map,
        employee_scores=employee_scores,
        employee_names=employee_names,
    )


@framework_router.get("/{framework_id}/team-gap-report", response_model=TeamGapReport)
async def get_team_gap_report(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> TeamGapReport:
    fw = await _get_framework_or_404(framework_id, db)
    _assert_owner(fw, current_user.user_id)

    emp_stmt = (
        select(EmployeeProfile)
        .where(EmployeeProfile.framework_id == framework_id)
        .order_by(EmployeeProfile.name)
    )
    employees = (await db.execute(emp_stmt)).scalars().all()

    if not employees:
        return TeamGapReport(
            framework_id=framework_id,
            framework_title=fw.title,
            employee_count=0,
            competency_stats=[],
            heatmap=[],
            critical_gaps=[],
        )

    emp_ids = [e.id for e in employees]
    scores_stmt = select(CompetencyScore).where(
        CompetencyScore.employee_profile_id.in_(emp_ids)
    )
    all_scores = (await db.execute(scores_stmt)).scalars().all()

    employee_scores: dict[str, dict[str, float | None]] = {}
    employee_names: dict[str, str] = {}
    for emp in employees:
        employee_names[emp.id] = emp.name
        emp_map: dict[str, float | None] = {}
        for comp in fw.competencies:
            comp_scores = [
                s for s in all_scores
                if s.employee_profile_id == emp.id and s.competency_id == comp.id
            ]
            emp_map[comp.id] = (
                max(comp_scores, key=lambda s: s.assessed_at).normalized_score
                if comp_scores
                else None
            )
        employee_scores[emp.id] = emp_map

    req_level, max_level = _required_level(fw.proficiency_levels)
    return team_gap_summary(
        framework_id=framework_id,
        framework_title=fw.title,
        competency_names={c.id: c.name for c in fw.competencies},
        proficiency_count=max_level,
        required_level=req_level,
        employee_scores=employee_scores,
        employee_names=employee_names,
    )
