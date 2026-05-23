"""Skills Explorer — AI diagnostic chat endpoint and assessment request tracking."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..core.auth import AuthUser, require_user
from ..core.config import settings
from ..core.database import get_db
from ..models.library import SkillRequest
from ..models.survey import UserRole

skills_explorer_router = APIRouter(prefix="/skills-explorer", tags=["skills-explorer"])

_SYSTEM_PROMPT = """\
You are an organizational psychologist consultant. Your job: ask short diagnostic \
questions to understand an org's needs, then recommend specific validated \
instruments. Be direct and conversational — a smart consultant who gets to the point.

RESPONSE RULES (non-negotiable):
- Maximum 2 sentences per message. No lists, no bullet points, no elaboration.
- One question per message only.
- If the user asks you something, answer in one sentence then ask your next question.
- By message 5-6, stop asking questions and give recommendations regardless of \
  how much you know. Do not ask a 7th diagnostic question.

DIAGNOSTIC FLOW (5-6 questions total, then recommend):
Q1: Industry and org size.
Q2: Roles being assessed (ICs, managers, executives, or mixed).
Q3: Primary goal — hiring, development, team health, culture, or research.
Q4: The main challenge or pain point they want to measure.
Q5: Any known gaps or specific concerns (burnout, low engagement, leadership issues, etc.).
Q6 (optional): One clarifying question only if critical — otherwise skip to recommendations.

LIBRARY KNOWLEDGE — what IS and IS NOT in the assessment library:
IN THE LIBRARY (psychological/behavioral instruments you can recommend):
- Engagement & well-being: UWES-9, OLBI, PERMA Profiler, PANAS, SWL
- Leadership: LMX-7, Servant Leadership Survey, Ethical Leadership Scale, MLQ
- Personality: BFI-10, HEXACO-60, NEO-PI
- Motivation & resilience: Grit-S, GSE, CSES, IMI
- Team & org: Psychological Safety Scale, Team Trust Scale, OCQ, POS
- Job design: JD-R, JSS, WFC
- Cognitive: NFC, CRT, TOLT

NOT IN THE LIBRARY (technical/hard-skill assessments — always put in skills_not_in_library):
- Any coding or software engineering assessment
- ML, AI, data science, or analytics competency frameworks
- Domain-specific technical skills (cybersecurity, DevOps, cloud, finance modeling, etc.)
- Hard-skill certification prep or job knowledge tests

CRITICAL DISTINCTION FOR TECHNICAL ORGS:
If the org focus is technical (engineering, ML, data science), the library only covers \
the behavioral/psychological side. Explain this briefly: "Our library covers behavioral \
measures — for technical skills, I'll flag those separately." Then recommend behavioral \
instruments that complement technical work (psychological safety, burnout risk, team \
trust, grit) and put the technical competency frameworks in skills_not_in_library.

RECOMMENDATION FORMAT:
After 5-6 exchanges, end with exactly this (no bullet points, prose only):
"Based on what you've shared, I'd recommend [instrument 1] for [one-sentence reason], \
[instrument 2] for [one-sentence reason], and [instrument 3] for [one-sentence reason]. \
Let me show you these on the skills map."

