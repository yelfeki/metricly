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

---

## Design System (canonical — adopt for every page, current and future)

Metricly's official visual language is **editorial-modern**: warm cream paper, deep Sociometri navy ink, five pigment accents (cobalt / butter / persimmon / olive / wine), Instrument Serif for display, DM Sans for UI, JetBrains Mono for numerals. **No frosted glass. No purple-blue gradients. No greys (every neutral is tinted).**

### How to use it

- **Tokens** live in `frontend/app/globals.css` as the `--mx-*` layer. Use them — never inline raw hex codes.
- **Fonts** are wired in `frontend/app/layout.tsx` via `next/font` and exposed as `--font-instrument-serif` / `--font-dm-sans` / `--font-jetbrains-mono`, aliased into `--mx-font-display / -sans / -mono`.
- **Utility classes** in globals.css: `.mx-h1 / -h2 / -h3 / -title / -body / -caption / -eyebrow / -caps / -tnum / -num / -italic`, plus primitives `.mx-card`, `.mx-pill`, `.mx-tab`, `.mx-tab-bar`, `.mx-text-grad-cool / -warm`.
- **Icons:** Tabler (`@tabler/icons-react`) at `stroke={1.6}`, sized 13–22 px. Existing inline SVGs in older components can stay until they're touched, but new components should use Tabler.
- **The brand wordmark** is italic Instrument Serif in navy. Never gradient-text the brand.

### Rules of thumb

- Card = `mx-card` (cream surface, 1 px hairline border, navy-tinted card shadow). Never use frosted-glass `rgba(255,255,255,0.65)` patterns for new work.
- Active state for buttons / tabs / pills = `var(--mx-grad-cool)` (navy → cobalt) on `var(--mx-paper)` text.
- Headings = Instrument Serif. UI text + buttons = DM Sans. Numerals = JetBrains Mono `.mx-tnum` (small) or Instrument Serif `.mx-num` (display).
- Italics earn their place — brand wordmark, one phrase per headline, a person's first name, and "researcher voice" notes only.
- Pill radius = 999 px. Card radius = `var(--mx-r-lg)` (14 px). Input radius = `var(--mx-r-md)` (10 px). Section panel = `var(--mx-r-xl)` (20 px).
- Animation timings: `--mx-dur-fast` 120 ms / `--mx-dur-base` 220 ms / `--mx-dur-slow` 360 ms, all `cubic-bezier(.4, 0, .2, 1)`.
- **No emoji. No unicode arrows.** Use Tabler icons or hand-rolled inline SVG.

### What about old code

Rollout is page-by-page. Pages still on the previous purple-gradient / frosted-glass / Plus Jakarta + Playfair aesthetic are migration targets — see `design/mockups/data-mapping.md` for the source of truth on per-page decisions. When touching a page or component, re-skin it; don't leave half-migrated code that mixes tokens.

### Reference

Full design system documentation, including the mockup HTML this language was ported from, lives in `design/mockups/data-mapping.md` (per-view data-source decisions) and the unpacked Claude Design bundle at `/tmp/anthropic-design/metricly/` (the original `colors_and_type.css` token specification, README rationale, and chat transcript).
