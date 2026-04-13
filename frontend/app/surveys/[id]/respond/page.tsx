"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
              className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border-2 py-3 transition-all ${
                selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
              }`}>
              <input type="radio" name={question.id} value={v} checked={selected}
                onChange={() => onChange(v)} className="sr-only" />
              <span className={`text-lg font-bold ${selected ? "text-indigo-600" : "text-slate-400"}`}>{v}</span>
            </label>
          )
        })}
      </div>
      <div className="flex justify-between px-1 text-[11px] text-slate-400">
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
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all ${
              selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
            }`}>
            <input type="radio" name={question.id} value={opt} checked={selected}
              onChange={() => onChange(opt)} className="sr-only" />
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
              selected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
            }`}>
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="text-sm text-slate-700">{opt}</span>
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
            className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all ${
              selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
            }`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              selected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
            }`}>
              {selected && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>}
            </span>
            <input type="checkbox" checked={selected} onChange={() => toggle(opt)} className="sr-only" />
            <span className="text-sm text-slate-700">{opt}</span>
          </label>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forced choice
// Respondent assigns exactly one item per label (radio-per-column behaviour).
// Selecting label A on item X automatically clears label A from every other item.
// If item X already holds label B, label B is cleared too (each item gets ≤ 1 label).
// ---------------------------------------------------------------------------

function ForcedChoiceQuestion({ question, value, onChange }: {
  question: QuestionOut
  value: Record<string, string>   // { "Most like me": "Bold", "Least like me": "Careful" }
  onChange: (v: Record<string, string>) => void
}) {
  const cfg = question.options as ForcedChoiceConfig
  const [labelA, labelB] = cfg.labels

  function assign(label: string, item: string) {
    const next = { ...value }
    // Remove the label from wherever it currently sits
    Object.keys(next).forEach(l => { if (next[l] === item) delete next[l] })
    // If the item currently holds the OTHER label, remove that too
    // (an item can only hold one label at a time)
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
            <th className="w-24 py-2 text-center text-xs font-semibold text-indigo-600">{labelA}</th>
            <th className="py-2 text-left text-xs font-medium text-slate-500">Item</th>
            <th className="w-24 py-2 text-center text-xs font-semibold text-indigo-600">{labelB}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cfg.items.map(item => {
            const hasA = value[labelA] === item
            const hasB = value[labelB] === item
            return (
              <tr key={item} className="hover:bg-slate-50">
                {/* Label A column */}
                <td className="py-2.5 text-center">
                  <button type="button" onClick={() => assign(labelA, item)}
                    className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                      hasA ? "border-indigo-500 bg-indigo-500" : "border-slate-300 hover:border-indigo-300"
                    }`}>
                    {hasA && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </button>
                </td>
                {/* Item */}
                <td className={`py-2.5 px-3 font-medium ${hasA || hasB ? "text-slate-900" : "text-slate-600"}`}>
                  {item}
                  {hasA && <span className="ml-2 text-[10px] font-semibold text-indigo-500">{labelA}</span>}
                  {hasB && <span className="ml-2 text-[10px] font-semibold text-indigo-500">{labelB}</span>}
                </td>
                {/* Label B column */}
                <td className="py-2.5 text-center">
                  <button type="button" onClick={() => assign(labelB, item)}
                    className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                      hasB ? "border-indigo-500 bg-indigo-500" : "border-slate-300 hover:border-indigo-300"
                    }`}>
                    {hasB && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {Object.keys(value).length < 2 && (
        <p className="mt-2 text-xs text-slate-400">
          Assign one item to each label ({cfg.labels.join(" / ")}).
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ranking
// Respondents drag items into their preferred order (1 = most preferred).
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
      <p className="text-xs text-slate-400">Drag to reorder · 1 = most preferred</p>
      {items.map((item, i) => (
        <div key={item} draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={e => onDragOver(e, i)}
          onDrop={e => onDrop(e, i)}
          onDragEnd={onDragEnd}
          className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all cursor-grab active:cursor-grabbing ${
            overIdx === i && dragIdx.current !== i
              ? "border-indigo-400 bg-indigo-50"
              : "border-slate-200 bg-white hover:border-slate-300"
          } ${dragIdx.current === i ? "opacity-40" : ""}`}>
          {/* Rank badge */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
            {i + 1}
          </span>
          {/* Drag dots */}
          <div className="flex flex-col gap-0.5 text-slate-300">
            {[0,1,2].map(r => <div key={r} className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" />
            </div>)}
          </div>
          <span className="flex-1 text-sm text-slate-700">{item}</span>
          {/* Up / Down for accessibility */}
          <div className="flex flex-col">
            <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)}
              className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}
              className="text-slate-300 hover:text-slate-600 disabled:opacity-20">
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

function TextQuestion({ question, value, onChange }: {
  question: QuestionOut; value: string; onChange: (v: string) => void
}) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder="Your answer…" rows={3}
      className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type AnswerState = string | string[] | Record<string, string>

export default function RespondPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [survey, setSurvey] = useState<SurveyOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    getSurvey(id)
      .then(s => {
        if (s.status !== "published") {
          setError("This survey is not currently accepting responses.")
        } else {
          setSurvey(s)
          // Seed ranking answers in original order
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
      await submitResponse(id, { answers: payload })
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading survey…</main>
    </div>
  )

  if (submitted) return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Response submitted</h1>
        <p className="text-sm text-slate-500">Thank you for completing the survey.</p>
        <button onClick={() => router.push("/surveys")}
          className="mt-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
          Back to Surveys
        </button>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-xl">
          {error && !survey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">{error}</div>
          )}

          {survey && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Survey header */}
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                <h1 className="text-xl font-bold text-slate-900">{survey.name}</h1>
                {survey.description && <p className="mt-1 text-sm text-slate-500">{survey.description}</p>}
                <p className="mt-3 text-xs text-slate-400">
                  {survey.questions.length} question{survey.questions.length !== 1 ? "s" : ""}
                </p>
              </div>

              {survey.questions.map((q, i) => (
                <div key={q.id} className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                  <p className="mb-4 text-sm font-semibold text-slate-800">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>{q.text}
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

              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
              )}

              <button type="submit" disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Submitting…" : "Submit Response"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
