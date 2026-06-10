"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import ChatShell from "@/components/chat/ChatShell"
import MessageBubble from "@/components/chat/MessageBubble"
import AnswerChips from "@/components/chat/AnswerChips"
import {
  createFrameworkFromLibrary,
  getCompetencies,
  rankForFramework,
  type RankedItem,
} from "@/lib/api"
import type { CompetencyListItem } from "@/lib/types"

// ---------------------------------------------------------------------------
// Question definitions — kept in sync with the backend ranker (GAP_KEYWORDS,
// ROLE_FAMILY_KEYWORDS, SIZE_CAPS) in backend/app/services/competency_ranker.py
// ---------------------------------------------------------------------------

type RoleLevel = "IC" | "Team Lead" | "Manager" | "Director+"
type Outcome = "revenue" | "delivery" | "retention" | "people-dev"
type Size = "lean" | "standard" | "comprehensive"

const LEVEL_OPTIONS: { value: RoleLevel; label: string }[] = [
  { value: "IC", label: "Individual Contributor" },
  { value: "Team Lead", label: "Team Lead" },
  { value: "Manager", label: "Manager" },
  { value: "Director+", label: "Director and above" },
]

const OUTCOME_OPTIONS: { value: Outcome; label: string; description: string }[] = [
  { value: "revenue", label: "Revenue growth", description: "Top-line, commercial outcomes" },
  { value: "delivery", label: "Delivery excellence", description: "Execution, quality, on-time shipping" },
  { value: "retention", label: "Retention and engagement", description: "Keep great people, grow them" },
  { value: "people-dev", label: "People development", description: "Build the bench, coach for promotion" },
]

const GAP_OPTIONS = [
  "Communication",
  "Execution and delivery",
  "People development",
  "Strategy and vision",
  "Customer focus",
  "Cross-functional collaboration",
  "Decision quality",
  "Resilience and adaptability",
  "Innovation and creativity",
  "Technical depth",
]

const SIZE_OPTIONS: { value: Size; label: string; description: string }[] = [
  { value: "lean", label: "Lean (5–7)", description: "Tight core — easier to assess on" },
  { value: "standard", label: "Standard (8–12)", description: "Most use cases" },
  { value: "comprehensive", label: "Comprehensive (13–18)", description: "Multi-dimensional roles" },
]

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type Step =
  | "role"
  | "level"
  | "outcome"
  | "gaps"
  | "size"
  | "required"
  | "generating"
  | "proposal"

interface Answers {
  role: string
  level: RoleLevel | ""
  outcome: Outcome | ""
  gaps: string[]
  size: Size | ""
  requiredIds: string[]
}

interface Turn {
  id: string
  role: "assistant" | "user"
  content: string
}