Then on a new line, with NO text after it:
SKILLS_PROFILE:{"recommended_categories":["exact names from: Leadership, Well-being, Skills & Competencies, Personality, Team Effectiveness, Organizational Health"],"recommended_skills":["exact short names from the library only, e.g. UWES-9, GSE, LMX-7 — only if genuinely relevant"],"skills_not_in_library":["full names of technical/hard-skill assessments that are NOT in the library, e.g. ML Engineering Competency Framework"],"industry_detected":"one of: legal, healthcare, education, criminal-justice, finance, technology, marketing, government, military, social-services, credit, insurance — or null if none of the 12 apply","context_summary":"2 sentences: what the org needs and why these instruments were chosen"}
"""

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 1024


_NOTIFICATION_EMAIL = "yelfeki@vt.edu"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str      # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    content: str


class AssessmentRequestBody(BaseModel):
    skill_name: str
    context: str | None = None
    requester_email: str | None = None


class AssessmentRequestOut(BaseModel):
    id: str
    skill_name: str
    context_summary: str | None
    requester_email: str | None
    requested_at: str
    status: str


# ---------------------------------------------------------------------------
# Auth helper — admin check
# ---------------------------------------------------------------------------


async def _require_admin(
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    stmt = select(UserRole).where(UserRole.user_id == current_user.user_id)
    role = (await db.execute(stmt)).scalar_one_or_none()
    if role is None or role.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# ---------------------------------------------------------------------------
# Email helper — best-effort; logs failure, never raises
# ---------------------------------------------------------------------------


def _try_send_email(
    skill_name: str,
    context: str | None,
    requester_email: str | None,
    requested_at: str,
) -> None:
    """Send a notification email via Gmail SMTP (port 587 + STARTTLS).

    Prints clearly to stdout so failures are visible in the terminal.
    Falls back to DB-only if SMTP_EMAIL / SMTP_PASSWORD are not set.
    """
    import smtplib
    from email.mime.text import MIMEText

    if not settings.smtp_email or not settings.smtp_password:
        print(
            f"[Metricly] SMTP not configured — request saved to DB only.\n"
            f"  Skill: {skill_name}\n"
            f"  Requester: {requester_email or 'not provided'}\n"
            f"  To enable email: set SMTP_EMAIL and SMTP_PASSWORD in backend/.env",
            flush=True,
        )
        return

    body = (
        f"A new skills assessment has been requested via Metricly Skills Explorer.\n\n"
        f"Skill Requested: {skill_name}\n"
        f"Organizational Context: {context or 'not provided'}\n"
        f"Requester Email: {requester_email or 'not provided'}\n"
        f"Requested At: {requested_at}\n\n"
        f"Log in to Metricly admin to review pending requests."
    )

    msg = MIMEText(body)
    msg["Subject"] = f"Metricly — New Skills Assessment Request: {skill_name}"
    msg["From"] = settings.smtp_email
    msg["To"] = _NOTIFICATION_EMAIL

    try:
        print(
            f"[Metricly] Sending email → {_NOTIFICATION_EMAIL} | skill: {skill_name}",
            flush=True,
        )
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.smtp_email, settings.smtp_password)
            server.sendmail(settings.smtp_email, _NOTIFICATION_EMAIL, msg.as_string())
        print(f"[Metricly] Email sent successfully to {_NOTIFICATION_EMAIL}", flush=True)
    except Exception as exc:
        print(
            f"[Metricly] Email send FAILED for '{skill_name}': {exc}\n"
            f"  Request is still saved in the database.",
            flush=True,
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@skills_explorer_router.post("/chat", response_model=ChatResponse)
async def skills_chat(
    body: ChatRequest,
    _: AuthUser = Depends(require_user),
) -> ChatResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI chat is not configured.")

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=_SYSTEM_PROMPT,
            messages=[{"role": m.role, "content": m.content} for m in body.messages],
        )
        return ChatResponse(content=response.content[0].text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}") from exc


@skills_explorer_router.post("/request-assessment", status_code=201)
async def request_assessment(
    body: AssessmentRequestBody,
    current_user: AuthUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record a request for an instrument not yet in the library."""
    record = SkillRequest(
        skill_name=body.skill_name.strip(),
        context_summary=body.context,
        requester_email=body.requester_email or current_user.email,
        requested_at=datetime.now(timezone.utc),
        status="pending",
    )
    db.add(record)
    await db.commit()

    # Best-effort email notification
    _try_send_email(
        body.skill_name,
        body.context,
        record.requester_email,
        record.requested_at.isoformat(),
    )

    return {"success": True, "id": record.id}


@skills_explorer_router.get("/requests", response_model=list[AssessmentRequestOut])
async def list_requests(
    _: AuthUser = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AssessmentRequestOut]:
    """Admin — list all pending assessment requests."""
    stmt = select(SkillRequest).order_by(SkillRequest.requested_at.desc())
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        AssessmentRequestOut(
            id=r.id,
            skill_name=r.skill_name,
            context_summary=r.context_summary,
            requester_email=r.requester_email,
            requested_at=r.requested_at.isoformat(),
            status=r.status,
        )
        for r in rows
    ]
