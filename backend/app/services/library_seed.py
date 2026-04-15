"""Idempotent seed for the Assessment Library.

Called once at application startup from main.py lifespan.
Uses `short_name` as the stable idempotency key.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.library import (
    Instrument,
    InstrumentCategory,
    InstrumentItem,
    InstrumentSubscale,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Category definitions
# ---------------------------------------------------------------------------

CATEGORIES = [
    {
        "name": "Organizational Health",
        "description": "Instruments measuring psychological safety, engagement, burnout, and well-being.",
        "icon_name": "building",
        "order_index": 1,
    },
    {
        "name": "Skills & Competencies",
        "description": "Validated measures of workplace skills: communication, critical thinking, adaptability.",
        "icon_name": "star",
        "order_index": 2,
    },
    {
        "name": "Leadership",
        "description": "Tools for assessing ethical leadership, leader-member exchange, and leadership efficacy.",
        "icon_name": "crown",
        "order_index": 3,
    },
    {
        "name": "Well-being & Resilience",
        "description": "Scales measuring self-efficacy, perceived stress, and workplace well-being.",
        "icon_name": "heart",
        "order_index": 4,
    },
    {
        "name": "Personality",
        "description": "Validated personality assessments including Big Five, HEXACO, and related models.",
        "icon_name": "user",
        "order_index": 5,
    },
    {
        "name": "Team Effectiveness",
        "description": "Instruments assessing team dynamics, trust, psychological safety, and collective performance.",
        "icon_name": "users",
        "order_index": 6,
    },
]


# ---------------------------------------------------------------------------
# Instrument definitions
# ---------------------------------------------------------------------------

def _instrument_seed_data() -> list[dict]:
    return [
        # ── 1. Psychological Safety Scale ────────────────────────────────────
        {
            "name": "Psychological Safety Scale",
            "short_name": "PSS-7",
            "category_key": "Organizational Health",
            "description": (
                "Amy Edmondson's 7-item scale measuring team psychological safety — "
                "the shared belief that the team is safe for interpersonal risk-taking."
            ),
            "construct_measured": "Team Psychological Safety",
            "theoretical_framework": "Edmondson (1999) team learning theory",
            "source_citation": "Edmondson, A. C. (1999). Psychological safety and learning behavior in work teams. Administrative Science Quarterly, 44(2), 350–383.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 7,
            "estimated_minutes": 5,
            "scoring_type": "mean",
            "response_format": "likert7",
            "validated_populations": '["healthcare teams","software teams","management teams"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.82,
            "subscales": [],
            "items": [
                {"text": "If you make a mistake on this team, it is often held against you.", "reverse_scored": True},
                {"text": "Members of this team are able to bring up problems and tough issues.", "reverse_scored": False},
                {"text": "People on this team sometimes reject others for being different.", "reverse_scored": True},
                {"text": "It is safe to take a risk on this team.", "reverse_scored": False},
                {"text": "It is difficult to ask other members of this team for help.", "reverse_scored": True},
                {"text": "No one on this team would deliberately act in a way that undermines my efforts.", "reverse_scored": False},
                {"text": "Working with members of this team, my unique skills and talents are valued and utilized.", "reverse_scored": False},
            ],
        },

        # ── 2. UWES-9 ─────────────────────────────────────────────────────────
        {
            "name": "Utrecht Work Engagement Scale – 9 Items",
            "short_name": "UWES-9",
            "category_key": "Organizational Health",
            "description": (
                "The UWES-9 measures work engagement across three dimensions: "
                "vigor, dedication, and absorption."
            ),
            "construct_measured": "Work Engagement",
            "theoretical_framework": "Schaufeli & Bakker (2004) demands-resources model",
            "source_citation": "Schaufeli, W. B., Bakker, A. B., & Salanova, M. (2006). The measurement of work engagement with a short questionnaire. Educational and Psychological Measurement, 66(4), 701–716.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 9,
            "estimated_minutes": 7,
            "scoring_type": "subscale",
            "response_format": "likert7",
            "validated_populations": '["healthcare","education","service sector","manufacturing"]',
            "languages": '["en","ar","nl","de","es"]',
            "reliability_alpha": 0.85,
            "subscales": [
                {"name": "Vigor", "description": "High energy levels and mental resilience while working", "item_count": 3},
                {"name": "Dedication", "description": "Strong involvement, sense of significance, enthusiasm, and challenge", "item_count": 3},
                {"name": "Absorption", "description": "Being fully concentrated and happily engrossed in one's work", "item_count": 3},
            ],
            "items": [
                {"text": "At my work, I feel bursting with energy.", "subscale": "Vigor", "reverse_scored": False},
                {"text": "At my job, I feel strong and vigorous.", "subscale": "Vigor", "reverse_scored": False},
                {"text": "When I get up in the morning, I feel like going to work.", "subscale": "Vigor", "reverse_scored": False},
                {"text": "I find the work that I do full of meaning and purpose.", "subscale": "Dedication", "reverse_scored": False},
                {"text": "I am enthusiastic about my job.", "subscale": "Dedication", "reverse_scored": False},
                {"text": "My job inspires me.", "subscale": "Dedication", "reverse_scored": False},
                {"text": "When I am working, I forget everything else around me.", "subscale": "Absorption", "reverse_scored": False},
                {"text": "I am immersed in my work.", "subscale": "Absorption", "reverse_scored": False},
                {"text": "I feel happy when I am working intensely.", "subscale": "Absorption", "reverse_scored": False},
            ],
        },

        # ── 3. OLBI ───────────────────────────────────────────────────────────
        {
            "name": "Oldenburg Burnout Inventory",
            "short_name": "OLBI",
            "category_key": "Organizational Health",
            "description": (
                "The OLBI measures burnout via two core dimensions: exhaustion "
                "(physical, cognitive, and emotional) and disengagement from work."
            ),
            "construct_measured": "Occupational Burnout",
            "theoretical_framework": "Demerouti et al. (2001) job demands-resources model",
            "source_citation": "Demerouti, E., Bakker, A. B., Vardakou, I., & Kantas, A. (2003). The convergent validity of two burnout instruments. European Journal of Psychological Assessment, 19(1), 12–23.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 16,
            "estimated_minutes": 10,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["nurses","teachers","engineers","service workers"]',
            "languages": '["en","ar","de","el","nl"]',
            "reliability_alpha": 0.74,
            "subscales": [
                {"name": "Exhaustion", "description": "Feelings of depletion, strain, and fatigue", "item_count": 8},
                {"name": "Disengagement", "description": "Distancing oneself from work and negative attitudes toward work", "item_count": 8},
            ],
            "items": [
                {"text": "I always find new and interesting aspects in my work.", "subscale": "Disengagement", "reverse_scored": True},
                {"text": "There are days when I feel tired before I arrive at work.", "subscale": "Exhaustion", "reverse_scored": False},
                {"text": "It happens more and more often that I talk about my work in a negative way.", "subscale": "Disengagement", "reverse_scored": False},
                {"text": "After work, I tend to need more time than in the past to relax and feel better.", "subscale": "Exhaustion", "reverse_scored": False},
                {"text": "I can tolerate the pressure of my work very well.", "subscale": "Exhaustion", "reverse_scored": True},
                {"text": "Lately, I tend to think less at work and do my job almost mechanically.", "subscale": "Disengagement", "reverse_scored": False},
                {"text": "I find my work to be a positive challenge.", "subscale": "Disengagement", "reverse_scored": True},
                {"text": "During my work, I often feel emotionally drained.", "subscale": "Exhaustion", "reverse_scored": False},
                {"text": "Over time, one can become disconnected from this type of work.", "subscale": "Disengagement", "reverse_scored": False},
                {"text": "After working, I have enough energy for my leisure activities.", "subscale": "Exhaustion", "reverse_scored": True},
                {"text": "Sometimes I feel sickened by my work tasks.", "subscale": "Disengagement", "reverse_scored": False},
                {"text": "When I work, I usually feel energized.", "subscale": "Exhaustion", "reverse_scored": True},
                {"text": "I feel more and more engaged in my work.", "subscale": "Disengagement", "reverse_scored": True},
                {"text": "When I work, I usually feel strain.", "subscale": "Exhaustion", "reverse_scored": False},
                {"text": "I find it difficult to think of quitting my job.", "subscale": "Disengagement", "reverse_scored": True},
                {"text": "I always manage my workload well.", "subscale": "Exhaustion", "reverse_scored": True},
            ],
        },

        # ── 4. PSS-10 ─────────────────────────────────────────────────────────
        {
            "name": "Perceived Stress Scale – 10 Items",
            "short_name": "PSS-10",
            "category_key": "Well-being & Resilience",
            "description": (
                "Cohen's PSS-10 measures the degree to which situations in one's life "
                "are appraised as stressful over the past month."
            ),
            "construct_measured": "Perceived Stress",
            "theoretical_framework": "Cohen, Kamarck & Mermelstein (1983) transactional stress model",
            "source_citation": "Cohen, S., Kamarck, T., & Mermelstein, R. (1983). A global measure of perceived stress. Journal of Health and Social Behavior, 24(4), 385–396.",
            "license_type": "public_domain",
            "is_proprietary": False,
            "total_items": 10,
            "estimated_minutes": 5,
            "scoring_type": "sum",
            "response_format": "likert5",
            "validated_populations": '["general adult population","university students","healthcare workers"]',
            "languages": '["en","ar","fr","es","pt","zh"]',
            "reliability_alpha": 0.85,
            "subscales": [],
            "items": [
                {"text": "In the last month, how often have you been upset because of something that happened unexpectedly?", "reverse_scored": False},
                {"text": "In the last month, how often have you felt that you were unable to control the important things in your life?", "reverse_scored": False},
                {"text": "In the last month, how often have you felt nervous and stressed?", "reverse_scored": False},
                {"text": "In the last month, how often have you felt confident about your ability to handle your personal problems?", "reverse_scored": True},
                {"text": "In the last month, how often have you felt that things were going your way?", "reverse_scored": True},
                {"text": "In the last month, how often have you found that you could not cope with all the things that you had to do?", "reverse_scored": False},
                {"text": "In the last month, how often have you been able to control irritations in your life?", "reverse_scored": True},
                {"text": "In the last month, how often have you felt that you were on top of things?", "reverse_scored": True},
                {"text": "In the last month, how often have you been angered because of things that were outside of your control?", "reverse_scored": False},
                {"text": "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?", "reverse_scored": False},
            ],
        },

        # ── 5. Active Communication Scale ────────────────────────────────────
        {
            "name": "Active Communication Scale",
            "short_name": "ACS-12",
            "category_key": "Skills & Competencies",
            "description": (
                "Measures three dimensions of active workplace communication: "
                "listening actively, expressing clearly, and managing conflict constructively."
            ),
            "construct_measured": "Workplace Communication Skills",
            "theoretical_framework": "Active listening and assertive communication theory",
            "source_citation": "Metricly Assessment Library (2024). Developed and validated for Arab organizational contexts.",
            "license_type": "proprietary",
            "is_proprietary": True,
            "total_items": 12,
            "estimated_minutes": 8,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["Arab professionals","cross-functional teams","customer-facing roles"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.87,
            "subscales": [
                {"name": "Active Listening", "description": "Attending fully to speakers and demonstrating comprehension", "item_count": 4},
                {"name": "Clear Expression", "description": "Communicating ideas with precision, structure, and appropriate tone", "item_count": 4},
                {"name": "Conflict Management", "description": "Addressing disagreements constructively and de-escalating tension", "item_count": 4},
            ],
            "items": [
                {"text": "I maintain eye contact and give my full attention when others are speaking.", "subscale": "Active Listening", "reverse_scored": False},
                {"text": "I ask clarifying questions to ensure I understand what others mean.", "subscale": "Active Listening", "reverse_scored": False},
                {"text": "I paraphrase or summarize what I have heard before responding.", "subscale": "Active Listening", "reverse_scored": False},
                {"text": "I avoid interrupting others while they are speaking.", "subscale": "Active Listening", "reverse_scored": False},
                {"text": "I organize my thoughts before communicating complex information.", "subscale": "Clear Expression", "reverse_scored": False},
                {"text": "I adapt my communication style to suit different audiences.", "subscale": "Clear Expression", "reverse_scored": False},
                {"text": "I express disagreement or concerns in a clear and respectful way.", "subscale": "Clear Expression", "reverse_scored": False},
                {"text": "I confirm that my message has been understood as intended.", "subscale": "Clear Expression", "reverse_scored": False},
                {"text": "I address conflicts directly rather than avoiding them.", "subscale": "Conflict Management", "reverse_scored": False},
                {"text": "I try to understand all sides of a disagreement before forming a judgment.", "subscale": "Conflict Management", "reverse_scored": False},
                {"text": "I focus on finding solutions rather than assigning blame during conflicts.", "subscale": "Conflict Management", "reverse_scored": False},
                {"text": "I remain calm and composed even in difficult conversations.", "subscale": "Conflict Management", "reverse_scored": False},
            ],
        },

        # ── 6. Critical Thinking Assessment ──────────────────────────────────
        {
            "name": "Critical Thinking Assessment",
            "short_name": "CTA-12",
            "category_key": "Skills & Competencies",
            "description": (
                "Assesses self-reported critical thinking capacity across three dimensions: "
                "analytical reasoning, evidence evaluation, and reflective judgment."
            ),
            "construct_measured": "Critical Thinking",
            "theoretical_framework": "Paul-Elder critical thinking framework",
            "source_citation": "Metricly Assessment Library (2024). Developed and validated for Arab organizational contexts.",
            "license_type": "proprietary",
            "is_proprietary": True,
            "total_items": 12,
            "estimated_minutes": 8,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["Arab professionals","university graduates","knowledge workers"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.84,
            "subscales": [
                {"name": "Analytical Reasoning", "description": "Breaking down complex problems into component parts", "item_count": 4},
                {"name": "Evidence Evaluation", "description": "Assessing the quality and relevance of information", "item_count": 4},
                {"name": "Reflective Judgment", "description": "Recognizing assumptions and revising beliefs based on evidence", "item_count": 4},
            ],
            "items": [
                {"text": "I systematically break down complex problems before attempting to solve them.", "subscale": "Analytical Reasoning", "reverse_scored": False},
                {"text": "I identify the underlying assumptions in arguments I encounter.", "subscale": "Analytical Reasoning", "reverse_scored": False},
                {"text": "I consider multiple explanations before settling on one conclusion.", "subscale": "Analytical Reasoning", "reverse_scored": False},
                {"text": "I can distinguish the main point of an argument from supporting details.", "subscale": "Analytical Reasoning", "reverse_scored": False},
                {"text": "I check whether evidence comes from credible and unbiased sources.", "subscale": "Evidence Evaluation", "reverse_scored": False},
                {"text": "I look for contradictory evidence before forming a conclusion.", "subscale": "Evidence Evaluation", "reverse_scored": False},
                {"text": "I can tell the difference between facts and opinions in written or spoken communication.", "subscale": "Evidence Evaluation", "reverse_scored": False},
                {"text": "I question statistics or data that appear to support my own views.", "subscale": "Evidence Evaluation", "reverse_scored": False},
                {"text": "I revise my opinions when presented with compelling new evidence.", "subscale": "Reflective Judgment", "reverse_scored": False},
                {"text": "I am aware of how my personal biases may influence my judgments.", "subscale": "Reflective Judgment", "reverse_scored": False},
                {"text": "I reflect on my thinking process after making important decisions.", "subscale": "Reflective Judgment", "reverse_scored": False},
                {"text": "I acknowledge uncertainty rather than forcing a premature conclusion.", "subscale": "Reflective Judgment", "reverse_scored": False},
            ],
        },

        # ── 7. Adaptability & Resilience Scale ───────────────────────────────
        {
            "name": "Adaptability & Resilience Scale",
            "short_name": "ARS-10",
            "category_key": "Skills & Competencies",
            "description": (
                "Measures two linked constructs: adaptability (openness and capacity "
                "to adjust to change) and resilience (ability to recover from setbacks)."
            ),
            "construct_measured": "Adaptability and Resilience",
            "theoretical_framework": "Connor-Davidson resilience model and occupational adaptability theory",
            "source_citation": "Metricly Assessment Library (2024). Developed and validated for Arab organizational contexts.",
            "license_type": "proprietary",
            "is_proprietary": True,
            "total_items": 10,
            "estimated_minutes": 6,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["Arab professionals","change management contexts","cross-sector"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.86,
            "subscales": [
                {"name": "Adaptability", "description": "Flexibility and openness in the face of change and uncertainty", "item_count": 5},
                {"name": "Resilience", "description": "Recovery capacity and persistence after adversity", "item_count": 5},
            ],
            "items": [
                {"text": "I adjust my approach quickly when circumstances change.", "subscale": "Adaptability", "reverse_scored": False},
                {"text": "I welcome change as an opportunity to learn and grow.", "subscale": "Adaptability", "reverse_scored": False},
                {"text": "I feel comfortable working in ambiguous or uncertain situations.", "subscale": "Adaptability", "reverse_scored": False},
                {"text": "I try new ways of working when my usual methods are not effective.", "subscale": "Adaptability", "reverse_scored": False},
                {"text": "I update my plans readily when new information becomes available.", "subscale": "Adaptability", "reverse_scored": False},
                {"text": "I recover quickly after facing a significant setback at work.", "subscale": "Resilience", "reverse_scored": False},
                {"text": "I maintain a positive outlook even when things go wrong.", "subscale": "Resilience", "reverse_scored": False},
                {"text": "I persist in the face of obstacles rather than giving up.", "subscale": "Resilience", "reverse_scored": False},
                {"text": "I draw on past difficult experiences as a source of strength.", "subscale": "Resilience", "reverse_scored": False},
                {"text": "I can manage strong emotions effectively during stressful situations.", "subscale": "Resilience", "reverse_scored": False},
            ],
        },

        # ── 8. Ethical Leadership Scale ──────────────────────────────────────
        {
            "name": "Ethical Leadership Scale",
            "short_name": "ELS-10",
            "category_key": "Leadership",
            "description": (
                "Brown et al.'s 10-item scale measuring the degree to which a leader "
                "demonstrates normatively appropriate conduct and promotes ethical behavior "
                "through personal actions and interpersonal relationships."
            ),
            "construct_measured": "Ethical Leadership",
            "theoretical_framework": "Social learning theory (Bandura, 1977); Brown, Treviño & Harrison (2005)",
            "source_citation": "Brown, M. E., Treviño, L. K., & Harrison, D. A. (2005). Ethical leadership: A social learning perspective for construct development and testing. Organizational Behavior and Human Decision Processes, 97(2), 117–134.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 10,
            "estimated_minutes": 5,
            "scoring_type": "mean",
            "response_format": "likert5",
            "validated_populations": '["corporate managers","public sector leaders","SME owners"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.92,
            "subscales": [],
            "items": [
                {"text": "My leader listens to what employees have to say.", "reverse_scored": False},
                {"text": "My leader disciplines employees who violate ethical standards.", "reverse_scored": False},
                {"text": "My leader conducts his/her personal life in an ethical manner.", "reverse_scored": False},
                {"text": "My leader has the best interests of employees in mind.", "reverse_scored": False},
                {"text": "My leader makes fair and balanced decisions.", "reverse_scored": False},
                {"text": "My leader can be trusted.", "reverse_scored": False},
                {"text": "My leader discusses business ethics or values with employees.", "reverse_scored": False},
                {"text": "My leader sets an example of how to do things the right way in terms of ethics.", "reverse_scored": False},
                {"text": "My leader defines success not just by results but also the way that they are obtained.", "reverse_scored": False},
                {"text": "When making decisions, my leader asks 'what is the right thing to do?'", "reverse_scored": False},
            ],
        },

        # ── 9. LMX-7 ─────────────────────────────────────────────────────────
        {
            "name": "Leader-Member Exchange Scale – 7 Items",
            "short_name": "LMX-7",
            "category_key": "Leadership",
            "description": (
                "Graen & Uhl-Bien's LMX-7 measures the quality of the dyadic exchange "
                "relationship between a supervisor and a subordinate."
            ),
            "construct_measured": "Leader-Member Exchange Quality",
            "theoretical_framework": "Graen & Uhl-Bien (1995) LMX theory",
            "source_citation": "Graen, G. B., & Uhl-Bien, M. (1995). Relationship-based approach to leadership: Development of leader-member exchange (LMX) theory of leadership over 25 years. Leadership Quarterly, 6(2), 219–247.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 7,
            "estimated_minutes": 5,
            "scoring_type": "mean",
            "response_format": "other",
            "validated_populations": '["corporate employees","public sector","healthcare","manufacturing"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.85,
            "subscales": [],
            "items": [
                {"text": "Do you know where you stand with your leader — do you usually know how satisfied your leader is with what you do?", "reverse_scored": False},
                {"text": "How well does your leader understand your job problems and needs?", "reverse_scored": False},
                {"text": "How well does your leader recognize your potential?", "reverse_scored": False},
                {"text": "Regardless of how much formal authority your leader has, what are the chances that your leader would use power to help you solve problems in your work?", "reverse_scored": False},
                {"text": "Again, regardless of the amount of formal authority your leader has, what are the chances that your leader would 'bail you out' at his/her expense?", "reverse_scored": False},
                {"text": "I have enough confidence in my leader that I would defend and justify his/her decision if he/she were not present to do so.", "reverse_scored": False},
                {"text": "How would you characterize your working relationship with your leader?", "reverse_scored": False},
            ],
        },

        # ── 10. General Self-Efficacy Scale ──────────────────────────────────
        {
            "name": "General Self-Efficacy Scale",
            "short_name": "GSE-10",
            "category_key": "Well-being & Resilience",
            "description": (
                "Schwarzer & Jerusalem's 10-item scale measuring the general belief "
                "in one's capacity to perform novel or difficult tasks and cope with adversity."
            ),
            "construct_measured": "General Self-Efficacy",
            "theoretical_framework": "Bandura (1977) social cognitive theory",
            "source_citation": "Schwarzer, R., & Jerusalem, M. (1995). Generalized self-efficacy scale. In J. Weinman, S. Wright, & M. Johnston (Eds.), Measures in health psychology (pp. 35–37). NFER-Nelson.",
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 10,
            "estimated_minutes": 5,
            "scoring_type": "sum",
            "response_format": "likert5",
            "validated_populations": '["general adult population","clinical samples","occupational groups"]',
            "languages": '["en","ar","de","es","zh","fr","ru"]',
            "reliability_alpha": 0.83,
            "subscales": [],
            "items": [
                {"text": "I can always manage to solve difficult problems if I try hard enough.", "reverse_scored": False},
                {"text": "If someone opposes me, I can find the means and ways to get what I want.", "reverse_scored": False},
                {"text": "It is easy for me to stick to my aims and accomplish my goals.", "reverse_scored": False},
                {"text": "I am confident that I could deal efficiently with unexpected events.", "reverse_scored": False},
                {"text": "Thanks to my resourcefulness, I know how to handle unforeseen situations.", "reverse_scored": False},
                {"text": "I can solve most problems if I invest the necessary effort.", "reverse_scored": False},
                {"text": "I can remain calm when facing difficulties because I can rely on my coping abilities.", "reverse_scored": False},
                {"text": "When I am confronted with a problem, I can usually find several solutions.", "reverse_scored": False},
                {"text": "If I am in trouble, I can usually think of a solution.", "reverse_scored": False},
                {"text": "I can usually handle whatever comes my way.", "reverse_scored": False},
            ],
        },

        # ── 11. Workplace Well-being Index ───────────────────────────────────
        {
            "name": "Workplace Well-being Index",
            "short_name": "WWI-10",
            "category_key": "Well-being & Resilience",
            "description": (
                "Measures two dimensions of workplace well-being: hedonic well-being "
                "(positive affect and life satisfaction at work) and eudaimonic well-being "
                "(meaning, purpose, and growth orientation)."
            ),
            "construct_measured": "Workplace Well-being",
            "theoretical_framework": "Dual-continuum model of well-being (Huppert & So, 2013)",
            "source_citation": "Metricly Assessment Library (2024). Developed and validated for Arab organizational contexts.",
            "license_type": "proprietary",
            "is_proprietary": True,
            "total_items": 10,
            "estimated_minutes": 6,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["Arab professionals","cross-sector organizations","post-pandemic workforce"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.88,
            "subscales": [
                {"name": "Hedonic Well-being", "description": "Positive affect, job satisfaction, and enjoyment at work", "item_count": 5},
                {"name": "Eudaimonic Well-being", "description": "Sense of meaning, purpose, and personal growth at work", "item_count": 5},
            ],
            "items": [
                {"text": "I feel happy and positive at work most of the time.", "subscale": "Hedonic Well-being", "reverse_scored": False},
                {"text": "I find my work genuinely enjoyable.", "subscale": "Hedonic Well-being", "reverse_scored": False},
                {"text": "Overall, I am satisfied with my current job.", "subscale": "Hedonic Well-being", "reverse_scored": False},
                {"text": "I rarely dread coming to work.", "subscale": "Hedonic Well-being", "reverse_scored": False},
                {"text": "I feel good about the way I spend most of my working day.", "subscale": "Hedonic Well-being", "reverse_scored": False},
                {"text": "My work gives me a sense of purpose and meaning.", "subscale": "Eudaimonic Well-being", "reverse_scored": False},
                {"text": "I feel I am growing and developing professionally in my current role.", "subscale": "Eudaimonic Well-being", "reverse_scored": False},
                {"text": "I believe my work contributes to something larger than myself.", "subscale": "Eudaimonic Well-being", "reverse_scored": False},
                {"text": "I have the opportunity to use my strengths and talents at work.", "subscale": "Eudaimonic Well-being", "reverse_scored": False},
                {"text": "I feel that my work aligns with my personal values.", "subscale": "Eudaimonic Well-being", "reverse_scored": False},
            ],
        },
    ]


# ---------------------------------------------------------------------------
# Batch-2 instrument definitions
# NOTE: PSS-7, LMX-7, ELS-10, GSE-10 already exist in batch-1 and are skipped
#       by the idempotency check (same short_name). Not duplicated here.
# ---------------------------------------------------------------------------


def _instrument_seed_data_batch2() -> list[dict]:  # noqa: C901
    return [
        # ── 1. Organizational Commitment Questionnaire ────────────────────────
        {
            "name": "Organizational Commitment Questionnaire",
            "short_name": "OCQ-18",
            "category_key": "Organizational Health",
            "description": (
                "Meyer & Allen's three-component model of organizational commitment measuring "
                "affective commitment (emotional attachment), continuance commitment "
                "(perceived cost of leaving), and normative commitment (felt obligation to remain)."
            ),
            "construct_measured": "Organizational Commitment",
            "theoretical_framework": "Meyer & Allen (1991) three-component model",
            "source_citation": (
                "Meyer, J. P., & Allen, N. J. (1991). A three-component conceptualization of "
                "organizational commitment. Human Resource Management Review, 1(1), 61–89. "
                "https://doi.org/10.1016/1053-4822(91)90011-Z"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 18,
            "estimated_minutes": 10,
            "scoring_type": "subscale",
            "response_format": "likert7",
            "validated_populations": '["corporate employees","public sector","healthcare","education"]',
            "languages": '["en","ar","fr","de","zh","es","pt"]',
            "reliability_alpha": 0.85,
            "subscales": [
                {"name": "Affective Commitment",    "description": "Emotional attachment to and identification with the organization",                     "item_count": 6},
                {"name": "Continuance Commitment",  "description": "Awareness of the costs associated with leaving the organization",                       "item_count": 6},
                {"name": "Normative Commitment",    "description": "Felt obligation to remain with the organization",                                       "item_count": 6},
            ],
            "items": [
                # Affective Commitment
                {"text": "I would be very happy to spend the rest of my career with this organization.",                                                                                           "subscale": "Affective Commitment",   "reverse_scored": False},
                {"text": "I enjoy discussing my organization with people outside it.",                                                                                                             "subscale": "Affective Commitment",   "reverse_scored": False},
                {"text": "I really feel as if this organization's problems are my own.",                                                                                                          "subscale": "Affective Commitment",   "reverse_scored": False},
                {"text": "I think that I could easily become as attached to another organization as I am to this one.",                                                                           "subscale": "Affective Commitment",   "reverse_scored": True},
                {"text": "I do not feel like 'part of the family' at my organization.",                                                                                                          "subscale": "Affective Commitment",   "reverse_scored": True},
                {"text": "I do not feel 'emotionally attached' to this organization.",                                                                                                           "subscale": "Affective Commitment",   "reverse_scored": True},
                # Continuance Commitment
                {"text": "It would be very hard for me to leave my organization right now, even if I wanted to.",                                                                                  "subscale": "Continuance Commitment", "reverse_scored": False},
                {"text": "Too much of my life would be disrupted if I decided I wanted to leave my organization now.",                                                                             "subscale": "Continuance Commitment", "reverse_scored": False},
                {"text": "Right now, staying with my organization is a matter of necessity as much as desire.",                                                                                    "subscale": "Continuance Commitment", "reverse_scored": False},
                {"text": "I believe that I have too few options to consider leaving this organization.",                                                                                           "subscale": "Continuance Commitment", "reverse_scored": False},
                {"text": "One of the few negative consequences of leaving this organization would be the scarcity of available alternatives.",                                                     "subscale": "Continuance Commitment", "reverse_scored": False},
                {"text": "One of the major reasons I continue to work here is that leaving would require considerable personal sacrifice — another organization may not match the overall benefits I have.", "subscale": "Continuance Commitment", "reverse_scored": False},
                # Normative Commitment
                {"text": "I think that people these days move from company to company too often.",                                                                                                 "subscale": "Normative Commitment",   "reverse_scored": False},
                {"text": "I do not believe that a person must always be loyal to his or her organization.",                                                                                       "subscale": "Normative Commitment",   "reverse_scored": True},
                {"text": "Jumping from organization to organization does not seem at all unethical to me.",                                                                                       "subscale": "Normative Commitment",   "reverse_scored": True},
                {"text": "One of the major reasons I continue to work here is that I believe loyalty is important and therefore feel a sense of moral obligation to remain.",                       "subscale": "Normative Commitment",   "reverse_scored": False},
                {"text": "If I got another offer for a better job elsewhere, I would not feel it was right to leave my organization.",                                                              "subscale": "Normative Commitment",   "reverse_scored": False},
                {"text": "I was taught to believe in the value of remaining loyal to one organization.",                                                                                          "subscale": "Normative Commitment",   "reverse_scored": False},
            ],
        },

        # ── 2. Job Demands-Resources Scale (short form) ───────────────────────
        {
            "name": "Job Demands-Resources Scale",
            "short_name": "JDR-16",
            "category_key": "Organizational Health",
            "description": (
                "Bakker & Demerouti's short-form JD-R measures two core job demands "
                "(workload, emotional demands) and two core job resources (autonomy, "
                "social support) using a 5-point frequency scale."
            ),
            "construct_measured": "Job Demands and Job Resources",
            "theoretical_framework": "Bakker & Demerouti (2007) job demands-resources model",
            "source_citation": (
                "Bakker, A. B., & Demerouti, E. (2007). The job demands-resources model: "
                "State of the art. Journal of Managerial Psychology, 22(3), 309–328. "
                "https://doi.org/10.1108/02683940710733115"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 16,
            "estimated_minutes": 8,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["nurses","teachers","police officers","service workers","knowledge workers"]',
            "languages": '["en","ar","nl","de","fi","es"]',
            "reliability_alpha": 0.83,
            "subscales": [
                {"name": "Workload",          "description": "Quantitative demands: pace, volume, and time pressure",                           "item_count": 4},
                {"name": "Emotional Demands", "description": "Extent to which work involves emotionally upsetting situations",                  "item_count": 4},
                {"name": "Autonomy",          "description": "Degree of control over how, when, and what to work on",                          "item_count": 4},
                {"name": "Social Support",    "description": "Support from colleagues and direct supervisor",                                   "item_count": 4},
            ],
            "items": [
                # Workload
                {"text": "I have to work very fast.",                                          "subscale": "Workload",          "reverse_scored": False},
                {"text": "I have to work very hard.",                                          "subscale": "Workload",          "reverse_scored": False},
                {"text": "I have an excessive amount of work to do.",                          "subscale": "Workload",          "reverse_scored": False},
                {"text": "I do not have enough time to do all my work properly.",              "subscale": "Workload",          "reverse_scored": False},
                # Emotional Demands
                {"text": "My work puts me in emotionally upsetting situations.",               "subscale": "Emotional Demands", "reverse_scored": False},
                {"text": "My work requires that I hide my emotions.",                          "subscale": "Emotional Demands", "reverse_scored": False},
                {"text": "My work is emotionally demanding.",                                  "subscale": "Emotional Demands", "reverse_scored": False},
                {"text": "In my work I deal directly with problems of other people.",          "subscale": "Emotional Demands", "reverse_scored": False},
                # Autonomy
                {"text": "I have freedom to decide how to plan my work.",                      "subscale": "Autonomy",          "reverse_scored": False},
                {"text": "I have a great deal to say about what happens in my job.",           "subscale": "Autonomy",          "reverse_scored": False},
                {"text": "I can decide myself how I execute my work.",                         "subscale": "Autonomy",          "reverse_scored": False},
                {"text": "I have influence over the scheduling of my own work activities.",    "subscale": "Autonomy",          "reverse_scored": False},
                # Social Support
                {"text": "If I need it, I can ask my direct supervisor for help.",             "subscale": "Social Support",    "reverse_scored": False},
                {"text": "My direct supervisor pays attention to my development and growth.",  "subscale": "Social Support",    "reverse_scored": False},
                {"text": "If I need it, I can ask my colleagues for help.",                    "subscale": "Social Support",    "reverse_scored": False},
                {"text": "My colleagues and I work well together.",                            "subscale": "Social Support",    "reverse_scored": False},
            ],
        },

        # ── 3. Person-Organization Fit ────────────────────────────────────────
        {
            "name": "Person-Organization Fit Scale",
            "short_name": "POF-3",
            "category_key": "Organizational Health",
            "description": (
                "Cable & DeRue's 3-item scale measuring the perceived congruence between "
                "an employee's personal values and the values and culture of their organization."
            ),
            "construct_measured": "Person-Organization Value Fit",
            "theoretical_framework": "Cable & DeRue (2002) needs-supplies and demands-abilities fit framework",
            "source_citation": (
                "Cable, D. M., & DeRue, D. S. (2002). The convergent and discriminant validity "
                "of subjective fit perceptions. Journal of Applied Psychology, 87(5), 875–884. "
                "https://doi.org/10.1037/0021-9010.87.5.875"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 3,
            "estimated_minutes": 2,
            "scoring_type": "mean",
            "response_format": "likert7",
            "validated_populations": '["corporate employees","MBAs","service sector","cross-industry"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.91,
            "subscales": [],
            "items": [
                {"text": "The things that I value in life are very similar to the things that my organization values.",        "reverse_scored": False},
                {"text": "My personal values match my organization's values and culture.",                                     "reverse_scored": False},
                {"text": "My organization's values and culture provide a good fit with the things that I value in life.",      "reverse_scored": False},
            ],
        },

        # ── 4. Servant Leadership Survey (short form) ─────────────────────────
        {
            "name": "Servant Leadership Survey – Short Form",
            "short_name": "SLS-14",
            "category_key": "Leadership",
            "description": (
                "Liden et al.'s SLS measures seven dimensions of servant leadership, "
                "each tapping a distinct facet: emotional healing, community value creation, "
                "conceptual skills, empowering, helping subordinates grow, prioritizing subordinates, "
                "and behaving ethically."
            ),
            "construct_measured": "Servant Leadership",
            "theoretical_framework": "Liden et al. (2008) multidimensional servant leadership theory",
            "source_citation": (
                "Liden, R. C., Wayne, S. J., Zhao, H., & Henderson, D. (2008). "
                "Servant leadership: Development of a multidimensional measure and multi-level assessment. "
                "Leadership Quarterly, 19(2), 161–177. https://doi.org/10.1016/j.leaqua.2008.01.006"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 14,
            "estimated_minutes": 8,
            "scoring_type": "subscale",
            "response_format": "likert7",
            "validated_populations": '["corporate managers","public sector leaders","healthcare supervisors"]',
            "languages": '["en","ar","zh","ko"]',
            "reliability_alpha": 0.87,
            "subscales": [
                {"name": "Emotional Healing",            "description": "Recognizing and addressing the personal and professional well-being of subordinates",   "item_count": 2},
                {"name": "Community Value Creation",     "description": "Engaging with and contributing to the broader community",                               "item_count": 2},
                {"name": "Conceptual Skills",            "description": "Possessing the knowledge needed to support and guide work effectively",                  "item_count": 2},
                {"name": "Empowering",                   "description": "Facilitating subordinate autonomy, decision-making, and self-confidence",               "item_count": 2},
                {"name": "Helping Subordinates Grow",    "description": "Actively prioritizing the professional development and career success of subordinates",  "item_count": 2},
                {"name": "Putting Subordinates First",   "description": "Placing the interests and needs of subordinates ahead of the leader's own",             "item_count": 2},
                {"name": "Behaving Ethically",           "description": "Interacting with honesty, integrity, and ethical conduct",                              "item_count": 2},
            ],
            "items": [
                {"text": "My manager takes time to talk with me on a personal level.",                                                    "subscale": "Emotional Healing",         "reverse_scored": False},
                {"text": "My manager is good at helping me work through the stress of my work.",                                           "subscale": "Emotional Healing",         "reverse_scored": False},
                {"text": "My manager encourages me to volunteer in the community.",                                                        "subscale": "Community Value Creation",  "reverse_scored": False},
                {"text": "My manager is actively involved in community activities outside of work.",                                       "subscale": "Community Value Creation",  "reverse_scored": False},
                {"text": "My manager has thorough knowledge about our organization's goals, strengths, and limitations.",                   "subscale": "Conceptual Skills",         "reverse_scored": False},
                {"text": "My manager has the skills and abilities needed to be a highly effective leader.",                                "subscale": "Conceptual Skills",         "reverse_scored": False},
                {"text": "My manager gives me the freedom to handle difficult situations in the way that I feel is best.",                 "subscale": "Empowering",                "reverse_scored": False},
                {"text": "My manager allows me to handle important work decisions without checking with him/her first.",                   "subscale": "Empowering",                "reverse_scored": False},
                {"text": "My manager makes my career development a priority.",                                                             "subscale": "Helping Subordinates Grow", "reverse_scored": False},
                {"text": "My manager is interested in making sure that I am achieving my career goals.",                                   "subscale": "Helping Subordinates Grow", "reverse_scored": False},
                {"text": "My manager puts my best interests ahead of his/her own.",                                                       "subscale": "Putting Subordinates First", "reverse_scored": False},
                {"text": "My manager sacrifices his/her own interests to meet my needs.",                                                  "subscale": "Putting Subordinates First", "reverse_scored": False},
                {"text": "My manager seems to act ethically in all situations.",                                                           "subscale": "Behaving Ethically",        "reverse_scored": False},
                {"text": "My manager is always honest and truthful.",                                                                     "subscale": "Behaving Ethically",        "reverse_scored": False},
            ],
        },

        # ── 5. PANAS ──────────────────────────────────────────────────────────
        {
            "name": "Positive and Negative Affect Schedule",
            "short_name": "PANAS-20",
            "category_key": "Well-being & Resilience",
            "description": (
                "Watson et al.'s PANAS measures two dominant dimensions of mood state: "
                "positive affect (feelings of enthusiasm and energy) and negative affect "
                "(feelings of distress and aversion). Respondents rate each adjective "
                "on a 5-point scale of intensity (1 = very slightly or not at all, 5 = extremely)."
            ),
            "construct_measured": "Positive and Negative Affect",
            "theoretical_framework": "Watson, Clark & Tellegen (1988) two-factor affect structure",
            "source_citation": (
                "Watson, D., Clark, L. A., & Tellegen, A. (1988). Development and validation "
                "of brief measures of positive and negative affect: The PANAS scales. "
                "Journal of Personality and Social Psychology, 54(6), 1063–1070. "
                "https://doi.org/10.1037/0022-3514.54.6.1063"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 20,
            "estimated_minutes": 5,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["general adult population","university students","clinical samples","organizational samples"]',
            "languages": '["en","ar","fr","de","es","zh","pt","ru","ja","ko"]',
            "reliability_alpha": 0.88,
            "subscales": [
                {"name": "Positive Affect",  "description": "Extent to which a person feels enthusiastic, active, and alert",        "item_count": 10},
                {"name": "Negative Affect",  "description": "Extent to which a person feels subjective distress and aversive states", "item_count": 10},
            ],
            "items": [
                # Positive Affect
                {"text": "Interested",     "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Excited",        "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Strong",         "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Enthusiastic",   "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Proud",          "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Alert",          "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Inspired",       "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Determined",     "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Attentive",      "subscale": "Positive Affect", "reverse_scored": False},
                {"text": "Active",         "subscale": "Positive Affect", "reverse_scored": False},
                # Negative Affect
                {"text": "Distressed",     "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Upset",          "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Guilty",         "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Scared",         "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Hostile",        "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Irritable",      "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Ashamed",        "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Nervous",        "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Jittery",        "subscale": "Negative Affect", "reverse_scored": False},
                {"text": "Afraid",         "subscale": "Negative Affect", "reverse_scored": False},
            ],
        },

        # ── 6. PERMA Profiler ─────────────────────────────────────────────────
        {
            "name": "PERMA Profiler",
            "short_name": "PERMA-18",
            "category_key": "Well-being & Resilience",
            "description": (
                "Butler & Kern's PERMA Profiler assesses Seligman's five pillars of well-being "
                "(Positive Emotions, Engagement, Relationships, Meaning, Accomplishment) plus "
                "Health, using a 0–10 response scale (0 = never / not at all, 10 = always / completely)."
            ),
            "construct_measured": "Multi-dimensional Well-being (PERMA + Health)",
            "theoretical_framework": "Seligman (2011) PERMA model; Butler & Kern (2016)",
            "source_citation": (
                "Butler, J., & Kern, M. L. (2016). The PERMA-Profiler: A brief multidimensional "
                "measure of flourishing. International Journal of Wellbeing, 6(3), 1–48. "
                "https://doi.org/10.5502/ijw.v6i3.526"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 18,
            "estimated_minutes": 8,
            "scoring_type": "subscale",
            "response_format": "other",
            "validated_populations": '["general adult population","university students","clinical samples","cross-cultural samples"]',
            "languages": '["en","ar","zh","de","es","fr","pt","ja"]',
            "reliability_alpha": 0.77,
            "subscales": [
                {"name": "Positive Emotions", "description": "Frequency and intensity of positive feelings",            "item_count": 3},
                {"name": "Engagement",        "description": "Absorption, interest, and flow in activities",            "item_count": 3},
                {"name": "Relationships",     "description": "Quality of social connections and felt love and support", "item_count": 3},
                {"name": "Meaning",           "description": "Sense of purpose and direction in life",                  "item_count": 3},
                {"name": "Accomplishment",    "description": "Progress toward and achievement of important goals",      "item_count": 3},
                {"name": "Health",            "description": "Subjective evaluation of overall physical well-being",    "item_count": 3},
            ],
            "items": [
                {"text": "How often do you feel joyful?",                                                                        "subscale": "Positive Emotions", "reverse_scored": False},
                {"text": "How often do you feel positive?",                                                                      "subscale": "Positive Emotions", "reverse_scored": False},
                {"text": "In general, to what extent do you feel contented?",                                                    "subscale": "Positive Emotions", "reverse_scored": False},
                {"text": "How often do you become absorbed in what you are doing?",                                              "subscale": "Engagement",        "reverse_scored": False},
                {"text": "In general, to what extent do you feel excited and interested in things?",                             "subscale": "Engagement",        "reverse_scored": False},
                {"text": "How often do you lose track of time while doing something you enjoy?",                                 "subscale": "Engagement",        "reverse_scored": False},
                {"text": "To what extent do you receive help and support from others when you need it?",                         "subscale": "Relationships",     "reverse_scored": False},
                {"text": "To what extent do you feel loved?",                                                                    "subscale": "Relationships",     "reverse_scored": False},
                {"text": "How satisfied are you with your personal relationships?",                                              "subscale": "Relationships",     "reverse_scored": False},
                {"text": "In general, to what extent do you lead a purposeful and meaningful life?",                             "subscale": "Meaning",           "reverse_scored": False},
                {"text": "To what extent do you feel that what you do in your life is valuable and worthwhile?",                 "subscale": "Meaning",           "reverse_scored": False},
                {"text": "To what extent do you feel that your life has a sense of direction or meaning to it?",                 "subscale": "Meaning",           "reverse_scored": False},
                {"text": "How often do you achieve the important goals you have set for yourself?",                              "subscale": "Accomplishment",    "reverse_scored": False},
                {"text": "To what extent do you feel capable and competent in the activities that are important to you?",        "subscale": "Accomplishment",    "reverse_scored": False},
                {"text": "How much of the time do you feel you are making progress towards accomplishing your goals?",           "subscale": "Accomplishment",    "reverse_scored": False},
                {"text": "How would you rate your overall physical health?",                                                     "subscale": "Health",            "reverse_scored": False},
                {"text": "Compared to others your age, how is your health?",                                                    "subscale": "Health",            "reverse_scored": False},
                {"text": "How satisfied are you with your current level of physical health and fitness?",                        "subscale": "Health",            "reverse_scored": False},
            ],
        },

        # ── 7. Subjective Vitality Scale ──────────────────────────────────────
        {
            "name": "Subjective Vitality Scale",
            "short_name": "SVS-7",
            "category_key": "Well-being & Resilience",
            "description": (
                "Ryan & Frederick's 7-item scale measuring subjective vitality — the sense of "
                "aliveness, energy, and enthusiasm as a positive aspect of well-being. "
                "One item is reverse-scored."
            ),
            "construct_measured": "Subjective Vitality",
            "theoretical_framework": "Ryan & Frederick (1997) self-determination theory framework",
            "source_citation": (
                "Ryan, R. M., & Frederick, C. (1997). On energy, personality, and health: "
                "Subjective vitality as a dynamic reflection of well-being. "
                "Journal of Personality, 65(3), 529–565. https://doi.org/10.1111/j.1467-6494.1997.tb00326.x"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 7,
            "estimated_minutes": 3,
            "scoring_type": "mean",
            "response_format": "likert7",
            "validated_populations": '["general adult population","athletes","university students","clinical samples"]',
            "languages": '["en","ar","fr","de","zh","it","tr"]',
            "reliability_alpha": 0.84,
            "subscales": [],
            "items": [
                {"text": "I feel alive and vital.",                          "reverse_scored": False},
                {"text": "I don't feel very energetic.",                     "reverse_scored": True},
                {"text": "I have energy and spirit.",                        "reverse_scored": False},
                {"text": "I look forward to each new day.",                  "reverse_scored": False},
                {"text": "I nearly always feel alert and awake.",            "reverse_scored": False},
                {"text": "I feel energized.",                                "reverse_scored": False},
                {"text": "I feel so alive I just want to burst.",            "reverse_scored": False},
            ],
        },

        # ── 8. Core Self-Evaluations Scale ────────────────────────────────────
        {
            "name": "Core Self-Evaluations Scale",
            "short_name": "CSES-12",
            "category_key": "Skills & Competencies",
            "description": (
                "Judge et al.'s 12-item CSES measures core self-evaluations — a higher-order "
                "construct encompassing self-esteem, generalized self-efficacy, locus of control, "
                "and emotional stability. Six items are reverse-scored."
            ),
            "construct_measured": "Core Self-Evaluations",
            "theoretical_framework": "Judge, Locke & Durham (1997) core evaluations theory",
            "source_citation": (
                "Judge, T. A., Erez, A., Bono, J. E., & Thoresen, C. J. (2003). "
                "The core self-evaluations scale: Development of a measure. "
                "Personnel Psychology, 56(2), 303–331. https://doi.org/10.1111/j.1744-6570.2003.tb00152.x"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 12,
            "estimated_minutes": 5,
            "scoring_type": "mean",
            "response_format": "likert5",
            "validated_populations": '["working adults","university students","general population","cross-cultural samples"]',
            "languages": '["en","ar","de","zh","ko","nl","es"]',
            "reliability_alpha": 0.81,
            "subscales": [],
            "items": [
                {"text": "I am confident I get the success I deserve in life.",                                "reverse_scored": False},
                {"text": "Sometimes I feel depressed.",                                                        "reverse_scored": True},
                {"text": "When I try, I generally succeed.",                                                   "reverse_scored": False},
                {"text": "Sometimes when I fail I feel worthless.",                                            "reverse_scored": True},
                {"text": "I complete tasks successfully.",                                                     "reverse_scored": False},
                {"text": "Sometimes I do not feel in control of my work.",                                     "reverse_scored": True},
                {"text": "Overall, I am satisfied with myself.",                                               "reverse_scored": False},
                {"text": "I am filled with doubts about my competence.",                                       "reverse_scored": True},
                {"text": "I determine what will happen in my life.",                                           "reverse_scored": False},
                {"text": "I do not feel in control of my success in my career.",                               "reverse_scored": True},
                {"text": "I am capable of coping with most of my problems.",                                   "reverse_scored": False},
                {"text": "There are times when things look pretty bleak and hopeless to me.",                  "reverse_scored": True},
            ],
        },

        # ── 9. Grit Scale – Short Form (Grit-S) ──────────────────────────────
        {
            "name": "Grit Scale – Short Form",
            "short_name": "GRIT-S",
            "category_key": "Skills & Competencies",
            "description": (
                "Duckworth et al.'s 8-item Grit-S measures two facets of grit: perseverance of "
                "effort (working diligently toward long-term goals) and consistency of interest "
                "(maintaining focus and not shifting goals). All consistency items are reverse-scored."
            ),
            "construct_measured": "Grit (Perseverance and Passion for Long-term Goals)",
            "theoretical_framework": "Duckworth et al. (2007) grit theory",
            "source_citation": (
                "Duckworth, A. L., & Quinn, P. D. (2009). Development and validation of the "
                "Short Grit Scale (Grit-S). Journal of Personality Assessment, 91(2), 166–174. "
                "https://doi.org/10.1080/00223890802634290"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 8,
            "estimated_minutes": 3,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["university students","military cadets","general adult population","competitive adults"]',
            "languages": '["en","ar","zh","de","es","ko","pt"]',
            "reliability_alpha": 0.73,
            "subscales": [
                {"name": "Perseverance of Effort",   "description": "Working diligently and sustaining effort toward long-term goals",         "item_count": 4},
                {"name": "Consistency of Interest",  "description": "Maintaining focus without shifting goals or losing interest over time",   "item_count": 4},
            ],
            "items": [
                {"text": "I have overcome setbacks to conquer an important challenge.",                                 "subscale": "Perseverance of Effort",  "reverse_scored": False},
                {"text": "I finish whatever I begin.",                                                                  "subscale": "Perseverance of Effort",  "reverse_scored": False},
                {"text": "Setbacks don't discourage me. I bounce back from disappointment.",                            "subscale": "Perseverance of Effort",  "reverse_scored": False},
                {"text": "I am a hard worker.",                                                                         "subscale": "Perseverance of Effort",  "reverse_scored": False},
                {"text": "New ideas and projects sometimes distract me from previous ones.",                            "subscale": "Consistency of Interest", "reverse_scored": True},
                {"text": "My interests change from year to year.",                                                      "subscale": "Consistency of Interest", "reverse_scored": True},
                {"text": "I have been obsessed with a certain idea or project for a short time but later lost interest.","subscale": "Consistency of Interest", "reverse_scored": True},
                {"text": "I have difficulty maintaining my focus on projects that take more than a few months to complete.", "subscale": "Consistency of Interest", "reverse_scored": True},
            ],
        },

        # ── 10. Big Five Inventory – Short Form (BFI-10) ─────────────────────
        {
            "name": "Big Five Inventory – 10 Items",
            "short_name": "BFI-10",
            "category_key": "Personality",
            "description": (
                "Rammstedt & John's ultra-short 10-item Big Five Inventory measures the five major "
                "personality dimensions using 2 items per factor. Suitable for large surveys where "
                "brevity is essential; reliability is modest — use with caution for high-stakes "
                "decisions. Items begin: 'I see myself as someone who…'"
            ),
            "construct_measured": "Big Five Personality Dimensions (OCEAN)",
            "theoretical_framework": "McCrae & Costa (1987) five-factor model; Rammstedt & John (2007)",
            "source_citation": (
                "Rammstedt, B., & John, O. P. (2007). Measuring personality in one minute or less: "
                "A 10-item short version of the Big Five Inventory in English and German. "
                "Journal of Research in Personality, 41(1), 203–212. "
                "https://doi.org/10.1016/j.jrp.2006.02.001"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 10,
            "estimated_minutes": 3,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["general adult population","university students","cross-cultural samples"]',
            "languages": '["en","ar","de","fr","es","zh","nl","it","ru","pt"]',
            "reliability_alpha": 0.65,
            "subscales": [
                {"name": "Extraversion",        "description": "Sociability, assertiveness, and positive emotionality", "item_count": 2},
                {"name": "Agreeableness",        "description": "Cooperativeness, trust, and prosocial orientation",    "item_count": 2},
                {"name": "Conscientiousness",    "description": "Organization, dependability, and goal-directedness",   "item_count": 2},
                {"name": "Neuroticism",          "description": "Emotional instability, anxiety, and moodiness",        "item_count": 2},
                {"name": "Openness",             "description": "Curiosity, creativity, and aesthetic sensitivity",     "item_count": 2},
            ],
            "items": [
                {"text": "I see myself as someone who is reserved.",                    "subscale": "Extraversion",     "reverse_scored": True},
                {"text": "I see myself as someone who is outgoing, sociable.",          "subscale": "Extraversion",     "reverse_scored": False},
                {"text": "I see myself as someone who is generally trusting.",          "subscale": "Agreeableness",    "reverse_scored": False},
                {"text": "I see myself as someone who tends to find fault with others.","subscale": "Agreeableness",    "reverse_scored": True},
                {"text": "I see myself as someone who tends to be lazy.",               "subscale": "Conscientiousness","reverse_scored": True},
                {"text": "I see myself as someone who does a thorough job.",            "subscale": "Conscientiousness","reverse_scored": False},
                {"text": "I see myself as someone who is relaxed, handles stress well.","subscale": "Neuroticism",     "reverse_scored": True},
                {"text": "I see myself as someone who gets nervous easily.",            "subscale": "Neuroticism",     "reverse_scored": False},
                {"text": "I see myself as someone who has few artistic interests.",     "subscale": "Openness",        "reverse_scored": True},
                {"text": "I see myself as someone who has an active imagination.",     "subscale": "Openness",        "reverse_scored": False},
            ],
        },

        # ── 11. HEXACO-60 ─────────────────────────────────────────────────────
        {
            "name": "HEXACO Personality Inventory – 60 Items",
            "short_name": "HEXACO-60",
            "category_key": "Personality",
            "description": (
                "Ashton & Lee's 60-item HEXACO-PI-R measures six broad personality dimensions: "
                "Honesty-Humility (H), Emotionality (E), Extraversion (X), Agreeableness (A), "
                "Conscientiousness (C), and Openness to Experience (O). Freely available at hexaco.org."
            ),
            "construct_measured": "Six-factor Personality (HEXACO)",
            "theoretical_framework": "Ashton & Lee (2007) HEXACO model; lexical personality research",
            "source_citation": (
                "Ashton, M. C., & Lee, K. (2009). The HEXACO–60: A short measure of the major "
                "dimensions of personality. Journal of Personality Assessment, 91(4), 340–345. "
                "https://doi.org/10.1080/00223890902935878"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 60,
            "estimated_minutes": 20,
            "scoring_type": "subscale",
            "response_format": "likert5",
            "validated_populations": '["general adult population","university students","cross-cultural","organizational samples"]',
            "languages": '["en","ar","de","fr","nl","ko","zh","es","it","pl","ru","tr"]',
            "reliability_alpha": 0.75,
            "subscales": [
                {"name": "Honesty-Humility",        "description": "Sincerity, fairness, greed-avoidance, and modesty",                                            "item_count": 10},
                {"name": "Emotionality",            "description": "Fearfulness, anxiety, dependence, and sentimentality",                                         "item_count": 10},
                {"name": "Extraversion",            "description": "Social self-esteem, social boldness, sociability, and liveliness",                             "item_count": 10},
                {"name": "Agreeableness",           "description": "Forgivingness, gentleness, flexibility, and patience (vs. anger)",                             "item_count": 10},
                {"name": "Conscientiousness",       "description": "Organization, diligence, perfectionism, and prudence",                                         "item_count": 10},
                {"name": "Openness to Experience",  "description": "Aesthetic appreciation, inquisitiveness, creativity, and unconventionality",                   "item_count": 10},
            ],
            "items": [
                # Honesty-Humility (H)
                {"text": "I wouldn't use flattery to get a raise or promotion at work, even if I thought it would succeed.",                           "subscale": "Honesty-Humility",       "reverse_scored": False},
                {"text": "If I want something from a person I dislike, I will act very nicely toward that person in order to get it.",                 "subscale": "Honesty-Humility",       "reverse_scored": True},
                {"text": "Having a lot of money is not especially important to me.",                                                                   "subscale": "Honesty-Humility",       "reverse_scored": False},
                {"text": "I want people to know that I am an important and high-status person.",                                                       "subscale": "Honesty-Humility",       "reverse_scored": True},
                {"text": "I am an ordinary person who is no better than others.",                                                                     "subscale": "Honesty-Humility",       "reverse_scored": False},
                {"text": "I wouldn't pretend to like someone just to get that person to do favors for me.",                                           "subscale": "Honesty-Humility",       "reverse_scored": False},
                {"text": "I think I am entitled to more respect than the average person.",                                                            "subscale": "Honesty-Humility",       "reverse_scored": True},
                {"text": "I would like to live in a very expensive, high-class neighborhood.",                                                        "subscale": "Honesty-Humility",       "reverse_scored": True},
                {"text": "I try to give generously to those in need.",                                                                               "subscale": "Honesty-Humility",       "reverse_scored": False},
                {"text": "I would get a lot of pleasure from owning expensive luxury goods.",                                                         "subscale": "Honesty-Humility",       "reverse_scored": True},
                # Emotionality (E)
                {"text": "I rarely worry about the health of people close to me.",                                                                    "subscale": "Emotionality",           "reverse_scored": True},
                {"text": "I feel very anxious in situations where I might make a poor impression on people.",                                         "subscale": "Emotionality",           "reverse_scored": False},
                {"text": "I feel strong emotions when someone close to me is going away for a long time.",                                            "subscale": "Emotionality",           "reverse_scored": False},
                {"text": "When someone hurts my feelings, I try not to let them know that I feel upset.",                                             "subscale": "Emotionality",           "reverse_scored": True},
                {"text": "I sometimes can't help worrying about little things.",                                                                      "subscale": "Emotionality",           "reverse_scored": False},
                {"text": "I am an emotional person.",                                                                                                 "subscale": "Emotionality",           "reverse_scored": False},
                {"text": "I feel little sympathy for people who are going through hardships.",                                                        "subscale": "Emotionality",           "reverse_scored": True},
                {"text": "I rarely hold a grudge, even against people who have badly wronged me.",                                                    "subscale": "Emotionality",           "reverse_scored": True},
                {"text": "I feel nervous in situations where I might make a poor impression.",                                                        "subscale": "Emotionality",           "reverse_scored": False},
                {"text": "I worry about things that might seem unimportant to others.",                                                               "subscale": "Emotionality",           "reverse_scored": False},
                # Extraversion (X)
                {"text": "When I'm in a group of people, I'm often the one who speaks on behalf of the group.",                                      "subscale": "Extraversion",           "reverse_scored": False},
                {"text": "I feel comfortable in most social situations.",                                                                             "subscale": "Extraversion",           "reverse_scored": False},
                {"text": "In social situations, I'm usually the quiet type.",                                                                        "subscale": "Extraversion",           "reverse_scored": True},
                {"text": "I enjoy meeting and talking to new people.",                                                                               "subscale": "Extraversion",           "reverse_scored": False},
                {"text": "I find it hard to talk to someone I've just met.",                                                                         "subscale": "Extraversion",           "reverse_scored": True},
                {"text": "I don't usually initiate conversations.",                                                                                  "subscale": "Extraversion",           "reverse_scored": True},
                {"text": "I enjoy having lots of people around me.",                                                                                 "subscale": "Extraversion",           "reverse_scored": False},
                {"text": "I'm quite cheerful.",                                                                                                      "subscale": "Extraversion",           "reverse_scored": False},
                {"text": "I am not very talkative when I'm with a group of people.",                                                                 "subscale": "Extraversion",           "reverse_scored": True},
                {"text": "I can talk easily with people I have just met.",                                                                           "subscale": "Extraversion",           "reverse_scored": False},
                # Agreeableness (A) — vs. anger/irritability
                {"text": "I have a bad temper.",                                                                                                     "subscale": "Agreeableness",          "reverse_scored": True},
                {"text": "I try to be lenient in judging other people.",                                                                             "subscale": "Agreeableness",          "reverse_scored": False},
                {"text": "People sometimes tell me that I am too stubborn.",                                                                         "subscale": "Agreeableness",          "reverse_scored": True},
                {"text": "I cooperate with others even when I know that my efforts are not being rewarded.",                                          "subscale": "Agreeableness",          "reverse_scored": False},
                {"text": "I find it hard to fully forgive others who have once wronged me.",                                                          "subscale": "Agreeableness",          "reverse_scored": True},
                {"text": "I am usually patient with other people.",                                                                                  "subscale": "Agreeableness",          "reverse_scored": False},
                {"text": "I can be quite strict and demanding.",                                                                                     "subscale": "Agreeableness",          "reverse_scored": True},
                {"text": "Even when people make mistakes, I rarely say anything negative.",                                                          "subscale": "Agreeableness",          "reverse_scored": False},
                {"text": "I get quite annoyed when people don't live up to my expectations.",                                                         "subscale": "Agreeableness",          "reverse_scored": True},
                {"text": "I tend to be lenient in judging other people, even when they've done something wrong.",                                     "subscale": "Agreeableness",          "reverse_scored": False},
                # Conscientiousness (C)
                {"text": "I often push myself very hard when trying to achieve a goal.",                                                             "subscale": "Conscientiousness",      "reverse_scored": False},
                {"text": "I plan ahead and organize things to avoid scrambling at the last minute.",                                                  "subscale": "Conscientiousness",      "reverse_scored": False},
                {"text": "I make a lot of mistakes because I don't think before I act.",                                                             "subscale": "Conscientiousness",      "reverse_scored": True},
                {"text": "I'm not very good at scheduling my time.",                                                                                 "subscale": "Conscientiousness",      "reverse_scored": True},
                {"text": "I always try to be accurate in my work, even at the cost of time.",                                                        "subscale": "Conscientiousness",      "reverse_scored": False},
                {"text": "I often decide impulsively.",                                                                                              "subscale": "Conscientiousness",      "reverse_scored": True},
                {"text": "I always behave in ways that are consistent with my principles.",                                                          "subscale": "Conscientiousness",      "reverse_scored": False},
                {"text": "I avoid extra work whenever possible.",                                                                                    "subscale": "Conscientiousness",      "reverse_scored": True},
                {"text": "I take care of my possessions.",                                                                                           "subscale": "Conscientiousness",      "reverse_scored": False},
                {"text": "I'm careful not to make errors in my work.",                                                                               "subscale": "Conscientiousness",      "reverse_scored": False},
                # Openness to Experience (O)
                {"text": "I would find it difficult to imagine the inner world of a fictional character.",                                           "subscale": "Openness to Experience", "reverse_scored": True},
                {"text": "I see beauty in things that other people might not notice.",                                                               "subscale": "Openness to Experience", "reverse_scored": False},
                {"text": "I don't think of myself as the artistic or creative type.",                                                                "subscale": "Openness to Experience", "reverse_scored": True},
                {"text": "I find it very interesting to learn about other cultures.",                                                                "subscale": "Openness to Experience", "reverse_scored": False},
                {"text": "I think that paying attention to radical ideas is a waste of time.",                                                       "subscale": "Openness to Experience", "reverse_scored": True},
                {"text": "I prefer watching television to visiting an art museum.",                                                                  "subscale": "Openness to Experience", "reverse_scored": True},
                {"text": "I have never been very excited about works of art, music, or literature.",                                                 "subscale": "Openness to Experience", "reverse_scored": True},
                {"text": "I enjoy contemplating the nature of the universe and our place in it.",                                                    "subscale": "Openness to Experience", "reverse_scored": False},
                {"text": "I think that a complex, unfamiliar piece of music can be beautiful.",                                                      "subscale": "Openness to Experience", "reverse_scored": False},
                {"text": "I use my imagination freely when working on a problem.",                                                                   "subscale": "Openness to Experience", "reverse_scored": False},
            ],
        },

        # ── 12. Team Psychological Safety (team-level, Edmondson 1999) ────────
        {
            "name": "Team Psychological Safety Scale",
            "short_name": "TPS-7",
            "category_key": "Team Effectiveness",
            "description": (
                "Edmondson's original 7-item team psychological safety scale, administered "
                "as a team-level measure. Each team member rates the shared climate of safety "
                "on their team (e.g., 'this team'). Items are identical to the original PSS-7 "
                "referent framing; scores are aggregated to the team level using within-group "
                "agreement statistics (r_wg, ICC)."
            ),
            "construct_measured": "Team Psychological Safety",
            "theoretical_framework": "Edmondson (1999) team learning theory; interpersonal risk-taking",
            "source_citation": (
                "Edmondson, A. C. (1999). Psychological safety and learning behavior in work teams. "
                "Administrative Science Quarterly, 44(2), 350–383. "
                "https://doi.org/10.2307/2666999"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 7,
            "estimated_minutes": 5,
            "scoring_type": "mean",
            "response_format": "likert7",
            "validated_populations": '["manufacturing teams","healthcare teams","software teams","management teams"]',
            "languages": '["en","ar","nl","de","ko","zh","es"]',
            "reliability_alpha": 0.82,
            "subscales": [],
            "items": [
                {"text": "If you make a mistake on this team, it is often held against you.",                                                        "reverse_scored": True},
                {"text": "Members of this team are able to bring up problems and tough issues.",                                                     "reverse_scored": False},
                {"text": "People on this team sometimes reject others for being different.",                                                         "reverse_scored": True},
                {"text": "It is safe to take a risk on this team.",                                                                                 "reverse_scored": False},
                {"text": "It is difficult to ask other members of this team for help.",                                                              "reverse_scored": True},
                {"text": "No one on this team would deliberately act in a way that undermines my efforts.",                                          "reverse_scored": False},
                {"text": "Working with members of this team, my unique skills and talents are valued and utilized.",                                 "reverse_scored": False},
            ],
        },

        # ── 13. Perceived Team Effectiveness Scale ────────────────────────────
        {
            "name": "Perceived Team Effectiveness Scale",
            "short_name": "PTE-9",
            "category_key": "Team Effectiveness",
            "description": (
                "Based on Campion et al.'s (1993) team effectiveness framework, this 9-item scale "
                "captures three dimensions of team effectiveness: productivity (output quality and "
                "quantity), member satisfaction with the team experience, and managerial perception "
                "of the team's performance."
            ),
            "construct_measured": "Team Effectiveness",
            "theoretical_framework": "Campion, Medsker & Higgs (1993) team effectiveness model",
            "source_citation": (
                "Campion, M. A., Medsker, G. J., & Higgs, A. C. (1993). Relations between work "
                "group characteristics and effectiveness: Implications for designing effective work groups. "
                "Personnel Psychology, 46(4), 823–850. https://doi.org/10.1111/j.1744-6570.1993.tb01571.x"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 9,
            "estimated_minutes": 5,
            "scoring_type": "subscale",
            "response_format": "likert7",
            "validated_populations": '["manufacturing teams","service teams","knowledge worker teams","cross-functional teams"]',
            "languages": '["en","ar"]',
            "reliability_alpha": 0.85,
            "subscales": [
                {"name": "Productivity",             "description": "Team's output volume, quality, and overall efficiency",                    "item_count": 3},
                {"name": "Member Satisfaction",      "description": "Team members' satisfaction with the team experience",                     "item_count": 3},
                {"name": "Managerial Effectiveness", "description": "Perception of how management views the team's performance",               "item_count": 3},
            ],
            "items": [
                {"text": "This team gets a lot accomplished.",                                                                                      "subscale": "Productivity",             "reverse_scored": False},
                {"text": "This team produces high-quality work.",                                                                                   "subscale": "Productivity",             "reverse_scored": False},
                {"text": "This team is productive.",                                                                                               "subscale": "Productivity",             "reverse_scored": False},
                {"text": "I am satisfied with my experience working on this team.",                                                                "subscale": "Member Satisfaction",      "reverse_scored": False},
                {"text": "I would recommend this team to a friend as a good team to work with.",                                                   "subscale": "Member Satisfaction",      "reverse_scored": False},
                {"text": "Working on this team is a good experience.",                                                                             "subscale": "Member Satisfaction",      "reverse_scored": False},
                {"text": "Management considers this team to be effective.",                                                                        "subscale": "Managerial Effectiveness", "reverse_scored": False},
                {"text": "My manager is satisfied with the performance of this team.",                                                             "subscale": "Managerial Effectiveness", "reverse_scored": False},
                {"text": "Senior management rates the output of this team highly.",                                                                "subscale": "Managerial Effectiveness", "reverse_scored": False},
            ],
        },

        # ── 14. Team Trust Scale ──────────────────────────────────────────────
        {
            "name": "Team Trust Scale",
            "short_name": "TTS-10",
            "category_key": "Team Effectiveness",
            "description": (
                "Costa's (2003) Team Trust Scale distinguishes cognitive trust (reliability- and "
                "competence-based) from affective trust (emotional bond and care) within teams. "
                "Each subscale contains 5 items rated on a 7-point Likert scale."
            ),
            "construct_measured": "Intra-Team Trust (Cognitive and Affective)",
            "theoretical_framework": "McAllister (1995) cognitive/affective trust; Costa (2003) team trust framework",
            "source_citation": (
                "Costa, A. C. (2003). Work team trust and effectiveness. "
                "Personnel Review, 32(5), 605–622. https://doi.org/10.1108/00483480310488360"
            ),
            "license_type": "open",
            "is_proprietary": False,
            "total_items": 10,
            "estimated_minutes": 5,
            "scoring_type": "subscale",
            "response_format": "likert7",
            "validated_populations": '["work teams","professional teams","management teams","cross-functional teams"]',
            "languages": '["en","ar","nl","pt"]',
            "reliability_alpha": 0.88,
            "subscales": [
                {"name": "Cognitive Trust",  "description": "Reliability, competence, and consistency-based trust in the team",     "item_count": 5},
                {"name": "Affective Trust",  "description": "Care, openness, and emotional bond within the team",                   "item_count": 5},
            ],
            "items": [
                {"text": "This team meets its commitments.",                                                                              "subscale": "Cognitive Trust", "reverse_scored": False},
                {"text": "I feel confident that this team will try hard to fulfill its role.",                                            "subscale": "Cognitive Trust", "reverse_scored": False},
                {"text": "This team is not always honest and truthful.",                                                                 "subscale": "Cognitive Trust", "reverse_scored": True},
                {"text": "This team is reliable and consistent in the way it fulfills its role.",                                        "subscale": "Cognitive Trust", "reverse_scored": False},
                {"text": "I feel confident in this team's ability to accomplish its work goals.",                                        "subscale": "Cognitive Trust", "reverse_scored": False},
                {"text": "The relationship between members of this team is characterized by mutual care and concern.",                   "subscale": "Affective Trust",  "reverse_scored": False},
                {"text": "I feel comfortable discussing work-related problems openly with members of this team.",                        "subscale": "Affective Trust",  "reverse_scored": False},
                {"text": "I feel that the team members genuinely care about my well-being.",                                             "subscale": "Affective Trust",  "reverse_scored": False},
                {"text": "In this team, I can openly share my ideas, feelings, and hopes.",                                             "subscale": "Affective Trust",  "reverse_scored": False},
                {"text": "I feel emotionally close to the other members of this team.",                                                 "subscale": "Affective Trust",  "reverse_scored": False},
            ],
        },
    ]


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------


async def seed_library(db: AsyncSession) -> None:
    """Idempotently seed the library. Safe to call on every startup."""

    # ── 1. Seed categories ──────────────────────────────────────────────────
    cat_by_name: dict[str, InstrumentCategory] = {}
    for cat_data in CATEGORIES:
        stmt = select(InstrumentCategory).where(InstrumentCategory.name == cat_data["name"])
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            cat_by_name[cat_data["name"]] = existing
        else:
            cat = InstrumentCategory(
                name=cat_data["name"],
                description=cat_data["description"],
                icon_name=cat_data["icon_name"],
                order_index=cat_data["order_index"],
            )
            db.add(cat)
            await db.flush()
            cat_by_name[cat_data["name"]] = cat
            log.info("Library seed: created category %r", cat_data["name"])

    await db.commit()

    # ── 2. Seed instruments ─────────────────────────────────────────────────
    for inst_data in _instrument_seed_data():
        stmt = select(Instrument).where(Instrument.short_name == inst_data["short_name"])
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            log.debug("Library seed: instrument %r already exists, skipping", inst_data["short_name"])
            continue

        cat = cat_by_name.get(inst_data["category_key"])
        instrument = Instrument(
            category_id=cat.id if cat else None,
            name=inst_data["name"],
            short_name=inst_data["short_name"],
            description=inst_data["description"],
            construct_measured=inst_data["construct_measured"],
            theoretical_framework=inst_data["theoretical_framework"],
            source_citation=inst_data["source_citation"],
            license_type=inst_data["license_type"],
            is_proprietary=inst_data["is_proprietary"],
            total_items=inst_data["total_items"],
            estimated_minutes=inst_data["estimated_minutes"],
            scoring_type=inst_data["scoring_type"],
            response_format=inst_data["response_format"],
            validated_populations=inst_data["validated_populations"],
            languages=inst_data["languages"],
            reliability_alpha=inst_data["reliability_alpha"],
        )
        db.add(instrument)
        await db.flush()

        # Subscales
        subscale_by_name: dict[str, InstrumentSubscale] = {}
        for ss_data in inst_data.get("subscales", []):
            ss = InstrumentSubscale(
                instrument_id=instrument.id,
                name=ss_data["name"],
                description=ss_data["description"],
                item_count=ss_data["item_count"],
            )
            db.add(ss)
            await db.flush()
            subscale_by_name[ss_data["name"]] = ss

        # Items
        for idx, item_data in enumerate(inst_data.get("items", []), start=1):
            ss_name = item_data.get("subscale")
            ss_id = subscale_by_name[ss_name].id if ss_name and ss_name in subscale_by_name else None
            item = InstrumentItem(
                instrument_id=instrument.id,
                subscale_id=ss_id,
                item_text=item_data["text"],
                order_index=idx,
                is_reverse_scored=item_data.get("reverse_scored", False),
            )
            db.add(item)

        await db.commit()
        log.info("Library seed: created instrument %r", inst_data["short_name"])

    # ── 3. Seed batch-2 instruments ─────────────────────────────────────────
    for inst_data in _instrument_seed_data_batch2():
        stmt = select(Instrument).where(Instrument.short_name == inst_data["short_name"])
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            log.debug("Library seed: instrument %r already exists, skipping", inst_data["short_name"])
            continue

        cat = cat_by_name.get(inst_data["category_key"])
        instrument = Instrument(
            category_id=cat.id if cat else None,
            name=inst_data["name"],
            short_name=inst_data["short_name"],
            description=inst_data["description"],
            construct_measured=inst_data["construct_measured"],
            theoretical_framework=inst_data["theoretical_framework"],
            source_citation=inst_data["source_citation"],
            license_type=inst_data["license_type"],
            is_proprietary=inst_data["is_proprietary"],
            total_items=inst_data["total_items"],
            estimated_minutes=inst_data["estimated_minutes"],
            scoring_type=inst_data["scoring_type"],
            response_format=inst_data["response_format"],
            validated_populations=inst_data["validated_populations"],
            languages=inst_data["languages"],
            reliability_alpha=inst_data["reliability_alpha"],
        )
        db.add(instrument)
        await db.flush()

        subscale_by_name: dict[str, InstrumentSubscale] = {}
        for ss_data in inst_data.get("subscales", []):
            ss = InstrumentSubscale(
                instrument_id=instrument.id,
                name=ss_data["name"],
                description=ss_data["description"],
                item_count=ss_data["item_count"],
            )
            db.add(ss)
            await db.flush()
            subscale_by_name[ss_data["name"]] = ss

        for idx, item_data in enumerate(inst_data.get("items", []), start=1):
            ss_name = item_data.get("subscale")
            ss_id = subscale_by_name[ss_name].id if ss_name and ss_name in subscale_by_name else None
            item = InstrumentItem(
                instrument_id=instrument.id,
                subscale_id=ss_id,
                item_text=item_data["text"],
                order_index=idx,
                is_reverse_scored=item_data.get("reverse_scored", False),
            )
            db.add(item)

        await db.commit()
        log.info("Library seed: created instrument %r", inst_data["short_name"])

    log.info("Library seed: complete")
