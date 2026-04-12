# Metricly

## Vision

Metricly is a psychometric platform built for the Arab world — combining IO psychology, psychometrics, and data science to deliver rigorous, culturally-grounded tools for talent assessment, organizational research, and workforce analytics.

The gap we are filling: psychometric tooling that is scientifically sound, built with Arabic-language data in mind, and designed for practitioners (HR professionals, IO psychologists, researchers) who need reliable outputs, not just black-box scores.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.11+, FastAPI, Pydantic v2 |
| Database | PostgreSQL + SQLAlchemy 2.0 (async) + Alembic |
| Frontend | Next.js (TypeScript) |
| Data / Stats | NumPy, Pandas, SciPy |
| Testing | pytest, pytest-asyncio, httpx |
| Linting | Ruff |

---

## Project Structure

```
metricly/
  backend/
    app/
      api/          # Route handlers
      core/         # Config, database, security
      models/       # SQLAlchemy ORM models
      schemas/      # Pydantic request/response schemas
      services/     # Business logic and psychometric engines
    tests/
  frontend/         # Next.js app (to be scaffolded)
  pyproject.toml
  CLAUDE.md
```

---

## Module 1: Reliability Calculator

**Goal:** Accept survey response data (a matrix of item scores) and return Cronbach's alpha with supporting diagnostics.

### What it does

Cronbach's alpha measures internal consistency — whether items in a scale are measuring the same construct. It is the most widely used reliability coefficient in psychometrics.

### API contract

```
POST /api/v1/reliability/cronbach-alpha

Request body:
{
  "items": [
    [4, 3, 5, 4],   // respondent 1 scores across items
    [2, 2, 3, 2],   // respondent 2
    ...
  ],
  "scale_name": "optional label"
}

Response:
{
  "alpha": 0.87,
  "n_items": 4,
  "n_respondents": 120,
  "item_total_correlations": [0.71, 0.68, 0.74, 0.65],
  "alpha_if_item_deleted": [0.85, 0.86, 0.84, 0.87],
  "interpretation": "good"   // poor / acceptable / good / excellent
}
```

### Interpretation thresholds

| Alpha | Label |
|---|---|
| < 0.60 | poor |
| 0.60 – 0.69 | acceptable |
| 0.70 – 0.89 | good |
| >= 0.90 | excellent |

### Implementation location

- Service logic: `backend/app/services/reliability.py`
- Route: `backend/app/api/reliability.py`
- Schemas: `backend/app/schemas/reliability.py`
- Tests: `backend/tests/test_reliability.py`

---

## Development conventions

- All business logic lives in `services/` — routes stay thin.
- Use async endpoints throughout.
- Pydantic v2 models for all request/response shapes.
- Every service function must have a corresponding test.
