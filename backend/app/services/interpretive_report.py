"""Claude-powered interpretive report generation.

Pure async function — no DB calls. The route handler in api/reports.py handles
caching, persistence, and input validation.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import anthropic

from ..core.config import settings

log = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 1500

_SYSTEM_PROMPT = (
    "You are a senior IO psychologist writing professional assessment reports. "
    "Write with precision and specificity — never hedge with 'may suggest' or "
    "'could indicate'. Be direct, behavioural, and actionable. "
    "Treat the reader as a fellow professional. "
    "Return ONLY valid JSON matching the exact schema provided. "
    "No markdown fences. No commentary before or after the JSON."
)

_SCHEMA_TEMPLATE = """{
  "overall_summary": "<2-3 sentence executive summary of the overall profile>",
  "factor_narratives": [
    {
      "factor_name": "<exact factor name>",
      "score": <normalized score 0-100>,
      "label": "<label string or null>",
      "narrative": "<2-3 sentences grounded in the actual score, behavioural and work-context specific>",
      "strengths": ["<concrete behavioural strength 1>", "<concrete behavioural strength 2>"],
      "watch_outs": ["<specific, constructive development area>"]
    }
  ],
  "development_suggestions": [
    "<actionable suggestion 1 — specify method and context, not just 'seek feedback'>",
    "<actionable suggestion 2>",
    "<actionable suggestion 3>"
  ]
}"""

_HIRING_FIELD = (
    '  "hiring_recommendation": "<Recommend | Consider | Do Not Recommend — '
    "based on overall profile fit for the stated role>\","
)

_ROLE_FIT_FIELD = (
    '  "role_fit_notes": "<specific analysis of how this profile fits '
    "the stated role — strengths and gaps to probe in interview>\","
)


def _build_schema(include_hiring: bool, include_role_fit: bool) -> str:
    """Inject optional fields into schema template just before closing brace."""
    extras = []
    if include_hiring:
        extras.append(_HIRING_FIELD)
    if include_role_fit:
        extras.append(_ROLE_FIT_FIELD)
    if not extras:
        return _SCHEMA_TEMPLATE
    # Insert before the final closing brace
    lines = _SCHEMA_TEMPLATE.rstrip().rstrip("}").rstrip()
    extras_block = "\n".join(extras)
    return f"{lines},\n{extras_block}\n}}"


def build_prompt(
    survey_title: str,
    survey_description: str | None,
    factor_scores: list[dict[str, Any]],   # [{name, normalized, label}, ...]
    composite_score: float | None,
    composite_label: str | None,
    context: dict[str, Any],
) -> str:
    """Build the Claude user-turn prompt. Pure function, fully testable."""
    purpose = context.get("purpose", "development")
    role = context.get("role") or None
    industry = context.get("industry") or None

    # Instrument header
    header = f"Instrument: {survey_title}"
    if survey_description:
        header += f"\n{survey_description}"

    # Context block
    ctx_lines = [f"Assessment purpose: {purpose}"]
    if role:
        ctx_lines.append(f"Target role: {role}")
    if industry:
        ctx_lines.append(f"Industry: {industry}")
    ctx_block = "\n".join(ctx_lines)

    # Factor scores block
    if factor_scores:
        score_lines = [
            f"  • {f['name']}: {f['normalized']:.1f}/100"
            + (f" ({f['label']})" if f.get("label") else "")
            for f in factor_scores
        ]
        scores_block = "\n".join(score_lines)
    else:
        scores_block = "  No scored factors available."

    composite_text = (
        f"{composite_score:.1f}/100"
        + (f" ({composite_label})" if composite_label else "")
        if composite_score is not None
        else "N/A"
    )

    # Rules that depend on context
    hiring_rule = (
        "- Include 'hiring_recommendation' (Recommend | Consider | Do Not Recommend) "
        "based on the overall profile and role fit."
        if purpose == "hiring"
        else "- Do NOT include the 'hiring_recommendation' key."
    )
    role_rule = (
        "- Include 'role_fit_notes' with a specific analysis of fit for the stated role."
        if role
        else "- Do NOT include the 'role_fit_notes' key."
    )

    schema = _build_schema(
        include_hiring=(purpose == "hiring"),
        include_role_fit=bool(role),
    )

    return f"""{header}

{ctx_block}

Factor Scores (normalized 0–100):
{scores_block}

Composite Score: {composite_text}

Generate a professional IO psychology assessment report as JSON. \
Return ONLY the JSON object — no markdown, no preamble, no explanation.

Required schema:
{schema}

Rules:
- Write each factor narrative in 2-3 sentences grounded in the actual numeric score
- Strengths must be concrete behavioural indicators observable in the workplace
- Watch-outs must be specific and constructive — frame as development, not criticism
- Development suggestions must specify the method and context (e.g. \
  "shadow a senior analyst during quarterly planning" not "seek feedback")
{hiring_rule}
{role_rule}
"""


async def generate_interpretive_report(
    survey_title: str,
    survey_description: str | None,
    factor_scores: list[dict[str, Any]],
    composite_score: float | None,
    composite_label: str | None,
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Call Claude and return the parsed interpretive report dict.

    Raises:
        ValueError: if Claude returns invalid JSON or is missing required fields.
        anthropic.APIError: on API-level failures (propagated to caller).
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = build_prompt(
        survey_title=survey_title,
        survey_description=survey_description,
        factor_scores=factor_scores,
        composite_score=composite_score,
        composite_label=composite_label,
        context=context,
    )

    message = await client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw: str = message.content[0].text.strip()

    # Strip markdown fences defensively in case Claude ignores instructions
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(
            line for line in lines
            if not line.startswith("```")
        ).strip()

    try:
        report = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.error("Claude returned non-JSON response (first 300 chars): %s", raw[:300])
        raise ValueError(f"Claude returned invalid JSON: {exc}") from exc

    required_keys = {"overall_summary", "factor_narratives", "development_suggestions"}
    missing = required_keys - report.keys()
    if missing:
        raise ValueError(
            f"Claude response missing required fields: {sorted(missing)}"
        )

    return report
