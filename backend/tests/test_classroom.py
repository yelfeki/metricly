"""Integration tests for the Classroom API (foundation + measure-taking)."""

from datetime import datetime, timezone

import pytest

from app.models.library import Instrument, InstrumentItem, InstrumentSubscale

BASE = "/api/v1/classroom"


async def _seed_instrument(db, short_name="TEST-3", n_items=3) -> str:
    """Insert a minimal 3-item Likert-5 instrument; return its id."""
    inst = Instrument(
        name="Test Scale",
        short_name=short_name,
        description="A tiny test instrument.",
        response_format="likert5",
        scoring_type="mean",
        total_items=n_items,
        license_type="open",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(inst)
    await db.flush()
    sub = InstrumentSubscale(instrument_id=inst.id, name="Overall", item_count=n_items)
    db.add(sub)
    await db.flush()
    for i in range(n_items):
        db.add(
            InstrumentItem(
                instrument_id=inst.id,
                subscale_id=sub.id,
                item_text=f"Item {i + 1}",
                order_index=i + 1,
                is_reverse_scored=False,
            )
        )
    await db.commit()
    return inst.id


async def _create_course(client) -> dict:
    resp = await client.post(
        f"{BASE}/courses",
        json={
            "code": "PSY 272",
            "title": "Introduction to I-O Psychology",
            "term": "Fall 2026",
            "section": "002",
            "project_title": "Measuring the Modern Workplace",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_create_course_makes_instructor_and_join_code(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    assert course["my_role"] == "instructor"
    assert len(course["join_code"]) == 6
    assert course["member_count"] == 1

    # creator shows up in their own course list
    resp = await client.get(f"{BASE}/courses")
    assert resp.status_code == 200
    assert any(c["id"] == course["id"] for c in resp.json())


@pytest.mark.asyncio
async def test_student_joins_with_code(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    code = course["join_code"]

    client.set_user("student-1")
    resp = await client.post(
        f"{BASE}/courses/join", json={"join_code": code, "name": "Maya Adeyemi"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["my_role"] == "student"

    # join is idempotent (re-join doesn't duplicate)
    resp2 = await client.post(f"{BASE}/courses/join", json={"join_code": code})
    assert resp2.status_code == 200

    # course now has 2 members
    client.set_user("instructor-1")
    detail = await client.get(f"{BASE}/courses/{course['id']}")
    assert detail.json()["member_count"] == 2


@pytest.mark.asyncio
async def test_join_with_bad_code_404(client):
    client.set_user("student-x")
    resp = await client.post(f"{BASE}/courses/join", json={"join_code": "ZZZZZZ"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_member_cannot_view_course(client):
    client.set_user("instructor-1")
    course = await _create_course(client)

    client.set_user("outsider")
    resp = await client.get(f"{BASE}/courses/{course['id']}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_team_assignment_and_my_enrollment(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]

    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code, "name": "Maya"})

    # student cannot create a team
    forbidden = await client.post(f"{BASE}/courses/{cid}/teams", json={"name": "Lighthouse"})
    assert forbidden.status_code == 403

    # instructor creates a team
    client.set_user("instructor-1")
    team = await client.post(f"{BASE}/courses/{cid}/teams", json={"name": "Team Lighthouse"})
    assert team.status_code == 201
    team_id = team.json()["id"]

    # find the student's enrollment id from the roster
    roster = (await client.get(f"{BASE}/courses/{cid}/roster")).json()
    stu = next(e for e in roster if e["user_id"] == "student-1")

    # assign the student to the team
    assign = await client.post(
        f"{BASE}/courses/{cid}/enrollments/{stu['id']}/team", json={"team_id": team_id}
    )
    assert assign.status_code == 200
    assert assign.json()["team_id"] == team_id

    # the student's "me" view now shows the team + membership
    client.set_user("student-1")
    me = (await client.get(f"{BASE}/courses/{cid}/me")).json()
    assert me["team"]["name"] == "Team Lighthouse"
    assert any(m["user_id"] == "student-1" for m in me["team"]["members"])


@pytest.mark.asyncio
async def test_module_lifecycle_and_completion(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]

    # instructor creates a weekly module
    mod = await client.post(
        f"{BASE}/courses/{cid}/modules",
        json={"week_no": 12, "topic": "Stress & well-being", "reading_ref": "Levy ch. 11", "order_index": 1},
    )
    assert mod.status_code == 201, mod.text
    module_id = mod.json()["id"]

    # student joins, sees module as not completed
    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code})
    mods = (await client.get(f"{BASE}/courses/{cid}/modules")).json()
    assert mods[0]["completed"] is False

    # student completes it
    done = await client.post(f"{BASE}/courses/{cid}/modules/{module_id}/complete")
    assert done.status_code == 200
    assert done.json()["completed"] is True

    mods = (await client.get(f"{BASE}/courses/{cid}/modules")).json()
    assert mods[0]["completed"] is True

    # instructor sees the completion in the roll-up
    client.set_user("instructor-1")
    comps = (await client.get(f"{BASE}/courses/{cid}/modules/{module_id}/completions")).json()
    assert any(e["user_id"] == "student-1" for e in comps)


@pytest.mark.asyncio
async def test_create_course_with_template_seeds_modules(client):
    client.set_user("instructor-1")
    resp = await client.post(
        f"{BASE}/courses",
        json={
            "code": "PSY 272",
            "title": "Intro I-O",
            "term": "Fall 2026",
            "template": "psy272-modern-workplace",
        },
    )
    assert resp.status_code == 201, resp.text
    course = resp.json()
    assert course["module_count"] == 5

    mods = (await client.get(f"{BASE}/courses/{course['id']}/modules")).json()
    weeks = [m["week_no"] for m in mods]
    assert weeks == [11, 12, 13, 15, 16]
    topics = [m["topic"] for m in mods]
    assert "Stress & well-being" in topics
    # concept + prompts content was seeded as JSON
    stress = next(m for m in mods if m["week_no"] == 12)
    assert stress["concept_json"] and "Perceived stress" in stress["concept_json"]
    assert stress["prompts_json"] and "Demand–Control" in stress["prompts_json"]
    assert stress["reading_ref"] == "Levy ch. 11"


@pytest.mark.asyncio
async def test_templates_catalogue(client):
    client.set_user("instructor-1")
    cat = (await client.get(f"{BASE}/templates")).json()
    keys = [t["key"] for t in cat]
    assert "psy272-modern-workplace" in keys
    psy = next(t for t in cat if t["key"] == "psy272-modern-workplace")
    assert len(psy["topics"]) == 5


@pytest.mark.asyncio
async def test_apply_template_is_idempotent_by_week(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]

    first = await client.post(
        f"{BASE}/courses/{cid}/apply-template",
        json={"template": "psy272-modern-workplace"},
    )
    assert first.status_code == 200
    assert len(first.json()) == 5

    # re-applying creates nothing new (same weeks)
    again = await client.post(
        f"{BASE}/courses/{cid}/apply-template",
        json={"template": "psy272-modern-workplace"},
    )
    assert len(again.json()) == 0
    mods = (await client.get(f"{BASE}/courses/{cid}/modules")).json()
    assert len(mods) == 5


@pytest.mark.asyncio
async def test_team_module_status(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(
            f"{BASE}/courses/{cid}/modules", json={"week_no": 12, "topic": "Stress", "order_index": 0}
        )
    ).json()
    team = (await client.post(f"{BASE}/courses/{cid}/teams", json={"name": "Lighthouse"})).json()

    # two students join and land on the same team
    for uid, name in [("stu-a", "Aya"), ("stu-b", "Ben")]:
        client.set_user(uid)
        await client.post(f"{BASE}/courses/join", json={"join_code": code, "name": name})

    client.set_user("instructor-1")
    roster = (await client.get(f"{BASE}/courses/{cid}/roster")).json()
    for e in roster:
        if e["role"] == "student":
            await client.post(
                f"{BASE}/courses/{cid}/enrollments/{e['id']}/team", json={"team_id": team["id"]}
            )

    # student A completes the module
    client.set_user("stu-a")
    await client.post(f"{BASE}/courses/{cid}/modules/{mod['id']}/complete")

    status = (
        await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/team-status")
    ).json()
    assert status["team_name"] == "Lighthouse"
    assert status["total"] == 2
    assert status["submitted"] == 1
    me = next(m for m in status["members"] if m["is_me"])
    assert me["completed"] is True


@pytest.mark.asyncio
async def test_deploy_measure_submit_loop(client, db_session):
    instrument_id = await _seed_instrument(db_session)

    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(
            f"{BASE}/courses/{cid}/modules",
            json={"week_no": 12, "topic": "Stress", "instrument_id": instrument_id, "order_index": 0},
        )
    ).json()

    # instructor deploys the measure → a survey id is set
    deployed = await client.post(f"{BASE}/courses/{cid}/modules/{mod['id']}/deploy")
    assert deployed.status_code == 200, deployed.text
    assert deployed.json()["survey_id"]

    # student joins and fetches the measure
    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code, "name": "Maya"})
    measure = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/measure")).json()
    assert len(measure["questions"]) == 3
    assert measure["scale_min"] == 1 and measure["scale_max"] == 5
    assert measure["already_completed"] is False

    # student submits answers
    answers = [{"question_id": q["id"], "value": "4"} for q in measure["questions"]]
    submit = await client.post(f"{BASE}/courses/{cid}/modules/{mod['id']}/submit", json={"answers": answers})
    assert submit.status_code == 200, submit.text
    assert submit.json()["completed"] is True
    assert submit.json()["response_id"]

    # the measure now reads as completed, and the module shows done
    measure2 = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/measure")).json()
    assert measure2["already_completed"] is True
    mods = (await client.get(f"{BASE}/courses/{cid}/modules")).json()
    assert mods[0]["completed"] is True


@pytest.mark.asyncio
async def test_measure_lazy_deploys_when_not_deployed(client, db_session):
    instrument_id = await _seed_instrument(db_session, short_name="LAZY-3")

    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(
            f"{BASE}/courses/{cid}/modules",
            json={"topic": "Teams", "instrument_id": instrument_id, "order_index": 0},
        )
    ).json()
    assert mod["survey_id"] is None  # not deployed yet

    # student opens the measure → it deploys on demand
    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code})
    measure = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/measure")).json()
    assert measure["survey_id"]
    assert len(measure["questions"]) == 3


