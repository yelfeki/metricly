"""Integration tests for the custom-competency endpoints.

Covers:
  - POST /api/v1/competencies/custom            (create active / draft / visibility / validation)
  - PATCH /api/v1/competencies/custom/{id}      (happy / cant-edit-seeded / cant-edit-other-org / draft→active)
  - GET   /api/v1/competencies/custom/{id}/framework-usage
  - GET   /api/v1/competencies/cluster-options

Tests use the `db_session` + `client` fixtures from conftest.py (aiosqlite
in-memory; `client` defaults to user 'user-alpha', `client.set_user(uid)`
switches identity).
"""

from __future__ import annotations

import pytest

from app.models.competency import CompetencyDefinition, CompetencyFramework
from app.models.framework import Competency as UserCompetency, Framework

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _full_levels() -> list[dict]:
    """Five complete levels — at least one indicator each → status='active'."""
    return [
        {
            "level": i,
            "label": label,
            "descriptor": f"Descriptor for {label}",
            "behavioral_indicators": [f"L{i} indicator one", f"L{i} indicator two"],
            "example_behaviors": [f"L{i} example"],
        }
        for i, label in enumerate(
            ["Novice", "Developing", "Proficient", "Advanced", "Expert"], start=1
        )
    ]


def _minimal_body(**overrides) -> dict:
    body = {
        "name": "Test Competency",
        "definition": "A short test definition.",
        "role_family": "Sales",
        "cluster": "Customer Engagement",
    }
    body.update(overrides)
    return body


async def _insert_seeded(db_session, *, name: str = "Seeded Comp") -> CompetencyDefinition:
    """Insert a seeded (is_custom=False) competency directly into the test DB."""
    fw = CompetencyFramework(name="Seeded FW", source="Test")
    db_session.add(fw)
    await db_session.flush()
    comp = CompetencyDefinition(
        framework_id=fw.id,
        name=name,
        definition="Seeded.",
        role_family="Sales",
        cluster="Customer Engagement",
        is_custom=False,
        status="active",
    )
    db_session.add(comp)
    await db_session.commit()
    return comp


# ---------------------------------------------------------------------------
# POST /api/v1/competencies/custom
# ---------------------------------------------------------------------------


class TestCreateCustomCompetency:
    async def test_creates_active_when_all_levels_have_indicators(self, client):
        body = _minimal_body(levels=_full_levels())
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["is_custom"] is True
        assert data["status"] == "active"
        assert data["organization_id"] == "user-alpha"
        assert data["created_by_user_id"] == "user-alpha"
        assert data["name"] == "Test Competency"
        assert len(data["proficiency_levels"]) == 5

    async def test_creates_draft_when_no_levels_provided(self, client):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "draft"

    async def test_creates_draft_when_indicators_empty(self, client):
        body = _minimal_body(
            levels=[
                {"level": i, "behavioral_indicators": [], "example_behaviors": []}
                for i in range(1, 6)
            ]
        )
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "draft"

    async def test_creates_draft_when_one_level_missing_indicators(self, client):
        levels = _full_levels()
        levels[2]["behavioral_indicators"] = []  # blank L3
        body = _minimal_body(levels=levels)
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.json()["status"] == "draft"

    async def test_other_org_cannot_view_custom(self, client):
        # Created as user-alpha
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        assert r.status_code == 201
        comp_id = r.json()["id"]

        # Switch to user-beta — visibility helper hides it (same as 404)
        client.set_user("user-beta")
        r2 = await client.get(f"/api/v1/competencies/{comp_id}")
        assert r2.status_code == 404

    async def test_same_org_can_view_custom(self, client):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]
        r2 = await client.get(f"/api/v1/competencies/{comp_id}")
        assert r2.status_code == 200
        assert r2.json()["id"] == comp_id

    async def test_validation_missing_name(self, client):
        body = _minimal_body()
        del body["name"]
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 422

    async def test_validation_missing_role_family(self, client):
        body = _minimal_body()
        del body["role_family"]
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 422

    async def test_validation_missing_cluster(self, client):
        body = _minimal_body()
        del body["cluster"]
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 422

    async def test_validation_missing_definition(self, client):
        body = _minimal_body()
        del body["definition"]
        r = await client.post("/api/v1/competencies/custom", json=body)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /api/v1/competencies/custom/{id}
