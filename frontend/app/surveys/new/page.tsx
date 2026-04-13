"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import { createSurvey } from "@/lib/api"
import type { QuestionDraft, QuestionType } from "@/lib/types"

// ---------------------------------------------------------------------------
// Question type catalogue
// ---------------------------------------------------------------------------

const QUESTION_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: "likert_5",       label: "Likert 1–5",      icon: "★" },
  { value: "likert_7",       label: "Likert 1–7",      icon: "★" },
  { value: "forced_choice",  label: "Forced Choice",   icon: "⇄" },
  { value: "ranking",        label: "Ranking",         icon: "↕" },
  { value: "single_choice",  label: "Single Choice",   icon: "◉" },
  { value: "multiple_choice",label: "Multiple Choice", icon: "☑" },
  { value: "text",           label: "Open Text",       icon: "¶" },
]

// Types that need an option/item list
const NEEDS_OPTIONS: QuestionType[] = [
  "single_choice", "multiple_choice", "ranking", "forced_choice",
]

function newQuestion(position: number, type: QuestionType = "likert_5"): QuestionDraft {
  return {
    localId: crypto.randomUUID(),
    text: "",
    question_type: type,
    options: NEEDS_OPTIONS.includes(type) ? ["", ""] : [],
    forced_choice_labels: ["Most like me", "Least like me"],
    position,
  }
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

interface CardProps {
  q: QuestionDraft
  index: number
  total: number
  onChange: (localId: string, patch: Partial<QuestionDraft>) => void
  onDelete: (localId: string) => void
  onMoveUp: (localId: string) => void
  onMoveDown: (localId: string) => void
}

function QuestionCard({ q, index, total, onChange, onDelete, onMoveUp, onMoveDown }: CardProps) {
  const isChoice  = q.question_type === "single_choice" || q.question_type === "multiple_choice"
  const isFC      = q.question_type === "forced_choice"
  const isRanking = q.question_type === "ranking"
  const needsList = isChoice || isFC || isRanking

  function setOption(i: number, v: string) {
    const next = [...q.options]; next[i] = v; onChange(q.localId, { options: next })
  }
  function addOption() { onChange(q.localId, { options: [...q.options, ""] }) }
  function removeOption(i: number) {
    onChange(q.localId, { options: q.options.filter((_, idx) => idx !== i) })
  }
  function setLabel(i: 0 | 1, v: string) {
    const next: [string, string] = [...q.forced_choice_labels] as [string, string]
    next[i] = v
    onChange(q.localId, { forced_choice_labels: next })
  }

  function handleTypeChange(type: QuestionType) {
    const willNeedList = NEEDS_OPTIONS.includes(type)
    const hadList = NEEDS_OPTIONS.includes(q.question_type)
    onChange(q.localId, {
      question_type: type,
      options: willNeedList ? (hadList && q.options.length ? q.options : ["", ""]) : [],
    })
  }

  const itemLabel = isFC ? "Item" : "Option"

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Grip dots (drag handle visual) */}
        <div className="mt-1.5 flex cursor-grab flex-col gap-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing">
          {[0,1,2].map(r => (
            <div key={r} className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </div>
          ))}
        </div>

        {/* Number badge */}
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Question text */}
          <textarea
            value={q.text}
            onChange={e => onChange(q.localId, { text: e.target.value })}
            placeholder={`Question ${index + 1}`}
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />

          {/* Type pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">Type:</span>
            {QUESTION_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  q.question_type === t.value
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Likert preview */}
          {(q.question_type === "likert_5" || q.question_type === "likert_7") && (
            <div className="flex gap-1.5">
              {Array.from({ length: q.question_type === "likert_5" ? 5 : 7 }, (_, i) => (
                <div key={i} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Forced-choice labels */}
          {isFC && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-indigo-50 p-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Label A</label>
                <input value={q.forced_choice_labels[0]} onChange={e => setLabel(0, e.target.value)}
                  placeholder="e.g. Most like me"
                  className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Label B (forced)</label>
                <input value={q.forced_choice_labels[1]} onChange={e => setLabel(1, e.target.value)}
                  placeholder="e.g. Least like me"
                  className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              </div>
            </div>
          )}

          {/* Ranking preview badge */}
          {isRanking && (
            <p className="text-[11px] text-slate-400">
              Respondents will drag these items into their preferred order.
            </p>
          )}

          {/* Options / Items list */}
          {needsList && (
            <div className="space-y-2">
              {q.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Indicator icon */}
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-slate-400 font-medium">
                    {isRanking ? i + 1 : isFC ? "·" : q.question_type === "multiple_choice" ? "☐" : "○"}
                  </span>
                  <input value={opt} onChange={e => setOption(i, e.target.value)}
                    placeholder={`${itemLabel} ${i + 1}`}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100" />
                  {q.options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)}
                      className="text-slate-300 hover:text-red-400 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addOption}
                className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add {itemLabel.toLowerCase()}
              </button>
            </div>
          )}
        </div>

        {/* Up / Down / Delete */}
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => onMoveUp(q.localId)} disabled={index === 0}
            className="rounded p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors" title="Move up">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button type="button" onClick={() => onMoveDown(q.localId)} disabled={index === total - 1}
            className="rounded p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors" title="Move down">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button type="button" onClick={() => onDelete(q.localId)}
            className="rounded p-1 text-slate-300 hover:text-red-500 transition-colors" title="Delete">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewSurveyPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion(1, "likert_5")])
  const [saving, setSaving] = useState<"draft" | "published" | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Drag-and-drop state
  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function addQuestion(type: QuestionType) {
    setQuestions(prev => [...prev, newQuestion(prev.length + 1, type)])
  }

  function onChange(localId: string, patch: Partial<QuestionDraft>) {
    setQuestions(prev => prev.map(q => q.localId === localId ? { ...q, ...patch } : q))
  }

  function onDelete(localId: string) {
    setQuestions(prev =>
      prev.filter(q => q.localId !== localId).map((q, i) => ({ ...q, position: i + 1 }))
    )
  }

  function onMoveUp(localId: string) {
    setQuestions(prev => {
      const idx = prev.findIndex(q => q.localId === localId)
      if (idx === 0) return prev
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next.map((q, i) => ({ ...q, position: i + 1 }))
    })
  }

  function onMoveDown(localId: string) {
    setQuestions(prev => {
      const idx = prev.findIndex(q => q.localId === localId)
      if (idx === prev.length - 1) return prev
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next.map((q, i) => ({ ...q, position: i + 1 }))
    })
  }

  function handleDragStart(e: React.DragEvent, localId: string) {
    dragId.current = localId
    e.dataTransfer.effectAllowed = "move"
  }
  function handleDragOver(e: React.DragEvent, localId: string) {
    e.preventDefault(); setDragOverId(localId)
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault(); setDragOverId(null)
    const fromId = dragId.current
    if (!fromId || fromId === targetId) return
    setQuestions(prev => {
      const items = [...prev]
      const fi = items.findIndex(q => q.localId === fromId)
      const ti = items.findIndex(q => q.localId === targetId)
      const [moved] = items.splice(fi, 1)
      items.splice(ti, 0, moved)
      return items.map((q, i) => ({ ...q, position: i + 1 }))
    })
    dragId.current = null
  }
  function handleDragEnd() { setDragOverId(null); dragId.current = null }

  async function handleSave(status: "draft" | "published") {
    if (!title.trim()) { setError("Survey title is required."); return }
    setError(null); setSaving(status)
    try {
      await createSurvey({
        name: title.trim(),
        description: description.trim() || null,
        status,
        questions: questions.map(q => {
          const base = { text: q.text || `Question ${q.position}`, question_type: q.question_type, position: q.position }
          if (q.question_type === "forced_choice") {
            return {
              ...base,
              forced_choice_config: {
                items: q.options.map(o => o.trim()).filter(Boolean),
                labels: q.forced_choice_labels,
              },
            }
          }
          return {
            ...base,
            options: NEEDS_OPTIONS.includes(q.question_type)
              ? q.options.map(o => o.trim()).filter(Boolean)
              : null,
          }
        }),
      })
      router.push("/surveys")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Survey</h1>
            <p className="mt-1 text-sm text-slate-500">Build your survey, then save as draft or publish.</p>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Title <span className="text-red-500">*</span>
              </label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Job Satisfaction Survey"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description <span className="text-slate-400 font-normal normal-case">(optional)</span>
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Briefly describe the purpose of this survey…" rows={2}
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition" />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Questions ({questions.length})
              </h2>
              <p className="text-xs text-slate-400">Drag ⠿ to reorder</p>
            </div>

            {questions.map((q, index) => (
              <div key={q.localId}
                draggable
                onDragStart={e => handleDragStart(e, q.localId)}
                onDragOver={e => handleDragOver(e, q.localId)}
                onDrop={e => handleDrop(e, q.localId)}
                onDragEnd={handleDragEnd}
                className={`rounded-xl transition-all ${
                  dragOverId === q.localId && dragId.current !== q.localId
                    ? "ring-2 ring-indigo-400 ring-offset-1" : ""
                } ${dragId.current === q.localId ? "opacity-50" : ""}`}
              >
                <QuestionCard q={q} index={index} total={questions.length}
                  onChange={onChange} onDelete={onDelete} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
              </div>
            ))}

            {/* Add question palette */}
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-4">
              <p className="mb-3 text-center text-xs font-medium text-slate-400">Add question</p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUESTION_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => addQuestion(t.value)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => handleSave("draft")} disabled={saving !== null}
              className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              {saving === "draft" ? "Saving…" : "Save as Draft"}
            </button>
            <button type="button" onClick={() => handleSave("published")} disabled={saving !== null}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
              {saving === "published" ? "Publishing…" : "Publish"}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
