"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Header from "@/components/Header"
import { getSurvey, submitResponse } from "@/lib/api"
import type { ForcedChoiceConfig, QuestionOut, SurveyOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Likert
// ---------------------------------------------------------------------------

function LikertQuestion({ question, value, onChange, scale }: {
  question: QuestionOut; value: string; onChange: (v: string) => void; scale: 5 | 7
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {Array.from({ length: scale }, (_, i) => {
          const v = String(i + 1)
          const selected = value === v
          return (
            <label key={v}
              className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl py-3 transition-all"
              style={selected
                ? { background: "rgba(15,40,65,0.12)", border: "1.5px solid rgba(15,40,65,0.4)" }
                : { background: "rgba(255,255,255,0.4)", border: "1.5px solid rgba(255,255,255,0.6)" }
              }>
              <input type="radio" name={question.id} value={v} checked={selected}
                onChange={() => onChange(v)} className="sr-only" />
              <span className="text-lg font-bold" style={{ color: selected ? "#0F2841" : "rgba(10,30,51,0.35)" }}>{v}</span>
            </label>
          )
        })}
      </div>
      <div className="flex justify-between px-1 text-[11px]" style={{ color: "rgba(10,30,51,0.35)" }}>
        <span>Strongly disagree</span><span>Strongly agree</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single choice
// ---------------------------------------------------------------------------

function SingleChoiceQuestion({ question, value, onChange }: {
  question: QuestionOut; value: string; onChange: (v: string) => void
}) {
  const opts = question.options as string[]
  return (
    <div className="space-y-2">
      {opts.map(opt => {
        const selected = value === opt
        return (
          <label key={opt}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-all"
            style={selected
              ? { background: "rgba(15,40,65,0.1)", border: "1.5px solid rgba(15,40,65,0.35)" }
              : { background: "rgba(255,255,255,0.4)", border: "1.5px solid rgba(255,255,255,0.6)" }
            }>
            <input type="radio" name={question.id} value={opt} checked={selected}
              onChange={() => onChange(opt)} className="sr-only" />
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
              style={selected
                ? { borderColor: "#0F2841", backgroundColor: "#0F2841" }
                : { borderColor: "rgba(10,30,51,0.25)" }
              }>
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="text-sm" style={{ color: "rgba(10,30,51,0.75)" }}>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Multiple choice
// ---------------------------------------------------------------------------

function MultipleChoiceQuestion({ question, value, onChange }: {
  question: QuestionOut; value: string[]; onChange: (v: string[]) => void
}) {
  const opts = question.options as string[]
  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }
  return (
    <div className="space-y-2">
      {opts.map(opt => {
        const selected = value.includes(opt)
        return (
          <label key={opt}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-all"
            style={selected
              ? { background: "rgba(15,40,65,0.1)", border: "1.5px solid rgba(15,40,65,0.35)" }
              : { background: "rgba(255,255,255,0.4)", border: "1.5px solid rgba(255,255,255,0.6)" }
            }>
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2"
              style={selected
                ? { borderColor: "#0F2841", backgroundColor: "#0F2841" }
                : { borderColor: "rgba(10,30,51,0.25)" }
              }>
              {selected && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>}
            </span>
            <input type="checkbox" checked={selected} onChange={() => toggle(opt)} className="sr-only" />
            <span className="text-sm" style={{ color: "rgba(10,30,51,0.75)" }}>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forced choice
// ---------------------------------------------------------------------------

function ForcedChoiceQuestion({ question, value, onChange }: {
  question: QuestionOut
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const cfg = question.options as ForcedChoiceConfig
  const [labelA, labelB] = cfg.labels

  function assign(label: string, item: string) {
    const next = { ...value }
    Object.keys(next).forEach(l => { if (next[l] === item) delete next[l] })
    const otherLabel = label === labelA ? labelB : labelA
    if (next[otherLabel] === item) delete next[otherLabel]
    next[label] = item
    onChange(next)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="w-24 py-2 text-center text-xs font-bold" style={{ color: "#0F2841" }}>{labelA}</th>
            <th className="py-2 text-left text-xs font-semibold" style={{ color: "rgba(10,30,51,0.5)" }}>Item</th>
            <th className="w-24 py-2 text-center text-xs font-bold" style={{ color: "#0F2841" }}>{labelB}</th>
          </tr>
        </thead>
        <tbody>
          {cfg.items.map(item => {
            const hasA = value[labelA] === item
            const hasB = value[labelB] === item
            return (
              <tr key={item} style={{ borderTop: "0.5px solid rgba(255,255,255,0.3)" }}>
                <td className="py-2.5 text-center">
                  <button type="button" onClick={() => assign(labelA, item)}
                    className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all"
                    style={hasA
                      ? { borderColor: "#0F2841", backgroundColor: "#0F2841" }
                      : { borderColor: "rgba(10,30,51,0.25)" }
                    }>
                    {hasA && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </button>
                </td>
                <td className="py-2.5 px-3 font-medium" style={{ color: hasA || hasB ? "#0A1E33" : "rgba(10,30,51,0.65)" }}>
                  {item}
                  {hasA && <span className="ml-2 text-[10px] font-bold" style={{ color: "#0F2841" }}>{labelA}</span>}
                  {hasB && <span className="ml-2 text-[10px] font-bold" style={{ color: "#0F2841" }}>{labelB}</span>}
                </td>
                <td className="py-2.5 text-center">
                  <button type="button" onClick={() => assign(labelB, item)}
                    className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all"
                    style={hasB
                      ? { borderColor: "#0F2841", backgroundColor: "#0F2841" }
                      : { borderColor: "rgba(10,30,51,0.25)" }
                    }>
                    {hasB && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {Object.keys(value).length < 2 && (
        <p className="mt-2 text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>
          Assign one item to each label ({cfg.labels.join(" / ")}).
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function RankingQuestion({ question, value, onChange }: {
  question: QuestionOut; value: string[]; onChange: (v: string[]) => void
}) {
  const opts = question.options as string[]
  const items = value.length ? value : opts
  const dragIdx = useRef<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function move(from: number, to: number) {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  function onDragStart(i: number) { dragIdx.current = i }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setOverIdx(i) }
  function onDrop(e: React.DragEvent, i: number) {
    e.preventDefault(); setOverIdx(null)
    if (dragIdx.current !== null && dragIdx.current !== i) move(dragIdx.current, i)
    dragIdx.current = null
  }
  function onDragEnd() { setOverIdx(null); dragIdx.current = null }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>Drag to reorder · 1 = most preferred</p>
      {items.map((item, i) => (
        <div key={item} draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={e => onDragOver(e, i)}
          onDrop={e => onDrop(e, i)}
          onDragEnd={onDragEnd}
          className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all cursor-grab active:cursor-grabbing"
          style={overIdx === i && dragIdx.current !== i
            ? { background: "rgba(15,40,65,0.12)", border: "1.5px solid rgba(15,40,65,0.35)" }
            : dragIdx.current === i
              ? { background: "rgba(255,255,255,0.25)", border: "1.5px solid rgba(255,255,255,0.4)", opacity: 0.4 }
              : { background: "rgba(255,255,255,0.4)", border: "1.5px solid rgba(255,255,255,0.6)" }
          }>
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-0.5" style={{ color: "rgba(10,30,51,0.2)" }}>
            {[0,1,2].map(r => <div key={r} className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" />
            </div>)}
          </div>
          <span className="flex-1 text-sm" style={{ color: "rgba(10,30,51,0.75)" }}>{item}</span>
          <div className="flex flex-col">
            <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)}
              className="disabled:opacity-20" style={{ color: "rgba(10,30,51,0.3)" }}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}
              className="disabled:opacity-20" style={{ color: "rgba(10,30,51,0.3)" }}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Open text
// ---------------------------------------------------------------------------

function TextQuestion({ value, onChange }: { question: QuestionOut; value: string; onChange: (v: string) => void }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder="Your answer…" rows={3}
      className="field w-full resize-y" />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type AnswerState = string | string[] | Record<string, string>

function RespondPageInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get("token")

  const [survey, setSurvey] = useState<SurveyOut | null>(null)
  const [isClosed, setIsClosed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    getSurvey(id)
      .then(s => {
        if (s.status === "closed") {
          setIsClosed(true)
        } else if (s.status !== "published") {
          setError("This survey is not currently accepting responses.")
        } else {
          setSurvey(s)
          const initial: Record<string, AnswerState> = {}
          s.questions.forEach(q => {
            if (q.question_type === "ranking") {
              initial[q.id] = (q.options as string[]) ?? []
            }
          })
          setAnswers(initial)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

  // suppress router unused warning
  void router

  function setAnswer(qid: string, v: AnswerState) {
    setAnswers(prev => ({ ...prev, [qid]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!survey) return
    setSubmitting(true); setError(null)
    try {
      const payload = survey.questions.map(q => {
        const raw = answers[q.id]
        let value: string
        if (q.question_type === "multiple_choice") {
          value = JSON.stringify(Array.isArray(raw) ? raw : [])
        } else if (q.question_type === "ranking") {
          value = JSON.stringify(Array.isArray(raw) ? raw : (q.options as string[]) ?? [])
        } else if (q.question_type === "forced_choice") {
          value = JSON.stringify(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})
        } else {
          value = String(raw ?? "")
        }
        return { question_id: q.id, value }
      })
      await submitResponse(id, { answers: payload, respondent_ref: inviteToken ?? null })
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>Loading…</main>
    </div>
  )

  if (isClosed) return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "rgba(239,68,68,0.1)" }}
        >
          <svg className="h-8 w-8" style={{ color: "#DD6334" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="page-title">Assessment closed</h1>
        <p className="text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>This assessment is no longer accepting responses.</p>
      </main>
    </div>
  )

  if (submitted) return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "rgba(16,185,129,0.12)" }}
        >
          <svg className="h-8 w-8" style={{ color: "#7E8A55" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="page-title">Response submitted</h1>
        <p className="text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>Thank you for completing this assessment.</p>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-xl">
          {error && !survey && (
            <div
              className="rounded-xl px-5 py-4 text-sm"
              style={{ background: "rgba(245,158,11,0.1)", border: "0.5px solid rgba(245,158,11,0.25)", color: "#7A4F0B" }}
            >
              {error}
            </div>
          )}

          {survey && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Survey header */}
              <div className="card px-6 py-5">
                <h1 className="section-heading">{survey.name}</h1>
                {survey.description && (
                  <p className="mt-1 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>{survey.description}</p>
                )}
                <p className="mt-3 text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>
                  {survey.questions.length} question{survey.questions.length !== 1 ? "s" : ""}
                </p>
              </div>

              {survey.questions.map((q, i) => (
                <div key={q.id} className="card px-6 py-5">
                  <p className="mb-4 text-sm font-semibold" style={{ color: "#0A1E33" }}>
                    <span className="mr-2" style={{ color: "rgba(10,30,51,0.35)" }}>{i + 1}.</span>{q.text}
                  </p>

                  {(q.question_type === "likert_5" || q.question_type === "likert_7") && (
                    <LikertQuestion question={q} value={String(answers[q.id] ?? "")}
                      onChange={v => setAnswer(q.id, v)} scale={q.question_type === "likert_5" ? 5 : 7} />
                  )}
                  {q.question_type === "single_choice" && (
                    <SingleChoiceQuestion question={q} value={String(answers[q.id] ?? "")}
                      onChange={v => setAnswer(q.id, v)} />
                  )}
                  {q.question_type === "multiple_choice" && (
                    <MultipleChoiceQuestion question={q}
                      value={Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : []}
                      onChange={v => setAnswer(q.id, v)} />
                  )}
                  {q.question_type === "forced_choice" && (
                    <ForcedChoiceQuestion question={q}
                      value={(answers[q.id] && typeof answers[q.id] === "object" && !Array.isArray(answers[q.id]))
                        ? (answers[q.id] as Record<string, string>) : {}}
                      onChange={v => setAnswer(q.id, v)} />
                  )}
                  {q.question_type === "ranking" && (
                    <RankingQuestion question={q}
                      value={Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : (q.options as string[]) ?? []}
                      onChange={v => setAnswer(q.id, v)} />
                  )}
                  {q.question_type === "text" && (
                    <TextQuestion question={q} value={String(answers[q.id] ?? "")}
                      onChange={v => setAnswer(q.id, v)} />
                  )}
                </div>
              ))}

              {error && <div className="alert-error">{error}</div>}

              <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-sm">
                {submitting ? "Submitting…" : "Submit Response"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

export default function RespondPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>Loading…</main>
      </div>
    }>
      <RespondPageInner />
    </Suspense>
  )
}
