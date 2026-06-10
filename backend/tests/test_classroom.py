"""Integration tests for the Classroom API (Phase 0 foundation)."""

import pytest

BASE = "/api/v1/classroom"


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
