"""Employee-centric routes: self-lookup and longitudinal growth profiles."""

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.framework import (
    Benchmark,
    CompetencyScore,
    EmployeeProfile,
    Framework,
)
from ..schemas.framework import EmployeeProfileOut, GrowthProfile

employee_router = APIRouter(prefix="/employees", tags=["employees"])

_EXCEEDING_MARGIN = 10.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_trend(scores: list[float]) -> str:
    if len(scores) < 2:
        return "insufficient_data"
    diff = scores[-1] - scores[-2]
    if diff > 5:
        return "improving"
    if diff < -5:
        return "declining"
    return "stable"


def _benchmark_status(actual: float, bench: float) -> str:
    if actual >= bench + _EXCEEDING_MARGIN:
        return "exceeding"
    if actual >= bench:
        return "meeting"
    return "below"


# ---------------------------------------------------------------------------
# GET /employees/me  — all employee profiles belonging to the current user
# ---------------------------------------------------------------------------


@employee_router.get("/me", response_model=list[EmployeeProfileOut])
async def get_my_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[EmployeeProfileOut]:
    """Return all EmployeeProfile rows whose email matches the authenticated user."""
    if not current_user.email:
        return []
    stmt = (
        select(EmployeeProfile)
        .where(EmployeeProfile.email == current_user.email)
        .order_by(EmployeeProfile.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# GET /employees/{id}/growth — longitudinal competency scores
# ---------------------------------------------------------------------------


@employee_router.get("/{employee_id}/growth", response_model=GrowthProfile)
async def get_growth(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> GrowthProfile:
    """
    Return a longitudinal growth profile for one employee.

    Access control:
    - The framework owner (admin) may always access this.
    - An employee whose email matches the profile's email may access their own data.
    """
    emp_stmt = select(EmployeeProfile).where(EmployeeProfile.id == employee_id)
    emp = (await db.execute(emp_stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    fw_stmt = (
        select(Framework)
        .options(selectinload(Framework.competencies))
        .where(Framework.id == emp.framework_id)
    )
    fw = (await db.execute(fw_stmt)).scalar_one_or_none()
    if fw is None:
        raise HTTPException(status_code=404, detail="Framework not found")

    is_owner = fw.user_id == current_user.user_id
    is_self = (
        current_user.email is not None
        and emp.email is not None
        and emp.email.lower() == current_user.email.lower()
    )
    if not is_owner and not is_self:
        raise HTTPException(status_code=403, detail="Access denied")

    # All scores for this employee, chronological
    scores_stmt = (
        select(CompetencyScore)
        .where(CompetencyScore.employee_profile_id == employee_id)
        .order_by(CompetencyScore.assessed_at.asc())
    )
    all_scores = list((await db.execute(scores_stmt)).scalars().all())

    # Benchmarks for this framework
    bench_stmt = select(Benchmark).where(Benchmark.framework_id == emp.framework_id)
    bench_map: dict[str, float] = {
        b.competency_id: b.required_score
        for b in (await db.execute(bench_stmt)).scalars().all()
    }

    trends = []
    for comp in fw.competencies:
        comp_scores = [s for s in all_scores if s.competency_id == comp.id]
        score_points = [
            {
                "assessed_at": s.assessed_at,
                "normalized_score": s.normalized_score,
                "proficiency_level": s.proficiency_level,
            }
            for s in comp_scores
        ]

        current_score = comp_scores[-1].normalized_score if comp_scores else None
        bench_score = bench_map.get(comp.id)

        bench_status = None
        if current_score is not None and bench_score is not None:
            bench_status = _benchmark_status(current_score, bench_score)

        trend = _compute_trend([s.normalized_score for s in comp_scores])

        trends.append(
            {
                "competency_id": comp.id,
                "competency_name": comp.name,
                "scores": score_points,
                "trend": trend,
                "current_score": current_score,
                "benchmark_score": bench_score,
                "benchmark_status": bench_status,
            }
        )

    return {
        "employee_id": employee_id,
        "employee_name": emp.name,
        "framework_id": fw.id,
        "framework_title": fw.title,
        "role_title": emp.role_title or fw.role_title,
        "department": emp.department,
        "competency_trends": trends,
    }
