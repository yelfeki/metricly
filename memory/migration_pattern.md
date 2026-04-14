---
name: Migration pattern
description: How schema migrations work in Metricly — idempotent SQL in database.py, not Alembic
type: project
---

Migrations are idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS statements in `backend/app/core/database.py::run_migrations()`.

Each version block is commented (v0.2, v0.3, ... v0.7). Each statement runs in its own `engine.begin()` transaction and errors are silently swallowed (already applied = no-op).

**Why:** Keeps schema evolution simple for a small team; no Alembic setup needed.
**How to apply:** When adding new tables/columns, append to the `migrations` list with a descriptive version comment. Never remove or modify existing statements — only add new ones.

Current version: v0.7 (survey_invites, user_roles tables added 2026-04-14)
