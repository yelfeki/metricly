"""Survey CRUD, question management, response submission, and results."""

import json
import math
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..models.survey import Answer, Question, Response, Survey
from ..schemas.reliability import CronbachAlphaRequest, CronbachAlphaResponse
from ..schemas.survey import (
    QuestionCreate,
    QuestionOut,
    QuestionStat,
    QuestionUpdate,
    ResponseOut,
    ResponseSubmit,
    SurveyCreate,
    SurveyListItem,
    SurveyOut,
    SurveyResults,
    SurveyUpdate,
)
from ..services.reliability import compute_cronbach_alpha

survey_router = APIRouter(prefix="/surveys", tags=["surveys"])
question_router = APIRouter(prefix="/questions", tags=["questions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _options_json(body: QuestionCreate | QuestionUpdate) -> str | None:
    """Serialize options or forced_choice_config to the DB text column."""
    qt = body.question_type
    if qt == "forced_choice" and body.forced_choice_config:
        cfg = body.forced_choice_config
        return json.dumps({"items": cfg.items, "labels": cfg.labels})
    return json.dumps(body.options) if body.options else None


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

        # Preserve the original option order from the question definition
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
# Survey CRUD
# ---------------------------------------------------------------------------


@survey_router.post("", response_model=SurveyOut, status_code=201)
async def create_survey(
    body: SurveyCreate, db: AsyncSession = Depends(get_db)
) -> SurveyOut:
    survey = Survey(
        name=body.name,
        description=body.description,
        status=body.status,
    )
    db.add(survey)
    await db.flush()  # assigns survey.id

    for q in body.questions:
        db.add(Question(
            survey_id=survey.id,
            text=q.text,
            question_type=q.question_type,
            options=_options_json(q),
            position=q.position,
        ))

    await db.commit()
    await db.refresh(survey)
    loaded = await _get_survey_or_404(survey.id, db)
    return _survey_out(loaded, 0)


@survey_router.get("", response_model=list[SurveyListItem])
async def list_surveys(db: AsyncSession = Depends(get_db)) -> list[SurveyListItem]:
    count_subq = (
        select(Response.survey_id, func.count(Response.id).label("cnt"))
        .group_by(Response.survey_id)
        .subquery()
    )
    stmt = (
        select(Survey, func.coalesce(count_subq.c.cnt, 0).label("response_count"))
        .outerjoin(count_subq, count_subq.c.survey_id == Survey.id)
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
async def get_survey(survey_id: str, db: AsyncSession = Depends(get_db)) -> SurveyOut:
    survey = await _get_survey_or_404(survey_id, db)
    cnt = await _response_count(survey_id, db)
    return _survey_out(survey, cnt)


@survey_router.patch("/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: str, body: SurveyUpdate, db: AsyncSession = Depends(get_db)
) -> SurveyOut:
    survey = await _get_survey_or_404(survey_id, db)
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
async def delete_survey(survey_id: str, db: AsyncSession = Depends(get_db)) -> None:
    survey = await _get_survey_or_404(survey_id, db)
    await db.delete(survey)
    await db.commit()


# ---------------------------------------------------------------------------
# Question management
# ---------------------------------------------------------------------------


@survey_router.post("/{survey_id}/questions", response_model=QuestionOut, status_code=201)
async def add_question(
    survey_id: str, body: QuestionCreate, db: AsyncSession = Depends(get_db)
) -> QuestionOut:
    await _get_survey_or_404(survey_id, db)
    q = Question(
        survey_id=survey_id,
        text=body.text,
        question_type=body.question_type,
        options=_options_json(body),
        position=body.position,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return QuestionOut.model_validate(q)


@question_router.patch("/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: str, body: QuestionUpdate, db: AsyncSession = Depends(get_db)
) -> QuestionOut:
    q = (await db.execute(select(Question).where(Question.id == question_id))).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")
    if body.text is not None:
        q.text = body.text
    if body.question_type is not None:
        q.question_type = body.question_type
    if body.options is not None or body.forced_choice_config is not None:
        q.options = _options_json(body)
    if body.position is not None:
        q.position = body.position
    await db.commit()
    await db.refresh(q)
    return QuestionOut.model_validate(q)


@question_router.delete("/{question_id}", status_code=204)
async def delete_question(
    question_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    q = (await db.execute(select(Question).where(Question.id == question_id))).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")
    await db.delete(q)
    await db.commit()


# ---------------------------------------------------------------------------
# Response submission
# ---------------------------------------------------------------------------


@survey_router.post("/{survey_id}/responses", response_model=ResponseOut, status_code=201)
async def submit_response(
    survey_id: str, body: ResponseSubmit, db: AsyncSession = Depends(get_db)
) -> ResponseOut:
    survey = await _get_survey_or_404(survey_id, db)
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
        score: float | None = None
        if q.question_type in ("likert_5", "likert_7"):
            try:
                score = float(ans.value)
            except ValueError:
                pass
        db.add(Answer(
            response_id=response.id,
            question_id=ans.question_id,
            value=ans.value,
            score=score,
        ))

    await db.commit()
    await db.refresh(response)
    return ResponseOut(
        id=response.id,
        survey_id=response.survey_id,
        respondent_ref=response.respondent_ref,
        submitted_at=response.submitted_at,
    )


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/results", response_model=SurveyResults)
async def get_results(
    survey_id: str, db: AsyncSession = Depends(get_db)
) -> SurveyResults:
    survey = await _get_survey_or_404(survey_id, db)
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
# Reliability analysis
# ---------------------------------------------------------------------------


@survey_router.get("/{survey_id}/analyse/reliability", response_model=CronbachAlphaResponse)
async def analyse_reliability(
    survey_id: str, db: AsyncSession = Depends(get_db)
) -> CronbachAlphaResponse:
    survey = await _get_survey_or_404(survey_id, db)

    likert_qs = [q for q in survey.questions if q.question_type in ("likert_5", "likert_7")]
    if len(likert_qs) < 2:
        raise HTTPException(
            status_code=400,
            detail="Reliability analysis requires at least 2 Likert-scale questions.",
        )

    # Load all responses for this survey
    resp_stmt = select(Response.id).where(Response.survey_id == survey_id)
    response_ids = list((await db.execute(resp_stmt)).scalars().all())
    if len(response_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="Reliability analysis requires at least 2 responses.",
        )

    # Load Likert answers only
    likert_q_ids = {q.id for q in likert_qs}
    ans_stmt = (
        select(Answer)
        .join(Response, Response.id == Answer.response_id)
        .where(Response.survey_id == survey_id)
        .where(Answer.question_id.in_(likert_q_ids))
    )
    answers = list((await db.execute(ans_stmt)).scalars().all())

    # Build (respondent → question_id → score) map
    from collections import defaultdict as _dd
    resp_scores: dict[str, dict[str, float]] = _dd(dict)
    for a in answers:
        try:
            resp_scores[a.response_id][a.question_id] = float(a.value)
        except (ValueError, TypeError):
            pass

    # Listwise deletion: keep only respondents with scores for ALL likert items
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
