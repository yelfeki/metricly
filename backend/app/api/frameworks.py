"""Competency framework CRUD, employee profiles, gap analysis, benchmarks, and pulse schedules."""

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
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
    CompetencyOut,
    CompetencyScoreCreate,
    CompetencyScoreOut,
    CompetencyUpdate,
    EmployeeProfileCreate,
    EmployeeProfileOut,
    FrameworkCreate,
    FrameworkListItem,
    FrameworkOut,
    FrameworkSurveyOut,
    FrameworkUpdate,
    GapReport,
    LinkSurveyRequest,
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
