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

    log.info("Library seed: complete")