@pytest.mark.asyncio
async def test_measure_without_instrument_is_400(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(f"{BASE}/courses/{cid}/modules", json={"topic": "Diversity", "order_index": 0})
    ).json()

    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code})
    resp = await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/measure")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_report_and_reflection(client, db_session):
    instrument_id = await _seed_instrument(db_session, short_name="RPT-3")

    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(
            f"{BASE}/courses/{cid}/modules",
            json={"week_no": 12, "topic": "Stress", "instrument_id": instrument_id, "order_index": 0},
        )
    ).json()

    # student joins, takes the measure (all 5s → top of scale)
    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code, "name": "Maya"})
    measure = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/measure")).json()
    answers = [{"question_id": q["id"], "value": "5"} for q in measure["questions"]]
    await client.post(f"{BASE}/courses/{cid}/modules/{mod['id']}/submit", json={"answers": answers})

    # report figures
    report = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/report")).json()
    assert report["scale_min"] == 1 and report["scale_max"] == 5
    assert report["composite"] == 100.0  # all 5s on a 1–5 scale
    assert len(report["items"]) == 3
    assert report["items"][0]["value"] == 5.0
    assert len(report["factors"]) >= 1
    assert report["factors"][0]["normalized"] == 100.0
    # workbook scaffolding echoed
    assert isinstance(report["guiding_questions"], list)

    # reflection starts empty
    refl = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/reflection")).json()
    assert refl["synthesis"] is None
    assert refl["recommendations"] == []

    # save synthesis + a recommendation
    saved = await client.put(
        f"{BASE}/courses/{cid}/modules/{mod['id']}/reflection",
        json={
            "synthesis": "My stress was high, driven by workload.",
            "recommendations": [
                {"observation": "Workload items highest", "concept": "Demand–Control", "action": "Planning block", "feasibility": "Low cost"}
            ],
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["synthesis"].startswith("My stress")
    assert body["recommendations"][0]["concept"] == "Demand–Control"

    # persisted
    refl2 = (await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/reflection")).json()
    assert refl2["recommendations"][0]["action"] == "Planning block"


@pytest.mark.asyncio
async def test_report_requires_completion(client, db_session):
    instrument_id = await _seed_instrument(db_session, short_name="NOCOMP-3")
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]
    mod = (
        await client.post(
            f"{BASE}/courses/{cid}/modules",
            json={"topic": "Stress", "instrument_id": instrument_id, "order_index": 0},
        )
    ).json()
    await client.post(f"{BASE}/courses/{cid}/modules/{mod['id']}/deploy")

    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code})
    resp = await client.get(f"{BASE}/courses/{cid}/modules/{mod['id']}/report")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_student_cannot_create_module(client):
    client.set_user("instructor-1")
    course = await _create_course(client)
    cid = course["id"]
    code = course["join_code"]

    client.set_user("student-1")
    await client.post(f"{BASE}/courses/join", json={"join_code": code})
    resp = await client.post(
        f"{BASE}/courses/{cid}/modules", json={"topic": "Sneaky", "order_index": 0}
    )
    assert resp.status_code == 403
