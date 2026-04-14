"""Survey CRUD, question management, response submission, and results."""

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.auth import AuthUser, optional_user, require_user
from ..core.database import get_db
from ..models.survey import Answer, Question, Response, Survey, SurveyFactor, ScoringAlgorithm, SurveyInvite
from ..schemas.reliability import CronbachAlphaRequest, CronbachAlphaResponse
from ..schemas.survey import (
    AnswerReport,
    CompositeReport,
    DashboardResponse,
    FactorDistribution,
    FactorGroupComparison,
    FactorReport,
    FactorScoreEntry,
    FactorScoresResponse,
    FactorScoresSummary,
    GroupComparisonResponse,
    GroupStats,
    HistogramBin,
    InviteCreate,
    InviteOut,
    ParticipantReport,
    QuestionCreate,
    QuestionOut,
    QuestionStat,
    QuestionUpdate,
    RespondentFactorScores,
    RespondentRow,
    RespondentsResponse,
    ResponseOut,
    ResponseSubmit,
    ScoringAlgorithmCreate,
    ScoringAlgorithmOut,
    ScoringAlgorithmUpdate,
    SurveyCreate,
    SurveyFactorCreate,
    SurveyFactorOut,
    SurveyFactorUpdate,
    SurveyListItem,
    SurveyOut,
    SurveyResults,
    SurveyStats,
    SurveyUpdate,
)
from ..services.cohort_analytics import cohort_summary, group_comparison
from ..services.reliability import compute_cronbach_alpha
from ..services.score_normalizer import get_label, normalize
from ..services.scoring import score_answer

survey_router = APIRouter(prefix="/surveys", tags=["surveys"])
question_router = APIRouter(prefix="/questions", tags=["questions"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _options_json(body: QuestionCreate | QuestionUpdate) -> str | None:
    """Serialize options or forced_choice_config to the DB text column."""
    qt = body.question_type
    if qt == "forced_choice" and body.forced_choice_config:
        cfg = body.forced_choice_config
        return json.dumps({"items": cfg.items, "labels": cfg.labels})
    return json.dumps(body.options) if body.options else None


def _option_scores_json(body: QuestionCreate | QuestionUpdate) -> str | None:
    """Serialize option_scores to the DB text column."""
    if body.option_scores:
        return json.dumps(body.option_scores)
    return None


async def _get_survey_or_404(survey_id: str, db: AsyncSession) -> Survey:
    stmt = (
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_id)
    )
    survey = (await db.execute(stmt)).scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


def _assert_owner(survey: Survey, user_id: str) -> None:
    """Raise 403 if the authenticated user does not own the survey."""
    if survey.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this survey.")


async def _response_count(survey_id: str, db: AsyncSession) -> int:
    stmt = select(func.count(Response.id)).where(Response.survey_id == survey_id)
    return (await db.execute(stmt)).scalar_one()


def _survey_out(survey: Survey, response_count: int) -> SurveyOut:
    return SurveyOut(
        id=survey.id,
        name=survey.name,
        description=survey.description,
        status=survey.status,
        created_at=survey.created_at,
        questions=[QuestionOut.model_validate(q) for q in survey.questions],
        response_count=response_count,
    )


def _compute_question_stat(question: Question, answers: list[Answer]) -> QuestionStat:
    q_answers = [a for a in answers if a.question_id == question.id]
    n = len(q_answers)

    # ------------------------------------------------------------------
    # Likert scales
    # ------------------------------------------------------------------
    if question.question_type in ("likert_5", "likert_7"):
        values = []
        for a in q_answers:
            try:
                values.append(float(a.value))
            except ValueError:
                pass
        mean = sum(values) / len(values) if values else None
        if len(values) > 1:
            variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)  # type: ignore[operator]
            std = math.sqrt(variance)
        else:
            std = 0.0
        dist: dict[str, int] = defaultdict(int)
        for v in values:
            dist[str(int(v))] += 1
        return QuestionStat(
            question_id=question.id,
            text=question.text,
            question_type=question.question_type,
            n=n,
            mean=mean,
            std=std,
            distribution=dict(dist),
        )

    # ------------------------------------------------------------------
    # Single / multiple choice
    # ------------------------------------------------------------------
    if question.question_type in ("single_choice", "multiple_choice"):
        dist = defaultdict(int)
        for a in q_answers:
            if question.question_type == "multiple_choice":
                try:
                    choices = json.loads(a.value)
                    for c in choices:
                        dist[str(c)] += 1
                except (json.JSONDecodeError, TypeError):
                    dist[a.value] += 1
            else:
                dist[a.value] += 1
        return QuestionStat(
            question_id=question.id,
            text=question.text,
            question_type=question.question_type,
            n=n,
            distribution=dict(dist),
        )

    # ------------------------------------------------------------------
    # Forced choice  — answer format: '{"Most like me": "Item A", ...}'
    # distribution key: "<label>|<item>"  → count
    # ------------------------------------------------------------------
    if question.question_type == "forced_choice":
        dist = defaultdict(int)
        for a in q_answers:
            try:
                assigned: dict[str, str] = json.loads(a.value)
                for label, item in assigned.items():
                    dist[f"{label}|{item}"] += 1
            except (json.JSONDecodeError, TypeError):
                pass
        return QuestionStat(
            question_id=question.id,
            text=question.text,
            question_type=question.question_type,
            n=n,
            distribution=dict(dist),
        )

    # ------------------------------------------------------------------
    # Ranking  — answer format: '["Item B", "Item A", "Item C"]'
    # ranking_averages: item → average rank (1-based, lower = preferred)
    # ------------------------------------------------------------------
    if question.question_type == "ranking":
        rank_sums: dict[str, float] = defaultdict(float)
        rank_counts: dict[str, int] = defaultdict(int)
        for a in q_answers:
            try:
                ranked: list[str] = json.loads(a.value)
                for pos, item in enumerate(ranked):
                    rank_sums[item] += pos + 1  # 1-based
                    rank_counts[item] += 1
            except (json.JSONDecodeError, TypeError):
                pass

        try:
            original_order: list[str] = json.loads(question.options or "[]")
        except (json.JSONDecodeError, TypeError):
            original_order = list(rank_sums.keys())

        averages = {
            item: round(rank_sums[item] / rank_counts[item], 2)
            for item in original_order
            if rank_counts[item] > 0
        }
        return QuestionStat(
            question_id=question.id,
            text=question.text,
            question_type=question.question_type,
            n=n,
            distribution={},
            ranking_averages=averages,
        )

    # ------------------------------------------------------------------
    # Open text
    # ------------------------------------------------------------------
    return QuestionStat(
        question_id=question.id,
        text=question.text,
        question_type=question.question_type,
        n=n,
        distribution={},
        text_values=[a.value for a in q_answers],
    )


