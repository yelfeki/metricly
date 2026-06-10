"""Idempotent seed for the Competency Framework Database.

Seeds three frameworks:
  1. Korn Ferry Leadership Architect (38 competencies)
  2. O*NET Core Skills (35 skills, 7 categories)
  3. Core Behavioral Competencies (12 universal competencies)

Idempotency key: framework name + competency name combination.
Called at startup from main.py lifespan.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.competency import (
    CompetencyDefinition,
    CompetencyFramework,
    CompetencyProficiencyLevel,
)

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Proficiency level labels (shared across all frameworks)
# ---------------------------------------------------------------------------

LEVEL_LABELS = {1: "Novice", 2: "Developing", 3: "Proficient", 4: "Advanced", 5: "Expert"}

# ---------------------------------------------------------------------------
# Framework 1: Korn Ferry Leadership Architect
# ---------------------------------------------------------------------------

_KF_COMPETENCIES: list[dict] = [
    # ── Factor: Thought ─────────────────────────────────────────────────────
    {
        "name": "Business Insight",
        "factor": "Thought",
        "cluster": "Business Insight",
        "definition": "Applies knowledge of business and the marketplace to advance the organization's goals. Understands relevant industry dynamics, competitive positioning, and market forces.",
        "is_leadership": True,
        "levels": [
            (["Knows basic business terms and can describe the company's products/services", "Struggles to connect daily work to broader business strategy"],
             ["Explains how their team contributes to revenue or cost savings"]),
            (["Understands how their department fits within the broader business", "Can identify key competitors and industry trends with prompting"],
             ["Prepares a competitive analysis for a team project"]),
            (["Monitors market trends and applies insights to planning decisions", "Links team objectives explicitly to business unit strategy"],
             ["Incorporates industry benchmarking data into quarterly planning"]),
            (["Anticipates industry shifts and proactively repositions team priorities", "Regularly engages with external business intelligence sources"],
             ["Redirected team focus six months ahead of a major market shift"]),
            (["Shapes organizational strategy based on deep market expertise", "Acts as a recognised thought leader in the industry"],
             ["Led cross-functional strategy refresh based on competitive landscape analysis"]),
        ],
    },
    {
        "name": "Financial Acumen",
        "factor": "Thought",
        "cluster": "Business Insight",
        "definition": "Understands the meaning and implications of key financial indicators. Uses financial analysis to generate and evaluate business opportunities.",
        "is_leadership": True,
        "levels": [
            (["Can read a basic P&L statement with assistance", "Aware that decisions have financial consequences"],
             ["Tracks team spending against a simple budget"]),
            (["Understands basic financial metrics: revenue, EBITDA, margin", "Reviews budget reports and identifies variances"],
             ["Flags a budget overrun before end-of-quarter close"]),
            (["Uses financial data to build business cases for investments", "Comfortable with ROI analysis and break-even calculations"],
             ["Built ROI model justifying a new hire to leadership"]),
            (["Drives cost-reduction initiatives with measurable P&L impact", "Reads complex financial statements with confidence"],
             ["Identified $500K in operational savings through variance analysis"]),
            (["Influences financial strategy at the enterprise level", "Models complex financial scenarios to support board decisions"],
             ["Restructured business unit finances to achieve 20% margin improvement"]),
        ],
    },
    {
        "name": "Deals with Ambiguity",
        "factor": "Thought",
        "cluster": "Complex Problem Solving",
        "definition": "Can effectively cope with change and uncertainty. Makes decisions and takes action without having the total picture, and comfortably handles risk and uncertainty.",
        "is_leadership": True,
        "levels": [
            (["Feels uncomfortable when direction is unclear", "Seeks extensive guidance before acting under uncertainty"],
             ["Asks manager to clarify every ambiguous situation"]),
            (["Begins to act with incomplete information when low risk is involved", "Tolerates short periods of uncertainty"],
             ["Takes first steps on a new initiative before all details are finalised"]),
            (["Manages ambiguity by breaking problems into smaller knowable parts", "Makes sound decisions with 70–80% of needed information"],
             ["Launched a pilot program without full data, adjusted based on early results"]),
            (["Thrives in highly ambiguous environments; models calm confidence for the team", "Develops contingency plans proactively"],
             ["Led the organisation through a merger with minimal clear direction"]),
            (["Creates frameworks that allow the organisation to operate effectively in chronic uncertainty", "Coaches others to embrace ambiguity as a competitive advantage"],
             ["Built scenario-planning infrastructure used across three business units"]),
        ],
    },
    {
        "name": "Decision Quality",
        "factor": "Thought",
        "cluster": "Complex Problem Solving",
        "definition": "Makes good and timely decisions that keep the organisation moving forward. Applies rigorous logic and sound judgment even in uncertain conditions.",
        "is_leadership": True,
        "levels": [
            (["Makes decisions reactively or defers frequently", "Relies heavily on others' opinions without independent analysis"],
             ["Waits for manager approval before making minor operational calls"]),
            (["Gathers relevant information before deciding", "Can apply basic decision frameworks with guidance"],
             ["Uses pros/cons list to evaluate vendor options"]),
            (["Makes timely, well-reasoned decisions using data and stakeholder input", "Considers downstream consequences and second-order effects"],
             ["Chose vendor after structured evaluation of cost, quality, and reliability"]),
            (["Makes complex, high-stakes decisions with confidence", "Knows when to decide vs. when to gather more data"],
             ["Reversed a failing product strategy based on early market signals"]),
            (["Sets the decision-making culture for the organisation", "Models transparent, principle-based decision-making"],
             ["Established decision rights framework adopted company-wide"]),
        ],
    },
    {
        "name": "Manages Complexity",
        "factor": "Thought",
        "cluster": "Complex Problem Solving",
        "definition": "Makes sense of complex, high-quantity, and sometimes contradictory information to effectively solve problems. Asks the right questions, challenges assumptions, and synthesises patterns.",
        "is_leadership": True,
        "levels": [
            (["Struggles to process multiple information streams simultaneously", "Addresses surface symptoms rather than root causes"],
             ["Fixes the same recurring error without investigating the underlying system"]),
            (["Can analyse moderately complex problems with defined parameters", "Begins to identify patterns and root causes"],
             ["Traces a customer complaint to a specific process failure"]),
            (["Synthesises large, contradictory datasets to identify key insights", "Distinguishes urgent from important issues effectively"],
             ["Mapped process failure to three interacting system variables"]),
            (["Decomposes enterprise-level complexity into actionable sub-problems", "Anticipates how changes ripple through the system"],
             ["Redesigned supply chain logic after modelling interdependencies"]),
            (["Creates systems-level solutions that simplify complexity for the organisation", "Widely consulted for ability to untangle the most intractable problems"],
             ["Architected a decision framework that reduced escalations by 60%"]),
        ],
    },
    {
        "name": "Cultivates Innovation",
        "factor": "Thought",
        "cluster": "Creating the New",
        "definition": "Creates new and better ways for the organisation to be successful. Challenges the status quo and fosters creative thinking in others.",
        "is_leadership": True,
        "levels": [
            (["Follows established processes; rarely suggests improvements", "Can identify inefficiencies when directly asked"],
             ["Points out a redundant step when asked for feedback on a process"]),
            (["Proposes incremental improvements to existing processes", "Experiments with small innovations within own scope"],
             ["Suggested a workflow tweak that saved the team two hours per week"]),
            (["Regularly generates novel ideas and brings them to implementation", "Creates safe space for others to experiment"],
             ["Introduced a new client feedback loop that improved NPS by 8 points"]),
            (["Leads innovation initiatives with cross-functional impact", "Invests time to develop an innovation pipeline"],
             ["Built an internal innovation lab with a structured idea-to-pilot process"]),
            (["Shapes the organisation's innovation culture and strategy", "Partners externally to bring disruptive ideas inside"],
             ["Led R&D transformation that produced three patented product innovations"]),
        ],
    },
    {
        "name": "Strategic Mindset",
        "factor": "Thought",
        "cluster": "Creating the New",
        "definition": "Sees ahead to future possibilities and translates them into breakthrough strategies. Frames the long-term vision and aligns the organisation behind it.",
        "is_leadership": True,
        "levels": [
            (["Focused on immediate tasks with limited awareness of long-term direction", "Thinks in weeks, not years"],
             ["Plans work for the current sprint without considering quarterly goals"]),
            (["Understands the team's role in department strategy", "Can articulate the 12-month plan"],
             ["Aligns team backlog to stated Q3 departmental priorities"]),
            (["Contributes to business unit strategy formulation", "Identifies strategic trade-offs and makes clear recommendations"],
             ["Presented a three-year market expansion strategy to senior leadership"]),
            (["Shapes multi-year organisational strategy and ensures alignment", "Translates external landscape trends into internal strategic pivots"],
             ["Authored division strategy adopted as the five-year roadmap"]),
            (["Sets enterprise vision and galvanises the organisation behind it", "Translates broad trends into differentiated competitive strategies"],
             ["Reoriented company strategy around an emerging market, doubling revenue in four years"]),
        ],
    },
    # ── Factor: Results ─────────────────────────────────────────────────────
    {
        "name": "Action Oriented",
        "factor": "Results",
        "cluster": "Delivering",
        "definition": "Takes on new opportunities and tough challenges with a sense of urgency, high energy, and enthusiasm. Biased toward taking action over deliberating.",
        "is_leadership": True,
        "levels": [
            (["Waits for direction before starting new work", "Avoids tasks outside the comfort zone"],
             ["Does not volunteer for stretch assignments"]),
            (["Acts when asked; shows basic initiative in familiar situations", "Beginning to take on new challenges"],
             ["Volunteers to help with a project outside their normal scope"]),
            (["Proactively seeks new challenges and starts work without being asked", "Demonstrates urgency and energy consistently"],
             ["Identified and fixed a production issue before it was escalated"]),
            (["Models bias-to-action culture; coaches team to move fast and iterate", "Takes calculated risks to accelerate results"],
             ["Launched an MVP in two weeks to test a high-priority hypothesis"]),
            (["Creates organisational urgency and speed as a competitive capability", "Acts decisively in the most complex and high-stakes situations"],
             ["Led a 90-day turnaround of an underperforming business unit"]),
        ],
    },
    {
        "name": "Drives Results",
        "factor": "Results",
        "cluster": "Delivering",
        "definition": "Consistently achieves results, even under tough circumstances. Holds self and others accountable for meeting commitments and exceeding expectations.",
        "is_leadership": True,
        "levels": [
            (["Meets basic expectations but rarely exceeds them", "Requires close supervision to complete work"],
             ["Delivers assigned tasks on time but needs reminders"]),
            (["Consistently meets commitments and self-manages basic workloads", "Beginning to exceed targets in familiar areas"],
             ["Completes all assigned deliverables before deadlines"]),
            (["Exceeds targets and takes ownership of outcomes", "Drives own and team performance proactively"],
             ["Exceeded quarterly sales quota by 18% through self-initiated outreach"]),
            (["Sustains high performance across volatile conditions", "Sets aggressive goals and achieves them consistently"],
             ["Led team to exceed annual targets by 25% during organisational restructure"]),
            (["Sets the performance standard for the organisation", "Drives results across multiple business cycles"],
             ["Built a high-performance culture that achieved top-quartile results industry-wide"]),
        ],
    },
    {
        "name": "Ensures Accountability",
        "factor": "Results",
        "cluster": "Delivering",
        "definition": "Holds self and others accountable to meet commitments. Establishes clear expectations and follows through to ensure results.",
        "is_leadership": True,
        "levels": [
            (["Inconsistent follow-through on personal commitments", "Avoids confronting others about missed commitments"],
             ["Lets missed deadlines slide without raising the issue"]),
            (["Reliably meets personal commitments", "Beginning to raise issues when others miss targets"],
             ["Flags a delayed dependency to the project manager"]),
            (["Holds self and direct reports accountable through clear metrics and follow-up", "Creates transparency around commitments and results"],
             ["Implemented weekly status dashboards; addressed every miss within 24 hours"]),
            (["Builds accountability culture across the team and organisation", "Models vulnerability by acknowledging own misses publicly"],
             ["Established team accountability norms adopted by three adjacent teams"]),
            (["Sets the enterprise accountability standard", "Links performance management systems to results rigorously"],
             ["Redesigned the performance review process to create organisation-wide accountability"]),
        ],
    },
    {
        "name": "Plans and Aligns",
        "factor": "Results",
        "cluster": "Delivering",
        "definition": "Plans and prioritises work to meet commitments aligned with organisational goals. Breaks down work and translates strategy into executable plans.",
        "is_leadership": True,
        "levels": [
            (["Plans reactively; does not consistently prioritise tasks", "Misses deadlines due to poor planning"],
             ["Consistently surprised by deadlines that were visible in the project plan"]),
            (["Creates basic project plans and tracks milestones", "Prioritises tasks based on stated urgency"],
             ["Built a simple Gantt chart for a 4-week team project"]),
            (["Develops detailed plans, anticipates obstacles, and builds contingencies", "Aligns team workload to strategic priorities explicitly"],
             ["Planned a product launch across five workstreams with zero delivery miss"]),
            (["Orchestrates multi-team planning processes across the business unit", "Anticipates resource constraints quarters in advance"],
             ["Led annual operating planning for a 150-person organisation"]),
            (["Designs the planning architecture for the enterprise", "Connects every initiative to enterprise strategy with measurable milestones"],
             ["Implemented OKR system adopted by 12 business units globally"]),
        ],
    },
    {
        "name": "Resourcefulness",
        "factor": "Results",
        "cluster": "Delivering",
        "definition": "Secures and deploys resources effectively and efficiently. Finds creative ways to accomplish objectives with limited resources.",
        "is_leadership": True,
        "levels": [
            (["Relies entirely on provided resources without seeking alternatives", "Escalates resource gaps rather than solving them"],
             ["Reports a tool shortage without investigating alternatives"]),
            (["Identifies alternative resources with guidance", "Repurposes existing tools creatively in familiar situations"],
             ["Uses existing spreadsheet software to replace a paid tool"]),
            (["Finds creative solutions to resource constraints independently", "Maximises value from limited budgets or headcount"],
             ["Delivered a project at 60% budget by identifying open-source alternatives"]),
            (["Builds resource networks and partnerships that extend team capacity", "Optimises resource allocation across the business unit"],
             ["Created a shared resource pool across three teams, reducing duplication by 30%"]),
            (["Architects the enterprise resource strategy", "Enables the organisation to achieve more with the same investment consistently"],
             ["Restructured global resource allocation model, saving $10M annually"]),
        ],
    },
    {
        "name": "Manages Ambiguity",
        "factor": "Results",
        "cluster": "Operating",
        "definition": "Operates effectively, even when things are not certain or the way forward is not clear. Keeps moving forward in the face of incomplete information.",
        "is_leadership": True,
        "levels": [
            (["Freezes or escalates when direction is unclear", "Requires certainty before acting"],
             ["Halts work when a single input is delayed"]),
            (["Takes small steps forward in ambiguous situations with encouragement", "Copes with short-term uncertainty"],
             ["Continues working on defined sub-tasks while waiting for overall direction"]),
            (["Maintains effective performance under sustained ambiguity", "Sets priorities independently when strategic direction is unclear"],
             ["Kept team productive through a three-month organisational restructure"]),
            (["Leads others through prolonged ambiguity with clarity and calm", "Creates interim frameworks to structure decision-making during uncertainty"],
             ["Guided 80-person team during CEO transition with no strategic plan in place"]),
            (["Thrives and creates competitive advantage from operating in VUCA environments", "Builds organisational resilience to chronic ambiguity"],
             ["Built adaptive strategy process enabling the company to pivot four times in two years"]),
        ],
    },
    {
        "name": "Nimble Learning",
        "factor": "Results",
        "cluster": "Operating",
        "definition": "Actively learns through experimentation when tackling new problems. Uses first-hand experience and quickly and continuously applies lessons learned.",
        "is_leadership": True,
        "levels": [
            (["Sticks to known approaches; reluctant to learn new methods", "Repeats past mistakes without reflection"],
             ["Uses the same failed approach repeatedly without adjustment"]),
            (["Open to learning new skills when required", "Applies lessons from direct feedback"],
             ["Adjusts approach after a negative project post-mortem"]),
            (["Actively seeks new knowledge; rapidly applies it to new situations", "Runs small experiments to test new approaches"],
             ["Learned a new analytics tool over a weekend to meet project needs"]),
            (["Builds a learning culture; models curiosity and rapid iteration", "Creates feedback loops to accelerate team learning"],
             ["Implemented sprint retrospectives that measurably improved team delivery speed"]),
            (["Champions organisational learning as a strategic capability", "Designs systems that embed learning into the workflow"],
             ["Built an internal learning platform used by 3,000+ employees"]),
        ],
    },
    {
        "name": "Situational Adaptability",
        "factor": "Results",
        "cluster": "Operating",
        "definition": "Adapts approach and demeanour in real time to match the shifting demands of different situations. Reads the context and adjusts accordingly.",
        "is_leadership": True,
        "levels": [
            (["Uses one style regardless of context", "Misreads social or situational cues"],
             ["Delivers a technical briefing the same way to executives and engineers"]),
            (["Begins to adjust communication style with prompting", "Recognises different situations require different approaches"],
             ["Simplifies language when presenting to non-technical stakeholders"]),
            (["Fluidly adjusts style, pace, and approach to different audiences and contexts", "Reads emotional climate and adapts in the moment"],
             ["Shifted from structured presentation to open dialogue when sensing audience disengagement"]),
            (["Models contextual agility; coaches others to read and adapt to situations", "Navigates high-stakes situations (conflict, crisis, celebration) with equal skill"],
             ["De-escalated a client confrontation by immediately shifting from data to empathy"]),
            (["Shapes organisational culture of situational awareness and adaptive leadership", "Recognised externally for situational leadership excellence"],
             ["Delivered turnaround strategy by matching each stakeholder group's unique decision style"]),
        ],
    },
    {
        "name": "Tech Savvy",
        "factor": "Results",
        "cluster": "Operating",
        "definition": "Anticipates and adopts innovations in business-building digital and technology applications. Comfortable learning and leveraging new technologies.",
        "is_leadership": True,
        "levels": [
            (["Avoids new technology; relies on manual processes", "Struggles with basic digital tools"],
             ["Uses printed documents when digital versions are available"]),
            (["Uses standard digital tools effectively", "Open to learning new software with training support"],
             ["Adopted new project management software after onboarding session"]),
            (["Proactively explores and adopts relevant technologies to improve efficiency", "Evaluates technology options to inform team decisions"],
             ["Introduced AI-powered scheduling tool that saved 5 hours/week per team member"]),
            (["Leads technology adoption initiatives; advocates for digital transformation", "Builds business case for technology investments"],
             ["Led cloud migration reducing infrastructure costs by 35%"]),
            (["Sets the organisation's technology vision and roadmap", "Partners with vendors and innovators to shape future capability"],
             ["Authored the enterprise digital transformation strategy adopted by the board"]),
        ],
    },
    # ── Factor: People ───────────────────────────────────────────────────────
    {
        "name": "Builds Effective Teams",
        "factor": "People",
        "cluster": "Collaborating",
        "definition": "Forms teams with appropriate and diverse mix of styles, perspectives, and experience. Creates psychologically safe environments where everyone can contribute.",
        "is_leadership": True,
        "levels": [
            (["Works within existing team structure without considering team dynamics", "Does not actively address team dysfunction"],
             ["Ignores a team conflict hoping it resolves itself"]),
            (["Acknowledges the importance of team diversity and inclusion", "Begins to give feedback to improve team dynamics"],
             ["Raises a team dynamic issue in a one-on-one with manager"]),
            (["Intentionally builds diverse, high-functioning teams", "Creates norms and rituals that drive trust and performance"],
             ["Rebuilt team composition to add missing capabilities and saw productivity rise 22%"]),
            (["Develops team capability as a competitive advantage", "Creates a pipeline of talent through deliberate team development"],
             ["Built a team culture recognised as the top-performing unit in the organisation for two years"]),
            (["Shapes the talent strategy for the organisation", "Creates conditions for high-performing teams to emerge consistently"],
             ["Designed a team effectiveness model deployed across the enterprise"]),
        ],
    },
    {
        "name": "Collaborates",
        "factor": "People",
        "cluster": "Collaborating",
        "definition": "Builds partnerships and works collaboratively with others to meet shared objectives. Puts shared goals above personal agenda.",
        "is_leadership": True,
        "levels": [
            (["Prefers to work independently; minimises cross-functional interaction", "Hoards information or resources"],
             ["Does not share information that would help adjacent teams"]),
            (["Participates in cross-functional meetings when required", "Shares relevant information proactively within team"],
             ["Shares project status updates with dependent teams"]),
            (["Actively seeks collaboration opportunities; builds strong cross-team partnerships", "Puts shared objectives above team interests"],
             ["Partnered with three teams to align release schedules, avoiding conflict"]),
            (["Orchestrates complex multi-stakeholder collaboration", "Resolves competing priorities between teams constructively"],
             ["Facilitated collaboration between sales, engineering, and ops to deliver a key account"]),
            (["Creates an enterprise culture of collaboration as a strategic asset", "Breaks down organisational silos systemically"],
             ["Led cross-functional transformation that eliminated 40% of inter-team escalations"]),
        ],
    },
    {
        "name": "Drives Engagement",
        "factor": "People",
        "cluster": "Collaborating",
        "definition": "Creates a climate where people are motivated to do their best work. Makes each person feel valued and that their work matters.",
        "is_leadership": True,
        "levels": [
            (["Does not actively consider team morale or motivation", "Focuses on tasks without considering people's experience"],
             ["Assigns work without explaining its importance or impact"]),
            (["Shows basic care for team members' experience", "Acknowledges good work when reminded"],
             ["Gives verbal praise when prompted after a team success"]),
            (["Consistently recognises contributions and connects work to meaning", "Actively monitors and addresses engagement signals"],
             ["Implemented weekly recognition rituals; team eNPS rose from 42 to 68"]),
            (["Builds an engagement culture that retains top talent", "Uses engagement data to drive management decisions"],
             ["Reduced voluntary turnover from 22% to 11% through structured engagement programs"]),
            (["Shapes employee experience strategy for the enterprise", "Creates conditions for engagement to be a sustainable competitive advantage"],
             ["Authored the company's Employee Value Proposition adopted globally"]),
        ],
    },
    {
        "name": "Organizational Savvy",
        "factor": "People",
        "cluster": "Collaborating",
        "definition": "Manoeuvres comfortably through complex policy, process, and people-related organisational dynamics. Reads the informal power structure and leverages it effectively.",
        "is_leadership": True,
        "levels": [
            (["Unaware of or ignores informal organisational dynamics", "Gets caught off-guard by politics or resistance"],
             ["Launches initiative without mapping stakeholders, triggering unexpected opposition"]),
            (["Beginning to map key stakeholders and informal influencers", "Learns to read the room in meetings"],
             ["Identifies key decision-makers before presenting a proposal"]),
            (["Navigates organisational politics with skill", "Builds coalitions proactively to drive initiatives forward"],
             ["Built cross-divisional coalition to approve a budget request that had twice been rejected"]),
            (["Masters organisational dynamics; coaches others to navigate them", "Shapes informal networks intentionally"],
             ["Orchestrated a consensus-building process that aligned 12 senior stakeholders on a contentious policy"]),
            (["Redefines how the organisation operates through influence rather than authority", "Shapes culture and power dynamics at the enterprise level"],
             ["Restructured informal leadership networks to accelerate cross-boundary collaboration"]),
        ],
    },
    {
        "name": "Communicates Effectively",
        "factor": "People",
        "cluster": "Inspiring",
        "definition": "Develops and delivers multi-mode communications that convey a clear understanding of the unique needs of different audiences. Listens attentively and responds thoughtfully.",
        "is_leadership": True,
        "levels": [
            (["Communication is unclear or poorly calibrated to the audience", "Does not actively listen; misses key messages"],
             ["Sends a jargon-heavy email to non-technical stakeholders"]),
            (["Communicates clearly in familiar situations", "Listens when engaged and paraphrases key points"],
             ["Adjusts email tone between a client update and an internal team note"]),
            (["Tailors message, medium, and style to audience consistently", "Uses storytelling to make data and strategy memorable"],
             ["Converted a complex analytics report into a clear executive narrative"]),
            (["Influences at scale through compelling communication", "Inspires action through clear strategic narratives"],
             ["Town-hall address credited with rallying team through a major change"]),
            (["Shapes organisational voice; models communication excellence", "Communicates enterprise strategy in ways that land across all levels"],
             ["Authored company narrative used in all external and internal communications"]),
        ],
    },
    {
        "name": "Develops Talent",
        "factor": "People",
        "cluster": "Inspiring",
        "definition": "Develops people to meet both their career goals and the organisation's goals. Provides regular coaching, stretch opportunities, and honest development feedback.",
        "is_leadership": True,
        "levels": [
            (["Focused on task delivery; does not invest in direct report development", "Delegates without coaching"],
             ["Assigns tasks without explaining how they develop the person"]),
            (["Provides occasional feedback and development input when asked", "Supports direct reports in attending training"],
             ["Encourages a team member to complete an online course"]),
            (["Actively coaches direct reports; creates individual development plans", "Provides honest strengths-and-gaps feedback regularly"],
             ["Ran monthly development conversations; three team members promoted within 12 months"]),
            (["Builds a team-level talent pipeline through succession planning", "Coaches managers on how to develop their own teams"],
             ["Developed five high-potentials into director-level roles over three years"]),
            (["Shapes the enterprise talent development strategy", "Creates learning culture that compounds individual and organisational growth"],
             ["Designed leadership development curriculum deployed to 500 managers"]),
        ],
    },
    {
        "name": "Directs Work",
        "factor": "People",
        "cluster": "Inspiring",
        "definition": "Provides direction, delegating and removing obstacles to get work done. Balances guidance and autonomy to get the best from each team member.",
        "is_leadership": True,
        "levels": [
            (["Provides vague direction or micromanages", "Does not clarify priorities or remove obstacles"],
             ["Assigns a project with no defined success criteria"]),
            (["Sets basic direction and delegates familiar tasks", "Begins to adapt level of guidance to individual need"],
             ["Assigns tasks with clear deadlines and outcome definitions"]),
            (["Provides clear direction calibrated to each individual's capability", "Removes barriers proactively to enable team performance"],
             ["Adjusted oversight level per person; team velocity increased 30%"]),
            (["Orchestrates complex, multi-team work through clear delegation frameworks", "Develops manager capability to direct their own teams effectively"],
             ["Designed delegation framework adopted across the department"]),
            (["Creates organisational systems that make direction-setting clear at every level", "Removes systemic obstacles that slow organisational execution"],
             ["Implemented a clarity-of-ownership model that cut decision delays by 50%"]),
        ],
    },
    {
        "name": "Instills Trust",
        "factor": "People",
        "cluster": "Inspiring",
        "definition": "Gains the confidence and trust of others through honesty, integrity, and authenticity. Does what they say they will do and treats others with respect.",
        "is_leadership": True,
        "levels": [
            (["Inconsistent follow-through erodes trust", "Sometimes says one thing and does another"],
             ["Commits to help with a task but forgets"]),
            (["Generally keeps commitments in low-stakes situations", "Straightforward and honest in communication"],
             ["Follows through on promises to team members consistently"]),
            (["Consistently operates with integrity; highly trusted by team and peers", "Volunteers uncomfortable information rather than hiding it"],
             ["Disclosed a project risk immediately rather than waiting for it to surface"]),
            (["Trusted source of truth across the organisation", "Models vulnerability and honesty even under executive scrutiny"],
             ["Delivered unfavourable results transparently to the board, earning increased confidence"]),
            (["Sets the integrity and ethical standard for the enterprise", "Trust in their leadership is a source of organisational stability"],
             ["Named most trusted leader in company-wide survey for three consecutive years"]),
        ],
    },
    {
        "name": "Persuades",
        "factor": "People",
        "cluster": "Inspiring",
        "definition": "Uses compelling arguments and data to gain commitment and support. Understands what motivates others and frames messages accordingly.",
        "is_leadership": True,
        "levels": [
            (["Relies on positional authority rather than persuasion", "Unable to gain buy-in outside direct team"],
             ["States a decision without explaining the reasoning"]),
            (["Can make a basic case for a position using facts", "Identifies simple motivations in others"],
             ["Uses data to support a recommendation in a team meeting"]),
            (["Crafts persuasive narratives tailored to stakeholder motivations", "Wins buy-in from skeptical audiences"],
             ["Gained board approval for a contentious proposal by reframing it around risk reduction"]),
            (["Influences complex, multi-stakeholder decisions", "Changes minds at the senior leadership level"],
             ["Persuaded three C-suite leaders to consolidate overlapping initiatives, saving resources"]),
            (["Shapes industry discourse and organisational belief systems through persuasive communication", "Recognised externally as a compelling communicator"],
             ["TED Talk that reframed the industry's understanding of leadership development"]),
        ],
    },
    {
        "name": "Being Resilient",
        "factor": "People",
        "cluster": "People Focus",
        "definition": "Rebounds from setbacks and adversity when facing difficult situations. Maintains composure and productivity under pressure.",
        "is_leadership": True,
        "levels": [
            (["Struggles to cope with setbacks; productivity drops significantly under stress", "Needs extended recovery time after failures"],
             ["Takes weeks to regain momentum after a project failure"]),
            (["Recovers from setbacks with some support", "Maintains basic function under moderate pressure"],
             ["Returns to full productivity within a week after a negative performance review"]),
            (["Bounces back quickly from adversity; maintains focus on forward progress", "Reframes setbacks as learning opportunities for the team"],
             ["Rebuilt team morale within two weeks of a major project cancellation"]),
            (["Sustains high performance through sustained adversity", "Models resilience that stabilises team during crises"],
             ["Led team through 18-month turnaround with zero key attrition"]),
            (["Creates organisational resilience as a capability", "Coaches leaders on building anti-fragility into their teams"],
             ["Designed organisational resilience framework deployed enterprise-wide"]),
        ],
    },
    {
        "name": "Customer Focus",
        "factor": "People",
        "cluster": "People Focus",
        "definition": "Builds strong customer relationships and delivers customer-centric solutions. Anticipates customer needs and acts on customer insights.",
        "is_leadership": True,
        "levels": [
            (["Focuses on internal tasks without considering customer impact", "Reactive to complaints rather than proactive"],
             ["Does not seek customer feedback on work products"]),
            (["Responds promptly to customer requests", "Gathers basic customer feedback when asked"],
             ["Resolves customer complaints within 24 hours"]),
            (["Proactively identifies and addresses unmet customer needs", "Uses customer insight to influence team priorities"],
             ["Introduced a quarterly customer advisory board that shaped product roadmap"]),
            (["Builds a customer-centric culture across the team", "Partners with customers as strategic co-creators"],
             ["Embedded customer journey mapping into the product development lifecycle"]),
            (["Shapes the enterprise customer experience strategy", "Creates lasting competitive advantage through customer intimacy"],
             ["Built customer success function from scratch; NPS rose from 34 to 72 in 18 months"]),
        ],
    },
    {
        "name": "Interpersonal Savvy",
        "factor": "People",
        "cluster": "People Focus",
        "definition": "Relates openly and comfortably with diverse groups of people. Builds rapport and navigates interpersonal differences with skill and sensitivity.",
        "is_leadership": True,
        "levels": [
            (["Relates comfortably only to similar others", "Struggles with interpersonal conflict or difficult personalities"],
             ["Avoids a challenging team member rather than engaging"]),
            (["Builds positive relationships within the team", "Navigates basic interpersonal differences respectfully"],
             ["Mediates a minor team disagreement with a calm, neutral approach"]),
            (["Connects genuinely with diverse stakeholders", "De-escalates interpersonal conflict with skill"],
             ["Built trust with a skeptical client through consistent follow-through and empathy"]),
            (["Creates an inclusive environment where diverse voices feel valued and heard", "Coaches others on interpersonal effectiveness"],
             ["Resolved longstanding inter-team tension through facilitated dialogue"]),
            (["Shapes the organisational culture around inclusion and interpersonal respect", "Widely recognised as a connector and relationship builder"],
             ["Built cross-cultural collaboration capability that enabled a successful international expansion"]),
        ],
    },
    {
        "name": "Values Differences",
        "factor": "People",
        "cluster": "People Focus",
        "definition": "Recognises the value that different perspectives and cultures bring to an organisation. Actively promotes an inclusive environment.",
        "is_leadership": True,
        "levels": [
            (["Does not actively consider diversity or inclusion in decisions", "Comfortable only with familiar perspectives"],
             ["Builds teams that reflect own background and working style"]),
            (["Acknowledges the value of diversity when prompted", "Treats all people respectfully"],
             ["Actively listens to a team member from a different cultural background"]),
            (["Actively seeks out and incorporates diverse perspectives", "Creates psychological safety for different viewpoints"],
             ["Restructured meetings to explicitly invite dissenting perspectives"]),
            (["Embeds inclusion into team processes and hiring decisions", "Advocates for underrepresented voices in high-stakes conversations"],
             ["Increased team diversity by 40% through revised sourcing and interview practices"]),
            (["Shapes enterprise DEI strategy as a business imperative", "Creates systems that make inclusion structural rather than optional"],
             ["Led DEI transformation that resulted in the company being recognised as a top inclusive employer"]),
        ],
    },
    # ── Factor: Self ─────────────────────────────────────────────────────────
    {
        "name": "Demonstrates Self-Awareness",
        "factor": "Self",
        "cluster": "Career and Learning",
        "definition": "Uses a combination of feedback and self-reflection to gain a productive view of one's personal strengths and limitations. Open to feedback and actively seeks it.",
        "is_leadership": True,
        "levels": [
            (["Limited self-insight; unaware of blind spots or impact on others", "Defensive when receiving feedback"],
             ["Dismisses negative feedback as inaccurate"]),
            (["Accepts feedback when delivered constructively", "Beginning to identify own strengths and development areas"],
             ["Uses annual review to identify one key development area"]),
            (["Actively solicits feedback; integrates it into visible behaviour change", "Demonstrates accurate self-assessment of strengths and limitations"],
             ["Sought 360 feedback and made three observable changes within 60 days"]),
            (["Models self-awareness and vulnerability as a leadership strength", "Coaches others on developing self-awareness"],
             ["Openly shares personal leadership blind spots in team settings to normalise feedback"]),
            (["Creates self-aware leadership culture across the organisation", "Integrates self-reflection into organisational practices"],
             ["Embedded 360 feedback and coaching into annual leadership development cycle"]),
        ],
    },
    {
        "name": "Self-Development",
        "factor": "Self",
        "cluster": "Career and Learning",
        "definition": "Actively seeks new ways to grow and be challenged using both formal and informal development channels. Takes responsibility for own learning and growth.",
        "is_leadership": True,
        "levels": [
            (["Relies on employer-assigned training; does not pursue self-directed learning", "Does not have a personal development plan"],
             ["Attends mandatory training only"]),
            (["Engages in development activities when encouraged", "Has a basic plan for 1-2 development areas"],
             ["Completes a recommended online course"]),
            (["Owns personal development; actively pursues stretch experiences and learning", "Maintains and acts on a robust individual development plan"],
             ["Sought out a cross-functional project to build a skill identified in 360 feedback"]),
            (["Develops as an enterprise asset through continuous learning", "Mentors others on self-development practices"],
             ["Completed an executive leadership program and immediately applied frameworks to team"]),
            (["Champions continuous learning as an organisational value", "Models lifelong learning at the senior leader level"],
             ["Published thought leadership on leadership development based on personal learning journey"]),
        ],
    },
    {
        "name": "Courage",
        "factor": "Self",
        "cluster": "Managing Self",
        "definition": "Steps up to address difficult issues, saying what needs to be said. Willingness to challenge the status quo, take unpopular positions, and act ethically under pressure.",
        "is_leadership": True,
        "levels": [
            (["Avoids difficult conversations; defers to authority even when concerns exist", "Does not raise ethical issues for fear of conflict"],
             ["Stays silent when observing an unfair team practice"]),
            (["Raises concerns with close colleagues or manager", "Speaks up in low-stakes situations"],
             ["Flags a concern about a flawed plan in a one-on-one"]),
            (["Addresses difficult issues directly with appropriate stakeholders", "Willing to challenge senior leaders respectfully when necessary"],
             ["Publicly disagreed with a flawed executive decision in a leadership forum"]),
            (["Takes principled stands on high-stakes issues despite personal risk", "Creates psychological safety for others to demonstrate courage"],
             ["Reported an ethics violation at personal career risk; was vindicated"]),
            (["Shapes the ethics and integrity culture of the organisation", "Known as a principled leader whose courage has created systemic change"],
             ["Drove a company-wide ethics overhaul after identifying systemic compliance failures"]),
        ],
    },
    {
        "name": "Manages Conflict",
        "factor": "Self",
        "cluster": "Managing Self",
        "definition": "Handles conflict situations effectively, with a minimum of noise. Settles disputes equitably and de-escalates tensions to productive outcomes.",
        "is_leadership": True,
        "levels": [
            (["Avoids conflict; allows tensions to fester", "Escalates all conflicts rather than resolving them"],
             ["Refers every disagreement to manager"]),
            (["Addresses low-level conflict with basic mediation", "Can de-escalate a tense team conversation with support"],
             ["Facilitates a short discussion to resolve a team scheduling conflict"]),
            (["Resolves complex conflicts between peers or across teams constructively", "Finds win-win solutions that preserve relationships"],
             ["Mediated a cross-team resource dispute that had been unresolved for two months"]),
            (["Proactively identifies and addresses conflict before it escalates", "Coaches others on conflict resolution skills"],
             ["Established a team conflict resolution process that reduced escalations by 70%"]),
            (["Creates conflict-competent culture across the organisation", "Recognised as an expert mediator in high-stakes organisational disputes"],
             ["Resolved board-level governance conflict that threatened company stability"]),
        ],
    },
]

# ---------------------------------------------------------------------------
# Framework 2: O*NET Core Skills
# ---------------------------------------------------------------------------

_ONET_SKILLS: list[dict] = [
    # Content Skills
    {"name": "Reading Comprehension", "category": "Content Skills",
     "definition": "Understanding written sentences and paragraphs in work-related documents.",
     "levels": [
         (["Reads simple instructions and basic workplace forms", "Needs support with multi-paragraph texts"],
          ["Follows a step-by-step procedure card"]),
         (["Reads and understands standard workplace documents", "Can extract key information from moderately complex texts"],
          ["Reviews a standard operating procedure and summarises key steps"]),
         (["Comprehends complex documents including technical manuals, reports, and regulations", "Critically evaluates written arguments"],
          ["Interprets a 50-page regulatory document to identify compliance requirements"]),
         (["Synthesises information across multiple complex sources", "Identifies subtle implications and unstated assumptions in text"],
          ["Cross-references three conflicting policy documents to determine a correct course of action"]),
         (["Masters highly technical, specialised written material in multiple domains", "Evaluates validity and quality of written research"],
          ["Reviews scientific literature and synthesises findings for an executive audience"]),
     ]},
    {"name": "Active Listening", "category": "Content Skills",
     "definition": "Giving full attention to what other people are saying; understanding the points being made and asking questions as appropriate.",
     "levels": [
         (["Listens when others speak but may miss key details", "Rarely paraphrases or confirms understanding"],
          ["Can repeat back a simple instruction"]),
         (["Demonstrates attentive listening in routine conversations", "Asks clarifying questions when confused"],
          ["Paraphrases a customer request to confirm understanding"]),
         (["Listens actively in complex, high-stakes conversations", "Picks up on emotional undertones and unstated concerns"],
          ["Identifies underlying concern beneath a client complaint through careful listening"]),
         (["Models active listening at a high level; coaches others on listening skills", "Extracts critical information from ambiguous or contradictory messages"],
          ["Facilitates a complex stakeholder meeting, capturing every nuance"]),
         (["Expert-level listening enables breakthroughs in negotiation, mediation, and complex problem-solving", "Sets the listening standard for the organisation"],
          ["De-escalates a major client dispute entirely through expert listening and reflection"]),
     ]},
    {"name": "Writing", "category": "Content Skills",
     "definition": "Communicating effectively in writing as appropriate for the needs of the audience.",
     "levels": [
         (["Writes simple, clear sentences for basic workplace communication", "Makes occasional grammatical errors"],
          ["Sends a clear, grammatically correct meeting confirmation email"]),
         (["Writes clear professional documents (emails, reports, summaries)", "Adapts tone for different audiences with prompting"],
          ["Drafts a concise project status update for the team"]),
         (["Produces polished, audience-appropriate documents independently", "Writes persuasive proposals and executive briefs"],
          ["Authors a business case that successfully secured $200K in budget"]),
         (["Writes at a publication-quality level for technical or executive audiences", "Ghost-writes for senior leaders"],
          ["Authors white paper cited by industry press"]),
         (["Recognised writer in the domain; shapes discourse through written communication", "Mentors others in advanced writing"],
          ["Published author whose writing has influenced field-wide practice"]),
     ]},
    {"name": "Speaking", "category": "Content Skills",
     "definition": "Talking to others to convey information effectively.",
     "levels": [
         (["Communicates basic information clearly in one-on-one or small group settings", "Speaks clearly though may lack confidence"],
          ["Gives a clear verbal update in a team standup"]),
         (["Speaks clearly and confidently in familiar settings", "Can present prepared material to small groups"],
          ["Presents a project update to a 10-person team"]),
         (["Delivers compelling presentations to diverse audiences", "Adjusts communication style in real time based on audience response"],
          ["Presents a complex strategy to a mixed technical/non-technical audience"]),
         (["Commands large audiences; speaks under high-stakes conditions", "Inspires action through spoken communication"],
          ["Delivers keynote at an industry conference attended by 500 people"]),
         (["World-class speaker whose communication creates organisational or industry-level change", "Coaches others to become highly effective speakers"],
          ["TED speaker; communication credited with shaping public discourse on key issue"]),
     ]},
    {"name": "Mathematics", "category": "Content Skills",
     "definition": "Using mathematics to solve problems.",
     "levels": [
         (["Performs basic arithmetic accurately", "Uses a calculator for simple operations"],
          ["Calculates a 15% tip or basic percentage"]),
         (["Applies basic statistical and algebraic concepts", "Calculates averages, percentages, and simple ratios"],
          ["Calculates a sales commission using a percentage formula"]),
         (["Uses intermediate-level mathematics in work analysis", "Applies statistical concepts to interpret data"],
          ["Builds a multi-variable budget model using formulas and logic"]),
         (["Applies advanced mathematical concepts to complex problems", "Uses statistical modelling and analysis"],
          ["Conducts regression analysis to forecast sales trends"]),
         (["Expert-level mathematical reasoning; applies advanced statistical, financial, or mathematical modelling", "Recognised for quantitative problem-solving ability"],
          ["Designs a complex pricing model using multivariate optimisation"]),
     ]},
    {"name": "Science", "category": "Content Skills",
     "definition": "Using scientific rules and methods to solve problems.",
     "levels": [
         (["Familiar with basic scientific concepts", "Applies structured observation"],
          ["Follows a scientific protocol to collect data"]),
         (["Applies scientific method in structured contexts", "Interprets basic experimental results"],
          ["Designs a simple A/B test and interprets results"]),
         (["Applies scientific reasoning to complex workplace problems", "Designs and evaluates experiments"],
          ["Designs a controlled study to evaluate a new product formulation"]),
         (["Integrates multiple scientific disciplines to solve multi-faceted problems", "Evaluates scientific literature critically"],
          ["Reviews scientific evidence to inform a regulatory submission"]),
         (["Generates new scientific knowledge or methods", "Recognised expert who advances the field"],
          ["Leads original research that produces a peer-reviewed publication"]),
     ]},
    # Process Skills
    {"name": "Critical Thinking", "category": "Process Skills",
     "definition": "Using logic and reasoning to identify the strengths and weaknesses of alternative solutions, conclusions, or approaches to problems.",
     "levels": [
         (["Identifies obvious errors or inconsistencies with prompting", "Accepts information at face value by default"],
          ["Spots a factual error in a report when asked to review it"]),
         (["Evaluates arguments and identifies logical flaws with guidance", "Questions assumptions when encouraged"],
          ["Challenges a proposed solution by asking 'what if' questions"]),
         (["Applies structured critical analysis to complex problems independently", "Evaluates evidence quality and logical validity"],
          ["Identifies a flawed assumption in a business case that would have led to a $500K error"]),
         (["Provides expert-level critical analysis across domains", "Coaches others in systematic thinking"],
          ["Develops a decision framework used by 200+ employees to evaluate options"]),
         (["Shapes organisational thinking quality through intellectual leadership", "Recognised as an expert critical thinker"],
          ["Peer-reviewed expert whose critical analysis has shaped field-wide standards"]),
     ]},
    {"name": "Active Learning", "category": "Process Skills",
     "definition": "Understanding the implications of new information for both current and future problem-solving and decision-making.",
     "levels": [
         (["Learns new information when directly instructed", "Applies new knowledge in very familiar contexts only"],
          ["Completes required training and applies it in prescribed situations"]),
         (["Seeks out new information relevant to current work", "Connects new learning to existing knowledge"],
          ["Reads a new industry report and identifies implications for current project"]),
         (["Actively synthesises new learning into improved practice", "Anticipates future learning needs"],
          ["Applies a new framework learned externally to redesign a team process"]),
         (["Creates learning systems for self and others", "Rapidly acquires expertise in new domains as required"],
          ["Became proficient in a new technology domain in six weeks to lead a strategic initiative"]),
         (["Expert learner who acquires and applies knowledge at an extraordinary rate", "Models and teaches active learning as a strategic skill"],
          ["Built personal learning system that enabled mastery of three new domains in one year"]),
     ]},
    {"name": "Learning Strategies", "category": "Process Skills",
     "definition": "Selecting and using training/instructional methods and procedures appropriate for the situation when learning or teaching new things.",
     "levels": [
         (["Uses a single learning method regardless of content type", "Relies on passive learning (reading, listening)"],
          ["Reads a manual to learn a new tool"]),
         (["Selects from a few learning approaches based on content", "Combines reading and practice for skill acquisition"],
          ["Uses tutorials and practice exercises to learn new software"]),
         (["Selects optimal learning strategies for each type of content and skill", "Designs effective personal learning plans"],
          ["Builds a 90-day learning plan combining mentorship, coursework, and applied practice"]),
         (["Designs learning experiences for others using evidence-based instructional design", "Coaches others on how to learn more effectively"],
          ["Designs a blended learning program for 150 employees"]),
         (["Expert learning architect whose instructional designs achieve measurable outcomes at scale", "Advances the field of learning and development"],
          ["Authors a learning methodology adopted by a professional association"]),
     ]},
    {"name": "Monitoring", "category": "Process Skills",
     "definition": "Monitoring/assessing performance of yourself, other individuals, or organisations to make improvements or take corrective action.",
     "levels": [
         (["Tracks own task completion at a basic level", "Reports status when asked"],
          ["Updates a task list at end of day"]),
         (["Monitors own and team performance against defined KPIs", "Identifies issues and escalates appropriately"],
          ["Reviews weekly sales metrics and flags underperformance to manager"]),
         (["Implements robust performance monitoring systems", "Diagnoses root causes of performance gaps"],
          ["Built a real-time dashboard that identified a quality issue before it reached customers"]),
         (["Designs performance monitoring systems across the organisation", "Coaches leaders on using data to drive decisions"],
          ["Implemented OKR tracking system adopted company-wide"]),
         (["Expert in performance monitoring methodology; shapes organisational measurement culture", "Advances field knowledge in performance management"],
          ["Architects the enterprise performance management framework"]),
     ]},
    # Social Skills
    {"name": "Social Perceptiveness", "category": "Social Skills",
     "definition": "Being aware of others' reactions and understanding why they react as they do.",
     "levels": [
         (["Notices obvious emotional cues", "Aware that others have different reactions than self"],
          ["Recognises when a colleague seems upset"]),
         (["Reads basic social and emotional cues accurately", "Understands common social dynamics in familiar groups"],
          ["Picks up on meeting room tension and adjusts own behaviour"]),
         (["Accurately reads subtle social and emotional signals across diverse groups", "Anticipates how individuals and groups will react to information"],
          ["Detects a key stakeholder's unspoken concern before it derails a project"]),
         (["Uses high social perceptiveness to navigate complex political and interpersonal dynamics", "Coaches others in social awareness"],
          ["Reads board room dynamics to time a critical proposal for maximum impact"]),
         (["Expert-level social intelligence enables influence at scale", "Widely sought for ability to navigate complex human dynamics"],
          ["Mediates a highly charged multi-party negotiation using expert reading of each party's motivations"]),
     ]},
    {"name": "Coordination", "category": "Social Skills",
     "definition": "Adjusting actions in relation to others' actions.",
     "levels": [
         (["Coordinates basic tasks with immediate team members", "Communicates changes that affect others"],
          ["Notifies a colleague before changing a shared document"]),
         (["Coordinates work effectively across a team", "Adjusts own schedule and outputs to match team needs"],
          ["Reschedules own work to unblock a colleague's critical path"]),
         (["Orchestrates cross-functional coordination across multiple workstreams", "Anticipates coordination needs before they become issues"],
          ["Coordinates five teams to synchronise a simultaneous product launch"]),
         (["Designs coordination systems for complex organisations", "Manages coordination across time zones and cultures"],
          ["Implements global project governance model for 20-country rollout"]),
         (["Expert coordinator who enables enterprise-level alignment and execution", "Recognised for ability to orchestrate at extraordinary scale"],
          ["Coordinates a multi-year, multi-continent strategic transformation"]),
     ]},
    {"name": "Persuasion", "category": "Social Skills",
     "definition": "Persuading others to change their minds or behaviour.",
     "levels": [
         (["Presents own view clearly", "Can persuade others in one-on-one low-stakes conversations"],
          ["Convinces a colleague to try a different work method"]),
         (["Uses evidence and logic to make persuasive arguments", "Understands basic audience motivations"],
          ["Makes a data-backed case for a budget increase"]),
         (["Crafts compelling arguments that persuade skeptical audiences", "Tailors persuasion strategy to individual motivations"],
          ["Wins approval for an unpopular initiative through targeted stakeholder engagement"]),
         (["Influences large groups and senior leaders through advanced persuasion", "Changes organisational beliefs and behaviours"],
          ["Delivers a compelling organisational change narrative adopted by the leadership team"]),
         (["Expert persuader whose influence creates industry or organisational-level change", "Shapes beliefs at scale"],
          ["Keynote speaker credited with shifting field-wide attitude toward a major issue"]),
     ]},
    {"name": "Negotiation", "category": "Social Skills",
     "definition": "Bringing others together and trying to reconcile differences.",
     "levels": [
         (["Participates in basic negotiations with guidance", "Understands the concept of mutual benefit"],
          ["Negotiates a simple schedule change with a colleague"]),
         (["Conducts routine negotiations resulting in acceptable outcomes", "Can articulate own interests and listen to others"],
          ["Negotiates a small vendor contract renewal"]),
         (["Achieves win-win outcomes in complex, multi-party negotiations", "Identifies creative solutions that expand the value available to all parties"],
          ["Negotiated a multi-year contract saving $1.5M while maintaining supplier goodwill"]),
         (["Expert negotiator in high-stakes, multi-party situations", "Coaches others in negotiation technique"],
          ["Led a cross-cultural acquisition negotiation resulting in a signed agreement worth $50M"]),
         (["World-class negotiator who operates in the most complex, high-stakes contexts", "Shapes negotiation capability across the organisation"],
          ["Negotiated a transformative strategic partnership on behalf of the enterprise"]),
     ]},
    {"name": "Instructing", "category": "Social Skills",
     "definition": "Teaching others how to do something.",
     "levels": [
         (["Can explain simple tasks step by step", "Demonstrates how to do something when asked"],
          ["Shows a new team member how to use a specific tool"]),
         (["Teaches familiar skills clearly to others", "Adapts instructions to the learner's level with prompting"],
          ["Onboards a new employee to a standard process"]),
         (["Designs and delivers effective instruction for complex skills", "Adapts teaching approach to different learning styles"],
          ["Develops a training curriculum for a new software system adopted by 50 users"]),
         (["Creates scalable instructional programs for large audiences", "Coaches other instructors and trainers"],
          ["Designs a train-the-trainer program for 200 managers"]),
         (["Expert instructional designer and educator at the highest level", "Advances the field of teaching and learning"],
          ["Authors award-winning instructional design methodology"]),
     ]},
    {"name": "Service Orientation", "category": "Social Skills",
     "definition": "Actively looking for ways to help people.",
     "levels": [
         (["Responds to requests promptly and politely", "Provides minimum adequate service"],
          ["Answers a customer query within agreed SLA"]),
         (["Anticipates common needs and addresses them proactively", "Goes slightly beyond what is required to satisfy customers"],
          ["Prepares an FAQ before customers ask common questions"]),
         (["Deeply understands customer needs and delivers exceptional service", "Creates service experiences that build lasting loyalty"],
          ["Designed a proactive outreach program that reduced support tickets by 40%"]),
         (["Builds a customer-centric culture across the team or organisation", "Creates service innovation that differentiates the organisation"],
          ["Transformed service model from reactive to proactive, increasing NPS by 35 points"]),
         (["Sets the enterprise customer experience standard", "Creates lasting competitive advantage through service excellence"],
          ["Built a globally recognised customer service model studied by competitors"]),
     ]},
    # Complex Problem Solving
    {"name": "Complex Problem Solving", "category": "Complex Problem Solving",
     "definition": "Identifying complex problems and reviewing related information to develop and evaluate options and implement solutions.",
     "levels": [
         (["Can identify simple problems and select from defined solutions", "Follows established problem-solving procedures"],
          ["Uses a checklist to troubleshoot a common software error"]),
         (["Analyses moderately complex problems using structured approaches", "Evaluates a small set of options systematically"],
          ["Maps a recurring customer complaint to a specific process breakdown"]),
         (["Diagnoses and solves complex, multi-variable problems independently", "Generates creative solutions when standard approaches fail"],
          ["Designed a novel process to resolve a quality issue that had stumped the team for a month"]),
         (["Solves enterprise-level problems with significant ambiguity and interdependence", "Coaches others in advanced problem-solving approaches"],
          ["Resolved a systemic cross-functional problem estimated to cost $2M if unaddressed"]),
         (["Expert problem-solver who tackles the organisation's most intractable challenges", "Creates problem-solving capability across the organisation"],
          ["Designed the organisation's problem-solving methodology now used enterprise-wide"]),
     ]},
    # Technical Skills
    {"name": "Operations Analysis", "category": "Technical Skills",
     "definition": "Analysing needs and product requirements to create a design.",
     "levels": [
         (["Identifies basic operational requirements with guidance", "Documents current state processes accurately"],
          ["Documents the steps in a standard workflow"]),
         (["Conducts requirements gathering for defined operational systems", "Identifies gaps between current and desired state"],
          ["Produces a business requirements document for a new system feature"]),
         (["Conducts comprehensive operations analysis for complex systems", "Identifies root cause inefficiencies and translates to design requirements"],
          ["Analyses an end-to-end supply chain and produces a redesign specification"]),
         (["Leads enterprise-level operations analysis projects", "Provides expert guidance on translating operational needs to technical design"],
          ["Authors a requirements framework used across multiple product lines"]),
         (["Expert operations analyst who shapes the methodology for the field", "Recognised for ability to analyse the most complex operational systems"],
          ["Designs the operational analysis approach for a major government transformation"]),
     ]},
    {"name": "Technology Design", "category": "Technical Skills",
     "definition": "Generating or adapting equipment and technology to serve user needs.",
     "levels": [
         (["Understands basic principles of technology design", "Can adapt simple existing tools to new uses"],
          ["Customises a spreadsheet template for a new reporting need"]),
         (["Designs or adapts technology solutions for defined use cases", "Considers user needs in design decisions"],
          ["Configures a CRM system to match a team's workflow"]),
         (["Designs original technology solutions that meet complex user needs", "Applies human-centred design principles"],
          ["Designs a workflow automation tool from scratch that reduces manual work by 60%"]),
         (["Leads technology design for enterprise systems", "Sets design standards and architecture"],
          ["Authors the technical architecture for a mission-critical enterprise platform"]),
         (["Expert technology designer who creates breakthrough solutions", "Shapes the field of technology design"],
          ["Invents a technology platform that creates a new product category"]),
     ]},
    {"name": "Equipment Selection", "category": "Technical Skills",
     "definition": "Determining the kind of tools and equipment needed to do a job.",
     "levels": [
         (["Selects from a predefined list of approved tools", "Identifies basic equipment needs"],
          ["Selects the correct tool from a standard kit for a task"]),
         (["Evaluates tools for suitability in familiar contexts", "Considers cost, capability, and usability"],
          ["Recommends a new piece of lab equipment based on technical specifications"]),
         (["Conducts systematic tool evaluation across multiple criteria", "Anticipates edge cases and constraints"],
          ["Leads a structured evaluation of five competing technology platforms"]),
         (["Designs equipment selection frameworks for organisational use", "Provides expert guidance on complex technology decisions"],
          ["Authors the tool selection criteria for a multi-million dollar infrastructure project"]),
         (["Expert in equipment and technology selection across complex domains", "Recognised for ability to select optimal tools for the most challenging contexts"],
          ["Advises government bodies on technology procurement for national infrastructure"]),
     ]},
    {"name": "Installation", "category": "Technical Skills",
     "definition": "Installing equipment, machines, wiring, or programs to meet specifications.",
     "levels": [
         (["Follows step-by-step instructions to install standard equipment", "Can install familiar software with documentation"],
          ["Installs standard office software following a written guide"]),
         (["Installs moderately complex systems in defined environments", "Troubleshoots common installation issues independently"],
          ["Deploys a new point-of-sale system at a retail location"]),
         (["Installs complex, integrated systems in variable environments", "Anticipates and resolves installation challenges"],
          ["Deploys a networked security system across a multi-building campus"]),
         (["Leads complex, large-scale installation projects", "Sets installation standards and procedures"],
          ["Manages the installation of enterprise infrastructure across 50 locations"]),
         (["Expert installer of the most complex systems", "Advances installation methodology for the field"],
          ["Designs the installation framework for a national telecommunications rollout"]),
     ]},
    {"name": "Programming", "category": "Technical Skills",
     "definition": "Writing computer programs for various purposes.",
     "levels": [
         (["Writes simple scripts or modifies existing code with guidance", "Understands basic programming logic"],
          ["Modifies a SQL query to filter results"]),
         (["Writes functional programs in at least one language for defined tasks", "Debugs own code effectively"],
          ["Writes a Python script to automate a data cleaning task"]),
         (["Designs and builds complex, production-ready software", "Applies software engineering best practices"],
          ["Builds a REST API service handling 10,000 requests per day"]),
         (["Architects large-scale software systems", "Mentors others and sets coding standards"],
          ["Designs a microservices architecture for an enterprise platform"]),
         (["Expert programmer who creates breakthrough software or advances the field", "Recognised as a technical authority"],
          ["Invents a programming framework adopted by thousands of developers"]),
     ]},
    {"name": "Operations Monitoring", "category": "Technical Skills",
     "definition": "Watching gauges, dials, or other indicators to make sure a machine or process is working properly.",
     "levels": [
         (["Reads standard indicators and reports normal/abnormal status", "Follows monitoring protocols"],
          ["Monitors a production dashboard and reports anomalies"]),
         (["Interprets complex monitoring data and identifies trends", "Takes corrective action for common issues"],
          ["Identifies a degrading machine metric before it causes a failure"]),
         (["Monitors complex, interconnected systems and diagnoses subtle issues", "Anticipates system failures before they occur"],
          ["Detects a multi-system cascade failure from monitoring data and prevents downtime"]),
         (["Designs monitoring systems for complex operations", "Coaches others in advanced monitoring techniques"],
          ["Builds a predictive monitoring platform that reduces unplanned downtime by 40%"]),
         (["Expert operations monitor who sets the monitoring standard for complex environments", "Advances monitoring methodology"],
          ["Designs the monitoring architecture for a critical national infrastructure system"]),
     ]},
    {"name": "Operation and Control", "category": "Technical Skills",
     "definition": "Controlling operations of equipment or systems.",
     "levels": [
         (["Operates standard equipment following defined procedures", "Maintains basic system settings"],
          ["Operates a standard CNC machine following a set program"]),
         (["Operates moderately complex equipment or systems proficiently", "Adjusts settings within approved parameters"],
          ["Adjusts production line speed and temperature settings to maintain quality"]),
         (["Controls complex systems under variable conditions", "Makes real-time adjustments to optimise performance"],
          ["Controls a chemical process, optimising yield under changing conditions"]),
         (["Manages control of highly complex, multi-variable systems", "Trains others and sets operating standards"],
          ["Oversees control room operations for a power generation facility"]),
         (["Expert operator of the most complex systems", "Shapes operation standards for the field"],
          ["Designs the operation framework for a complex national system"]),
     ]},
    {"name": "Equipment Maintenance", "category": "Technical Skills",
     "definition": "Performing routine maintenance on equipment and determining when and what kind of maintenance is needed.",
     "levels": [
         (["Performs basic cleaning and lubrication tasks", "Reports maintenance needs to specialists"],
          ["Cleans and lubricates a standard piece of equipment per schedule"]),
         (["Performs standard scheduled maintenance independently", "Identifies maintenance needs through inspection"],
          ["Completes a full preventive maintenance cycle on production equipment"]),
         (["Diagnoses and resolves complex maintenance issues", "Develops maintenance schedules to optimise equipment life"],
          ["Extends equipment lifespan by 20% through revised maintenance program"]),
         (["Designs maintenance systems for complex equipment fleets", "Coaches maintenance teams and sets standards"],
          ["Implements a predictive maintenance program reducing breakdowns by 50%"]),
         (["Expert in equipment maintenance at the most complex level", "Advances maintenance methodology for the field"],
          ["Authors the maintenance framework for a fleet of specialised industrial equipment"]),
     ]},
    {"name": "Troubleshooting", "category": "Technical Skills",
     "definition": "Determining causes of operating errors and deciding what to do about it.",
     "levels": [
         (["Identifies and resolves common, well-documented issues", "Escalates unfamiliar problems"],
          ["Resolves a common software error by following a known fix"]),
         (["Troubleshoots moderately complex problems systematically", "Documents solutions for future use"],
          ["Diagnoses a recurring equipment fault by eliminating possible causes"]),
         (["Diagnoses complex, multi-cause failures in interconnected systems", "Finds root causes rather than symptoms"],
          ["Traces a production quality issue to a subtle interaction between three system variables"]),
         (["Expert troubleshooter for the most complex systems", "Creates troubleshooting frameworks and trains others"],
          ["Resolves a critical system failure that stumped the vendor's engineering team"]),
         (["Recognised as the organisation's or field's most capable troubleshooter", "Advances troubleshooting methodology"],
          ["Authors the troubleshooting guide for a complex national infrastructure system"]),
     ]},
    {"name": "Repairing", "category": "Technical Skills",
     "definition": "Repairing machines or systems using the needed tools.",
     "levels": [
         (["Performs basic repairs following detailed instructions", "Replaces simple components"],
          ["Replaces a worn belt on a standard piece of machinery"]),
         (["Conducts standard repairs independently", "Selects correct tools and parts"],
          ["Rebuilds a hydraulic component following technical specifications"]),
         (["Repairs complex, specialised equipment with minimal documentation", "Fabricates replacement parts when unavailable"],
          ["Repairs a custom piece of manufacturing equipment using improvised solutions"]),
         (["Leads repair of the most complex or mission-critical systems", "Coaches others and sets repair standards"],
          ["Manages repair of a failed critical system, restoring operations ahead of schedule"]),
         (["Expert repairer at the highest level of technical complexity", "Advances repair methodology"],
          ["Designs the repair protocol for a class of complex specialised systems"]),
     ]},
    {"name": "Quality Control Analysis", "category": "Technical Skills",
     "definition": "Conducting tests and inspections of products, services, or processes to evaluate quality or performance.",
     "levels": [
         (["Conducts basic quality checks using defined checklists", "Records results accurately"],
          ["Performs a standard incoming inspection using a checklist"]),
         (["Conducts quality tests and analyses results independently", "Identifies defects and their probable causes"],
          ["Runs a process capability study and interprets Cpk results"]),
         (["Designs and leads comprehensive quality control programs", "Uses statistical methods to monitor and improve quality"],
          ["Implements SPC program that reduces defect rate by 30%"]),
         (["Architects quality management systems for complex organisations", "Coaches quality teams and sets standards"],
          ["Leads ISO 9001 implementation across a 500-person manufacturing operation"]),
         (["World-class quality expert who advances the field", "Shapes quality standards at industry or national level"],
          ["Authors quality framework adopted as an industry standard"]),
     ]},
    # Systems Skills
    {"name": "Judgment and Decision Making", "category": "Systems Skills",
     "definition": "Considering the relative costs and benefits of potential actions to choose the most appropriate one.",
     "levels": [
         (["Makes sound decisions in simple, well-defined situations", "Seeks input before deciding in novel situations"],
          ["Decides which of two standard approaches to use for a task"]),
         (["Makes good decisions in moderately complex situations using available information", "Weighs costs and benefits explicitly"],
          ["Evaluates two project approaches using a structured cost-benefit comparison"]),
         (["Makes complex decisions under uncertainty with consistently good outcomes", "Balances short and long-term considerations"],
          ["Decides to delay a product launch to fix a quality issue, preventing a costly recall"]),
         (["Makes high-stakes, enterprise-level decisions with confidence and rigour", "Coaches others in decision quality"],
          ["Makes a critical strategic decision that is later validated by market outcomes"]),
         (["Expert decision-maker whose track record over time demonstrates exceptional judgment", "Shapes the organisation's decision-making culture"],
          ["Establishes the decision-making principles and processes used enterprise-wide"]),
     ]},
    {"name": "Systems Analysis", "category": "Systems Skills",
     "definition": "Determining how a system should work and how changes in conditions, operations, and the environment will affect outcomes.",
     "levels": [
         (["Understands the basic components of a system", "Can trace a simple cause-and-effect relationship"],
          ["Maps the inputs and outputs of a simple process"]),
         (["Analyses moderately complex systems and identifies key interdependencies", "Predicts the direct effects of system changes"],
          ["Maps a product delivery system and identifies the key bottleneck"]),
         (["Analyses complex systems with multiple interdependencies", "Models second and third-order effects of changes"],
          ["Models how a pricing change ripples through supply chain, demand, and financials"]),
         (["Expert systems analyst who models enterprise-level complexity", "Shapes systems thinking across the organisation"],
          ["Designs the system model for an enterprise transformation initiative"]),
         (["World-class systems thinker who advances the field", "Applies systems analysis to the most complex sociotechnical challenges"],
          ["Authors a systems analysis methodology adopted by national planning bodies"]),
     ]},
    {"name": "Systems Evaluation", "category": "Systems Skills",
     "definition": "Identifying measures or indicators of system performance and the actions needed to improve or correct performance, relative to the goals of the system.",
     "levels": [
         (["Can measure defined system metrics", "Reports whether a system is meeting basic targets"],
          ["Reports weekly against defined production KPIs"]),
         (["Evaluates system performance against multiple criteria", "Identifies performance gaps and causes"],
          ["Diagnoses why a customer service system is missing SLA targets"]),
         (["Designs and executes comprehensive system evaluations", "Recommends systemic improvements with clear impact projections"],
          ["Conducts a full performance evaluation of a supply chain and identifies $3M improvement opportunity"]),
         (["Expert system evaluator who assesses enterprise-level systems", "Designs evaluation frameworks adopted across the organisation"],
          ["Authors the enterprise performance evaluation methodology"]),
         (["World-class system evaluator who advances the field", "Evaluates the most complex sociotechnical systems"],
          ["Leads the evaluation of a national public service system"]),
     ]},
    # Resource Management
    {"name": "Time Management", "category": "Resource Management",
     "definition": "Managing one's own time and the time of others.",
     "levels": [
         (["Manages own time adequately for simple workloads", "Meets most deadlines with reminders"],
          ["Consistently meets individual deadlines"]),
         (["Prioritises effectively and meets multiple simultaneous deadlines", "Plans own workload proactively"],
          ["Manages three concurrent projects without missing a deadline"]),
         (["Manages time across complex workloads and competing priorities", "Optimises use of time for self and team"],
          ["Delivers a complex multi-workstream project on time through rigorous scheduling"]),
         (["Designs time management systems for teams and organisations", "Coaches others in time optimisation"],
          ["Implements a workflow prioritisation system adopted by a 50-person team"]),
         (["Expert in time and workload management at the highest complexity", "Shapes organisational time culture"],
          ["Architects the time management practices used enterprise-wide"]),
     ]},
    {"name": "Management of Financial Resources", "category": "Resource Management",
     "definition": "Determining how money will be spent to get the work done and accounting for these expenditures.",
     "levels": [
         (["Tracks and reports own expenses accurately", "Follows defined budget procedures"],
          ["Submits an accurate monthly expense report"]),
         (["Manages a team-level budget", "Identifies variances and escalates risks"],
          ["Manages a $200K project budget with monthly variance reporting"]),
         (["Manages complex, multi-year budgets", "Makes trade-off decisions to maximise ROI"],
          ["Manages a $5M divisional budget, delivering all programmes within 3% of plan"]),
         (["Sets budget strategy for a business unit", "Builds financial rigour across the team"],
          ["Authors the annual budget for a $50M business unit"]),
         (["Sets the enterprise financial resource strategy", "Manages and allocates at the enterprise level"],
          ["Authors the enterprise capital allocation framework used by the board"]),
     ]},
    {"name": "Management of Material Resources", "category": "Resource Management",
     "definition": "Obtaining and seeing to the appropriate use of equipment, facilities, and materials needed to do certain work.",
     "levels": [
         (["Tracks and requests standard materials as needed", "Manages own equipment responsibly"],
          ["Maintains an accurate inventory of own equipment"]),
         (["Manages material resources for a team", "Ensures resources are available when needed"],
          ["Manages tool crib and ensures availability for a 10-person team"]),
         (["Manages complex material supply chains", "Optimises resource utilisation across the organisation"],
          ["Manages a $2M materials budget, achieving a 15% efficiency improvement"]),
         (["Designs material resource management systems for complex organisations", "Coaches others in resource optimisation"],
          ["Implements a just-in-time materials system across a manufacturing operation"]),
         (["Expert in material resource management at the highest level", "Shapes organisational procurement and asset strategy"],
          ["Authors the enterprise resource management framework"]),
     ]},
    {"name": "Management of Personnel Resources", "category": "Resource Management",
     "definition": "Motivating, developing, and directing people as they work, identifying the best people for the job.",
     "levels": [
         (["Assigns basic tasks and follows up on completion", "Recognises individual contributions"],
          ["Assigns work to team members based on their defined roles"]),
         (["Matches people to tasks based on skills and motivation", "Coaches direct reports on performance"],
          ["Identifies team members' strengths and aligns assignments accordingly"]),
         (["Manages team composition and development proactively", "Builds high-performing teams through deliberate talent decisions"],
          ["Restructures team to optimise skill coverage and increases output by 25%"]),
         (["Designs talent management systems for the organisation", "Coaches managers on effective people management"],
          ["Leads the talent review process for a 200-person organisation"]),
         (["Expert in people resource management at the enterprise level", "Shapes the talent strategy as a competitive advantage"],
          ["Authors the enterprise talent management strategy"]),
     ]},
]

# ---------------------------------------------------------------------------
# Framework 3: Core Behavioral Competencies
# ---------------------------------------------------------------------------

_CORE_BEHAVIORAL: list[dict] = [
    {
        "name": "Communication",
        "definition": "Conveys ideas clearly in written, verbal, and non-verbal forms. Listens actively to understand before responding.",
        "levels": [
            (["Communicates simple information clearly in familiar situations", "Listens when spoken to"],
             ["Sends a clear email confirming meeting details"]),
            (["Communicates clearly across written and verbal channels", "Adapts language to audience with prompting"],
             ["Writes a clear project update for a non-technical stakeholder"]),
            (["Tailors communication to audience, medium, and context independently", "Uses active listening techniques consistently"],
             ["Facilitates a productive cross-functional discussion on a complex topic"]),
            (["Communicates with impact across all channels and audiences", "Models communication excellence for the team"],
             ["Delivers a change communication that lands positively with a resistant audience"]),
            (["Recognised communication leader who shapes organisational discourse", "Coaches others to communicate with excellence"],
             ["Authors the organisation's communication playbook"]),
        ],
    },
    {
        "name": "Teamwork and Collaboration",
        "definition": "Works cooperatively with others toward shared goals. Prioritises team success over individual recognition.",
        "levels": [
            (["Participates in team activities when asked", "Cooperates with immediate colleagues"],
             ["Helps a colleague finish a task when their own work is complete"]),
            (["Actively supports team goals", "Shares information and resources with teammates"],
             ["Volunteers to document team processes for shared use"]),
            (["Drives team performance through proactive collaboration", "Resolves team conflicts constructively"],
             ["Identifies a team communication gap and implements a fix that improves delivery"]),
            (["Builds high-performing collaborative cultures", "Creates cross-team partnerships that deliver shared value"],
             ["Leads a cross-functional initiative that achieves a goal no single team could have met alone"]),
            (["Shapes the organisation's collaborative culture", "Recognised as an exemplary team player at the highest level"],
             ["Designs the collaboration framework used enterprise-wide"]),
        ],
    },
    {
        "name": "Problem Solving and Critical Thinking",
        "definition": "Identifies root causes of problems, evaluates options rigorously, and implements effective solutions.",
        "levels": [
            (["Identifies obvious problems and applies known solutions", "Follows defined problem-solving procedures"],
             ["Uses a checklist to troubleshoot a common system error"]),
            (["Analyses moderately complex problems with guidance", "Evaluates a few options before deciding"],
             ["Maps a recurring issue to a specific process step"]),
            (["Independently diagnoses and solves complex problems", "Applies structured frameworks to novel situations"],
             ["Develops a novel solution to a recurring bottleneck that previous approaches failed to solve"]),
            (["Solves enterprise-level problems with significant complexity", "Coaches others in problem-solving rigour"],
             ["Resolves a systemic cross-functional issue saving the organisation $1M+"]),
            (["Expert problem-solver recognised across the organisation or field", "Creates problem-solving capability at scale"],
             ["Designs the organisation's problem-solving methodology"]),
        ],
    },
    {
        "name": "Adaptability and Flexibility",
        "definition": "Adjusts effectively to changing priorities, environments, and demands. Embraces change as an opportunity.",
        "levels": [
            (["Accepts changes when told", "Adjusts own work when directed by others"],
             ["Updates work method when manager requests a change"]),
            (["Adapts to changes with minimal disruption to own productivity", "Seeks to understand the reason for changes"],
             ["Quickly resets priorities when a key project changes direction"]),
            (["Thrives under change; helps others adapt", "Proactively identifies and addresses adaptation needs"],
             ["Keeps team productive and morale high through a major reorganisation"]),
            (["Leads change effectively; creates adaptability as a team strength", "Coaches others to embrace change"],
             ["Leads a major transformation with high adoption and low resistance"]),
            (["Champions organisational agility", "Creates systems that make the organisation inherently adaptable"],
             ["Builds the adaptive strategy capability that enables continuous organisational transformation"]),
        ],
    },
    {
        "name": "Leadership and Influence",
        "definition": "Guides and motivates others toward shared goals. Leads through influence, not just authority.",
        "is_leadership": True,
        "levels": [
            (["Influences close colleagues informally", "Takes initiative within own scope"],
             ["Steps up to coordinate a team activity without being asked"]),
            (["Leads small groups effectively in familiar contexts", "Influences peers through sound reasoning"],
             ["Leads a sub-team to deliver a project milestone"]),
            (["Leads cross-functional efforts through influence", "Inspires commitment beyond formal authority"],
             ["Leads a cross-functional initiative with no direct authority over participants"]),
            (["Leads at the organisational level through compelling vision and values", "Develops other leaders"],
             ["Leads a 200-person organisation through a strategic transformation"]),
            (["Recognised leadership model for the organisation", "Shapes the field's understanding of leadership"],
             ["Widely regarded as a leadership exemplar who defines the organisation's leadership culture"]),
        ],
    },
    {
        "name": "Emotional Intelligence",
        "definition": "Recognises and manages own emotions, and reads and responds to the emotions of others with empathy and skill.",
        "levels": [
            (["Aware of own emotional states", "Shows basic empathy toward others"],
             ["Recognises when a colleague seems stressed and offers support"]),
            (["Manages own emotional reactions in routine situations", "Reads the emotional climate of a team meeting"],
             ["Stays calm and constructive during a tense team discussion"]),
            (["Consistently applies emotional intelligence in complex, high-stakes situations", "Uses empathy to build trust and resolve conflict"],
             ["Navigates a difficult performance conversation leaving the person feeling respected and motivated"]),
            (["Models and coaches emotional intelligence at a leadership level", "Creates psychologically safe environments"],
             ["Creates a team climate where vulnerability and authentic expression are normalised"]),
            (["Shapes the organisation's emotional culture", "Recognised expert in EI who advances the field"],
             ["Authors the emotional intelligence development curriculum used enterprise-wide"]),
        ],
    },
    {
        "name": "Ethics and Integrity",
        "definition": "Consistently acts with honesty, fairness, and moral courage. Upholds ethical standards even when it is difficult.",
        "levels": [
            (["Follows stated rules and policies", "Honest in direct communications"],
             ["Accurately reports own work hours"]),
            (["Acts ethically in straightforward situations", "Raises concerns about obvious violations"],
             ["Reports a minor policy violation to the manager"]),
            (["Maintains ethical conduct under pressure", "Proactively identifies and addresses ethical risks"],
             ["Refuses to falsify data to meet a target, escalating the underlying issue"]),
            (["Challenges unethical behaviour at senior levels", "Creates accountability systems for ethical conduct"],
             ["Exposes a systemic ethics issue at personal career risk"]),
            (["Sets the ethical standard for the organisation", "Shapes the culture of integrity enterprise-wide"],
             ["Authors the corporate ethics framework adopted by the board"]),
        ],
    },
    {
        "name": "Results Orientation",
        "definition": "Focuses on achieving outcomes with urgency and quality. Sets high standards and holds self accountable for results.",
        "levels": [
            (["Completes assigned tasks reliably", "Meets basic performance expectations"],
             ["Delivers all assigned work on time"]),
            (["Consistently meets targets and takes ownership of outcomes", "Goes beyond minimum requirements"],
             ["Exceeds a quarterly sales target without being prompted to do more"]),
            (["Drives significant results; raises the bar for the team", "Sustains high performance under pressure"],
             ["Delivers a complex project 15% ahead of schedule and under budget"]),
            (["Sets and achieves stretch goals at the team or business unit level", "Creates a high-performance culture"],
             ["Leads team to top-quartile performance for three consecutive years"]),
            (["Sets the performance standard for the organisation", "Creates results-oriented culture at enterprise scale"],
             ["Architects the performance management system that drives enterprise-wide results"]),
        ],
    },
    {
        "name": "Customer Focus",
        "definition": "Understands and prioritises the needs of customers, internal or external. Delivers solutions that create genuine value.",
        "levels": [
            (["Responds to customer requests promptly", "Treats customers politely"],
             ["Acknowledges a customer inquiry within one business day"]),
            (["Anticipates common customer needs", "Goes slightly beyond what is expected to satisfy customers"],
             ["Prepares an FAQ before common customer questions arise"]),
            (["Deeply understands customer needs and delivers exceptional value", "Uses customer insight to shape team priorities"],
             ["Introduces a service improvement based on customer feedback that reduces complaints by 35%"]),
            (["Builds a customer-centric culture across the team", "Creates customer experience innovations"],
             ["Transforms the team's service model, increasing NPS by 30 points"]),
            (["Sets the enterprise customer experience strategy", "Creates sustainable competitive advantage through customer focus"],
             ["Authors the customer experience strategy that differentiates the company in the market"]),
        ],
    },
    {
        "name": "Innovation and Creativity",
        "definition": "Generates novel ideas and finds creative ways to solve problems. Challenges the status quo to create better outcomes.",
        "levels": [
            (["Suggests minor improvements when asked", "Open to trying new approaches"],
             ["Identifies a small inefficiency and suggests a simple fix"]),
            (["Proposes meaningful improvements to existing processes", "Experiments with new approaches within own scope"],
             ["Redesigns a team workflow based on a creative idea, saving 2 hours per week"]),
            (["Generates breakthrough ideas and leads them to implementation", "Creates a safe space for others to innovate"],
             ["Introduces a novel product feature that becomes a top customer request"]),
            (["Leads innovation initiatives with cross-team impact", "Builds innovation culture and capability"],
             ["Establishes an innovation lab with a structured idea-to-pilot process"]),
            (["Shapes the organisation's innovation strategy", "Creates innovation as a sustainable competitive advantage"],
             ["Leads R&D transformation that produces multiple patented innovations"]),
        ],
    },
    {
        "name": "Self-Development and Learning Agility",
        "definition": "Takes ownership of personal growth. Rapidly acquires new knowledge and skills and applies them to new situations.",
        "levels": [
            (["Engages in assigned development activities", "Open to feedback"],
             ["Completes a required training course"]),
            (["Pursues development opportunities with encouragement", "Applies feedback visibly"],
             ["Seeks out a stretch assignment to build a new skill"]),
            (["Owns personal development proactively", "Rapidly acquires and applies new skills"],
             ["Builds proficiency in a new domain in weeks to meet a project need"]),
            (["Creates personal learning systems that compound growth", "Coaches others on self-development"],
             ["Becomes a recognised internal expert in a new domain within six months"]),
            (["Models continuous learning at the highest level", "Shapes the organisation's learning culture"],
             ["Authors the individual development framework used enterprise-wide"]),
        ],
    },
    {
        "name": "Diversity, Equity and Inclusion",
        "definition": "Actively promotes an environment where people of all backgrounds are valued, included, and empowered to contribute fully.",
        "levels": [
            (["Treats all people with respect", "Aware that different backgrounds bring different perspectives"],
             ["Listens respectfully to a colleague from a different background"]),
            (["Actively seeks out diverse perspectives", "Recognises and mitigates own biases with effort"],
             ["Explicitly invites quieter team members to share their view in meetings"]),
            (["Creates inclusive team environments through deliberate practice", "Advocates for underrepresented colleagues"],
             ["Redesigns meeting norms so all voices are heard equally"]),
            (["Builds DEI into team processes and hiring", "Champions equity as a business imperative"],
             ["Leads a team diversity initiative that increases representation by 30%"]),
            (["Shapes enterprise DEI strategy", "Creates systemic change that makes inclusion structural"],
             ["Authors the DEI strategy that earns the company a top-employer recognition"]),
        ],
    },
]


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------


async def seed_competency_frameworks(session: AsyncSession) -> None:
    """Idempotently seed all three competency frameworks."""

    # ── Check if already seeded ─────────────────────────────────────────────
    existing = (await session.execute(select(CompetencyFramework))).scalars().all()
    existing_names = {f.name for f in existing}

    seeded = 0

    for fw_name, fw_data in [
        (
            "Korn Ferry Leadership Architect",
            {
                "source": "Korn Ferry",
                "description": (
                    "38 leadership competencies organised into four factors "
                    "(Thought, Results, People, Self) and twelve clusters. "
                    "Industry-standard framework for leadership development and selection."
                ),
                "version": "2014",
                "competencies": _KF_COMPETENCIES,
                "is_leadership_fw": True,
            },
        ),
        (
            "O*NET Core Skills",
            {
                "source": "U.S. Department of Labor / O*NET",
                "description": (
                    "35 foundational occupational skills spanning content, process, "
                    "social, technical, systems, and resource management categories. "
                    "Based on the publicly available O*NET Skills taxonomy."
                ),
                "version": "28.0",
                "competencies": _ONET_SKILLS,
                "is_leadership_fw": False,
            },
        ),
        (
            "Core Behavioral Competencies",
            {
                "source": "Metricly",
                "description": (
                    "12 universal role-agnostic behavioural competencies applicable "
                    "across industries, functions, and seniority levels. "
                    "Designed for development and 360 applications."
                ),
                "version": "1.0",
                "competencies": _CORE_BEHAVIORAL,
                "is_leadership_fw": False,
            },
        ),
    ]:
        if fw_name in existing_names:
            log.debug("Competency framework already seeded: %s", fw_name)
            continue

        fw = CompetencyFramework(
            name=fw_name,
            source=fw_data["source"],
            description=fw_data["description"],
            version=fw_data["version"],
        )
        session.add(fw)
        await session.flush()  # get fw.id

        for comp_data in fw_data["competencies"]:
            comp = CompetencyDefinition(
                framework_id=fw.id,
                name=comp_data["name"],
                definition=comp_data.get("definition"),
                cluster=comp_data.get("cluster"),
                factor=comp_data.get("factor"),
                category=comp_data.get("category"),
                role_family=comp_data.get("role_family"),
                framework_source=comp_data.get("framework_source"),
                is_leadership=comp_data.get("is_leadership", fw_data["is_leadership_fw"]),
                is_technical=comp_data.get("is_technical", False),
            )
            session.add(comp)
            await session.flush()

            for lvl_num, (indicators, examples) in enumerate(comp_data["levels"], start=1):
                pl = CompetencyProficiencyLevel(
                    competency_id=comp.id,
                    level=lvl_num,
                    label=LEVEL_LABELS[lvl_num],
                    behavioral_indicators=json.dumps(indicators),
                    example_behaviors=json.dumps(examples),
                )
                session.add(pl)

            seeded += 1

        await session.commit()
        log.info("Seeded competency framework: %s (%d competencies)", fw_name, len(fw_data["competencies"]))

    if seeded:
        log.info("Total competencies seeded: %d", seeded)
    else:
        log.debug("All competency frameworks already seeded.")


# ═══════════════════════════════════════════════════════════════════════════
# Framework 4: Role-Family Competency Library
# ═══════════════════════════════════════════════════════════════════════════
#
# Curated by Metricly from SHL UCF, Korn Ferry, O*NET, Lominger, and Bartram
# Great Eight. Each competency cites its specific source in `framework_source`
# (NULL when no specific named source can be honestly cited).
#
# Semantic note on `cluster`:
#   For KF, `cluster` is a sub-group within `factor` (e.g. "Business Insight"
#   within "Thought"). For this library, `cluster` is a sub-group within
#   `role_family` (e.g. "Customer Engagement" within "Sales"). Capped at 3–4
#   clusters per family.
#
# ---------------------------------------------------------------------------
# Cuts from the original 70-competency proposal (kept here so we don't
# re-litigate):
# ---------------------------------------------------------------------------
#   Sales:
#     · Solution Articulation         — communication-flavoured; covered by KF Communicates Effectively
#     · Sales Resilience              — covered by KF "Being Resilient"; role-context didn't add enough
#   Technical/Engineering:
#     · Technical Problem Decomposition — covered by O*NET Complex Problem Solving + Systems Thinking
#     · Continuous Technical Learning   — covered by KF "Nimble Learning"
#   People Management:
#     · Running Effective 1:1s and Team Rituals — practice bundle, not a competency; subsumed by First-Line Performance Coaching
#     · Change Implementation at the Team Level — overlap with KF "Drives Engagement" + "Plans and Aligns"
#   Customer Service & Success:
#     · Multichannel Service Communication — communication-flavoured; rely on KF Communicates Effectively
#     · Product Knowledge for Service      — knowledge (trainable), not a psychometrically assessable competency
#   Operations & PM:
#     · Cross-Functional Coordination       — covered by KF "Collaborates"
#     · Stakeholder Communication (PM)      — communication-flavoured
#     · Continuous Improvement Mindset      — covered by KF "Cultivates Innovation"
#   Finance & Accounting:
#     · Financial Analysis and Modelling    — covered by KF "Financial Acumen" + role_family tag
#   Marketing & Communications:
#     · Public Relations and External Communications — communication-flavoured
# ---------------------------------------------------------------------------

ROLE_FAMILY_COMPETENCIES: list[dict] = [
    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Sales (8 competencies)
    # Clusters: Customer Engagement, Account Lifecycle, Sales Discipline
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Consultative Discovery",
        "role_family": "Sales",
        # SHL UCF Dimension 3.2 — Persuading and Influencing.
        # Methodology: Rackham (1988) SPIN Selling (not a competency framework).
        "framework_source": "SHL UCF 3.2 — Persuading and Influencing",
        "cluster": "Customer Engagement",
        "definition": (
            "Engages prospects through structured diagnostic questioning to surface "
            "latent needs and decision drivers. Co-creates solutions around customer "
            "outcomes rather than presenting product features."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Follows scripted pitches; questions are closed and product-focused",
              "Reverts to feature lists when the customer raises objections"],
             ["Opens calls by walking through a fixed product deck"]),
            (["Asks open questions only in the warm-up phase of the call; transitions to product features once the customer mentions a need",
              "Identifies surface pain points without linking them to solution value"],
             ["Surfaces a buyer complaint but pitches the standard package in response"]),
            (["Conducts structured discovery; surfaces 2–3 pain points per call",
              "Links customer problems to specific product capabilities and outcomes"],
             ["Reframed a price objection into a discussion of total cost of ownership"]),
            (["Diagnoses systemic challenges across multiple stakeholders in a buying group",
              "Shifts conversations from price comparison to value framing across all deal stages, including procurement and legal review"],
             ["Mapped three executive stakeholders' competing priorities into one unified business case"]),
            (["Invited by customer executives to advise on decisions outside the immediate purchase scope (e.g. org changes, vendor strategy)",
              "Coaches others in consultative methods; closes complex deals where competitors lose on product-only positioning"],
             ["Won a strategic account after the customer rejected three lower-priced competitors on fit alone"]),
        ],
    },
    {
        "name": "Commercial Negotiation",
        "role_family": "Sales",
        # O*NET 2.B.1.e — Negotiation (generic); this competency is the
        # sales-context specialisation focusing on commercial terms.
        "framework_source": "O*NET 2.B.1.e — Negotiation (sales-context specialisation)",
        "cluster": "Account Lifecycle",
        "definition": (
            "Reaches commercial agreements that secure value for both buyer and "
            "seller. Manages concessions, defends margin, and structures terms that "
            "support the long-term relationship rather than only the immediate deal."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Concedes on price or terms at the first sign of buyer pushback",
              "Negotiates one variable (price) without packaging trade-offs"],
             ["Drops list price by 15% to avoid losing a deal in the first call"]),
            (["Holds price on small deals but folds under procurement pressure",
              "Names two or three commercial levers but rarely combines them in a single offer"],
             ["Trades a discount for an annual commitment only when prompted by their manager"]),
            (["Constructs balanced proposals trading price, term length, payment terms, and scope",
              "Identifies the buyer's BATNA and walk-away point before entering serious negotiation"],
             ["Closed a deal at list price by extending the contract term and adding a quarterly business review"]),
            (["Negotiates multi-year, multi-product commercial structures with procurement and legal",
              "Walks away from deals where economics or precedent would damage the wider portfolio"],
             ["Restructured a stalled renewal into a three-year deal with built-in escalators"]),
            (["Sets commercial negotiation playbooks adopted by the wider sales organisation",
              "Coaches account teams through deals where the commercial pattern is novel to the company"],
             ["Authored the deal-desk playbook the company now uses for all enterprise renewals"]),
        ],
    },
    {
        "name": "Closing and Commitment Securing",
        "role_family": "Sales",
        "framework_source": None,
        "cluster": "Account Lifecycle",
        "definition": (
            "Secures explicit decisions from prospects at each stage of the buying "
            "cycle. Names the next commitment, gets it in writing, and prevents "
            "deals from drifting through ambiguity."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Ends calls without a named next step or owner",
              "Treats 'we'll get back to you' as a positive signal"],
             ["Sends a follow-up email asking 'any thoughts?' three weeks after the demo"]),
            (["Asks for the close only at the end of the cycle; misses smaller commitments along the way",
              "Documents next steps but does not get buyer agreement to them in writing"],
             ["Schedules a follow-up call but cannot say who from the buyer side will attend"]),
            (["Secures named next steps with owner and date at the end of every customer interaction",
              "Confirms commitments back to the buyer in writing within 24 hours"],
             ["Sent a recap email after each meeting; deal advanced through six gates in nine weeks"]),
            (["Diagnoses stalled deals and re-engages decision-makers using specific commercial or business triggers",
              "Negotiates parallel commitments across procurement, legal, and the business sponsor"],
             ["Recovered a deal that had been dormant for two quarters by surfacing a new compliance deadline"]),
            (["Establishes deal-progression discipline across an entire team; pipeline-to-close conversion measurably improves",
              "Coaches peers through complex multi-party commitment sequences"],
             ["Lifted team close rate from 18% to 27% over four quarters by enforcing exit criteria at every stage"]),
        ],
    },
    {
        "name": "Pipeline and Territory Management",
        "role_family": "Sales",
        "framework_source": "Korn Ferry LA — 'Plans and Aligns' (sales-context operationalisation)",
        "cluster": "Sales Discipline",
        "definition": (
            "Manages a portfolio of opportunities and accounts so that pipeline "
            "coverage, stage progression, and territory potential are sized "
            "rationally to quota. Prioritises time against deal value and "
            "probability rather than recency."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Works deals in the order they arrive; no explicit prioritisation",
              "Pipeline coverage is unknown or estimated from memory"],
             ["Cannot answer 'what's your current 90-day pipeline coverage' without checking the CRM live"]),
            (["Tracks pipeline in the CRM but does not size it against quota",
              "Prioritises by deal age rather than expected value × probability"],
             ["Spends Monday on the oldest deal in the pipeline, regardless of value"]),
            (["Maintains pipeline coverage of 3× quota with stage-weighted probability",
              "Allocates calling time across territory in proportion to account potential"],
             ["Built a tiered account list (A/B/C) and matched call cadence to each tier"]),
            (["Forecasts within ±10% accuracy quarter over quarter",
              "Identifies coverage gaps two quarters out and reorients prospecting effort accordingly"],
             ["Flagged a Q4 coverage gap in Q2; rebuilt pipeline by adding two new verticals"]),
            (["Sets pipeline and territory standards adopted by the broader sales organisation",
              "Forecast accuracy is referenced as a benchmark in management reviews"],
             ["Forecast accuracy of ±5% over six consecutive quarters; methodology now used company-wide"]),
        ],
    },
    {
        "name": "Account Planning and Expansion",
        "role_family": "Sales",
        "framework_source": "Korn Ferry LA — 'Strategic Mindset' (account-level operationalisation)",
        "cluster": "Account Lifecycle",
        "definition": (
            "Develops multi-year plans for named strategic accounts. Maps "
            "stakeholders, identifies whitespace, and orchestrates internal "
            "resources to grow revenue, retention, and reference value over time."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Manages accounts transactionally — one renewal or deal at a time",
              "Cannot name the buyer's strategic priorities for the next 12 months"],
             ["Treats each renewal as a fresh sales motion with no account-level memory"]),
            (["Maintains a contact list per account but no stakeholder map",
              "Recognises expansion opportunities only when the buyer raises them"],
             ["Renews an account at the same scope it had two years ago, despite buyer growth"]),
            (["Builds account plans with stakeholder map, whitespace analysis, and 12-month expansion roadmap",
              "Coordinates internal resources (CS, product, executives) against named account objectives"],
             ["Grew an existing account 40% by mapping three under-engaged business units and tailoring proposals to each"]),
            (["Orchestrates multi-year, multi-product expansion across complex enterprise accounts",
              "Maintains executive relationships with C-level sponsors independent of any single deal"],
             ["Sponsored a five-year strategic partnership generating recurring revenue across four product lines"]),
            (["Account strategies are referenced internally as exemplars; methodology is taught to other account teams",
              "Customer cites this person as central to their internal business case for the partnership"],
             ["Account is featured in the company's annual report as a flagship customer reference"]),
        ],
    },
    {
        "name": "Product and Market Acumen",
        "role_family": "Sales",
        # Differentiated from KF "Business Insight" — this is product-mastery
        # depth in the seller's specific market, not general business judgement.
        "framework_source": "Korn Ferry LA — 'Business Insight' (product/market-specific specialisation)",
        "cluster": "Customer Engagement",
        "definition": (
            "Demonstrates deep working knowledge of the company's products, the "
            "competitive landscape, and the customer's industry. Translates that "
            "knowledge into credible commercial conversations without dependence "
            "on sales engineers for routine questions."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Knows product names and headline features only",
              "Defers all technical or competitive questions to sales engineering"],
             ["Cannot answer 'how do you compare to Competitor X' without a follow-up call"]),
            (["Demonstrates core product use cases without help",
              "Can name competitors but not articulate specific competitive differentiation"],
             ["Demos the platform end-to-end but struggles when the buyer asks an off-script question"]),
            (["Handles 80% of product and competitive questions live, in conversation",
              "Translates product capabilities into customer-industry-specific outcomes"],
             ["Closed a deal in the financial services vertical by mapping product features to FCA reporting requirements"]),
            (["Recognised internally as a domain expert in their assigned vertical or product line",
              "Anticipates competitive moves and pre-positions the company's products accordingly"],
             ["Coached the marketing team on a competitive positioning shift after a competitor's product launch"]),
            (["Sets product and market knowledge standards adopted by the wider sales organisation",
              "Sought out externally — by analysts, press, or customers — as a domain authority"],
             ["Keynote speaker at the industry's largest annual customer conference"]),
        ],
    },
    {
        "name": "Sales Forecasting and CRM Discipline",
        "role_family": "Sales",
        "framework_source": None,
        "cluster": "Sales Discipline",
        "definition": (
            "Maintains accurate, current CRM data and produces forecasts that "
            "management can act on. Distinguishes commit from upside, narrates "
            "deal risk in specific commercial terms, and updates positions as "
            "evidence changes."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Updates CRM only when prompted; deal stages lag actual reality by weeks",
              "Forecast is essentially a target restatement; commit vs. upside is undifferentiated"],
             ["Quarterly forecast equals quarterly quota with no supporting deal-level detail"]),
            (["Updates CRM weekly; stages reflect recent activity but not deal economics",
              "Distinguishes commit and upside but the categorisation drifts over the quarter"],
             ["Calls a deal 'commit' in week three; deal slips in week eleven without prior warning"]),
            (["Maintains deal stages, next steps, and close dates within ±1 week of actuality",
              "Forecast commit hits ±15% accuracy; deal slippage is signalled at least two weeks ahead"],
             ["Flagged a slipping commit deal six weeks before quarter end, allowing pipeline backfill"]),
            (["Forecast commit hits ±10% accuracy consistently; deal-by-deal narrative cites specific commercial risk",
              "CRM hygiene is sufficient that downstream functions (finance, RevOps) act on it without re-validation"],
             ["Finance plans cash based directly on this rep's forecast without sanity-checking with the manager"]),
            (["Forecast and CRM standards are referenced as benchmarks across the wider sales organisation",
              "Coaches peers and managers on commit-vs-upside discipline; methodology is adopted into team training"],
             ["Team-level forecast accuracy improved by 12 points after methodology was rolled out"]),
        ],
    },
    {
        "name": "Cross-Cultural Selling",
        "role_family": "Sales",
        # Metricly addition — no direct named-competency source. Informed by
        # Hofstede (1980), Trompenaars (1993), and GCC commercial-customs research.
        "framework_source": None,
        "cluster": "Customer Engagement",
        "definition": (
            "Adapts commercial approach to the cultural context of the buyer — "
            "relationship cadence, decision-making structure, communication "
            "directness, and the role of formal vs. informal trust. Particularly "
            "relevant for sales spanning GCC, Levant, and North African markets."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Applies a single sales playbook regardless of the buyer's cultural context",
              "Mistakes relationship-building investment for inefficiency"],
             ["Pushes to close a GCC enterprise deal on the second meeting after a brief intro"]),
            (["Recognises that pace and protocol differ across markets but cannot articulate specifics",
              "Adapts tactics (e.g. meeting cadence) but not underlying strategy"],
             ["Slows meeting cadence in the Gulf but still expects Western-style direct yes/no answers"]),
            (["Maps the buyer's likely decision structure (consensus, hierarchical, family-influenced) and adapts approach accordingly",
              "Invests appropriate relationship time before commercial discussion in cultures where that is required"],
             ["Spent three meetings on relationship-building before introducing pricing; deal closed at full margin"]),
            (["Navigates multi-cultural deals where the buyer, the channel partner, and the end user span different commercial cultures",
              "Coaches other sellers on culturally appropriate approach for assigned markets"],
             ["Closed a tri-party deal across UK HQ, GCC channel partner, and Egyptian end customer over six months"]),
            (["Recognised authority on commercial customs in their assigned region",
              "Authors regional sales playbooks; sets norms for the company's approach to that geography"],
             ["Authored the company's MENA sales playbook now used by all sellers in the region"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Technical/Engineering (8 competencies)
    # Clusters: Engineering Practice, Engineering Judgement, Engineering Social
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Systems and Architecture Thinking",
        "role_family": "Technical/Engineering",
        # Differentiated from KF "Manages Complexity" — engineering-specific
        # design judgement at the system boundary level.
        "framework_source": "Korn Ferry LA — 'Manages Complexity' (engineering-design specialisation)",
        "cluster": "Engineering Judgement",
        "definition": (
            "Reasons about software systems at the boundary, component, and "
            "interaction level. Anticipates how design decisions in one component "
            "will constrain or enable others; identifies the load-bearing parts "
            "of a system before they fail."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Reasons about code at the function or file level only",
              "Cannot describe how a request flows through more than one component of the system"],
             ["Asks 'where does this data come from' for systems they have worked in for six months"]),
            (["Describes flows through the immediate components they touch",
              "Notices boundary issues only after they cause a bug"],
             ["Adds a new API endpoint without considering downstream caching behaviour"]),
            (["Designs new features within an existing service with explicit attention to interface contracts and failure modes",
              "Identifies the load-bearing components in their team's systems"],
             ["Designed a new endpoint with documented latency budgets and graceful-degradation behaviour"]),
            (["Designs cross-service features with clear ownership boundaries; anticipates second-order effects of design decisions",
              "Recognises architectural smell (god services, hidden coupling, leaky abstractions) and proposes targeted refactors"],
             ["Proposed a service split that eliminated a recurring cross-team release-coordination bottleneck"]),
            (["Sets architectural direction adopted across the engineering organisation; reasoning is referenced by other architects",
              "Anticipates system constraints that don't yet manifest as problems and pre-empts them"],
             ["Authored the platform's service-decomposition standard, now used in all new system designs"]),
        ],
    },
    {
        "name": "Code Craftsmanship and Quality",
        "role_family": "Technical/Engineering",
        "framework_source": None,
        "cluster": "Engineering Practice",
        "definition": (
            "Writes code that other engineers can read, modify, and extend with "
            "confidence. Treats clarity, testability, and naming as first-order "
            "concerns rather than afterthoughts; leaves the codebase measurably "
            "better than they found it."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Writes code that works for the happy path but is hard for others to read or extend",
              "Tests cover only the success case; edge cases discovered in code review"],
             ["Names variables 'data', 'temp', 'result' in production code that ships"]),
            (["Writes readable code in isolation but adds complexity when integrating with existing structure",
              "Adds tests when prompted in review; tests verify behaviour but not edge cases"],
             ["Adds a new branch to an existing function rather than refactoring it, even when the function is already long"]),
            (["Writes code that reviewers approve without significant rework; tests cover edge and failure cases",
              "Refactors adjacent code opportunistically when the change is local and well-tested"],
             ["Refactored a 200-line function into four named functions while implementing an unrelated feature"]),
            (["Sets local quality norms (naming, structure, test coverage) that other engineers adopt by example",
              "Identifies recurring quality issues in the codebase and drives targeted improvement work"],
             ["Led a quarter-long initiative reducing the team's flaky-test rate from 8% to under 1%"]),
            (["Sets engineering-wide quality standards; codebase areas they own are referenced as exemplars",
              "Quality work they ship measurably reduces downstream incident or rework volume"],
             ["Codebase area they own has a 60% lower incident rate than the org average"]),
        ],
    },
    {
        "name": "Debugging and Root Cause Analysis",
        "role_family": "Technical/Engineering",
        "framework_source": "O*NET Skill 2.B.5.a — Troubleshooting",
        "cluster": "Engineering Practice",
        "definition": (
            "Systematically isolates the source of technical defects by forming "
            "testable hypotheses, gathering evidence from logs and instrumentation, "
            "and reasoning from symptoms to underlying causes rather than patching "
            "surface behaviour."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Uses guess-and-check; applies fixes that mask symptoms",
              "Escalates bugs that span more than one file or service to a senior engineer"],
             ["Reverts a recent change to make a failure go away without understanding why"]),
            (["Reproduces bugs that have a clear deterministic trigger; uses logging and breakpoints to trace failures within a single function",
              "Stops at the first plausible explanation rather than confirming root cause"],
             ["Fixes a null-pointer error by adding a guard, without checking why the value was null"]),
            (["Independently diagnoses defects within a single service or codebase area without escalation",
              "Uses structured methods such as bisection and binary search; regressions in their fixes are caught by their own pre-merge tests rather than reported downstream"],
             ["Localised an intermittent test failure to a race condition using git bisect and added a regression test"]),
            (["Diagnoses cross-system issues spanning multiple services, languages, or layers",
              "Identifies patterns across recurring incidents and addresses the underlying class of problem"],
             ["Traced a recurring latency spike across four microservices to a connection-pool exhaustion pattern"]),
            (["Diagnoses ambiguous production issues under time pressure with limited information",
              "Codifies debugging heuristics and tooling that the broader engineering organisation adopts"],
             ["Authored the team's incident-debugging runbook now referenced across the engineering org"]),
        ],
    },
    {
        "name": "Technical Writing and Documentation",
        "role_family": "Technical/Engineering",
        "framework_source": "O*NET 2.A.1.c — Writing (technical-audience specialisation)",
        "cluster": "Engineering Social",
        "definition": (
            "Produces written technical material — design docs, runbooks, API "
            "references, post-mortems — that other engineers can act on without "
            "follow-up. Distinguishes audience (junior, senior, external) and "
            "adjusts depth, vocabulary, and assumptions accordingly."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Writes documentation only when required; content lags the code",
              "Documents what was done but not why or what alternatives were considered"],
             ["Documentation says 'returns the user' without specifying which user or in what shape"]),
            (["Writes documentation that covers the basics but assumes reader already knows the context",
              "Mixes audiences (internal engineer + external consumer) in a single document"],
             ["API doc explains parameters but omits the error states the caller has to handle"]),
            (["Writes design docs that allow another engineer to implement the proposal without conversation",
              "Distinguishes audiences and structures content accordingly (overview for new joiners, depth for reviewers)"],
             ["Wrote a design doc that reviewers approved in one round with no clarifying questions"]),
            (["Sets documentation patterns adopted by the team (templates, RFC structures, runbook standards)",
              "Documents that ship with their work become reference material used months later"],
             ["Authored the team's design-doc template now used for every quarterly planning cycle"]),
            (["Documentation they author is referenced across the engineering organisation as exemplary",
              "Their writing changes how decisions are made — design discussions reach conclusion faster because the written record is clearer"],
             ["Authored a post-mortem now used in onboarding to teach incident-response standards"]),
        ],
    },
    {
        "name": "Engineering Estimation and Planning",
        "role_family": "Technical/Engineering",
        "framework_source": "O*NET 2.B.3.e — Time Management (engineering-context specialisation)",
        "cluster": "Engineering Practice",
        "definition": (
            "Produces estimates and plans for engineering work that hold up under "
            "execution. Decomposes work into verifiable units, surfaces unknowns "
            "explicitly, and updates estimates as evidence accumulates rather "
            "than defending the original number."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Estimates by gut feel; estimates miss by 2× or more in either direction",
              "Treats estimates as commitments and avoids revising them when reality changes"],
             ["Commits to a two-week task that takes six weeks; never flags the slip until the deadline"]),
            (["Decomposes work into tasks but most tasks are 'fix the thing'-sized",
              "Distinguishes known work from unknowns only when explicitly asked"],
             ["Estimate sheet lists 'investigation' as a single 5-day item with no further breakdown"]),
            (["Decomposes work into verifiable units of ≤2 days; names unknowns and time-boxes investigation",
              "Updates estimates within the sprint when new evidence emerges; team-level forecast is reliable"],
             ["Flagged a tripled scope estimate after two days of investigation, before committing to the sprint"]),
            (["Plans work spanning multiple sprints with realistic dependency mapping and risk reserves",
              "Estimates from this engineer are used in capacity planning without adjustment"],
             ["Quarterly roadmap proposed by this engineer shipped within 10% of original estimate"]),
            (["Sets estimation and planning practices adopted across the wider engineering organisation",
              "Their planning artefacts are used as training material for other engineers"],
             ["Methodology was adopted as the engineering org's standard sprint-planning approach"]),
        ],
    },
    {
        "name": "Code Review and Peer Mentorship",
        "role_family": "Technical/Engineering",
        "framework_source": None,
        "cluster": "Engineering Social",
        "definition": (
            "Reviews other engineers' code so that the codebase improves and the "
            "author learns. Distinguishes blocking from non-blocking feedback, "
            "names the reasoning behind suggestions, and adapts review depth to "
            "the author's experience level and the change's risk."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Reviews focus on style and personal preference; substantive issues missed",
              "Comments are imperative without reasoning ('change this')"],
             ["Approves a PR with a subtle concurrency bug because tests pass"]),
            (["Catches obvious bugs but rarely raises design or maintainability concerns",
              "Treats every comment as blocking; PRs go through many review cycles"],
             ["Blocks a PR for variable naming, ignoring a more significant control-flow issue"]),
            (["Reviews cover correctness, design, and maintainability; comments cite reasoning",
              "Distinguishes blocking from non-blocking feedback explicitly"],
             ["Caught a transaction-isolation bug in review; suggested fix shipped same day"]),
            (["Adapts review depth to author seniority and change risk; novice authors visibly grow",
              "Reviews of their own PRs are also high-signal because they make their reasoning visible to reviewers"],
             ["Junior engineer cited in retrospective: 'three months of their code review changed how I think about state'"]),
            (["Reviews are sought out across the engineering organisation; standards they apply spread by example",
              "Engineers they have mentored have themselves become recognised reviewers"],
             ["Three engineers they mentored over the past two years now lead their own teams"]),
        ],
    },
    {
        "name": "Security and Risk-Aware Engineering",
        "role_family": "Technical/Engineering",
        "framework_source": None,
        "cluster": "Engineering Judgement",
        "definition": (
            "Designs and writes software with explicit attention to security, "
            "data sensitivity, and failure modes. Treats security as a property "
            "of the system rather than a checklist applied at the end; identifies "
            "and addresses risks before they reach production."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Adds authentication only when required by feature requirements",
              "Does not distinguish sensitive from non-sensitive data in logs, errors, or storage"],
             ["Logs full request bodies including passwords to debug an issue"]),
            (["Applies basic security patterns (parameterised queries, password hashing) by convention",
              "Identifies surface security issues but misses deeper ones (authorisation logic, indirect data exposure)"],
             ["Adds input validation but misses an IDOR vulnerability in the same endpoint"]),
            (["Designs features with explicit threat model; sensitive data paths are identified and protected",
              "Considers failure modes (partial writes, retries, network failures) as part of normal design"],
             ["Designed a new payment flow with documented threat model that passed security review without rework"]),
            (["Identifies systemic security and reliability risks across the codebase and drives remediation",
              "Reviews of others' code consistently catch security issues that would otherwise reach production"],
             ["Identified and led remediation of a class of authorisation bugs affecting four endpoints"]),
            (["Sets security and reliability standards adopted across the engineering organisation",
              "Recognised externally (security community, conference talks, published advisories) as a domain authority"],
             ["Authored the company's secure-design review process now mandatory for all new services"]),
        ],
    },
    {
        "name": "Engineering Pragmatism",
        "role_family": "Technical/Engineering",
        "framework_source": None,
        "cluster": "Engineering Judgement",
        "definition": (
            "Makes judgement calls between build vs. buy, ship vs. polish, "
            "refactor vs. rewrite, perfect vs. good-enough. Balances engineering "
            "ideals against time, team capacity, business priority, and the long-"
            "term cost of the decision."
        ),
        "is_leadership": False,
        "is_technical": True,
        "levels": [
            (["Optimises for engineering ideals (clean code, full coverage) regardless of business context",
              "Or — at the other extreme — ships whatever works fastest with no regard for downstream cost"],
             ["Spends three weeks perfecting a internal-only admin tool used by two people"]),
            (["Recognises trade-offs when they're pointed out but does not surface them proactively",
              "Defaults to one mode (always polish, or always ship-fast) regardless of the work"],
             ["Pushes back on every shortcut in code review without distinguishing high-risk from low-risk shortcuts"]),
            (["Names trade-offs explicitly in design discussions; choices match business context",
              "Distinguishes work that needs to be reversible from work that doesn't, and applies different standards"],
             ["Argued successfully for a deliberately temporary script to unblock a customer launch, with planned removal date"]),
            (["Calibrates polish, abstraction, and investment to the specific situation across many decisions per quarter",
              "Helps other engineers see when their default mode doesn't fit the work in front of them"],
             ["Talked a junior engineer out of building a configurable framework for a one-off integration"]),
            (["Their judgement on engineering trade-offs is sought out by leadership for high-stakes decisions",
              "Engineering culture in their orbit visibly shifts toward better trade-off framing"],
             ["Asked by the CTO to weigh in on the build-vs-buy decision for the company's data platform"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: People Management (6 competencies)
    # Clusters: Manager Effectiveness, Team Climate
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "First-Line Performance Coaching",
        "role_family": "People Management",
        # KF LA "Develops Talent" is the named source. Operationalised for
        # daily-cadence first-line context rather than long-horizon career mentorship.
        "framework_source": "Korn Ferry LA — 'Develops Talent' (daily-cadence first-line operationalisation)",
        "cluster": "Manager Effectiveness",
        "definition": (
            "Improves direct reports' in-role performance through frequent, "
            "specific, timely feedback and structured development conversations. "
            "Distinct from annual review or long-horizon career mentorship — "
            "focused on the work in progress this week."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Gives feedback only at formal reviews or when problems have escalated",
              "Feedback uses trait language ('be more proactive', 'show more ownership') rather than naming specific observed events; postpones or skips conversations they expect will be negative"],
             ["Lets a missed deadline pass without comment until the next quarterly review"]),
            (["Holds regular 1:1s but they default to status updates",
              "Timely on positive recognition; delays negative feedback"],
             ["Praises good work in the moment but waits two weeks to raise a recurring quality issue"]),
            (["Conducts coaching conversations that cite specific observed events and their impact, rather than generalisations about the person",
              "Reports show measurable skill growth attributable to coaching"],
             ["Coached a mid-performer through three iterations of a presentation, with visible improvement each round"]),
            (["Tailors coaching style to each report's development stage and motivation",
              "Surfaces underperformance in private 1:1s within two weeks of first observing it; the direct report can describe the conversation specifically in skip-level interviews"],
             ["Helped a senior IC navigate a stalled promotion case by reframing their visible work over one quarter"]),
            (["At least one of their direct reports has been promoted to manager and successfully coaches their own team using methods learned from this leader",
              "Alumni cite this leader as pivotal to their development years later"],
             ["Three former direct reports have been promoted into manager roles in the past two years"]),
        ],
    },
    {
        "name": "Delegation and Workload Calibration",
        "role_family": "People Management",
        # KF LA "Directs Work" is adjacent but focuses on direction-giving;
        # this competency is specifically about calibrated handoff.
        "framework_source": "Korn Ferry LA — 'Directs Work' (calibrated-delegation specialisation)",
        "cluster": "Manager Effectiveness",
        "definition": (
            "Distributes work across the team so that capacity matches load and "
            "each report stretches without overload. Distinguishes what to "
            "delegate from what to retain; transfers ownership clearly so the "
            "report can operate without constant check-in."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Either does the work themselves or hands it off without clear ownership transfer",
              "Workload distribution is uneven; some reports overloaded while others are idle"],
             ["Re-writes a junior's deliverable instead of giving feedback on the draft"]),
            (["Delegates routine work but retains anything important to themselves",
              "Notices workload imbalance only when a report flags it"],
             ["A senior report becomes a bottleneck on every decision because the manager won't delegate"]),
            (["Delegates with explicit outcome, deadline, and check-in cadence; ownership transfer is visible",
              "Calibrates load across the team weekly based on capacity and developmental fit"],
             ["Handed a customer escalation to a mid-level report with clear outcome; report ran it end-to-end without help"]),
            (["Delegates stretch work that grows reports' capability beyond current role; manages risk through targeted check-ins rather than oversight",
              "Team load is visibly balanced over time; no chronic bottlenecks at any single report"],
             ["Promoted a report into a stretch project leading a cross-team initiative; report delivered and was promoted"]),
            (["Delegation pattern is referenced as exemplary; team has higher developmental velocity than peer teams",
              "Coaches other managers on how to calibrate handoff vs. retention"],
             ["Two reports promoted from this manager's team in the past year; both cite stretch assignments as decisive"]),
        ],
    },
    {
        "name": "Hiring and Selection Judgement",
        "role_family": "People Management",
        "framework_source": None,
        "cluster": "Manager Effectiveness",
        "definition": (
            "Makes selection decisions that hold up over time. Distinguishes "
            "evidence of capability from interview performance, calibrates "
            "across candidates with consistent standards, and resists pressure "
            "to lower the bar when filling the role is urgent."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Hires from gut feel after the interview loop; cannot articulate specific evidence",
              "Lowers standards when hiring pressure is high"],
             ["Hires a candidate because 'the interview felt great' without revisiting the take-home"]),
            (["Uses structured interview rubric but evidence-gathering during interviews is uneven",
              "Distinguishes strong from weak candidates but cannot reliably distinguish strong from very strong"],
             ["Rates two candidates the same on 'communication' for very different actual behaviours"]),
            (["Gathers specific behavioural evidence during interviews; calibration with other interviewers is consistent",
              "Selection decisions hold up: most hires perform at or above the level they were hired into within 12 months"],
             ["80%+ of their hires over the past two years rated 'meets or exceeds' at 12-month review"]),
            (["Designs interview loops and rubrics that other hiring managers adopt",
              "Calibrates across candidates with very different backgrounds (industry, geography, level) using consistent capability evidence"],
             ["Designed the rubric that lifted the team's 12-month new-hire success rate from 65% to 85%"]),
            (["Sets selection standards across the wider organisation; their hires are referenced as exemplars",
              "Recognised externally for selection methodology (publications, speaking, consulting)"],
             ["Authored the company's interviewing standards now used across all engineering hiring"]),
        ],
    },
    {
        "name": "Difficult Conversations",
        "role_family": "People Management",
        # KF "Manages Conflict" covers interpersonal disputes between others;
        # this competency is specifically about the manager-as-deliverer of
        # private, hard feedback.
        "framework_source": "Korn Ferry LA — 'Courage' + 'Manages Conflict' (private-feedback specialisation)",
        "cluster": "Manager Effectiveness",
        "definition": (
            "Initiates and conducts hard private conversations — underperformance, "
            "promotion denials, role changes, behavioural concerns — directly, "
            "respectfully, and in time for the recipient to respond. Does not "
            "outsource these conversations or soften them into ambiguity."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Avoids hard conversations; problems are addressed through process (PIPs, exit) rather than dialogue",
              "Feedback in hard conversations is softened to the point of being unclear"],
             ["A report on a performance plan reports being 'surprised' because no prior conversation set context"]),
            (["Initiates hard conversations only with HR involvement or after problems have escalated",
              "Delivers difficult feedback but accompanies it with so much qualification that the message is unclear"],
             ["Tells a report 'there's some feedback that maybe you could think about working on' without specifics"]),
            (["Initiates hard conversations within two weeks of identifying the issue; message is direct and specific",
              "Recipient leaves the conversation knowing exactly what is being asked of them and why"],
             ["Held a clear underperformance conversation; report later cited it as the turning point in their recovery"]),
            (["Conducts difficult conversations across power differentials (with reports, peers, senior stakeholders)",
              "Trust survives the conversation; recipient and manager continue to work effectively afterwards"],
             ["Denied a promotion case to a strong senior IC; relationship survived and the IC was later promoted on stronger evidence"]),
            (["Coaches other managers through their own difficult conversations; methodology adopted across the management chain",
              "Recognised as the person other managers go to for advice before high-stakes conversations"],
             ["Other managers across three different teams consult them before delivering hard messages"]),
        ],
    },
    {
        "name": "Psychological Safety and Team Climate",
        "role_family": "People Management",
        # Edmondson (1999) "Psychological Safety and Learning Behavior in Work
        # Teams" is the academic source. No direct equivalent in KF Leadership
        # Architect.
        "framework_source": "Edmondson (1999) — Psychological Safety construct",
        "cluster": "Team Climate",
        "definition": (
            "Creates the conditions for team members to raise concerns, "
            "disagree, ask questions, and admit mistakes without fear of "
            "punishment or embarrassment. Treats safety as a property of the "
            "team's habits, not a slogan."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Reacts negatively (visibly frustrated, dismissive) to mistakes, dissent, or questions",
              "Team members rehearse messages with peers before raising them with this manager"],
             ["A report admits a mistake; manager responds 'how did this happen' in a tone that ends the conversation"]),
            (["Says the right things about safety but reacts inconsistently when tested",
              "Team raises easy concerns but withholds harder ones"],
             ["Manager declares 'no bad ideas' in a brainstorm; visibly winces when one is suggested"]),
            (["Team members raise concerns, disagree, and admit mistakes in meetings without visible cost",
              "Manager responds to bad news with curiosity rather than blame"],
             ["A report flagged a process failure they were responsible for; conversation focused on systemic fix, not the individual"]),
            (["Team's safety climate is visibly stronger than peer teams; reports speak up early on problems",
              "Behaviour is consistent under pressure (deadlines, incidents, senior stakeholder presence)"],
             ["During a public production incident, three engineers volunteered information about what they'd done; root cause found within 30 minutes"]),
            (["Models and teaches safety practices across the wider organisation; other managers' teams adopt them",
              "Safety climate they create persists after they move on — successor teams maintain the pattern"],
             ["Two years after this manager moved roles, the team they previously led still scores top quartile on safety surveys"]),
        ],
    },
    {
        "name": "Leading Without Formal Authority",
        "role_family": "People Management",
        "framework_source": None,
        "cluster": "Manager Effectiveness",
        "definition": (
            "Drives outcomes through people who do not report to them — peer "
            "teams, cross-functional stakeholders, external partners. Uses "
            "credibility, framing, and relationship rather than escalation or "
            "positional power."
        ),
        "is_leadership": True,
        "is_technical": False,
        "levels": [
            (["Escalates to senior stakeholders whenever a peer team blocks progress",
              "Cannot describe what would motivate a peer team to prioritise their request"],
             ["Files an executive-level escalation in week one of a cross-team disagreement"]),
            (["Negotiates with peer teams transactionally — favour-for-favour, not shared outcome",
              "Builds tactical relationships but loses them when the immediate project ends"],
             ["Asks a peer team for a favour during a deadline; relationship goes cold afterwards"]),
            (["Frames cross-team work in terms of shared outcomes; peer teams agree without escalation",
              "Maintains working relationships across the organisation that persist beyond any specific project"],
             ["Led a multi-team migration where each team's leadership saw their own goals served by the shared plan"]),
            (["Mobilises senior stakeholders and external partners around shared outcomes",
              "Sought out by peer teams to weigh in on contentious cross-organisation decisions"],
             ["Aligned three competing product organisations around a shared platform roadmap over six months"]),
            (["Drives organisation-wide change without ever having direct authority over the affected groups",
              "Cross-functional change patterns they develop are studied and adopted by other organisations"],
             ["Led the company's adoption of a new engineering standard across nine independent business units"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Customer Service and Success (6 competencies)
    # Clusters: Service Interaction, Customer Lifecycle, Customer Intelligence
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Service Empathy and Active Care",
        "role_family": "Customer Service and Success",
        "framework_source": "O*NET 2.B.1.f — Service Orientation (empathy-anchored operationalisation)",
        "cluster": "Service Interaction",
        "definition": (
            "Recognises and responds to the emotional state of the customer in "
            "service interactions. Distinguishes the surface complaint from the "
            "underlying concern; communicates care without compromising on "
            "operational reality."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Responds to complaints by quoting policy without acknowledging the customer's experience",
              "Cannot distinguish a frustrated customer from a hostile one"],
             ["Customer escalates because the agent kept restating the return policy without engaging with their actual issue"]),
            (["Acknowledges customer emotion with scripted phrases ('I understand your frustration') but doesn't adapt approach",
              "Empathy fades when the customer is wrong or unreasonable"],
             ["Uses 'I understand' six times in one call but never names what specifically the customer is upset about"]),
            (["Names the customer's underlying concern in their own words; adapts tone and approach to the emotional context",
              "Maintains care even when the customer is mistaken — addresses the emotion before correcting the fact"],
             ["Customer wrote a follow-up note thanking the agent specifically for 'listening properly' even though the request was denied"]),
            (["Builds genuine rapport in service interactions; customers ask for them by name",
              "Distinguishes systemic empathy patterns: which customer segments need which kinds of care, and matches accordingly"],
             ["Customer cohort that this agent handles has higher CSAT than peers' cohorts by 15+ points"]),
            (["Coaches other agents on empathy-without-policy-erosion; methodology adopted across the service organisation",
              "Customer experience patterns they develop influence service strategy at the company level"],
             ["Authored the company's escalation-empathy guide now used in all CS training"]),
        ],
    },
    {
        "name": "Service Recovery and Complaint Resolution",
        "role_family": "Customer Service and Success",
        "framework_source": None,
        "cluster": "Service Interaction",
        "definition": (
            "Resolves customer complaints in a way that restores trust and "
            "retains the relationship. Distinguishes the recoverable from the "
            "lost; matches remedy to actual harm; closes the loop so the "
            "customer can see the resolution."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats every complaint identically; remedies are policy-driven rather than situation-fit",
              "Closes tickets quickly without verifying the customer is actually satisfied"],
             ["Closes a complaint with a goodwill credit; customer cancels two weeks later"]),
            (["Distinguishes minor from major complaints but applies templated remedies to both",
              "Verifies satisfaction on positive resolutions but not on contentious ones"],
             ["Refunds a customer; doesn't check whether the underlying issue was actually resolved"]),
            (["Diagnoses the customer's actual loss (financial, time, trust) and matches remedy to it",
              "Closes the loop by confirming with the customer that the resolution addressed their concern"],
             ["A customer escalation was resolved with a partial refund + scheduled follow-up; customer renewed and expanded"]),
            (["Recovers customers on the verge of leaving; conversion of at-risk to retained accounts is measurably higher than peers",
              "Identifies patterns across complaints and surfaces them to product or operations for systemic fix"],
             ["Personally retained $400K of at-risk ARR over the past year through individual recoveries"]),
            (["Sets service-recovery standards across the wider customer organisation",
              "Recovery work measurably reduces complaint volume by influencing upstream product or process changes"],
             ["Surfaced a billing-system bug that, once fixed, eliminated 30% of inbound complaints"]),
        ],
    },
    {
        "name": "De-Escalation Under Hostility",
        "role_family": "Customer Service and Success",
        "framework_source": None,
        "cluster": "Service Interaction",
        "definition": (
            "Maintains composure and direction when customers are angry, "
            "abusive, or threatening. Reduces emotional temperature without "
            "capitulating; protects own wellbeing and the company's position "
            "while keeping the customer in dialogue."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Mirrors customer hostility (defensive, raised voice) or shuts down entirely",
              "Concedes commercial terms to make the conversation end"],
             ["Hangs up on a customer or agrees to a refund well beyond entitlement to end the call"]),
            (["Maintains professional tone but is visibly drained after hostile interactions",
              "De-escalation works on shouting customers but not on more skilled aggressors"],
             ["Handles an irate customer well but cannot manage a calm-but-manipulative one"]),
            (["Reduces customer hostility within the interaction through specific techniques (naming, slowing, refocusing)",
              "Maintains the company's position on policy or commercials while keeping the customer in dialogue"],
             ["A customer who opened the call demanding to 'speak to your CEO' ended the call having accepted a non-cash resolution"]),
            (["De-escalates situations involving threats (legal, social media, physical) with composure",
              "Coaches other agents on de-escalation techniques in real time"],
             ["Handled a customer's public-channel attack; converted to private resolution and a positive follow-up review"]),
            (["Sets de-escalation training adopted across the organisation",
              "Recognised externally for de-escalation methodology (industry talks, training contributions)"],
             ["Methodology adopted by the company's contact centre training programme; new-hire de-escalation scores improved by 25%"]),
        ],
    },
    {
        "name": "Customer Onboarding and Adoption",
        "role_family": "Customer Service and Success",
        "framework_source": None,
        "cluster": "Customer Lifecycle",
        "definition": (
            "Drives new customers from contract signature to active, "
            "successful product use. Identifies the customer's success "
            "criteria, sequences enablement against them, and surfaces "
            "obstacles before they become churn risks."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Runs onboarding from a fixed checklist regardless of customer context",
              "Hands off to ongoing CS only when the checklist is complete, not when the customer is actually adopting"],
             ["Marks an account as 'onboarded' when the kickoff call is done, despite zero product usage"]),
            (["Adapts onboarding pace to customer urgency but not to customer success criteria",
              "Identifies non-adoption only when it becomes a renewal risk"],
             ["Onboards an account in four weeks; usage flat-lines in week six, no intervention until renewal conversation"]),
            (["Defines explicit customer success criteria at the start; sequences enablement against them",
              "Tracks adoption signals weekly and intervenes proactively when they trail expectation"],
             ["Identified low feature adoption in week three; ran a targeted enablement session; usage hit target by week six"]),
            (["Customises onboarding programs for accounts with non-standard success criteria (enterprise, multi-region, complex use case)",
              "Their onboarded accounts have measurably higher 12-month retention than peers' onboarded accounts"],
             ["Onboarded portfolio retention at 95% vs. team average of 84%"]),
            (["Sets onboarding standards adopted across the wider CS organisation",
              "Onboarding artefacts they develop (playbooks, kickoff structures) become company-wide methodology"],
             ["Authored the enterprise onboarding methodology now used for all accounts over $500K ARR"]),
        ],
    },
    {
        "name": "Account Health Monitoring",
        "role_family": "Customer Service and Success",
        "framework_source": None,
        "cluster": "Customer Lifecycle",
        "definition": (
            "Maintains current, evidence-based assessment of each account's "
            "renewal and expansion risk. Synthesises usage, sentiment, "
            "executive engagement, and external signals into a coherent view; "
            "acts on weakening signals before they become churn."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats accounts as healthy unless the customer escalates",
              "Cannot describe the current health of a named account without checking the CRM live"],
             ["Surprised by a churn notice from an account flagged 'green' two days earlier"]),
            (["Tracks usage as the primary health signal; misses qualitative signals (sentiment, sponsor changes)",
              "Identifies declining accounts but two to three months later than the signals were available"],
             ["Notices a sponsor has left the customer org only when their successor opens the renewal conversation"]),
            (["Synthesises usage, sentiment, executive engagement, and external signals into a current health score per account",
              "Acts on weakening signals within two weeks of detection"],
             ["Detected a sponsor exit through LinkedIn; engaged the successor within five days; account renewed"]),
            (["Identifies account-level risk patterns invisible to standard health-score systems",
              "Renewal forecast accuracy is measurably higher than peers'"],
             ["Renewal forecast accuracy of 92% over the past year vs. team average of 78%"]),
            (["Health-monitoring methodology they develop is adopted across the wider CS organisation",
              "External recognition as a domain authority on customer health analytics"],
             ["Authored the company's customer health framework now used to drive all renewal forecasts"]),
        ],
    },
    {
        "name": "Voice-of-Customer Synthesis",
        "role_family": "Customer Service and Success",
        "framework_source": None,
        "cluster": "Customer Intelligence",
        "definition": (
            "Translates customer interactions — calls, tickets, feedback, "
            "usage patterns — into actionable insight for product, marketing, "
            "and leadership. Distinguishes signal from noise; resists the "
            "loudest-customer bias; quantifies where possible."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Reports customer feedback as anecdotes from recent calls",
              "Cannot quantify how widespread a reported issue is"],
             ["Says 'customers are unhappy about X' citing two specific accounts, with no broader evidence"]),
            (["Aggregates feedback by theme but doesn't distinguish frequency from importance",
              "Surfaces the loudest customers' issues; misses the quiet majority's"],
             ["Reports a feature gap raised by three loud accounts; misses that 30% of usage data shows the same gap"]),
            (["Synthesises customer interactions into themed insights with frequency and impact estimates",
              "Distinguishes one-off complaints from systemic issues; quantifies where the data allows"],
             ["Surfaced a workflow gap with both qualitative quotes and quantitative usage evidence; product shipped a fix within a quarter"]),
            (["Insights they produce shape product roadmap, marketing positioning, or executive decisions",
              "Bridges customer reality with internal strategy in language each side recognises"],
             ["VOC report driven by this person caused a product strategy shift now generating measurable revenue growth"]),
            (["VOC methodology they develop is adopted across the organisation; outputs are referenced at board level",
              "External recognition (industry talks, publications) as a domain authority on customer insight"],
             ["Quarterly VOC report is now standard input to the company's annual product planning cycle"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Operations and Project Management (7 competencies)
    # Clusters: Project Discipline, Operational Discipline, External Coordination
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Project Scoping and Chartering",
        "role_family": "Operations and Project Management",
        "framework_source": "PMI PMBOK — Project Integration / Scope Management",
        "cluster": "Project Discipline",
        "definition": (
            "Defines what a project is and is not. Establishes objectives, "
            "success criteria, in-scope and out-of-scope boundaries, "
            "stakeholders, and constraints — in writing, in time for them to "
            "shape execution rather than rationalise outcomes."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Starts execution without written scope or success criteria",
              "Boundaries (what's in, what's out) are negotiated mid-project when conflict emerges"],
             ["Project is described in three different ways by three different stakeholders six weeks in"]),
            (["Documents objectives and deliverables but not constraints or out-of-scope items",
              "Stakeholder list is incomplete; surprise stakeholders surface mid-project"],
             ["Discovers in week eight that finance has approval rights nobody asked them about in week one"]),
            (["Produces a complete charter (objectives, success criteria, in/out of scope, stakeholders, constraints, assumptions) before execution begins",
              "Charter is signed off by stakeholders and referenced during the project, not just at kickoff"],
             ["Scope dispute in week ten was resolved in fifteen minutes by referring to the signed charter"]),
            (["Charters complex multi-team or multi-phase projects with explicit dependency, risk, and contingency framing",
              "Charter discipline they apply prevents predictable categories of mid-project failure"],
             ["Chartered a year-long platform migration that finished within original scope and timeline"]),
            (["Charter methodology they develop is adopted as organisational standard",
              "Other PMs reference their chartering as a discipline benchmark"],
             ["Authored the PM organisation's chartering template now mandatory for all projects over £100K"]),
        ],
    },
    {
        "name": "Schedule and Milestone Management",
        "role_family": "Operations and Project Management",
        "framework_source": "PMI PMBOK — Schedule Management",
        "cluster": "Project Discipline",
        "definition": (
            "Builds and maintains project schedules that reflect reality. "
            "Distinguishes the critical path from parallel work; updates "
            "estimates as evidence accumulates; surfaces slippage early in "
            "specific commercial or business terms."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Builds a schedule once at kickoff; updates it only when a milestone is obviously missed",
              "Cannot identify the critical path or distinguish it from other work"],
             ["Reports project is 'on track' two days before missing a major milestone"]),
            (["Updates the schedule weekly but does not adjust the critical path when underlying tasks slip",
              "Identifies slippage after it has occurred, not before"],
             ["Flags a missed milestone the day it slips; downstream work is already affected"]),
            (["Maintains a critical-path view; reorients the schedule when underlying tasks shift",
              "Identifies emerging slippage at least two weeks before it lands"],
             ["Flagged an at-risk milestone four weeks ahead; rescoping kept the overall project on plan"]),
            (["Manages schedules across multi-team, multi-quarter programs with realistic dependency and float modelling",
              "Schedule changes they propose are accepted by stakeholders because the reasoning is transparent and the evidence cited"],
             ["Rescheduled a £2M program twice over its lifecycle; both rescopes accepted without escalation"]),
            (["Schedule discipline they apply becomes referenced standard across the program-management organisation",
              "Their published estimates are used by leadership in commercial commitments to customers"],
             ["Sales team uses their delivery schedule directly in customer commercial commitments"]),
        ],
    },
    {
        "name": "Risk and Issue Management",
        "role_family": "Operations and Project Management",
        "framework_source": "PMI PMBOK — Risk Management",
        "cluster": "Project Discipline",
        "definition": (
            "Identifies what could go wrong before it does; tracks live issues "
            "until they close; distinguishes risk (probability × impact, "
            "actionable) from worry (unbounded). Maintains a register that "
            "stakeholders trust as a current view rather than a checklist "
            "artefact."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Maintains a risk register because process requires it; entries are vague and stale",
              "Treats risks and issues identically; no probability/impact estimation"],
             ["Risk register lists 'team capacity' as a risk for six months with no probability or mitigation"]),
            (["Distinguishes risk from issue but probability/impact ratings are guesswork",
              "Surfaces risks at scheduled review points only, not as they emerge"],
             ["Mentions a new risk in the monthly steering committee, three weeks after first detecting it"]),
            (["Risk register reflects current reality; entries have probability, impact, owner, mitigation, and review date",
              "Surfaces emerging risks within days of detection; closes them when no longer relevant"],
             ["Closed a risk register entry within one day of confirmation that the mitigation had been put in place"]),
            (["Anticipates risk categories the team has not yet considered; runs structured pre-mortems on major decisions",
              "Risk management style is cited by stakeholders as a reason they trust the project"],
             ["Ran a pre-mortem that surfaced three risks; all three would have hit if not pre-empted"]),
            (["Risk management methodology they develop is adopted as organisational standard",
              "Recognised internally as the person to consult before high-stakes go/no-go decisions"],
             ["CFO requests their pre-mortem input on all capital projects over £5M"]),
        ],
    },
    {
        "name": "Process Improvement (Lean / Kaizen)",
        "role_family": "Operations and Project Management",
        "framework_source": "Lean / Toyota Production System — Kaizen practice",
        "cluster": "Operational Discipline",
        "definition": (
            "Identifies waste, friction, and rework in operational processes; "
            "designs targeted improvements; measures impact. Distinguishes "
            "process problems from people problems; resists optimisation "
            "theatre."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Notices process inefficiency but does not attempt to address it",
              "Cannot describe a process in terms of inputs, outputs, and waste"],
             ["Tolerates a manual reconciliation step that takes four hours every week for two years"]),
            (["Identifies process improvements but proposes solutions before diagnosing root cause",
              "Improvements ship but impact is not measured"],
             ["Replaces a manual spreadsheet with a different manual spreadsheet; weekly hours are unchanged"]),
            (["Maps processes in terms of value-add vs. non-value-add steps; targets improvements with measurable impact",
              "Measures process metrics before and after; verifies improvement is real and durable"],
             ["Reduced month-end close from 9 days to 5 by eliminating one reconciliation step; sustained over four quarters"]),
            (["Designs improvements across multi-team or multi-system processes; impact compounds over time",
              "Distinguishes process root causes from people performance; addresses each appropriately"],
             ["Led a quarter-long improvement reducing customer-onboarding cycle time from 6 weeks to 2 weeks"]),
            (["Process improvement methodology they develop is adopted across the wider operational organisation",
              "Recognised internally as the expert on operational excellence"],
             ["Authored the company's continuous-improvement playbook now used by every operational team"]),
        ],
    },
    {
        "name": "Vendor and Contractor Management",
        "role_family": "Operations and Project Management",
        "framework_source": None,
        "cluster": "External Coordination",
        "definition": (
            "Selects, contracts, and manages external suppliers and contractors "
            "to deliver against requirements. Distinguishes vendor capability "
            "from vendor sales; structures contracts to align incentives; "
            "monitors performance and intervenes when reality drifts from "
            "expectation."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Selects vendors based on initial pitch or existing relationship; no structured evaluation",
              "Contracts are signed without explicit performance criteria or exit mechanisms"],
             ["Hires a contractor who pitches well; quality issues surface in week three with no contractual recourse"]),
            (["Runs structured selection but evaluation criteria are heavily weighted on price",
              "Manages vendors reactively — checks in when something is obviously wrong"],
             ["Selects the cheapest vendor on a complex project; quality issues require a full rework"]),
            (["Evaluates vendors on capability, fit, and total cost (not just unit price); structures contracts with performance criteria",
              "Manages vendor performance proactively against contracted criteria"],
             ["Caught a vendor's quality degradation in month two via routine review; corrected before downstream impact"]),
            (["Manages portfolios of vendors with differentiated approaches by criticality and capability fit",
              "Vendor relationships they build outlast individual contracts; vendors invest in the relationship"],
             ["Renegotiated three vendor contracts simultaneously, achieving 18% cost reduction without quality impact"]),
            (["Vendor management methodology they develop is adopted across the wider procurement organisation",
              "Vendors cite this person by name as a reason they invest in the relationship beyond contractual minimum"],
             ["Authored the company's vendor scorecard now used to evaluate all suppliers over £100K annual spend"]),
        ],
    },
    {
        "name": "Operational Metrics and Reporting",
        "role_family": "Operations and Project Management",
        "framework_source": None,
        "cluster": "Operational Discipline",
        "definition": (
            "Designs and produces operational reporting that drives action. "
            "Distinguishes vanity metrics from actionable ones; surfaces "
            "leading indicators alongside lagging; presents data in formats "
            "that lead to decisions rather than further questions."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Reports volume of activity (counts, completion rates) without context or comparison",
              "Reports describe what happened; do not suggest what to do about it"],
             ["Weekly report lists 'tickets closed: 412' with no comparison to target, trend, or quality"]),
            (["Reports include comparison to target but not to trend or to similar segments",
              "Distinguishes leading from lagging indicators inconsistently"],
             ["Reports week-over-week numbers without quarter-trend or year-over-year context"]),
            (["Reports combine lagging outcomes, leading indicators, and segment comparisons; format leads to clear decisions",
              "Surfaces anomalies and their likely causes proactively, not after stakeholders ask"],
             ["Quarterly report led to a re-prioritisation decision by the executive team within the same meeting"]),
            (["Designs operational reporting adopted across multiple teams; metrics become the shared language for decision-making",
              "Reports they author measurably reduce the time-to-decision in operational reviews"],
             ["Rebuilt the operations review pack; meetings reduced from 90 minutes to 45 with the same decisions made"]),
            (["Reporting methodology they develop is referenced as organisational standard",
              "Recognised externally for operational reporting practice (publications, conference talks)"],
             ["Their dashboard architecture was adopted as the company's operational standard across three business units"]),
        ],
    },
    {
        "name": "Quality Assurance Discipline",
        "role_family": "Operations and Project Management",
        "framework_source": "ISO 9001 — Quality Management System principles",
        "cluster": "Operational Discipline",
        "definition": (
            "Maintains the quality of operational outputs through structured "
            "verification rather than hope. Designs control points, defines "
            "what 'good' looks like, and intervenes when output drifts. "
            "Distinguishes inspection from prevention; invests in the latter."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Quality issues are caught by customers or downstream functions, not by internal review",
              "Cannot describe what 'good' looks like for the team's output in specific terms"],
             ["Customer complaint surfaces a quality issue the team didn't notice"]),
            (["Reviews outputs but inspection is sampling-based and inconsistent",
              "Quality criteria exist but are not visibly applied to the work"],
             ["Reviewer signs off on a deliverable that fails customer review the next day"]),
            (["Defines explicit quality criteria; applies them consistently; quality issues are caught internally rather than externally",
              "Distinguishes prevention (process design) from inspection (catching defects); invests in the former"],
             ["Customer-facing defect rate dropped from 4% to under 1% after introducing a structured review checklist"]),
            (["Designs quality systems across multi-team operations; quality becomes a property of the process, not individual diligence",
              "Quality metrics they own are consistently among the best in the organisation"],
             ["Team's defect rate has been top-quartile across the wider operations organisation for six consecutive quarters"]),
            (["Quality methodology they develop is adopted as organisational standard",
              "Recognised externally for quality practice (industry awards, publications)"],
             ["Authored the company's operational quality standard now mandatory across all customer-facing functions"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Human Resources and People Operations (8 competencies)
    # Clusters: Talent Lifecycle, Workforce Strategy, HR Governance
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Talent Acquisition and Selection",
        "role_family": "Human Resources and People Operations",
        "framework_source": "SHRM BoCK — Talent Acquisition functional area",
        "cluster": "Talent Lifecycle",
        "definition": (
            "Designs and operates hiring processes that produce strong, "
            "calibrated hires within reasonable time and cost. Distinguishes "
            "process effectiveness (right person hired) from process "
            "efficiency (fast hire); optimises both with the right priority "
            "for the role."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Operates a single template hiring process regardless of role criticality or scarcity",
              "Cannot articulate why some hires take longer than others except 'market'"],
             ["Treats a CFO search and a frontline customer-support hire as the same process"]),
            (["Adapts process by seniority but not by role criticality or candidate scarcity",
              "Quality of hire is reviewed at six months but rarely changes future process design"],
             ["Six-month review shows a problematic hiring pattern; same process is used for the next cohort"]),
            (["Distinguishes role criticality and candidate scarcity; designs hiring processes accordingly",
              "Quality of hire is measured and feeds back into process design over time"],
             ["Restructured engineering hiring after quality data showed two interview stages were not predictive"]),
            (["Designs hiring strategies across the full talent funnel — sourcing, selection, offer, onboarding feedback loops",
              "Hiring outcomes (quality, time, cost) measurably improve year over year under their stewardship"],
             ["Reduced time-to-hire by 30% while lifting 12-month retention from 78% to 89%"]),
            (["Hiring methodology they develop is referenced as exemplary across the wider HR function",
              "Their work shapes hiring norms beyond their own organisation (publications, industry talks)"],
             ["Authored the company's hiring playbook now used across all business units"]),
        ],
    },
    {
        "name": "Onboarding and Integration Design",
        "role_family": "Human Resources and People Operations",
        "framework_source": "SHRM BoCK — Employee Engagement & Retention",
        "cluster": "Talent Lifecycle",
        "definition": (
            "Designs the experience new hires have from offer-accept to "
            "fully-productive. Distinguishes orientation (paperwork, tools) "
            "from integration (relationships, role mastery, culture); "
            "instruments both so that new-hire success can be measured and "
            "improved."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Onboarding is a checklist of administrative tasks completed in week one",
              "New hires reach productivity at unpredictable pace; cannot explain why"],
             ["Three engineers hired the same week reach productivity at three very different points; nobody knows why"]),
            (["Distinguishes orientation from integration but integration is unstructured",
              "Measures new-hire satisfaction but not new-hire productivity"],
             ["Sends a 30-day satisfaction survey; doesn't track whether the new hire is actually contributing"]),
            (["Designs onboarding with explicit week-by-week milestones for both orientation and integration",
              "Measures new-hire productivity (output, ramp time) alongside satisfaction; uses both to improve the program"],
             ["New-hire 90-day productivity improved 25% after restructuring the first-month plan"]),
            (["Designs differentiated onboarding for different role categories or hire profiles (lateral senior vs. graduate)",
              "Onboarding outcomes (ramp time, 12-month retention) measurably improve under their stewardship"],
             ["12-month retention of new hires went from 80% to 92% over two years of onboarding redesign"]),
            (["Onboarding methodology they develop is adopted across the wider HR function",
              "Recognised externally for new-hire integration practice"],
             ["Methodology was the basis for a conference talk and is now used at three other companies"]),
        ],
    },
    {
        "name": "Compensation and Reward Strategy",
        "role_family": "Human Resources and People Operations",
        "framework_source": "WorldatWork — Total Rewards framework",
        "cluster": "Workforce Strategy",
        "definition": (
            "Designs pay structures, incentive plans, and benefits that "
            "support business strategy while staying defensible internally "
            "and competitive externally. Distinguishes pay-as-cost from "
            "pay-as-investment; uses market data without being captured by it."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Sets pay against market median by job title with no further analysis",
              "Cannot explain why two people in the same role are paid differently except 'history'"],
             ["A senior engineer is paid 30% less than a peer hired six months later because nobody checked at the time"]),
            (["Applies market data to set ranges but doesn't connect compensation to business strategy",
              "Identifies pay inequity but addresses it transactionally rather than systemically"],
             ["Fixes individual pay inequity cases as they're raised; pattern repeats every quarter"]),
            (["Builds pay structures with explicit linkage to business strategy and role criticality",
              "Identifies and addresses pay inequity systemically; defensible to internal challenge and external audit"],
             ["Designed a band structure that resolved historic pay inequity across 40 roles; held up under legal review"]),
            (["Designs reward strategies across the full mix (cash, equity, benefits, recognition) with clear strategic rationale",
              "Compensation outcomes (attraction, retention, equity) measurably improve under their stewardship"],
             ["Designed a sales compensation overhaul that lifted top-quartile rep retention from 60% to 85%"]),
            (["Reward methodology they develop is adopted across the wider HR function",
              "Recognised externally for compensation practice (industry talks, publications, advisory roles)"],
             ["Co-authored a compensation benchmark study now referenced by other firms in the industry"]),
        ],
    },
    {
        "name": "Employee Relations and Investigations",
        "role_family": "Human Resources and People Operations",
        "framework_source": "SHRM BoCK — Employee & Labor Relations",
        "cluster": "HR Governance",
        "definition": (
            "Handles concerns, grievances, and complaints with procedural "
            "rigour and human judgement. Conducts investigations that are "
            "fair to all parties, legally defensible, and produce findings "
            "leadership can act on. Maintains confidentiality without "
            "stonewalling."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Handles concerns informally; documentation is inconsistent",
              "Cannot articulate the difference between a complaint, a grievance, and a regulated investigation"],
             ["A harassment complaint is handled with a 'quiet word'; reaches a tribunal six months later"]),
            (["Applies process for formal complaints but informal concerns are handled inconsistently",
              "Investigations reach conclusions but the procedural trail is thin"],
             ["Investigation concludes with a verbal report; no written summary, no documented evidence trail"]),
            (["Investigations are procedurally rigorous; findings are documented, defensible, and acted upon",
              "Confidentiality is maintained without leaving parties stonewalled"],
             ["Investigation produced a clear written finding; both complainant and respondent reported the process felt fair"]),
            (["Handles high-complexity employee relations cases (multiple parties, cross-jurisdiction, executive-level)",
              "Cases they investigate hold up under external legal challenge"],
             ["Investigated and resolved a cross-jurisdiction case involving four parties; resolution held up under external counsel review"]),
            (["Employee relations practice they develop is adopted across the wider HR function",
              "Recognised externally as a domain authority (legal publications, advisory work)"],
             ["Authored the company's investigations protocol now used across all jurisdictions; cited by external counsel as best practice"]),
        ],
    },
    {
        "name": "Workforce Planning and Analytics",
        "role_family": "Human Resources and People Operations",
        "framework_source": "SHRM BoCK — HR Strategy & Planning",
        "cluster": "Workforce Strategy",
        "definition": (
            "Forecasts and shapes the size, shape, and capability of the "
            "workforce to match business strategy. Uses data — attrition, "
            "demographics, skills inventory, demand forecasts — to anticipate "
            "gaps before they constrain the business."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Workforce planning is annual headcount budgeting; no skill or capability dimension",
              "Cannot describe the current workforce in terms of skill mix or capability gaps"],
             ["Annual plan asks for 10% more headcount; cannot explain what capability the new headcount should bring"]),
            (["Tracks headcount and attrition but does not connect them to capability or demand",
              "Identifies workforce gaps reactively, when business teams escalate"],
             ["Discovers a critical skill shortage when a director raises it; six months of recruitment lag follows"]),
            (["Forecasts workforce size and capability against business demand on a rolling basis",
              "Identifies emerging gaps two to four quarters ahead of need; recruitment and development plans align accordingly"],
             ["Flagged an emerging data-engineering capability gap; targeted hiring and reskilling closed it before it bit the business"]),
            (["Workforce strategies they design materially shape business strategy options",
              "Analytics they produce are referenced by business leaders in their own planning"],
             ["Workforce analysis was the basis for the company's decision to open a new technology hub"]),
            (["Workforce planning methodology they develop is referenced across the wider HR profession",
              "Recognised externally (industry publications, conference talks) as a domain authority"],
             ["Their workforce planning model was adopted as the basis for a published industry framework"]),
        ],
    },
    {
        "name": "Learning and Development Design",
        "role_family": "Human Resources and People Operations",
        "framework_source": "ATD Talent Development Capability Model — Building Personal Capability",
        "cluster": "Talent Lifecycle",
        "definition": (
            "Designs learning experiences — programmes, curricula, on-the-job "
            "structures — that change what people can do. Distinguishes "
            "training delivery from behaviour change; measures impact against "
            "the latter; resists training as theatre."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Designs learning by topic ('we need a leadership course'); content is generic",
              "Measures learning by attendance or satisfaction; cannot say whether behaviour changed"],
             ["Delivers a half-day workshop; reports 92% satisfaction; cannot link to any business outcome"]),
            (["Designs learning with clear objectives but objectives are knowledge-level, not behaviour-level",
              "Measures learning effectiveness by post-course assessment, not on-job application"],
             ["Post-course test shows 85% mastery; six weeks later, no observable change in behaviour on the job"]),
            (["Designs learning with behaviour-change objectives; uses on-the-job application as the measure of success",
              "Distinguishes learning needs from performance needs; doesn't design training where coaching or process change is the real answer"],
             ["Redesigned the manager-onboarding programme around behaviour metrics; observable management practice improved within one quarter"]),
            (["Designs learning systems (not just programmes); curricula compound across roles and levels",
              "Learning impact is measurably linked to business outcomes (retention, productivity, capability indices)"],
             ["Built a leadership development curriculum that lifted internal-promotion rates from 35% to 55% of management hires"]),
            (["L&D methodology they develop is adopted across the wider HR function",
              "Recognised externally for development practice (publications, conference talks, advisory work)"],
             ["Programme they designed was a finalist for a national L&D award and is used as a case study elsewhere"]),
        ],
    },
    {
        "name": "HR Compliance and Policy",
        "role_family": "Human Resources and People Operations",
        "framework_source": "SHRM BoCK — HR in the Global Context / U.S. Employment Law & Regulations",
        "cluster": "HR Governance",
        "definition": (
            "Maintains HR practice in compliance with employment law, "
            "regulatory requirements, and internal policy across the "
            "jurisdictions the company operates in. Translates legal "
            "complexity into actionable policy; identifies and addresses "
            "compliance risk before it crystallises."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Knows headline compliance requirements; misses nuance and jurisdictional variation",
              "Reactive to legal change; updates policy after external advisors flag it"],
             ["Misses a notification deadline for a regulatory change because nobody was tracking it proactively"]),
            (["Maintains compliance on the standard cases; struggles with edge cases (multi-jurisdiction, contingent workers, M&A)",
              "Identifies compliance risk after it has emerged, not before"],
             ["Discovers a regulatory misclassification of contractors during an external audit"]),
            (["Maintains current compliance across the company's operating jurisdictions; addresses edge cases with appropriate legal input",
              "Identifies emerging compliance risk proactively; closes gaps before they become incidents"],
             ["Surfaced a classification risk three months before a new regulation took effect; remediation was completed in time"]),
            (["Translates legal complexity into clear, actionable policy across multiple jurisdictions",
              "Compliance posture they maintain has held up under external audit, regulatory enquiry, or litigation"],
             ["Three external audits across two years passed without significant findings"]),
            (["Compliance methodology they develop is adopted across the wider HR function",
              "Recognised externally for compliance practice (legal publications, advisory work)"],
             ["Authored compliance protocols cited by external counsel as exemplary"]),
        ],
    },
    {
        "name": "Organisational Design",
        "role_family": "Human Resources and People Operations",
        "framework_source": "Galbraith Star Model — Organisation Design",
        "cluster": "Workforce Strategy",
        "definition": (
            "Designs organisational structures — reporting lines, role "
            "definitions, decision rights, coordination mechanisms — that "
            "support strategy. Distinguishes structural problems from "
            "individual performance problems; redesigns deliberately rather "
            "than by accretion."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats org design as headcount allocation and reporting lines",
              "Cannot articulate why a given structure was chosen except 'it's what we had'"],
             ["Adds a new VP because a senior leader 'needs a team' rather than because the work requires it"]),
            (["Considers reporting lines and headcount but not decision rights or coordination mechanisms",
              "Diagnoses individual performance issues when the underlying problem is structural"],
             ["Replaces a 'failing' manager three times; the role itself is structurally untenable"]),
            (["Designs structure across reporting lines, decision rights, role definitions, and coordination mechanisms",
              "Distinguishes structural from individual performance issues; addresses each appropriately"],
             ["Redesigned a function around decision rights rather than reporting lines; cross-team friction dropped measurably"]),
            (["Designs structures for complex, multi-business-unit organisations with intentional coordination architecture",
              "Org designs they develop persist — structure remains coherent over multiple years of business change"],
             ["Designed the structure of a new business unit; structure held up through two years of growth and a major strategy shift"]),
            (["Organisational design methodology they develop is adopted across the wider HR function",
              "Recognised externally as a domain authority (publications, conference talks, advisory work)"],
             ["Org design framework they developed was adopted by two acquired companies during post-merger integration"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Finance and Accounting (7 competencies)
    # Clusters: Financial Operations, Financial Strategy, Financial Governance
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Budgeting and Forecasting (Corporate Finance)",
        "role_family": "Finance and Accounting",
        "framework_source": "AICPA / IMA CMA — Planning, Budgeting & Forecasting",
        "cluster": "Financial Operations",
        "definition": (
            "Builds, maintains, and updates organisational budgets and "
            "rolling forecasts. Distinguishes commitment from aspiration in "
            "budget inputs; surfaces variance early; reforecasts when the "
            "underlying assumptions no longer hold."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Produces a budget once a year as a target-setting exercise; not used during the year for decision-making",
              "Variance reporting is retrospective; cannot explain why variances occurred except 'overspend'"],
             ["Annual budget is set in October; not referenced again until the following October"]),
            (["Maintains monthly variance reporting but rolling forecasts are static",
              "Reforecasts only at quarter-end; misses material shifts within the quarter"],
             ["Reports a 15% variance at quarter-end with no prior warning of the trend"]),
            (["Maintains rolling forecasts updated monthly with current evidence; surfaces material variance within weeks of detection",
              "Distinguishes timing variance from underlying variance; commentary supports decision-making"],
             ["Flagged an emerging margin compression in week three of the quarter; pricing adjustment recovered the year"]),
            (["Forecasts and budgets they produce are used directly in commercial, hiring, and capital decisions",
              "Forecast accuracy is consistently within ±5% at the quarter, ±10% at the year"],
             ["CEO uses their quarterly reforecast directly in board commitments without re-validation"]),
            (["Budgeting and forecasting methodology they develop is adopted across the wider finance function",
              "Their work shapes external-facing financial guidance and investor communication"],
             ["Their reforecast model was the basis for the company's published guidance methodology"]),
        ],
    },
    {
        "name": "Internal Controls and Compliance",
        "role_family": "Finance and Accounting",
        "framework_source": "COSO Internal Control — Integrated Framework",
        "cluster": "Financial Governance",
        "definition": (
            "Designs and maintains the controls that ensure financial "
            "transactions are recorded accurately, authorised appropriately, "
            "and resistant to fraud or error. Distinguishes control "
            "effectiveness from control existence; tests both."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Maintains controls as documented procedures; does not test whether they actually operate",
              "Cannot describe how a specific control prevents a specific risk"],
             ["A documented dual-approval control is bypassed routinely; nobody notices until external audit"]),
            (["Tests controls annually for existence but not for effectiveness",
              "Identifies control gaps reactively, after exceptions occur"],
             ["Control gap is identified during external audit; same gap was unflagged in internal review"]),
            (["Designs and tests controls for both existence and operating effectiveness on a rolling basis",
              "Identifies and remediates control weaknesses before they manifest as exceptions"],
             ["Identified a segregation-of-duties weakness in routine testing; remediation completed before any incident"]),
            (["Designs control frameworks across multi-entity, multi-jurisdiction operations",
              "Controls they maintain consistently pass external audit without material findings"],
             ["Three consecutive external audits closed with no significant deficiencies"]),
            (["Internal-controls methodology they develop is adopted across the wider finance function",
              "Recognised externally as a domain authority (audit firm publications, advisory roles)"],
             ["Authored the internal controls framework cited as best practice by their external auditor"]),
        ],
    },
    {
        "name": "Financial Reporting Accuracy",
        "role_family": "Finance and Accounting",
        "framework_source": "IFRS / U.S. GAAP — applicable reporting standards",
        "cluster": "Financial Operations",
        "definition": (
            "Produces financial statements and management reports that "
            "accurately represent the entity's position and performance. "
            "Distinguishes reporting from interpretation; ensures the numbers "
            "are right before discussing what they mean."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Produces reports from system extracts without independent verification",
              "Errors are discovered by report consumers, not by the producer"],
             ["Executive notices a 10% discrepancy between this month's and last month's revenue report; nobody on the finance team caught it"]),
            (["Verifies reports through routine reconciliations but doesn't catch underlying classification or timing errors",
              "Distinguishes accounting from forecasting but treats both with similar rigour"],
             ["Reconciliations balance; misclassified expense doesn't surface until year-end audit"]),
            (["Produces reports that consistently tie to underlying records; classification, timing, and cut-off issues caught before publication",
              "Distinguishes immaterial from material discrepancies; addresses each with appropriate priority"],
             ["Caught a material accrual timing error in month-end close; restated correctly before publication"]),
            (["Reports they produce are signed off by external audit without adjustment for several consecutive periods",
              "Reporting cycle compression they achieve allows faster decision-making in the wider business"],
             ["Reduced month-end close cycle from 9 days to 4 with zero increase in error rate"]),
            (["Reporting methodology they develop is adopted across multi-entity operations",
              "Recognised externally for reporting practice (technical publications, professional body roles)"],
             ["Authored the technical accounting paper that resolved an industry-wide reporting ambiguity"]),
        ],
    },
    {
        "name": "Treasury and Cash Management",
        "role_family": "Finance and Accounting",
        "framework_source": "AFP / ACT — Treasury Management body of knowledge",
        "cluster": "Financial Operations",
        "definition": (
            "Manages the organisation's cash, liquidity, and short-term "
            "investments. Forecasts cash position with accuracy; optimises "
            "working capital; ensures sufficient liquidity for operations "
            "while not holding unnecessary idle balances."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Tracks bank balances; cash forecast is monthly and inaccurate",
              "Cannot explain working capital movements except through retrospective reporting"],
             ["Cash forecast misses by 30%; finance team can explain it only after the fact"]),
            (["Maintains weekly cash forecast with reasonable accuracy on routine items",
              "Identifies working capital issues reactively, when payment runs are at risk"],
             ["Working capital tightens unexpectedly; payments rescheduled with two days' notice"]),
            (["Maintains rolling weekly cash forecast accurate within ±5% at one week, ±10% at one month",
              "Manages working capital actively across receivables, payables, and inventory or service-delivery cycles"],
             ["Reduced days-sales-outstanding from 65 to 45 over six months through targeted process changes"]),
            (["Manages treasury across multi-currency, multi-entity operations including FX and interest-rate exposure",
              "Liquidity decisions they make measurably reduce financing cost without increasing risk"],
             ["Restructured banking arrangements reducing financing cost by 30 basis points while maintaining liquidity headroom"]),
            (["Treasury methodology they develop is adopted as organisational standard",
              "Recognised externally as a domain authority (professional body roles, industry publications)"],
             ["Their cash forecast model was adopted as best practice across three subsidiary entities"]),
        ],
    },
    {
        "name": "Investment Appraisal and Capital Allocation",
        "role_family": "Finance and Accounting",
        "framework_source": "CFA Institute — Corporate Finance / Capital Budgeting",
        "cluster": "Financial Strategy",
        "definition": (
            "Evaluates investment opportunities and capital allocation "
            "decisions using rigorous financial analysis. Distinguishes "
            "decision-quality analysis from advocacy; surfaces assumptions "
            "and sensitivities so decision-makers see what they're betting on."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Produces investment analysis from sponsor-provided assumptions without independent challenge",
              "Cannot explain key sensitivities; analysis is essentially a payback calculation"],
             ["Produces an NPV that's positive under sponsor assumptions; doesn't test what happens if revenue is 20% lower"]),
            (["Builds models with multiple scenarios but assumptions are not independently verified",
              "Sensitivity analysis is mechanical (±10% on each input) rather than risk-based"],
             ["Three scenarios all show positive NPV; underlying revenue assumption is unverified and turns out to be 40% optimistic"]),
            (["Independently verifies key assumptions; produces analysis with risk-based sensitivities and explicit decision triggers",
              "Distinguishes between analysis that supports a decision and analysis that advocates for an outcome"],
             ["Recommended against a project that sponsors strongly supported; analysis held up under board challenge"]),
            (["Evaluates portfolios of investments with explicit framing of capital constraints, risk appetite, and strategic fit",
              "Recommendations they produce are followed because the analysis is trusted, even when conclusions are unwelcome"],
             ["Capital allocation framework they introduced reshaped the company's investment portfolio over two years"]),
            (["Capital allocation methodology they develop influences decisions at the board or executive committee level",
              "Recognised externally as a domain authority (industry publications, advisory roles)"],
             ["CFO uses their framework as the basis for quarterly capital allocation reviews"]),
        ],
    },
    {
        "name": "Tax Awareness and Planning",
        "role_family": "Finance and Accounting",
        "framework_source": None,
        "cluster": "Financial Governance",
        "definition": (
            "Manages the organisation's tax position across the "
            "jurisdictions it operates in. Distinguishes compliance from "
            "planning; takes positions that are commercially sensible and "
            "legally defensible; avoids aggressive structures that create "
            "downstream risk."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Manages tax compliance reactively, jurisdiction by jurisdiction",
              "Cannot describe the organisation's effective tax rate or its main drivers"],
             ["Misses a filing deadline in a jurisdiction nobody was actively tracking"]),
            (["Maintains compliance on routine matters; struggles with cross-jurisdiction complexity",
              "Treats tax planning as the external advisor's job"],
             ["Cross-border transaction is structured inefficiently because tax wasn't consulted until contract signing"]),
            (["Maintains current compliance across all operating jurisdictions; engages external advisors on novel or complex matters",
              "Anticipates tax implications of business decisions early enough to influence structure"],
             ["Restructured an acquisition to reduce tax leakage by 15% while remaining fully defensible"]),
            (["Manages tax positions across multi-entity, multi-jurisdiction operations including transfer pricing and treaty considerations",
              "Tax positions they take consistently hold up under tax authority review"],
             ["Five-year period across multiple jurisdictions closed with no material tax authority adjustments"]),
            (["Tax strategy they develop is referenced as exemplary by external advisors and peer organisations",
              "Recognised externally as a domain authority (technical publications, professional body roles)"],
             ["Tax practice paper they co-authored is cited by external advisors as guidance for similar structures"]),
        ],
    },
    {
        "name": "Audit Readiness",
        "role_family": "Finance and Accounting",
        "framework_source": None,
        "cluster": "Financial Governance",
        "definition": (
            "Maintains the organisation's records, evidence, and processes "
            "in a state where external audit can be completed efficiently. "
            "Distinguishes audit readiness from audit response; invests in "
            "the former so the latter is minimal."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats audit as an annual fire drill; assembles evidence reactively when requested",
              "Audit findings recur year after year because root causes are not addressed"],
             ["Audit team requests evidence finance can locate only after three days of searching"]),
            (["Maintains routine evidence but quality varies; some items still assembled reactively at audit time",
              "Addresses individual findings but not the patterns behind them"],
             ["Same control weakness flagged by audit two years running; remediation each time is point-fix"]),
            (["Maintains audit-grade evidence as part of routine operation; audit requests are filled within hours, not days",
              "Audit findings reduce year over year as root causes are addressed"],
             ["Cut audit fieldwork time by 40% through proactive evidence management; findings reduced from 8 to 2"]),
            (["Audit posture is consistently strong across multi-entity, multi-auditor relationships",
              "External auditors cite this organisation's audit readiness as best practice in their portfolio"],
             ["Auditor's management letter cited audit readiness as exemplary three years running"]),
            (["Audit-readiness methodology they develop is adopted as organisational standard",
              "Recognised externally (audit firm publications, industry roles)"],
             ["Their audit-readiness framework was adopted across the parent company's nine subsidiaries"]),
        ],
    },

    # ═══════════════════════════════════════════════════════════════════════
    # ROLE FAMILY: Marketing and Communications (7 competencies)
    # Clusters: Market Insight, Brand and Content, Marketing Analytics
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Market Research and Insight Generation",
        "role_family": "Marketing and Communications",
        "framework_source": "AMA — Marketing Capabilities (Market Research)",
        "cluster": "Market Insight",
        "definition": (
            "Designs and conducts research that produces actionable customer "
            "and market insight. Distinguishes data collection from insight; "
            "frames questions that drive decisions; resists confirmation bias "
            "in interpretation."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats research as data collection ('let's survey 500 customers')",
              "Insights are restatements of data rather than implications for decision"],
             ["Survey results are reported as 'top three complaints' with no recommendation"]),
            (["Designs research with a research question but the question doesn't connect to a specific decision",
              "Findings are reported faithfully but not framed for decision-makers"],
             ["Research finds 'customers value reliability' — true but doesn't tell anyone what to do"]),
            (["Designs research around specific business decisions; findings include explicit decision implications",
              "Distinguishes statistical significance from business significance; explains both clearly"],
             ["Research on pricing willingness led directly to a pricing change that grew margin 4 points"]),
            (["Synthesises across multiple research streams (quant, qual, behavioural) into integrated market insight",
              "Insights they produce reshape product, marketing, or commercial strategy"],
             ["Multi-method research recommended a market re-segmentation now used as the company's go-to-market framework"]),
            (["Research methodology they develop is adopted across the wider marketing function",
              "Recognised externally (industry publications, conference talks)"],
             ["Their methodology paper on B2B segmentation is referenced in industry consortium standards"]),
        ],
    },
    {
        "name": "Brand Stewardship",
        "role_family": "Marketing and Communications",
        "framework_source": "Keller — Customer-Based Brand Equity framework",
        "cluster": "Brand and Content",
        "definition": (
            "Maintains and develops the brand as a strategic asset. "
            "Distinguishes brand from logo and tagline; protects brand "
            "integrity in commercial decisions; builds equity over time "
            "through consistent positioning."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Treats brand as visual identity (logo, colours, fonts)",
              "Cannot articulate the brand's positioning or what it stands for in customer terms"],
             ["Defends a logo standard but agrees to off-brand campaign content because it 'tested well'"]),
            (["Articulates brand positioning at a high level; protects it inconsistently in operational decisions",
              "Distinguishes on-brand from off-brand but doesn't always escalate when commercial pressure pushes off-brand"],
             ["Approves a campaign with off-brand tone because the deadline was tight; brand equity erodes gradually"]),
            (["Maintains brand consistency across channels and over time; distinguishes the small choices that compound from the ones that don't matter",
              "Defends brand integrity against commercial pressure when defensibly necessary"],
             ["Pushed back on a major-account-requested customisation that would have created an off-brand asset; account agreed to compromise"]),
            (["Develops the brand strategically — positioning, architecture, extensions — to fit business evolution",
              "Brand equity measures (consideration, preference, premium) improve under their stewardship"],
             ["Brand consideration in target segment grew from 25% to 42% over two years of consistent positioning work"]),
            (["Brand methodology they develop is adopted as organisational standard",
              "Recognised externally (industry awards, publications, advisory work)"],
             ["Brand repositioning they led was a finalist for a national brand award and is cited as an industry case study"]),
        ],
    },
    {
        "name": "Campaign Strategy and Execution",
        "role_family": "Marketing and Communications",
        "framework_source": "AMA — Marketing Capabilities (Marketing Communications)",
        "cluster": "Brand and Content",
        "definition": (
            "Designs and runs marketing campaigns that achieve specific "
            "business objectives. Distinguishes activity from outcome; "
            "defines success in measurable terms before launch; iterates "
            "during execution based on evidence."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Runs campaigns on the channels available, with the assets to hand",
              "Defines success as 'we launched it' rather than as outcome metrics"],
             ["Reports campaign success as 'we sent 50,000 emails' without click, conversion, or pipeline impact"]),
            (["Sets success metrics but they're activity proxies (impressions, clicks) rather than business outcomes",
              "Runs campaigns to plan; doesn't iterate based on mid-flight evidence"],
             ["Campaign tracks well on impressions but generates no pipeline; runs to plan anyway"]),
            (["Defines campaigns around business outcomes (pipeline, revenue, retention) with appropriate activity metrics underneath",
              "Iterates during execution based on early evidence; kills underperforming elements quickly"],
             ["Reallocated 60% of mid-flight campaign budget from underperforming channel; ROI doubled vs. original plan"]),
            (["Designs integrated campaigns across multiple channels with attribution that distinguishes contribution",
              "Campaign outcomes they produce consistently outperform peer campaigns on the same objective"],
             ["Campaign delivered 3× pipeline of comparable campaigns at similar spend levels"]),
            (["Campaign methodology they develop is referenced across the wider marketing function",
              "Recognised externally (industry awards, conference talks, agency engagements)"],
             ["Campaign was a finalist for a national marketing award and is used as a B2B case study by an industry body"]),
        ],
    },
    {
        "name": "Content and Editorial Judgement",
        "role_family": "Marketing and Communications",
        "framework_source": None,
        "cluster": "Brand and Content",
        "definition": (
            "Commissions, edits, and publishes content that earns audience "
            "attention and supports business objectives. Distinguishes "
            "quality from volume; resists publishing-for-publishing's-sake; "
            "maintains an editorial standard the audience recognises."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Publishes content on a fixed cadence regardless of whether anything is worth saying",
              "Cannot articulate what makes content good or bad except 'engagement'"],
             ["Publishes weekly content with declining readership; treats it as required activity"]),
            (["Distinguishes higher from lower quality content but not consistently",
              "Edits for grammar and brand voice but not for argument or insight"],
             ["Edits a thought-leadership piece for tone; doesn't challenge the underlying argument that doesn't hold up"]),
            (["Commissions and edits content with explicit editorial standards (insight, originality, evidence)",
              "Distinguishes content that will compound (evergreen, reference value) from content that's disposable"],
             ["Killed a planned series after the first piece; commissioned a different angle that became the team's most-cited resource"]),
            (["Builds editorial properties (publications, podcasts, research reports) that earn audience attention over time",
              "Content programmes they run produce measurable business outcomes (pipeline influence, brand consideration)"],
             ["Built a quarterly research report that became the company's largest single source of inbound leads"]),
            (["Editorial standards they set become industry reference points",
              "Recognised externally for content practice (industry publications, journalism awards, advisory work)"],
             ["Editorial property they founded is now industry-required reading; cited by competitors and analysts"]),
        ],
    },
    {
        "name": "Digital and Performance Marketing",
        "role_family": "Marketing and Communications",
        "framework_source": None,
        "cluster": "Marketing Analytics",
        "definition": (
            "Designs and operates digital marketing across paid channels with "
            "measurable performance objectives. Distinguishes channel "
            "performance from creative performance; optimises against "
            "business outcomes rather than channel-native metrics."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Manages digital channels against channel-native metrics (CPC, CTR) without business-outcome connection",
              "Cannot explain why some channels perform better than others except 'audience'"],
             ["Reports low CPC on a channel that produces zero pipeline; treats it as a win"]),
            (["Connects channel metrics to business outcomes inconsistently; attribution is single-touch",
              "Optimises within channels but doesn't shift budget between channels based on outcome evidence"],
             ["Maintains a high-spend channel that contributes nothing to pipeline because 'we've always run it'"]),
            (["Manages digital channels against business outcomes with appropriate attribution; shifts budget between channels based on evidence",
              "Distinguishes channel from creative performance; tests both"],
             ["Reallocated 40% of digital budget across channels based on attribution evidence; pipeline rose 30% at constant spend"]),
            (["Designs digital strategies that compound across paid, owned, and earned channels",
              "Performance outcomes consistently outperform industry benchmarks on the same objective"],
             ["CPA across the digital portfolio sits at 60% of industry benchmark for similar B2B SaaS profile"]),
            (["Digital methodology they develop is referenced across the wider marketing function",
              "Recognised externally (industry publications, conference talks, advisory work)"],
             ["Their attribution framework became the methodology adopted across a multi-business-unit parent organisation"]),
        ],
    },
    {
        "name": "Customer Segmentation and Targeting",
        "role_family": "Marketing and Communications",
        "framework_source": "Wendell Smith (1956) — Market Segmentation theory",
        "cluster": "Market Insight",
        "definition": (
            "Identifies and defines the customer segments the business "
            "should serve. Distinguishes descriptive segmentation (who they "
            "are) from actionable segmentation (what we do differently for "
            "them); resists creating segments the business cannot operate "
            "against."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Segments by demographic or firmographic descriptors only (industry, size, geography)",
              "Cannot explain what the business would do differently for different segments"],
             ["Reports 12 customer segments; sales team treats them all identically"]),
            (["Segments include behavioural or need-based variables but the segments don't drive operational differentiation",
              "Recommends segments that the business cannot actually operate against"],
             ["Proposes a six-segment model; only two are operationally used"]),
            (["Builds segmentations that drive differentiated treatment in product, marketing, and sales",
              "Distinguishes segments worth investing in from segments that are statistically distinct but commercially unimportant"],
             ["Segmentation drove a sales-coverage redesign and pricing differentiation; revenue grew in target segments by 35%"]),
            (["Segmentation strategies they design shape strategic decisions (market entry, product priority, channel investment)",
              "Segmentations they build remain useful over multiple years of business evolution"],
             ["Segmentation built four years ago still drives the company's go-to-market structure today"]),
            (["Segmentation methodology they develop is referenced across the wider marketing profession",
              "Recognised externally (industry publications, conference talks, advisory work)"],
             ["Their B2B segmentation case study is taught at business schools as an industry exemplar"]),
        ],
    },
    {
        "name": "Marketing Analytics and Attribution",
        "role_family": "Marketing and Communications",
        "framework_source": None,
        "cluster": "Marketing Analytics",
        "definition": (
            "Measures the contribution of marketing activity to business "
            "outcomes. Distinguishes correlation from causation; designs "
            "attribution that's good enough to drive decisions without "
            "overclaiming precision; resists vanity metrics."
        ),
        "is_leadership": False,
        "is_technical": False,
        "levels": [
            (["Reports activity metrics (impressions, clicks, leads) without business-outcome connection",
              "Cannot distinguish marketing-influenced from marketing-sourced pipeline"],
             ["Reports 'marketing generated $5M in pipeline' citing first-touch attribution only"]),
            (["Connects activity to outcomes via single-touch attribution but doesn't challenge its limits",
              "Reports correlation between activity and outcome without testing causation"],
             ["Attributes a revenue spike to a recent campaign; doesn't notice it correlates with a competitor's outage"]),
            (["Uses multi-touch attribution with explicit acknowledgement of its limits; tests causation through controlled experiments where possible",
              "Distinguishes marketing-influenced from marketing-sourced; communicates both with appropriate humility"],
             ["Designed an incrementality test that distinguished the actual lift of a campaign from baseline pipeline trend"]),
            (["Designs marketing measurement frameworks that decision-makers use directly",
              "Insights they produce shape marketing investment decisions; investment shifts measurably improve business outcomes"],
             ["Reallocation driven by their measurement framework lifted marketing-sourced revenue by 25% at constant spend"]),
            (["Measurement methodology they develop is referenced across the wider marketing function",
              "Recognised externally (industry publications, conference talks, advisory work)"],
             ["Measurement framework they authored is used as the standard by an industry trade body"]),
        ],
    },
]


# ---------------------------------------------------------------------------
# Seed function — Role-Family Competency Library
# ---------------------------------------------------------------------------


async def seed_role_family_competencies(session: AsyncSession) -> None:
    """Idempotently seed the Role-Family Competency Library.

    Mirrors the per-row check-then-skip pattern from industry_library_seed:
    safe to call on every startup. New entries added to
    ROLE_FAMILY_COMPETENCIES are picked up incrementally on next restart
    without truncating or re-seeding existing rows.
    """

    framework_name = "Role-Family Competency Library"

    # 1. Framework: check by name, create if missing
    fw = (
        await session.execute(
            select(CompetencyFramework).where(CompetencyFramework.name == framework_name)
        )
    ).scalar_one_or_none()

    if fw is None:
        fw = CompetencyFramework(
            name=framework_name,
            source=(
                "Metricly (curated from SHL UCF, Korn Ferry, O*NET, Lominger, "
                "Bartram Great Eight, PMI, COSO, SHRM BoCK, AMA, and others)"
            ),
            description=(
                "Role-family-specific competencies spanning Sales, Technical/Engineering, "
                "People Management, Customer Service and Success, Operations and Project "
                "Management, Human Resources and People Operations, Finance and Accounting, "
                "and Marketing and Communications. Each competency cites its originating "
                "framework in framework_source (NULL where no specific named source can be "
                "honestly cited)."
            ),
            version="1.0",
        )
        session.add(fw)
        await session.flush()

    # 2. Each competency: check by (framework_id, name), skip if exists
    seeded = 0
    for comp_data in ROLE_FAMILY_COMPETENCIES:
        existing_comp = (
            await session.execute(
                select(CompetencyDefinition).where(
                    CompetencyDefinition.framework_id == fw.id,
                    CompetencyDefinition.name == comp_data["name"],
                )
            )
        ).scalar_one_or_none()
        if existing_comp is not None:
            continue

        comp = CompetencyDefinition(
            framework_id=fw.id,
            name=comp_data["name"],
            definition=comp_data.get("definition"),
            cluster=comp_data.get("cluster"),
            factor=comp_data.get("factor"),
            category=comp_data.get("category"),
            role_family=comp_data.get("role_family"),
            framework_source=comp_data.get("framework_source"),
            is_leadership=comp_data.get("is_leadership", False),
            is_technical=comp_data.get("is_technical", False),
        )
        session.add(comp)
        await session.flush()

        # 3. Proficiency levels: created alongside a new competency
        for lvl_num, (indicators, examples) in enumerate(comp_data["levels"], start=1):
            session.add(
                CompetencyProficiencyLevel(
                    competency_id=comp.id,
                    level=lvl_num,
                    label=LEVEL_LABELS[lvl_num],
                    behavioral_indicators=json.dumps(indicators),
                    example_behaviors=json.dumps(examples),
                )
            )

        seeded += 1

    await session.commit()

    if seeded:
        log.info(
            "Role-Family Competency Library seed: added %d new competencies (library size: %d)",
            seeded,
            len(ROLE_FAMILY_COMPETENCIES),
        )
    else:
        log.debug(
            "Role-Family Competency Library already up to date (library size: %d)",
            len(ROLE_FAMILY_COMPETENCIES),
        )
