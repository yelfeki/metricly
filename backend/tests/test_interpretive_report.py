"""Tests for the interpretive report service and API.

Service tests use mocked Claude responses (no DB, no real API calls).
Prompt-builder tests are synchronous pure-function tests.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.interpretive_report import (
    build_prompt,
    generate_interpretive_report,
)


# ---------------------------------------------------------------------------
# Helpers — build minimal valid inputs
# ---------------------------------------------------------------------------

_FACTORS = [
    {"name": "Psychological Safety", "normalized": 72.5, "label": "High"},
    {"name": "Work Engagement", "normalized": 45.0, "label": "Moderate"},
]

_VALID_REPORT = {
    "overall_summary": "This candidate demonstrates strong interpersonal openness.",
    "factor_narratives": [
        {
            "factor_name": "Psychological Safety",
            "score": 72.5,
            "label": "High",
            "narrative": "A score of 72.5 indicates ...",
            "strengths": ["Willing to voice concerns openly"],
            "watch_outs": ["May over-extend trust in new teams"],
        }
    ],
    "development_suggestions": [
        "Join a cross-functional project to build resilience",
        "Shadow a senior analyst for 30 days",
        "Take a structured feedback course",
    ],
}


def _make_mock_message(content: str) -> MagicMock:
    msg = MagicMock()
    msg.content = [MagicMock(text=content)]
    return msg


# ---------------------------------------------------------------------------
# build_prompt — pure function tests
# ---------------------------------------------------------------------------


class TestBuildPrompt:
    def test_contains_survey_title(self):
        p = build_prompt("PSS-7 Survey", None, _FACTORS, 60.0, "Moderate", {"purpose": "development"})
        assert "PSS-7 Survey" in p

    def test_contains_survey_description_when_provided(self):
        p = build_prompt("PSS", "Measures team safety.", _FACTORS, 60.0, None, {"purpose": "development"})
        assert "Measures team safety." in p

    def test_omits_description_when_none(self):
        p = build_prompt("PSS", None, _FACTORS, 60.0, None, {"purpose": "development"})
        # Should not crash and should not have 'None' in text
        assert "None" not in p

    def test_contains_factor_names_and_scores(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "development"})
        assert "Psychological Safety" in p
        assert "72.5" in p
        assert "Work Engagement" in p
        assert "45.0" in p

    def test_contains_labels_when_present(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "development"})
        assert "High" in p
        assert "Moderate" in p

    def test_contains_composite_score(self):
        p = build_prompt("Survey", None, _FACTORS, 68.5, "Good", {"purpose": "development"})
        assert "68.5" in p
        assert "Good" in p

    def test_composite_na_when_none(self):
        p = build_prompt("Survey", None, _FACTORS, None, None, {"purpose": "development"})
        assert "N/A" in p

    def test_role_in_prompt_when_provided(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "hiring", "role": "Sales Manager"})
        assert "Sales Manager" in p

    def test_role_absent_when_not_provided(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "development"})
        assert "Target role" not in p

    def test_industry_in_prompt_when_provided(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "development", "industry": "Healthcare"})
        assert "Healthcare" in p

    def test_hiring_rule_included_for_hiring_purpose(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "hiring"})
        assert "hiring_recommendation" in p
        assert "Do Not Recommend" in p

    def test_hiring_rule_excluded_for_development_purpose(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "development"})
        # Should explicitly say NOT to include hiring_recommendation
        assert "Do NOT include" in p

    def test_role_fit_key_appears_in_schema_when_role_provided(self):
        p = build_prompt("Survey", None, _FACTORS, 60.0, None, {"purpose": "hiring", "role": "PM"})
        assert "role_fit_notes" in p

    def test_no_factors_handled_gracefully(self):
        p = build_prompt("Survey", None, [], None, None, {"purpose": "development"})
        assert "No scored factors" in p


# ---------------------------------------------------------------------------
# generate_interpretive_report — async service tests with mocked Claude
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_report_returns_parsed_dict():
    mock_msg = _make_mock_message(json.dumps(_VALID_REPORT))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        result = await generate_interpretive_report(
            "PSS Survey", "Desc", _FACTORS, 60.0, "Moderate", {"purpose": "development"}
        )

    assert result["overall_summary"] == _VALID_REPORT["overall_summary"]
    assert isinstance(result["factor_narratives"], list)
    assert isinstance(result["development_suggestions"], list)


@pytest.mark.asyncio
async def test_generate_report_strips_markdown_fences():
    fenced = f"```json\n{json.dumps(_VALID_REPORT)}\n```"
    mock_msg = _make_mock_message(fenced)
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        result = await generate_interpretive_report(
            "Survey", None, _FACTORS, None, None, {"purpose": "development"}
        )

    assert "overall_summary" in result


@pytest.mark.asyncio
async def test_generate_report_raises_on_invalid_json():
    mock_msg = _make_mock_message("Not valid JSON {{{{")
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        with pytest.raises(ValueError, match="invalid JSON"):
            await generate_interpretive_report(
                "Survey", None, _FACTORS, None, None, {"purpose": "development"}
            )


@pytest.mark.asyncio
async def test_generate_report_raises_on_missing_required_fields():
    incomplete = {"overall_summary": "Some summary"}  # missing factor_narratives etc.
    mock_msg = _make_mock_message(json.dumps(incomplete))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        with pytest.raises(ValueError, match="missing required fields"):
            await generate_interpretive_report(
                "Survey", None, _FACTORS, None, None, {"purpose": "development"}
            )


@pytest.mark.asyncio
async def test_generate_report_with_hiring_context_passes_purpose():
    """When purpose=hiring Claude is called — result can include hiring_recommendation."""
    report_with_hiring = {**_VALID_REPORT, "hiring_recommendation": "Recommend"}
    mock_msg = _make_mock_message(json.dumps(report_with_hiring))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        result = await generate_interpretive_report(
            "Survey", None, _FACTORS, 75.0, "High",
            {"purpose": "hiring", "role": "Sales Manager", "industry": "SaaS"}
        )

    assert result.get("hiring_recommendation") == "Recommend"


@pytest.mark.asyncio
async def test_generate_report_calls_claude_exactly_once():
    mock_msg = _make_mock_message(json.dumps(_VALID_REPORT))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        await generate_interpretive_report(
            "Survey", None, _FACTORS, None, None, {"purpose": "development"}
        )

    mock_client.messages.create.assert_called_once()


@pytest.mark.asyncio
async def test_generate_report_uses_correct_model():
    from app.services.interpretive_report import _MODEL

    mock_msg = _make_mock_message(json.dumps(_VALID_REPORT))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        await generate_interpretive_report(
            "Survey", None, _FACTORS, None, None, {"purpose": "development"}
        )

    call_kwargs = mock_client.messages.create.call_args
    assert call_kwargs.kwargs.get("model") == _MODEL or call_kwargs.args[0] == _MODEL if call_kwargs.args else True
    # Check via keyword arg
    assert mock_client.messages.create.call_args.kwargs.get("model") == _MODEL


@pytest.mark.asyncio
async def test_generate_report_with_empty_factors():
    """Empty factor list should not crash the service."""
    report = {**_VALID_REPORT, "factor_narratives": []}
    mock_msg = _make_mock_message(json.dumps(report))
    with patch("app.services.interpretive_report.anthropic.AsyncAnthropic") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value = mock_client
        mock_client.messages.create = AsyncMock(return_value=mock_msg)

        result = await generate_interpretive_report(
            "Survey", None, [], None, None, {"purpose": "research"}
        )

    assert result["factor_narratives"] == []