# ---------------------------------------------------------------------------


class TestUpdateCustomCompetency:
    async def test_happy_path_updates_name_and_status_recomputed(self, client):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]
        assert r.json()["status"] == "draft"

        r2 = await client.patch(
            f"/api/v1/competencies/custom/{comp_id}",
            json={"name": "Renamed"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["name"] == "Renamed"
        # Still draft — no levels added
        assert r2.json()["status"] == "draft"

    async def test_cannot_edit_seeded_competency(self, client, db_session):
        seeded = await _insert_seeded(db_session)
        r = await client.patch(
            f"/api/v1/competencies/custom/{seeded.id}",
            json={"name": "Hacked"},
        )
        assert r.status_code == 403
        assert "custom competencies" in r.json()["detail"].lower()

    async def test_cannot_edit_other_orgs_custom(self, client):
        # Create as alpha
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]

        # Switch to beta and try to edit
        client.set_user("user-beta")
        r2 = await client.patch(
            f"/api/v1/competencies/custom/{comp_id}",
            json={"name": "Stolen"},
        )
        assert r2.status_code == 403

    async def test_draft_to_active_transition_when_levels_completed(self, client):
        # Start: draft
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]
        assert r.json()["status"] == "draft"

        # Add all 5 levels with indicators
        r2 = await client.patch(
            f"/api/v1/competencies/custom/{comp_id}",
            json={"levels": _full_levels()},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "active"
        assert len(r2.json()["proficiency_levels"]) == 5
        # Behavioural indicators round-trip correctly
        assert r2.json()["proficiency_levels"][0]["behavioral_indicators"][0].startswith("L1 indicator")

    async def test_active_to_draft_transition_when_levels_emptied(self, client):
        # Start: active
        r = await client.post(
            "/api/v1/competencies/custom",
            json=_minimal_body(levels=_full_levels()),
        )
        assert r.json()["status"] == "active"
        comp_id = r.json()["id"]

        # Replace with empty levels — should go back to draft
        r2 = await client.patch(
            f"/api/v1/competencies/custom/{comp_id}",
            json={"levels": []},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "draft"


# ---------------------------------------------------------------------------
# GET /api/v1/competencies/custom/{id}/framework-usage
# ---------------------------------------------------------------------------


class TestFrameworkUsage:
    async def test_zero_when_not_used(self, client):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]
        r2 = await client.get(f"/api/v1/competencies/custom/{comp_id}/framework-usage")
        assert r2.status_code == 200
        data = r2.json()
        assert data["framework_count"] == 0
        assert data["framework_titles"] == []

    async def test_counts_frameworks_and_returns_titles(self, client, db_session):
        # Create the custom competency
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]

        # Insert 3 frameworks owned by user-alpha that each reference it
        for title in ["FW Alpha", "FW Beta", "FW Gamma"]:
            fw = Framework(title=title, user_id="user-alpha")
            db_session.add(fw)
            await db_session.flush()
            db_session.add(
                UserCompetency(
                    framework_id=fw.id,
                    name="Imported",
                    library_competency_id=comp_id,
                )
            )
        await db_session.commit()

        r2 = await client.get(f"/api/v1/competencies/custom/{comp_id}/framework-usage")
        assert r2.status_code == 200
        data = r2.json()
        assert data["framework_count"] == 3
        assert sorted(data["framework_titles"]) == ["FW Alpha", "FW Beta", "FW Gamma"]

    async def test_caps_titles_at_5(self, client, db_session):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]

        for i in range(7):
            fw = Framework(title=f"FW {i}", user_id="user-alpha")
            db_session.add(fw)
            await db_session.flush()
            db_session.add(
                UserCompetency(
                    framework_id=fw.id, name="x", library_competency_id=comp_id
                )
            )
        await db_session.commit()

        data = (await client.get(
            f"/api/v1/competencies/custom/{comp_id}/framework-usage"
        )).json()
        assert data["framework_count"] == 7
        assert len(data["framework_titles"]) == 5  # capped

    async def test_does_not_count_other_orgs_frameworks(self, client, db_session):
        r = await client.post("/api/v1/competencies/custom", json=_minimal_body())
        comp_id = r.json()["id"]

        # Beta's framework that references alpha's comp — should NOT count for alpha
        fw_beta = Framework(title="Beta's FW", user_id="user-beta")
        db_session.add(fw_beta)
        await db_session.flush()
        db_session.add(
            UserCompetency(
                framework_id=fw_beta.id, name="x", library_competency_id=comp_id
            )
        )
        await db_session.commit()

        data = (await client.get(
            f"/api/v1/competencies/custom/{comp_id}/framework-usage"
        )).json()
        assert data["framework_count"] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/competencies/cluster-options