const QUESTION_PROMPTS: Record<Step, string> = {
  role:
    "Let's design a competency framework. First — what role or team are you building this for? A short description is fine (e.g. \"Enterprise Account Executive\" or \"Senior backend engineers\").",
  level: "What seniority level should this framework be calibrated to?",
  outcome: "What's the primary outcome this role is accountable for?",
  gaps:
    "Where are the gaps or concerns you most want this framework to surface? Pick up to three.",
  size: "How many competencies would you like in the framework?",
  required:
    "Any specific competencies you know you want to include? Type to search the library, or skip.",
  generating: "",
  proposal: "",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuidedFrameworkFlow() {
  const router = useRouter()

  // Q-flow state
  const [step, setStep] = useState<Step>("role")
  const [answers, setAnswers] = useState<Answers>({
    role: "",
    level: "",
    outcome: "",
    gaps: [],
    size: "",
    requiredIds: [],
  })
  const [turns, setTurns] = useState<Turn[]>([
    { id: "q-role", role: "assistant", content: QUESTION_PROMPTS.role },
  ])

  // Q1 input
  const [roleInput, setRoleInput] = useState("")

  // Q6 search state
  const [allLibrary, setAllLibrary] = useState<CompetencyListItem[] | null>(null)
  const [searchInput, setSearchInput] = useState("")

  // Proposal state
  const [proposal, setProposal] = useState<RankedItem[] | null>(null)
  const [roleFamilyInferred, setRoleFamilyInferred] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load library once when entering Q6
  useEffect(() => {
    if (step === "required" && allLibrary === null) {
      getCompetencies().then(setAllLibrary).catch(() => setAllLibrary([]))
    }
  }, [step, allLibrary])

  // Helpers --------------------------------------------------------------

  function pushUserTurn(content: string, nextStep: Step) {
    setTurns(prev => [
      ...prev,
      { id: `a-${prev.length}`, role: "user", content },
      { id: `q-${nextStep}`, role: "assistant", content: QUESTION_PROMPTS[nextStep] },
    ])
    setStep(nextStep)
  }

  function answerRole() {
    const text = roleInput.trim()
    if (!text) return
    setAnswers(a => ({ ...a, role: text }))
    pushUserTurn(text, "level")
    setRoleInput("")
  }

  function answerLevel(value: string) {
    const opt = LEVEL_OPTIONS.find(o => o.value === value)
    if (!opt) return
    setAnswers(a => ({ ...a, level: opt.value }))
    pushUserTurn(opt.label, "outcome")
  }

  function answerOutcome(value: string) {
    const opt = OUTCOME_OPTIONS.find(o => o.value === value)
    if (!opt) return
    setAnswers(a => ({ ...a, outcome: opt.value }))
    pushUserTurn(opt.label, "gaps")
  }

  function commitGaps() {
    if (answers.gaps.length === 0) return
    const summary = answers.gaps.join(", ")
    pushUserTurn(summary, "size")
  }

  function answerSize(value: string) {
    const opt = SIZE_OPTIONS.find(o => o.value === value)
    if (!opt) return
    setAnswers(a => ({ ...a, size: opt.value }))
    pushUserTurn(opt.label, "required")
  }

  async function submitRequired(skipped: boolean) {
    // Compose summary
    const summary = skipped
      ? "Skipped — let the ranker decide."
      : `${answers.requiredIds.length} competenc${answers.requiredIds.length === 1 ? "y" : "ies"} pinned.`
    setTurns(prev => [
      ...prev,
      { id: `a-${prev.length}`, role: "user", content: summary },
    ])
    setStep("generating")

    try {
      const res = await rankForFramework({
        role: answers.role,
        level: answers.level as RoleLevel,
        outcome: answers.outcome as Outcome,
        gaps: answers.gaps,
        size: answers.size as Size,
        required_ids: skipped ? null : answers.requiredIds,
      })
      setProposal(res.ranked)
      setRoleFamilyInferred(res.role_family_inferred)
      setStep("proposal")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate proposal")
      setStep("required") // allow retry
    }
  }

  async function commitFramework() {
    if (!proposal) return
    setSubmitting(true)
    setError(null)
    try {
      const fw = await createFrameworkFromLibrary({
        title: `${answers.role} — competency framework`,
        role_title: answers.role,
        description: `Guided build · ${answers.level} · ${answers.outcome} · ${answers.size} (${proposal.length} competencies)`,
        competencies: proposal.map((p, i) => ({
          library_competency_id: p.competency_id,
          order_index: i,
          suggested_proficiency_level: p.suggested_proficiency_level,
        })),
      })
      router.push(`/frameworks/${fw.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create framework")
      setSubmitting(false)
    }
  }

  // Q6 filtered library
  const filteredLibrary = useMemo(() => {
    if (!allLibrary) return []
    const q = searchInput.trim().toLowerCase()
    if (!q) return allLibrary.slice(0, 8)
    return allLibrary
      .filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          (c.definition?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8)
  }, [allLibrary, searchInput])

  // Render ---------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ChatShell
        scrollOn={turns.length}
        isTyping={step === "generating"}
        header={
          <div className="mb-6 text-center">
            <h1 className="page-title text-xl">Guided framework builder</h1>
            <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.45)" }}>
              Six questions, then a proposed framework you can adjust.
            </p>
          </div>
        }
        footer={
          step === "role" ? (
            <RoleInput
              value={roleInput}
              onChange={setRoleInput}
              onSubmit={answerRole}
            />
          ) : step === "required" ? (
            <RequiredFooter
              search={searchInput}
              onSearch={setSearchInput}
              suggestions={filteredLibrary}
              selectedIds={answers.requiredIds}
              onToggle={id =>
                setAnswers(a => ({
                  ...a,
                  requiredIds: a.requiredIds.includes(id)
                    ? a.requiredIds.filter(x => x !== id)
                    : [...a.requiredIds, id],
                }))
              }
              onSkip={() => submitRequired(true)}
              onContinue={() => submitRequired(false)}
              loading={!allLibrary}
            />
          ) : null
        }
      >
        {turns.map(t => (
          <MessageBubble key={t.id} role={t.role}>
            {t.content}
          </MessageBubble>
        ))}

        {/* Inline answer affordances per step */}
        {step === "level" && (
          <AnswerChips options={LEVEL_OPTIONS} onSelect={answerLevel} />
        )}
        {step === "outcome" && (
          <AnswerChips options={OUTCOME_OPTIONS} onSelect={answerOutcome} />
        )}
        {step === "gaps" && (
          <div className="ml-10 space-y-3">
            <AnswerChips
              multi
              maxSelect={3}
              options={GAP_OPTIONS.map(g => ({ value: g, label: g }))}
              value={answers.gaps}
              onSelect={v => setAnswers(a => ({ ...a, gaps: v }))}
            />
            <button
              className="btn-primary text-xs"
              disabled={answers.gaps.length === 0}
              onClick={commitGaps}
            >
              Continue ({answers.gaps.length}/3)
            </button>
          </div>
        )}
        {step === "size" && (
          <AnswerChips options={SIZE_OPTIONS} onSelect={answerSize} />
        )}

        {step === "proposal" && proposal && (
          <ProposalView
            proposal={proposal}
            roleFamilyInferred={roleFamilyInferred}
            answers={answers}
            onContinue={commitFramework}
            onAdjust={() => {
              setStep("size")
              setProposal(null)
            }}
            submitting={submitting}
            error={error}
          />
        )}
      </ChatShell>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Q1 — free-text role input
// ---------------------------------------------------------------------------

function RoleInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <div
      className="flex items-end gap-3 rounded-2xl p-2"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "0.5px solid rgba(255,255,255,0.8)",
        backdropFilter: "blur(12px)",
      }}
    >
      <input
        type="text"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="e.g., Sales Manager, Software Engineer, Customer Success Lead"
        className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
        style={{ color: "#0A1E33" }}
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
        aria-label="Submit role"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Q6 — required-competency search
// ---------------------------------------------------------------------------

function RequiredFooter({
  search,
  onSearch,
  suggestions,
  selectedIds,
  onToggle,
  onSkip,
  onContinue,
  loading,
}: {
  search: string
  onSearch: (v: string) => void
  suggestions: CompetencyListItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onSkip: () => void
  onContinue: () => void
  loading: boolean
}) {
  return (
    <div className="space-y-3">
      {/* Search input */}
      <div
        className="rounded-2xl p-2"
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "0.5px solid rgba(255,255,255,0.8)",
          backdropFilter: "blur(12px)",
        }}
      >
        <input
          type="text"
          autoFocus
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder={
            loading
              ? "Loading library…"
              : "e.g., Customer Focus, Resilience, Strategic Mindset"
          }
          disabled={loading}
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
          style={{ color: "#0A1E33" }}
        />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map(c => {
            const selected = selectedIds.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                style={
                  selected
                    ? {
                        background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
                        color: "#fff",
                      }
                    : {
                        background: "rgba(255,255,255,0.55)",
                        border: "0.5px solid rgba(255,255,255,0.8)",
                        color: "#0A1E33",
                      }
                }
                title={c.definition ?? undefined}
              >
                {selected ? "✓ " : ""}
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-3">
        <button onClick={onSkip} className="btn-ghost text-xs">
          Skip — let the ranker decide
        </button>
        <button
          onClick={onContinue}
          disabled={selectedIds.length === 0}
          className="btn-primary text-xs disabled:opacity-50"
        >
          Continue with {selectedIds.length} pinned
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Proposal view
// ---------------------------------------------------------------------------

function ProposalView({
  proposal,
  roleFamilyInferred,
  answers,
  onContinue,
  onAdjust,
  submitting,
  error,
}: {
  proposal: RankedItem[]
  roleFamilyInferred: string | null
  answers: Answers
  onContinue: () => void
  onAdjust: () => void
  submitting: boolean
  error: string | null
}) {
  // Group by cluster
  const byCluster = useMemo(() => {
    const groups = new Map<string, RankedItem[]>()
    for (const p of proposal) {
      const key = p.cluster ?? "Uncategorised"
      const arr = groups.get(key) ?? []
      arr.push(p)
      groups.set(key, arr)
    }
    return Array.from(groups.entries())
  }, [proposal])

  return (
    <div className="ml-10 mt-2 space-y-4">
      <div className="card p-5">
        <div className="eyebrow mb-1">Proposed framework</div>
        <h2 className="section-heading mb-1">
          {answers.role} — {proposal.length} competencies
        </h2>
        <p className="text-xs" style={{ color: "rgba(10,30,51,0.55)" }}>
          {roleFamilyInferred ? (
            <>
              Inferred role family: <span className="font-semibold">{roleFamilyInferred}</span> ·
              calibrated to <span className="font-semibold">{answers.level}</span> ·
              focus on <span className="font-semibold">{answers.outcome}</span>
            </>
          ) : (
            <>
              No specific role family matched — drawing on the wider library ·
              calibrated to <span className="font-semibold">{answers.level}</span>
            </>
          )}
        </p>
      </div>

      {/* Clustered list */}
      {byCluster.map(([cluster, items]) => (
        <div key={cluster} className="card p-5">
          <div className="label-caps mb-3">{cluster}</div>
          <ul className="space-y-3">
            {items.map(p => (
              <li
                key={p.competency_id}
                className="flex items-start justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
                style={{ borderColor: "rgba(255,255,255,0.4)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "#0A1E33" }}>
                      {p.name}
                    </span>
                    <span className="text-[10px]" style={{ color: "rgba(10,30,51,0.4)" }}>
                      {p.framework_name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.55)" }}>
                    {p.rationale}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
                  >
                    L{p.suggested_proficiency_level}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* CTAs */}
      {error && <div className="alert-error">{error}</div>}
      <div className="flex gap-3">
        <button onClick={onAdjust} className="btn-ghost text-xs" disabled={submitting}>
          Adjust answers
        </button>
        <button onClick={onContinue} className="btn-primary text-xs" disabled={submitting}>
          {submitting ? "Creating…" : "Continue to dashboard →"}
        </button>
      </div>
    </div>
  )
}
