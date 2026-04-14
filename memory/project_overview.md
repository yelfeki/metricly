---
name: Metricly project overview
description: Core platform purpose, sprint history, and current feature set
type: project
---

Metricly is a psychometric SaaS platform for the Arab world — IO psychology + data science for talent assessment.

Stack: FastAPI (Python 3.11+), PostgreSQL + SQLAlchemy 2.0 async, Next.js (TypeScript), NumPy/SciPy.

**Sprint history:**
- Sprint 1: Reliability calculator (Cronbach's alpha), basic survey builder
- Sprint 2: Response submission, basic results page
- Sprint 3: Company dashboard, cohort analytics, demographic breakdown with significance testing
- Sprint 3 (cont): Psychometric scoring, factor structure, scoring algorithm builder
- Sprint 4 (2026-04-14): Response rate tracking, shareable invite links, role-based navigation, assessment status (draft/live/closed)

**Key architectural decisions:**
- Migrations: idempotent ALTER TABLE SQL in `database.py::run_migrations()`, versioned v0.2..v0.7
- No Alembic — all schema changes are inline idempotent SQL
- Auth: Supabase OIDC/JWT, ES256, JWKS cached in memory
- Status values: "draft" | "published" (shown as "Live" in UI) | "closed"
- Invites: token-based, token passed as respondent_ref on submission
- Roles: admin (yelfeki@vt.edu) | client (default); seeded on first /users/me/role call

**Why:** Yasmine is building this as a commercial product targeting Arabic-language HR teams.
**How to apply:** Understand the psychometric context when suggesting features; keep migrations non-destructive.
