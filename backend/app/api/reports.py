"""Interpretive report endpoints.

Routes:
  POST /surveys/{survey_id}/responses/{response_id}/interpretive-report
  GET  /surveys/{survey_id}/responses/{response_id}/interpretive-report
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, require_user
from ..core.database import get_db
from ..models.report import InterpretiveReport
from ..models.survey import Answer, Question, Response, ScoringAlgorithm, Survey, SurveyFactor
from ..services.interpretive_report import generate_interpretive_report
from ..services.score_normalizer import get_label, normalize

log = logging.getLogger(__name__)

reports_router = APIRouter(prefix="/surveys", tags=["reports"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class InterpretiveReportRequest(BaseModel):
    role: str | None = None
    industry: str | None = None
    purpose: Literal["hiring", "development", "research"] = "development"
    force: bool = False  # True → delete cached report and regenerate


class InterpretiveReportOut(BaseModel):
    id: str
    response_id: str
    survey_id: str
    generated_at: datetime
    context: dict
    report: dict
    model_used: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_survey_or_404(survey_id: str, db: AsyncSession) -> Survey:
    stmt = (
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_id)
    )
    survey = (await db.execute(stmt)).scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found.")
    return survey


def _assert_owner(survey: Survey, user_id: str) -> None:
    if survey.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this survey.")


async def _compute_factor_scores(
    survey: Survey,
    response_id: str,
    db: AsyncSession,
) -> tuple[list[dict], float | None, str | None]:
    """
    Compute factor scores from raw answers for a given response.

    Returns:
        factor_scores: list of {name, normalized, label}
        composite_score: float | None
        composite_label: str | None
    """
    # Load answers
    raw_answers = list(
        (await db.execute(select(Answer).where(Answer.response_id == response_id))).scalars()
    )

    # Load factors and algorithms
    sf_rows = list(
        (await db.execute(
            select(SurveyFactor).where(SurveyFactor.survey_id == survey.id).order_by(SurveyFactor.name)
        )).scalars()
    )
    algo_rows = list(
        (await db.execute(
            select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == survey.id)
        )).scalars()
    )

    name_to_factor_id: dict[str, str] = {sf.name: sf.id for sf in sf_rows}
    algo_by_factor_id: dict[str | None, ScoringAlgorithm] = {a.factor_id: a for a in algo_rows}
    question_map: dict[str, Question] = {q.id: q for q in survey.questions}

    def _apply_algo(raw: float, fname: str | None) -> tuple[float | None, str | None]:
        fid = name_to_factor_id.get(fname) if fname else None
        algo = algo_by_factor_id.get(fid) if fid else None
        if algo is None:
            return None, None
        norm = normalize(raw, algo.min_possible, algo.max_possible, algo.normalized_min, algo.normalized_max)
        norm = round(norm, 2)
        label = None
        if algo.labels:
            try:
                info = get_label(norm, json.loads(algo.labels))
                label = (info or {}).get("label")
            except (json.JSONDecodeError, TypeError):
                pass
        return norm, label

    # Accumulate per-factor scores
    score_acc: dict[str, list[float]] = defaultdict(list)
    for ans in raw_answers:
        q = question_map.get(ans.question_id)
        if q and q.factor and ans.numeric_score is not None:
            score_acc[q.factor].append(ans.numeric_score)

    factor_scores: list[dict] = []
    norm_for_composite: list[float] = []

    for sf in sf_rows:
        vals = score_acc.get(sf.name, [])
        if not vals:
            continue
        raw_mean = sum(vals) / len(vals)
        norm, label = _apply_algo(raw_mean, sf.name)
        if norm is not None:
            norm_for_composite.append(norm)
            factor_scores.append({"name": sf.name, "normalized": norm, "label": label})

    # Composite
    composite_score: float | None = None
    composite_label: str | None = None
    if norm_for_composite:
        composite_score = round(sum(norm_for_composite) / len(norm_for_composite), 2)
        comp_algo = algo_by_factor_id.get(None)
        if comp_algo and comp_algo.labels:
            try:
                ci = get_label(composite_score, json.loads(comp_algo.labels))
                composite_label = (ci or {}).get("label")
            except (json.JSONDecodeError, TypeError):
                pass

    return factor_scores, composite_score, composite_label


def _row_to_out(row: InterpretiveReport) -> InterpretiveReportOut:
    return InterpretiveReportOut(
        id=row.id,
        response_id=row.response_id,
        survey_id=row.survey_id,
        generated_at=row.generated_at,
        context=json.loads(row.context_json),
        report=json.loads(row.report_json),
        model_used=row.model_used,
    )


# ---------------------------------------------------------------------------
# POST — generate (or return cached)
# ---------------------------------------------------------------------------


@reports_router.post(
    "/{survey_id}/responses/{response_id}/interpretive-report",
    response_model=InterpretiveReportOut,
    status_code=201,
)
async def create_interpretive_report(
    survey_id: str,
    response_id: str,
    body: InterpretiveReportRequest,
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> InterpretiveReportOut:
    # 1. Validate survey + ownership
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    # 2. Validate response belongs to this survey
    response = (await db.execute(
        select(Response).where(Response.id == response_id, Response.survey_id == survey_id)
    )).scalar_one_or_none()
    if response is None:
        raise HTTPException(status_code=404, detail="Response not found.")

    # 3. Check cache
    existing = (await db.execute(
        select(InterpretiveReport).where(InterpretiveReport.response_id == response_id)
    )).scalar_one_or_none()

    if existing and not body.force:
        return _row_to_out(existing)

    # 4. Delete stale cached report if regenerating
    if existing and body.force:
        await db.delete(existing)
        await db.flush()

    # 5. Compute factor scores
    factor_scores, composite_score, composite_label = await _compute_factor_scores(
        survey, response_id, db
    )

    # 6. Generate via Claude
    context = {
        "role": body.role,
        "industry": body.industry,
        "purpose": body.purpose,
    }
    try:
        report_dict = await generate_interpretive_report(
            survey_title=survey.name,
            survey_description=survey.description,
            factor_scores=factor_scores,
            composite_score=composite_score,
            composite_label=composite_label,
            context=context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        log.error("Claude API error: %s", exc)
        raise HTTPException(status_code=502, detail="AI report generation failed. Please try again.")

    # 7. Persist
    from ..services.interpretive_report import _MODEL
    row = InterpretiveReport(
        response_id=response_id,
        survey_id=survey_id,
        generated_at=datetime.now(timezone.utc),
        context_json=json.dumps(context),
        report_json=json.dumps(report_dict),
        model_used=_MODEL,
    )
    db.add(row)
    await db.commit()

    return _row_to_out(row)


# ---------------------------------------------------------------------------
# GET — retrieve cached report
# ---------------------------------------------------------------------------


@reports_router.get(
    "/{survey_id}/responses/{response_id}/interpretive-report",
    response_model=InterpretiveReportOut,
)
async def get_interpretive_report(
    survey_id: str,
    response_id: str,
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> InterpretiveReportOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    row = (await db.execute(
        select(InterpretiveReport).where(
            InterpretiveReport.response_id == response_id,
            InterpretiveReport.survey_id == survey_id,
        )
    )).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="No interpretive report found for this response.")

    return _row_to_out(row)