# ---------------------------------------------------------------------------
# Survey CRUD  (all require auth; scoped to owner)
# ---------------------------------------------------------------------------


@survey_router.post("", response_model=SurveyOut, status_code=201)
async def create_survey(
    body: SurveyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyOut:
    survey = Survey(
        name=body.name,
        description=body.description,
        status=body.status,
        user_id=current_user.user_id,
    )
    db.add(survey)
    await db.flush()

    for q in body.questions:
        db.add(Question(
            survey_id=survey.id,
            text=q.text,
            question_type=q.question_type,
            options=_options_json(q),
            position=q.position,
            factor=q.factor or None,
            reverse_scored=q.reverse_scored,
            score_weight=q.score_weight,
            option_scores=_option_scores_json(q),
            is_demographic=q.is_demographic,
            demographic_key=q.demographic_key or None,
        ))

    await db.commit()
    await db.refresh(survey)
    loaded = await _get_survey_or_404(survey.id, db)
    return _survey_out(loaded, 0)


@survey_router.get("", response_model=list[SurveyListItem])
async def list_surveys(
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[SurveyListItem]:
    count_subq = (
        select(Response.survey_id, func.count(Response.id).label("cnt"))
        .group_by(Response.survey_id)
        .subquery()
    )
    stmt = (
        select(Survey, func.coalesce(count_subq.c.cnt, 0).label("response_count"))
        .outerjoin(count_subq, count_subq.c.survey_id == Survey.id)
        .where(Survey.user_id == current_user.user_id)
        .order_by(Survey.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        SurveyListItem(
            id=s.id,
            name=s.name,
            description=s.description,
            status=s.status,
            created_at=s.created_at,
            response_count=cnt,
        )
        for s, cnt in rows
    ]


@survey_router.get("/{survey_id}", response_model=SurveyOut)
async def get_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[AuthUser] = Depends(optional_user),
) -> SurveyOut:
    """
    Public for published surveys (respondents need it).
    Draft surveys are only visible to their owner.
    """
    survey = await _get_survey_or_404(survey_id, db)

    is_owner = current_user is not None and survey.user_id == current_user.user_id
    if survey.status != "published" and not is_owner:
        raise HTTPException(status_code=404, detail="Survey not found")

    cnt = await _response_count(survey_id, db)
    return _survey_out(survey, cnt)


@survey_router.patch("/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: str,
    body: SurveyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    if body.name is not None:
        survey.name = body.name
    if body.description is not None:
        survey.description = body.description
    if body.status is not None:
        survey.status = body.status
    await db.commit()
    await db.refresh(survey)
    cnt = await _response_count(survey_id, db)
    return _survey_out(survey, cnt)


@survey_router.delete("/{survey_id}", status_code=204)
async def delete_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    await db.delete(survey)
    await db.commit()


# ---------------------------------------------------------------------------
# Question management  (owner only)
# ---------------------------------------------------------------------------


@survey_router.post("/{survey_id}/questions", response_model=QuestionOut, status_code=201)
async def add_question(
    survey_id: str,
    body: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> QuestionOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    q = Question(
        survey_id=survey_id,
        text=body.text,
        question_type=body.question_type,
        options=_options_json(body),
        position=body.position,
        factor=body.factor or None,
        reverse_scored=body.reverse_scored,
        score_weight=body.score_weight,
        option_scores=_option_scores_json(body),
        is_demographic=body.is_demographic,
        demographic_key=body.demographic_key or None,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return QuestionOut.model_validate(q)


async def _get_question_survey(question_id: str, db: AsyncSession) -> tuple[Question, Survey]:
    """Return (question, survey) or raise 404."""
    q = (await db.execute(select(Question).where(Question.id == question_id))).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")
    survey = (await db.execute(
        select(Survey).options(selectinload(Survey.questions)).where(Survey.id == q.survey_id)
    )).scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")
    return q, survey


@question_router.patch("/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: str,
    body: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> QuestionOut:
    q, survey = await _get_question_survey(question_id, db)
    _assert_owner(survey, current_user.user_id)

    if body.text is not None:
        q.text = body.text
    if body.question_type is not None:
        q.question_type = body.question_type
    if body.options is not None or body.forced_choice_config is not None:
        q.options = _options_json(body)
    if body.position is not None:
        q.position = body.position
    if body.factor is not None:
        q.factor = body.factor or None  # empty string → NULL
    if body.reverse_scored is not None:
        q.reverse_scored = body.reverse_scored
    if body.score_weight is not None:
        q.score_weight = body.score_weight
    if body.option_scores is not None:
        q.option_scores = json.dumps(body.option_scores) if body.option_scores else None
    if body.is_demographic is not None:
        q.is_demographic = body.is_demographic
    if body.demographic_key is not None:
        q.demographic_key = body.demographic_key or None
    await db.commit()
    await db.refresh(q)
    return QuestionOut.model_validate(q)


@question_router.delete("/{question_id}", status_code=204)
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    q, survey = await _get_question_survey(question_id, db)
    _assert_owner(survey, current_user.user_id)
    await db.delete(q)
    await db.commit()


# ---------------------------------------------------------------------------
# Factor management  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/factors", response_model=list[SurveyFactorOut])
async def list_factors(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[SurveyFactorOut]:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    stmt = (
        select(SurveyFactor)
        .where(SurveyFactor.survey_id == survey_id)
        .order_by(SurveyFactor.name)
    )
    factors = list((await db.execute(stmt)).scalars().all())
    return [SurveyFactorOut.model_validate(f) for f in factors]


@survey_router.post("/{survey_id}/factors", response_model=SurveyFactorOut, status_code=201)
async def create_factor(
    survey_id: str,
    body: SurveyFactorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyFactorOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    factor = SurveyFactor(
        survey_id=survey_id,
        name=body.name,
        description=body.description,
    )
    db.add(factor)
    await db.commit()
    await db.refresh(factor)
    return SurveyFactorOut.model_validate(factor)


@survey_router.patch("/{survey_id}/factors/{factor_id}", response_model=SurveyFactorOut)
async def update_factor(
    survey_id: str,
    factor_id: str,
    body: SurveyFactorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyFactorOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    factor = (await db.execute(
        select(SurveyFactor).where(
            SurveyFactor.id == factor_id,
            SurveyFactor.survey_id == survey_id,
        )
    )).scalar_one_or_none()
    if factor is None:
        raise HTTPException(status_code=404, detail="Factor not found")
    if body.name is not None:
        factor.name = body.name
    if body.description is not None:
        factor.description = body.description
    await db.commit()
    await db.refresh(factor)
    return SurveyFactorOut.model_validate(factor)


@survey_router.delete("/{survey_id}/factors/{factor_id}", status_code=204)
async def delete_factor(
    survey_id: str,
    factor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    factor = (await db.execute(
        select(SurveyFactor).where(
            SurveyFactor.id == factor_id,
            SurveyFactor.survey_id == survey_id,
        )
    )).scalar_one_or_none()
    if factor is None:
        raise HTTPException(status_code=404, detail="Factor not found")
    await db.delete(factor)
    await db.commit()


# ---------------------------------------------------------------------------
# Scoring algorithm management  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/scoring-algorithms", response_model=list[ScoringAlgorithmOut])
async def list_scoring_algorithms(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[ScoringAlgorithmOut]:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    stmt = (
        select(ScoringAlgorithm)
        .where(ScoringAlgorithm.survey_id == survey_id)
        .order_by(ScoringAlgorithm.created_at)
    )
    algos = list((await db.execute(stmt)).scalars().all())
    return [ScoringAlgorithmOut.model_validate(a) for a in algos]


@survey_router.post(
    "/{survey_id}/scoring-algorithms",
    response_model=ScoringAlgorithmOut,
    status_code=201,
)
async def create_scoring_algorithm(
    survey_id: str,
    body: ScoringAlgorithmCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> ScoringAlgorithmOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    # Validate factor_id belongs to this survey (if provided)
    if body.factor_id is not None:
        factor = (await db.execute(
            select(SurveyFactor).where(
                SurveyFactor.id == body.factor_id,
                SurveyFactor.survey_id == survey_id,
            )
        )).scalar_one_or_none()
        if factor is None:
            raise HTTPException(status_code=404, detail="Factor not found")

    algo = ScoringAlgorithm(
        survey_id=survey_id,
        factor_id=body.factor_id,
        min_possible=body.min_possible,
        max_possible=body.max_possible,
        normalized_min=body.normalized_min,
        normalized_max=body.normalized_max,
        labels=json.dumps([lt.model_dump() for lt in body.labels]) if body.labels else None,
    )
    db.add(algo)
    await db.commit()
    await db.refresh(algo)
    return ScoringAlgorithmOut.model_validate(algo)


@survey_router.patch(
    "/{survey_id}/scoring-algorithms/{algo_id}",
    response_model=ScoringAlgorithmOut,
)
async def update_scoring_algorithm(
    survey_id: str,
    algo_id: str,
    body: ScoringAlgorithmUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> ScoringAlgorithmOut:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    algo = (await db.execute(
        select(ScoringAlgorithm).where(
            ScoringAlgorithm.id == algo_id,
            ScoringAlgorithm.survey_id == survey_id,
        )
    )).scalar_one_or_none()
    if algo is None:
        raise HTTPException(status_code=404, detail="Scoring algorithm not found")

    if body.min_possible is not None:
        algo.min_possible = body.min_possible
    if body.max_possible is not None:
        algo.max_possible = body.max_possible
    if body.normalized_min is not None:
        algo.normalized_min = body.normalized_min
    if body.normalized_max is not None:
        algo.normalized_max = body.normalized_max
    if body.labels is not None:
        algo.labels = json.dumps([lt.model_dump() for lt in body.labels])
    await db.commit()
    await db.refresh(algo)
    return ScoringAlgorithmOut.model_validate(algo)


@survey_router.delete("/{survey_id}/scoring-algorithms/{algo_id}", status_code=204)
async def delete_scoring_algorithm(
    survey_id: str,
    algo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> None:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)
    algo = (await db.execute(
        select(ScoringAlgorithm).where(
            ScoringAlgorithm.id == algo_id,
            ScoringAlgorithm.survey_id == survey_id,
        )
    )).scalar_one_or_none()
    if algo is None:
        raise HTTPException(status_code=404, detail="Scoring algorithm not found")
    await db.delete(algo)
    await db.commit()


# ---------------------------------------------------------------------------
# Response submission  (public — survey must be published)
# ---------------------------------------------------------------------------


@survey_router.post("/{survey_id}/responses", response_model=ResponseOut, status_code=201)
async def submit_response(
    survey_id: str,
    body: ResponseSubmit,
    db: AsyncSession = Depends(get_db),
) -> ResponseOut:
    survey = await _get_survey_or_404(survey_id, db)
    if survey.status == "closed":
        raise HTTPException(status_code=403, detail="This assessment is closed.")
    if survey.status != "published":
        raise HTTPException(status_code=400, detail="Survey is not published.")

    valid_ids = {q.id for q in survey.questions}
    for ans in body.answers:
        if ans.question_id not in valid_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Question {ans.question_id} does not belong to this survey.",
            )

    response = Response(survey_id=survey_id, respondent_ref=body.respondent_ref)
    db.add(response)
    await db.flush()

    question_map = {q.id: q for q in survey.questions}
    for ans in body.answers:
        q = question_map[ans.question_id]
        # Legacy Likert score (raw value, kept for backward compat)
        legacy_score: float | None = None
        if q.question_type in ("likert_5", "likert_7"):
            try:
                legacy_score = float(ans.value)
            except ValueError:
                pass
        # Computed psychometric score (v0.4)
        numeric = score_answer(q, ans.value)
        db.add(Answer(
            response_id=response.id,
            question_id=ans.question_id,
            value=ans.value,
            score=legacy_score,
            numeric_score=numeric,
            demographic_value=ans.value if q.is_demographic else None,
        ))

    await db.commit()
    await db.refresh(response)

    # If a valid invite token was passed as respondent_ref, mark the invite responded
    if body.respondent_ref:
        inv_stmt = select(SurveyInvite).where(
            SurveyInvite.token == body.respondent_ref,
            SurveyInvite.survey_id == survey_id,
        )
        invite = (await db.execute(inv_stmt)).scalar_one_or_none()
        if invite and invite.responded_at is None:
            invite.responded_at = datetime.now(timezone.utc)
            await db.commit()

    return ResponseOut(
        id=response.id,
        survey_id=response.survey_id,
        respondent_ref=response.respondent_ref,
        submitted_at=response.submitted_at,
    )


# ---------------------------------------------------------------------------
# Results  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/results", response_model=SurveyResults)
async def get_results(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyResults:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    response_count = await _response_count(survey_id, db)

    stmt = (
        select(Answer)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
    )
    all_answers = list((await db.execute(stmt)).scalars().all())

    return SurveyResults(
        survey_id=survey_id,
        survey_name=survey.name,
        response_count=response_count,
        questions=[_compute_question_stat(q, all_answers) for q in survey.questions],
    )


# ---------------------------------------------------------------------------
# Factor scores  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/factor-scores", response_model=FactorScoresResponse)
async def get_factor_scores(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> FactorScoresResponse:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    # Questions that have a factor name assigned
    factor_of: dict[str, str] = {q.id: q.factor for q in survey.questions if q.factor}
    all_factors = sorted(set(factor_of.values()))

    def _empty_entry() -> FactorScoreEntry:
        return FactorScoreEntry(raw_mean=None)

    empty = FactorScoresResponse(
        survey_id=survey_id,
        factors=all_factors,
        rows=[],
        summary=FactorScoresSummary(
            mean={f: _empty_entry() for f in all_factors},
            sd={f: None for f in all_factors},
        ),
    )

    if not all_factors:
        return empty

    # Load survey factors to build name → factor_id mapping
    sf_rows = list((await db.execute(
        select(SurveyFactor).where(SurveyFactor.survey_id == survey_id)
    )).scalars().all())
    name_to_factor_id: dict[str, str] = {sf.name: sf.id for sf in sf_rows}

    # Load scoring algorithms keyed by factor_id (None = composite)
    algo_rows = list((await db.execute(
        select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == survey_id)
    )).scalars().all())
    algo_by_factor_id: dict[str | None, ScoringAlgorithm] = {a.factor_id: a for a in algo_rows}

    def _apply_algo(raw_mean: float, factor_name: str) -> FactorScoreEntry:
        """Normalize and label a raw mean score using the factor's algorithm."""
        factor_id = name_to_factor_id.get(factor_name)
        algo = algo_by_factor_id.get(factor_id) if factor_id else None
        if algo is None:
            return FactorScoreEntry(raw_mean=round(raw_mean, 4))
        norm = normalize(
            raw_mean,
            algo.min_possible,
            algo.max_possible,
            algo.normalized_min,
            algo.normalized_max,
        )
        norm = round(norm, 2)
        label_info: dict | None = None
        if algo.labels:
            try:
                label_list = json.loads(algo.labels)
                label_info = get_label(norm, label_list)
            except (json.JSONDecodeError, TypeError):
                pass
        return FactorScoreEntry(
            raw_mean=round(raw_mean, 4),
            normalized=norm,
            label=label_info["label"] if label_info else None,
            color=label_info["color"] if label_info else None,
        )

    # All responses in submission order
    resp_rows = list((await db.execute(
        select(Response.id, Response.respondent_ref)
        .where(Response.survey_id == survey_id)
        .order_by(Response.submitted_at)
    )).all())

    if not resp_rows:
        return empty

    # Answers with numeric_score for factored questions only
    ans_stmt = (
        select(Answer.response_id, Answer.question_id, Answer.numeric_score)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
        .where(Answer.question_id.in_(factor_of.keys()))
    )
    raw_answers = list((await db.execute(ans_stmt)).all())

    # Accumulate: resp_id → factor → [numeric_scores]
    acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for resp_id, q_id, ns in raw_answers:
        if ns is not None:
            acc[resp_id][factor_of[q_id]].append(ns)

    # Build per-respondent rows
    rows: list[RespondentFactorScores] = []
    # Track raw means per factor for summary computation
    factor_raw_vals: dict[str, list[float]] = defaultdict(list)
    for resp_id, resp_ref in resp_rows:
        factor_data = acc.get(resp_id, {})
        scores: dict[str, FactorScoreEntry] = {}
        for f in all_factors:
            vals = factor_data.get(f, [])
            if vals:
                raw_mean = sum(vals) / len(vals)
                factor_raw_vals[f].append(raw_mean)
                scores[f] = _apply_algo(raw_mean, f)
            else:
                scores[f] = _empty_entry()
        rows.append(RespondentFactorScores(
            response_id=resp_id,
            respondent_id=resp_ref or resp_id[:8],
            scores=scores,
        ))

    # Summary: mean ± SD of raw means per factor
    mean_d: dict[str, FactorScoreEntry] = {}
    sd_d: dict[str, float | None] = {}
    for f in all_factors:
        vals = factor_raw_vals[f]
        if vals:
            m = sum(vals) / len(vals)
            mean_d[f] = _apply_algo(m, f)
            if len(vals) > 1:
                variance = sum((v - m) ** 2 for v in vals) / (len(vals) - 1)
                sd_d[f] = round(math.sqrt(variance), 4)
            else:
                sd_d[f] = 0.0
        else:
            mean_d[f] = _empty_entry()
            sd_d[f] = None

    return FactorScoresResponse(
        survey_id=survey_id,
        factors=all_factors,
        rows=rows,
        summary=FactorScoresSummary(mean=mean_d, sd=sd_d),
    )


# ---------------------------------------------------------------------------
# Participant report  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get(
    "/{survey_id}/responses/{response_id}/report",
    response_model=ParticipantReport,
)
async def get_participant_report(
    survey_id: str,
    response_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> ParticipantReport:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    # Load the specific response
    response = (await db.execute(
        select(Response).where(
            Response.id == response_id,
            Response.survey_id == survey_id,
        )
    )).scalar_one_or_none()
    if response is None:
        raise HTTPException(status_code=404, detail="Response not found")

    # Load answers for this response
    raw_answers = list((await db.execute(
        select(Answer).where(Answer.response_id == response_id)
    )).scalars().all())

    # Load factors and algorithms
    sf_rows = list((await db.execute(
        select(SurveyFactor).where(SurveyFactor.survey_id == survey_id)
        .order_by(SurveyFactor.name)
    )).scalars().all())
    name_to_factor_id: dict[str, str] = {sf.name: sf.id for sf in sf_rows}

    algo_rows = list((await db.execute(
        select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == survey_id)
    )).scalars().all())
    algo_by_factor_id: dict[str | None, ScoringAlgorithm] = {a.factor_id: a for a in algo_rows}

    def _apply_algo(
        raw_score: float, factor_name: str | None
    ) -> tuple[float | None, str | None, str | None]:
        """Return (normalized, label, color) for a raw score + factor."""
        fid = name_to_factor_id.get(factor_name) if factor_name else None
        algo = algo_by_factor_id.get(fid) if fid else None
        if algo is None:
            return None, None, None
        norm = normalize(
            raw_score,
            algo.min_possible,
            algo.max_possible,
            algo.normalized_min,
            algo.normalized_max,
        )
        norm = round(norm, 2)
        label_info: dict | None = None
        if algo.labels:
            try:
                label_info = get_label(norm, json.loads(algo.labels))
            except (json.JSONDecodeError, TypeError):
                pass
        return norm, (label_info or {}).get("label"), (label_info or {}).get("color")

    # Build question map (id → Question), preserving position order
    question_map = {q.id: q for q in survey.questions}

    # ── Per-answer details ──────────────────────────────────────────────────
    answer_reports: list[AnswerReport] = []
    for ans in raw_answers:
        q = question_map.get(ans.question_id)
        if q is None:
            continue
        if ans.numeric_score is not None:
            norm, lbl, clr = _apply_algo(ans.numeric_score, q.factor)
        else:
            norm, lbl, clr = None, None, None
        answer_reports.append(AnswerReport(
            question_id=q.id,
            question_text=q.text,
            factor=q.factor,
            value=ans.value,
            raw_score=ans.numeric_score,
            normalized=norm,
            label=lbl,
            color=clr,
            reverse_scored=q.reverse_scored,
        ))
    answer_reports.sort(key=lambda a: question_map[a.question_id].position)

    # ── Factor summaries ────────────────────────────────────────────────────
    factor_score_acc: dict[str, list[float]] = defaultdict(list)
    for ans in raw_answers:
        q = question_map.get(ans.question_id)
        if q and q.factor and ans.numeric_score is not None:
            factor_score_acc[q.factor].append(ans.numeric_score)

    factor_item_counts: dict[str, int] = defaultdict(int)
    for ans in raw_answers:
        q = question_map.get(ans.question_id)
        if q and q.factor:
            factor_item_counts[q.factor] += 1

    factor_reports: list[FactorReport] = []
    factor_norm_scores: list[float] = []

    for sf in sf_rows:
        fname = sf.name
        vals = factor_score_acc.get(fname, [])
        raw_mean = sum(vals) / len(vals) if vals else None
        if raw_mean is not None:
            norm, lbl, clr = _apply_algo(raw_mean, fname)
            if norm is not None:
                factor_norm_scores.append(norm)
        else:
            norm, lbl, clr = None, None, None
        factor_reports.append(FactorReport(
            factor_name=fname,
            item_count=factor_item_counts.get(fname, 0),
            raw_mean=round(raw_mean, 4) if raw_mean is not None else None,
            normalized=norm,
            label=lbl,
            color=clr,
        ))

    # ── Composite ───────────────────────────────────────────────────────────
    composite_norm = (
        round(sum(factor_norm_scores) / len(factor_norm_scores), 2)
        if factor_norm_scores else None
    )
    comp_lbl, comp_clr = None, None
    if composite_norm is not None:
        comp_algo = algo_by_factor_id.get(None)  # factor_id IS NULL → composite
        if comp_algo and comp_algo.labels:
            try:
                li = get_label(composite_norm, json.loads(comp_algo.labels))
                if li:
                    comp_lbl, comp_clr = li["label"], li["color"]
            except (json.JSONDecodeError, TypeError):
                pass

    return ParticipantReport(
        survey_id=survey_id,
        survey_title=survey.name,
        survey_description=survey.description,
        response_id=response_id,
        respondent_ref=response.respondent_ref,
        submitted_at=response.submitted_at,
        answers=answer_reports,
        factors=factor_reports,
        composite=CompositeReport(
            normalized=composite_norm,
            label=comp_lbl,
            color=comp_clr,
        ),
    )


# ---------------------------------------------------------------------------
# Dashboard  (owner only)
# ---------------------------------------------------------------------------


async def _load_algo_helpers(
    survey_id: str, db: AsyncSession
) -> tuple[
    dict[str, str],                          # factor_name → factor_id
    dict[str | None, ScoringAlgorithm],      # factor_id | None → algo
]:
    """Shared loader for factor-name→id map and algo lookup."""
    sf_rows = list((await db.execute(
        select(SurveyFactor).where(SurveyFactor.survey_id == survey_id).order_by(SurveyFactor.name)
    )).scalars().all())
    algo_rows = list((await db.execute(
        select(ScoringAlgorithm).where(ScoringAlgorithm.survey_id == survey_id)
    )).scalars().all())
    return (
        {sf.name: sf.id for sf in sf_rows},
        {a.factor_id: a for a in algo_rows},
    )


def _algo_apply(
    raw_score: float,
    factor_name: str | None,
    name_to_fid: dict[str, str],
    algo_by_fid: dict[str | None, ScoringAlgorithm],
) -> tuple[float | None, str | None, str | None]:
    """Return (normalized, label, color)."""
    fid = name_to_fid.get(factor_name) if factor_name else None
    algo = algo_by_fid.get(fid) if fid else None
    if algo is None:
        return None, None, None
    norm = round(normalize(raw_score, algo.min_possible, algo.max_possible,
                           algo.normalized_min, algo.normalized_max), 2)
    li: dict | None = None
    if algo.labels:
        try:
            li = get_label(norm, json.loads(algo.labels))
        except (json.JSONDecodeError, TypeError):
            pass
    return norm, (li or {}).get("label"), (li or {}).get("color")


def _composite_apply(
    factor_norm_scores: list[float],
    algo_by_fid: dict[str | None, ScoringAlgorithm],
) -> tuple[float | None, str | None, str | None]:
    if not factor_norm_scores:
        return None, None, None
    comp = round(sum(factor_norm_scores) / len(factor_norm_scores), 2)
    comp_algo = algo_by_fid.get(None)
    if comp_algo and comp_algo.labels:
        try:
            li = get_label(comp, json.loads(comp_algo.labels))
            if li:
                return comp, li["label"], li["color"]
        except (json.JSONDecodeError, TypeError):
            pass
    return comp, None, None


@survey_router.get("/{survey_id}/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> DashboardResponse:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    name_to_fid, algo_by_fid = await _load_algo_helpers(survey_id, db)
    question_map = {q.id: q for q in survey.questions}

    # All responses
    resp_rows = list((await db.execute(
        select(Response.id, Response.submitted_at)
        .where(Response.survey_id == survey_id)
        .order_by(Response.submitted_at)
    )).all())

    response_count = len(resp_rows)
    date_start = resp_rows[0].submitted_at if resp_rows else None
    date_end = resp_rows[-1].submitted_at if resp_rows else None

    # All answers for this survey
    all_answers = list((await db.execute(
        select(Answer.response_id, Answer.question_id, Answer.numeric_score)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
    )).all())

    # Demographic keys (distinct) from questions marked as demographic
    demo_keys = sorted({
        q.demographic_key
        for q in survey.questions
        if q.is_demographic and q.demographic_key
    })

    # Accumulate factor raw means per respondent
    acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for resp_id, q_id, ns in all_answers:
        q = question_map.get(q_id)
        if q and q.factor and ns is not None:
            acc[resp_id][q.factor].append(ns)

    # Factor scores: resp_id → factor → normalized
    factor_norm_by_resp: dict[str, dict[str, float]] = {}
    for resp_id, _ in resp_rows:
        fdata = acc.get(resp_id, {})
        norm_scores: dict[str, float] = {}
        for fname in name_to_fid:
            vals = fdata.get(fname, [])
            if vals:
                raw_mean = sum(vals) / len(vals)
                norm, _, _ = _algo_apply(raw_mean, fname, name_to_fid, algo_by_fid)
                if norm is not None:
                    norm_scores[fname] = norm
        factor_norm_by_resp[resp_id] = norm_scores

    # Composite per respondent
    composite_scores: list[float] = []
    for resp_id, _ in resp_rows:
        fn = factor_norm_by_resp.get(resp_id, {})
        if fn:
            comp, _, _ = _composite_apply(list(fn.values()), algo_by_fid)
            if comp is not None:
                composite_scores.append(comp)

    avg_comp: float | None = None
    comp_lbl, comp_clr = None, None
    if composite_scores:
        avg_comp = round(sum(composite_scores) / len(composite_scores), 2)
        _, comp_lbl, comp_clr = _composite_apply([avg_comp], algo_by_fid)

    # Factor distributions via cohort_summary
    factor_scores_flat: dict[str, list[float]] = defaultdict(list)
    for resp_id, fn in factor_norm_by_resp.items():
        for fname, score in fn.items():
            factor_scores_flat[fname].append(score)

    summary = cohort_summary(dict(factor_scores_flat))

    factor_distributions: list[FactorDistribution] = []
    for fname in sorted(summary.keys()):
        s = summary[fname]
        lbl, clr = None, None
        if s["mean"] is not None:
            _, lbl, clr = _algo_apply(s["mean"], fname, name_to_fid, algo_by_fid)
        factor_distributions.append(FactorDistribution(
            factor_name=fname,
            mean=s["mean"],
            sd=s["sd"],
            min=s["min"],
            max=s["max"],
            n=s["n"],
            histogram=[HistogramBin(**b) for b in s["histogram"]],
            label=lbl,
            color=clr,
        ))

    # Sort by mean desc (factors with None mean last)
    factor_distributions.sort(
        key=lambda fd: fd.mean if fd.mean is not None else -1,
        reverse=True,
    )

    from app.services.cohort_analytics import _histogram
    comp_hist = [HistogramBin(**b) for b in _histogram(composite_scores)]

    return DashboardResponse(
        survey_id=survey_id,
        response_count=response_count,
        date_range_start=date_start,
        date_range_end=date_end,
        average_composite=avg_comp,
        composite_label=comp_lbl,
        composite_color=comp_clr,
        factor_distributions=factor_distributions,
        composite_histogram=comp_hist,
        demographic_keys=demo_keys,
    )


# ---------------------------------------------------------------------------
# Group comparison  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/group-comparison", response_model=GroupComparisonResponse)
async def get_group_comparison(
    survey_id: str,
    demographic_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> GroupComparisonResponse:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    name_to_fid, algo_by_fid = await _load_algo_helpers(survey_id, db)
    question_map = {q.id: q for q in survey.questions}

    # Find the demographic question IDs for this key
    demo_q_ids = {
        q.id for q in survey.questions
        if q.is_demographic and q.demographic_key == demographic_key
    }
    if not demo_q_ids:
        raise HTTPException(
            status_code=404,
            detail=f"No demographic question found with key '{demographic_key}'"
        )

    # Load all answers in one query
    all_ans = list((await db.execute(
        select(Answer.response_id, Answer.question_id, Answer.numeric_score, Answer.demographic_value)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
    )).all())

    # Map response → demographic value for this key
    resp_demo: dict[str, str] = {}
    for resp_id, q_id, _, demo_val in all_ans:
        if q_id in demo_q_ids and demo_val:
            resp_demo[resp_id] = demo_val

    # Accumulate raw factor scores per respondent
    acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for resp_id, q_id, ns, _ in all_ans:
        q = question_map.get(q_id)
        if q and q.factor and ns is not None and not q.is_demographic:
            acc[resp_id][q.factor].append(ns)

    # Build: factor → group_value → [normalized scores]
    factor_group: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for resp_id, fdata in acc.items():
        gval = resp_demo.get(resp_id)
        if not gval:
            continue
        for fname, vals in fdata.items():
            if vals:
                raw_mean = sum(vals) / len(vals)
                norm, _, _ = _algo_apply(raw_mean, fname, name_to_fid, algo_by_fid)
                if norm is not None:
                    factor_group[fname][gval].append(norm)

    comparison = group_comparison(dict(factor_group))
    all_group_values = sorted({g for fg in factor_group.values() for g in fg})

    factors_out: list[FactorGroupComparison] = []
    for fname, res in comparison.items():
        factors_out.append(FactorGroupComparison(
            factor_name=fname,
            groups=[GroupStats(**g) for g in res["groups"]],
            test_type=res["test_type"],
            p_value=res["p_value"],
            significant=res["significant"],
            effect_size=res["effect_size"],
            effect_size_type=res["effect_size_type"],
            interpretation=res["interpretation"],
        ))

    return GroupComparisonResponse(
        survey_id=survey_id,
        demographic_key=demographic_key,
        group_values=all_group_values,
        factors=factors_out,
    )


# ---------------------------------------------------------------------------
# Respondents table  (owner only, paginated)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/respondents", response_model=RespondentsResponse)
async def get_respondents(
    survey_id: str,
    page: int = 1,
    page_size: int = 20,
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> RespondentsResponse:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    name_to_fid, algo_by_fid = await _load_algo_helpers(survey_id, db)
    question_map = {q.id: q for q in survey.questions}

    # All responses ordered by submission time
    all_resps = list((await db.execute(
        select(Response.id, Response.respondent_ref, Response.submitted_at)
        .where(Response.survey_id == survey_id)
        .order_by(Response.submitted_at.desc())
    )).all())

    # All answers for this survey
    all_ans = list((await db.execute(
        select(Answer.response_id, Answer.question_id, Answer.numeric_score, Answer.demographic_value)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
    )).all())

    # Build per-response data
    factor_acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    demo_acc: dict[str, dict[str, str]] = defaultdict(dict)

    for resp_id, q_id, ns, demo_val in all_ans:
        q = question_map.get(q_id)
        if not q:
            continue
        if q.is_demographic and q.demographic_key and demo_val:
            demo_acc[resp_id][q.demographic_key] = demo_val
        elif q.factor and ns is not None:
            factor_acc[resp_id][q.factor].append(ns)

    # Compute composite + factor scores per respondent
    rows_data: list[tuple[float | None, str, str | None, str]] = []
    # (composite_score_for_sort, resp_id, resp_ref, submitted_at)
    resp_detail: dict[str, tuple[float | None, str | None, str | None, dict, dict]] = {}
    # resp_id → (comp_score, comp_label, comp_color, factor_scores_dict, demographics_dict)

    for resp_id, resp_ref, submitted_at in all_resps:
        fdata = factor_acc.get(resp_id, {})
        factor_scores: dict[str, FactorScoreEntry] = {}
        fn_scores: list[float] = []

        for fname in name_to_fid:
            vals = fdata.get(fname, [])
            if vals:
                raw_mean = sum(vals) / len(vals)
                norm, lbl, clr = _algo_apply(raw_mean, fname, name_to_fid, algo_by_fid)
                factor_scores[fname] = FactorScoreEntry(
                    raw_mean=round(raw_mean, 4),
                    normalized=norm,
                    label=lbl,
                    color=clr,
                )
                if norm is not None:
                    fn_scores.append(norm)
            else:
                factor_scores[fname] = FactorScoreEntry(raw_mean=None)

        comp, comp_lbl, comp_clr = _composite_apply(fn_scores, algo_by_fid)
        resp_detail[resp_id] = (comp, comp_lbl, comp_clr, factor_scores, demo_acc.get(resp_id, {}))

    # Sort by composite score
    reverse = sort_dir.lower() != "asc"
    sorted_resps = sorted(
        all_resps,
        key=lambda r: (resp_detail[r[0]][0] is not None, resp_detail[r[0]][0] or 0.0),
        reverse=reverse,
    )

    total = len(sorted_resps)
    page = max(1, page)
    start = (page - 1) * page_size
    paged = sorted_resps[start: start + page_size]

    rows: list[RespondentRow] = []
    for resp_id, resp_ref, submitted_at in paged:
        comp, comp_lbl, comp_clr, factor_scores, demographics = resp_detail[resp_id]
        rows.append(RespondentRow(
            response_id=resp_id,
            respondent_ref=resp_ref,
            submitted_at=submitted_at,
            composite_score=comp,
            composite_label=comp_lbl,
            composite_color=comp_clr,
            factor_scores=factor_scores,
            demographics=demographics,
        ))

    return RespondentsResponse(
        survey_id=survey_id,
        total=total,
        page=page,
        page_size=page_size,
        rows=rows,
    )


# ---------------------------------------------------------------------------
# Reliability analysis  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/analyse/reliability", response_model=CronbachAlphaResponse)
async def analyse_reliability(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> CronbachAlphaResponse:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    likert_qs = [q for q in survey.questions if q.question_type in ("likert_5", "likert_7")]
    if len(likert_qs) < 2:
        raise HTTPException(
            status_code=400,
            detail="Reliability analysis requires at least 2 Likert-scale questions.",
        )

    resp_stmt = select(Response.id).where(Response.survey_id == survey_id)
    response_ids = list((await db.execute(resp_stmt)).scalars().all())
    if len(response_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="Reliability analysis requires at least 2 responses.",
        )

    likert_q_ids = {q.id for q in likert_qs}
    ans_stmt = (
        select(Answer)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
        .where(Answer.question_id.in_(likert_q_ids))
    )
    answers = list((await db.execute(ans_stmt)).scalars().all())

    resp_scores: dict[str, dict[str, float]] = defaultdict(dict)
    for a in answers:
        try:
            resp_scores[a.response_id][a.question_id] = float(a.value)
        except (ValueError, TypeError):
            pass

    q_order = [q.id for q in likert_qs]
    matrix: list[list[float]] = []
    for resp_id in response_ids:
        row_map = resp_scores.get(resp_id, {})
        if all(qid in row_map for qid in q_order):
            matrix.append([row_map[qid] for qid in q_order])

    if len(matrix) < 2:
        raise HTTPException(
            status_code=400,
            detail="Not enough complete responses for reliability analysis (need ≥ 2 with all Likert items answered).",
        )

    request = CronbachAlphaRequest(items=matrix, scale_name=survey.name)
    return compute_cronbach_alpha(request)


# ---------------------------------------------------------------------------
# Response rate stats  (owner only)
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/stats", response_model=SurveyStats)
async def get_survey_stats(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> SurveyStats:
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    total_invited = (
        await db.execute(
            select(func.count(SurveyInvite.id)).where(SurveyInvite.survey_id == survey_id)
        )
    ).scalar_one()

    total_responded_invites = (
        await db.execute(
            select(func.count(SurveyInvite.id)).where(
                SurveyInvite.survey_id == survey_id,
                SurveyInvite.responded_at.isnot(None),
            )
        )
    ).scalar_one()

    total_responses = await _response_count(survey_id, db)

    last_response_at = (
        await db.execute(
            select(func.max(Response.submitted_at)).where(Response.survey_id == survey_id)
        )
    ).scalar_one()

    response_rate = (
        round(total_responded_invites / total_invited * 100, 1)
        if total_invited > 0
        else 0.0
    )

    return SurveyStats(
        survey_id=survey_id,
        total_invited=total_invited,
        total_responded=total_responses,
        response_rate=response_rate,
        last_response_at=last_response_at,
        avg_completion_time_seconds=None,
    )


# ---------------------------------------------------------------------------
# Invite management  (owner only)
# ---------------------------------------------------------------------------


@survey_router.post("/{survey_id}/invites", response_model=list[InviteOut], status_code=201)
async def create_invites(
    survey_id: str,
    body: InviteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[InviteOut]:
    """Create invite records for a list of emails and return unique respond links."""
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    if not body.emails:
        raise HTTPException(status_code=422, detail="No emails provided.")

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_emails = [e.strip().lower() for e in body.emails if e.strip() and e.strip().lower() not in seen and not seen.add(e.strip().lower())]  # type: ignore[func-returns-value]

    created: list[InviteOut] = []
    for email in unique_emails:
        invite = SurveyInvite(survey_id=survey_id, email=email)
        db.add(invite)
        await db.flush()

        base_url = str(request.base_url).rstrip("/")
        respond_url = f"{base_url}/surveys/{survey_id}/respond?token={invite.token}"
        created.append(InviteOut(
            id=invite.id,
            survey_id=invite.survey_id,
            email=invite.email,
            token=invite.token,
            invited_at=invite.invited_at,
            responded_at=invite.responded_at,
            respond_url=respond_url,
        ))

    await db.commit()
    return created


@survey_router.get("/{survey_id}/invites", response_model=list[InviteOut])
async def list_invites(
    survey_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: AuthUser = Depends(require_user),
) -> list[InviteOut]:
    """List all invites for a survey."""
    survey = await _get_survey_or_404(survey_id, db)
    _assert_owner(survey, current_user.user_id)

    stmt = (
        select(SurveyInvite)
        .where(SurveyInvite.survey_id == survey_id)
        .order_by(SurveyInvite.invited_at.desc())
    )
    invites = list((await db.execute(stmt)).scalars().all())

    base_url = str(request.base_url).rstrip("/")
    return [
        InviteOut(
            id=inv.id,
            survey_id=inv.survey_id,
            email=inv.email,
            token=inv.token,
            invited_at=inv.invited_at,
            responded_at=inv.responded_at,
            respond_url=f"{base_url}/surveys/{survey_id}/respond?token={inv.token}",
        )
        for inv in invites
    ]