# ---------------------------------------------------------------------------


class TestClusterOptions:
    async def test_returns_global_clusters(self, client, db_session):
        # Seed two global competencies in different clusters
        fw = CompetencyFramework(name="Global FW")
        db_session.add(fw)
        await db_session.flush()
        for cluster in ["Customer Engagement", "Account Lifecycle"]:
            db_session.add(
                CompetencyDefinition(
                    framework_id=fw.id,
                    name=f"Comp in {cluster}",
                    role_family="Sales",
                    cluster=cluster,
                    is_custom=False,
                    status="active",
                )
            )
        await db_session.commit()

        r = await client.get("/api/v1/competencies/cluster-options")
        assert r.status_code == 200
        options = r.json()["options"]
        assert "Sales" in options
        assert sorted(options["Sales"]) == ["Account Lifecycle", "Customer Engagement"]

    async def test_includes_callers_custom_clusters(self, client, db_session):
        fw = CompetencyFramework(name="Global FW")
        db_session.add(fw)
        await db_session.flush()
        # One global Sales cluster
        db_session.add(
            CompetencyDefinition(
                framework_id=fw.id,
                name="Global",
                role_family="Sales",
                cluster="Customer Engagement",
                is_custom=False,
            )
        )
        # Alpha's custom cluster in same family
        db_session.add(
            CompetencyDefinition(
                framework_id=fw.id,
                name="Alpha Custom",
                role_family="Sales",
                cluster="Org-Specific Selling",
                is_custom=True,
                organization_id="user-alpha",
                status="active",
            )
        )
        await db_session.commit()

        options = (await client.get("/api/v1/competencies/cluster-options")).json()["options"]
        assert "Customer Engagement" in options["Sales"]
        assert "Org-Specific Selling" in options["Sales"]

    async def test_excludes_other_orgs_custom_clusters(self, client, db_session):
        fw = CompetencyFramework(name="Global FW")
        db_session.add(fw)
        await db_session.flush()
        # Beta's custom cluster — must NOT appear when user-alpha queries
        db_session.add(
            CompetencyDefinition(
                framework_id=fw.id,
                name="Beta Custom",
                role_family="Sales",
                cluster="Beta's Secret Cluster",
                is_custom=True,
                organization_id="user-beta",
                status="active",
            )
        )
        await db_session.commit()

        options = (await client.get("/api/v1/competencies/cluster-options")).json()["options"]
        # Either Sales is absent entirely (no visible Sales clusters), or
        # present without Beta's cluster — both are valid.
        sales_clusters = options.get("Sales", [])
        assert "Beta's Secret Cluster" not in sales_clusters

    async def test_clusters_are_sorted(self, client, db_session):
        fw = CompetencyFramework(name="Global FW")
        db_session.add(fw)
        await db_session.flush()
        for cluster in ["Zebra", "Alpha", "Mango"]:
            db_session.add(
                CompetencyDefinition(
                    framework_id=fw.id,
                    name=f"C-{cluster}",
                    role_family="Sales",
                    cluster=cluster,
                    is_custom=False,
                )
            )
        await db_session.commit()

        options = (await client.get("/api/v1/competencies/cluster-options")).json()["options"]
        assert options["Sales"] == ["Alpha", "Mango", "Zebra"]

    async def test_competencies_without_role_family_or_cluster_are_skipped(self, client, db_session):
        fw = CompetencyFramework(name="Global FW")
        db_session.add(fw)
        await db_session.flush()
        db_session.add(
            CompetencyDefinition(
                framework_id=fw.id,
                name="No grouping",
                role_family=None,
                cluster=None,
                is_custom=False,
            )
        )
        await db_session.commit()
        options = (await client.get("/api/v1/competencies/cluster-options")).json()["options"]
        assert options == {}
