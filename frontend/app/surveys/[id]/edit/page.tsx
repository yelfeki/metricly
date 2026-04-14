"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Header from "@/components/Header"
import {
  getSurvey,
  updateSurvey,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getFactors,
  createFactor,
  updateFactor,
  deleteFactor,
  getAlgorithms,
  createAlgorithm,
  updateAlgorithm,
} from "@/lib/api"
import type {
  LabelThreshold,
  QuestionDraft,
  QuestionOut,
  QuestionType,
  ScoringAlgorithm,
  SurveyFactor,
  SurveyStatus,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUESTION_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: "likert_5",        label: "Likert 1–5",      icon: "★" },
  { value: "likert_7",        label: "Likert 1–7",      icon: "★" },
  { value: "forced_choice",   label: "Forced Choice",   icon: "⇄" },
  { value: "ranking",         label: "Ranking",         icon: "↕" },
  { value: "single_choice",   label: "Single Choice",   icon: "◉" },
  { value: "multiple_choice", label: "Multiple Choice", icon: "☑" },
  { value: "text",            label: "Open Text",       icon: "¶" },
]

const NEEDS_OPTIONS: QuestionType[] = ["single_choice", "multiple_choice", "ranking", "forced_choice"]
const SCORED_OPTIONS: QuestionType[] = ["single_choice", "multiple_choice", "forced_choice"]
const LIKERT_TYPES: QuestionType[] = ["likert_5", "likert_7"]

// ---------------------------------------------------------------------------
// Extended draft type: serverId is set for questions that already exist in DB
// ---------------------------------------------------------------------------

interface EditDraft extends QuestionDraft {
  serverId: string | null  // null → new, not yet saved
}

function newDraft(position: number, type: QuestionType = "likert_5"): EditDraft {
  const needsList = NEEDS_OPTIONS.includes(type)
  return {
    localId: crypto.randomUUID(),
    serverId: null,
    text: "",
    question_type: type,
    options: needsList ? ["", ""] : [],
    forced_choice_labels: ["Most like me", "Least like me"],
    option_scores: needsList ? [0, 0] : [],
    factor: "",
    reverse_scored: false,
    score_weight: 1.0,
    position,
    is_demographic: false,
    demographic_key: "",
  }
}

function questionOutToEditDraft(q: QuestionOut, position: number): EditDraft {
  let options: string[] = []
  let forced_choice_labels: [string, string] = ["Most like me", "Least like me"]
  let option_scores: number[] = []

  if (q.question_type === "forced_choice" && q.options && !Array.isArray(q.options)) {
    const cfg = q.options as { items: string[]; labels: [string, string] }
    options = cfg.items ?? []
    forced_choice_labels = cfg.labels ?? ["Most like me", "Least like me"]
    option_scores = options.map(item => q.option_scores?.[item] ?? 0)
  } else if (Array.isArray(q.options)) {
    options = q.options as string[]
    option_scores = options.map(opt => q.option_scores?.[opt] ?? 0)
  }

  return {
    localId: crypto.randomUUID(),
    serverId: q.id,
    text: q.text,
    question_type: q.question_type,
    options,
    forced_choice_labels,
    option_scores,
    factor: q.factor ?? "",
    reverse_scored: q.reverse_scored ?? false,
    score_weight: q.score_weight ?? 1.0,
    position,
    is_demographic: q.is_demographic ?? false,
    demographic_key: q.demographic_key ?? "",
  }
}

// ---------------------------------------------------------------------------
// Factor dropdown
// ---------------------------------------------------------------------------

interface FactorSelectProps {
  value: string
  factorNames: string[]
  onChange: (name: string) => void
  onCreateFactor: (name: string) => void
}

function FactorSelect({ value, factorNames, onChange, onCreateFactor }: FactorSelectProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  function saveNew() {
    const trimmed = newName.trim()
    if (trimmed) { onCreateFactor(trimmed); onChange(trimmed) }
    setCreating(false); setNewName("")
  }

  if (creating) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") { setCreating(false); setNewName("") } }}
          placeholder="Factor name"
          className="w-28 rounded border border-indigo-300 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <button type="button" onClick={saveNew} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Save</button>
        <button type="button" onClick={() => { setCreating(false); setNewName("") }} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
      </div>
    )
  }

  return (
    <select
      value={value || ""}
      onChange={e => {
        if (e.target.value === "__new__") { setCreating(true) }
        else { onChange(e.target.value) }
      }}
      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
    >
      <option value="">No factor</option>
      {factorNames.map(f => <option key={f} value={f}>{f}</option>)}
      <option value="__new__">+ New factor…</option>
    </select>
  )
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

interface CardProps {
  q: EditDraft
  index: number
  total: number
  factorNames: string[]
  onChange: (localId: string, patch: Partial<EditDraft>) => void
  onDelete: (localId: string) => void
  onMoveUp: (localId: string) => void
  onMoveDown: (localId: string) => void
  onCreateFactor: (name: string) => void
}

function QuestionCard({ q, index, total, factorNames, onChange, onDelete, onMoveUp, onMoveDown, onCreateFactor }: CardProps) {
  const isChoice  = q.question_type === "single_choice" || q.question_type === "multiple_choice"
  const isFC      = q.question_type === "forced_choice"
  const isRanking = q.question_type === "ranking"
  const isLikert  = LIKERT_TYPES.includes(q.question_type)
  const needsList = isChoice || isFC || isRanking
  const hasScores = SCORED_OPTIONS.includes(q.question_type)

  function setOption(i: number, v: string) {
    const next = [...q.options]; next[i] = v; onChange(q.localId, { options: next })
  }
  function setOptionScore(i: number, v: string) {
    const scores = [...q.option_scores]
    scores[i] = parseFloat(v) || 0
    onChange(q.localId, { option_scores: scores })
  }
  function addOption() {
    onChange(q.localId, { options: [...q.options, ""], option_scores: [...q.option_scores, 0] })
  }
  function removeOption(i: number) {
    onChange(q.localId, {
      options: q.options.filter((_, idx) => idx !== i),
      option_scores: q.option_scores.filter((_, idx) => idx !== i),
    })
  }
  function setLabel(i: 0 | 1, v: string) {
    const next: [string, string] = [...q.forced_choice_labels] as [string, string]
    next[i] = v
    onChange(q.localId, { forced_choice_labels: next })
  }
  function handleTypeChange(type: QuestionType) {
    const willNeedList = NEEDS_OPTIONS.includes(type)
    const hadList = NEEDS_OPTIONS.includes(q.question_type)
    const options = willNeedList ? (hadList && q.options.length ? q.options : ["", ""]) : []
    const option_scores = willNeedList ? (hadList && q.option_scores.length ? q.option_scores : [0, 0]) : []
    onChange(q.localId, { question_type: type, options, option_scores })
  }

  const itemLabel = isFC ? "Item" : "Option"

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-1.5 flex cursor-grab flex-col gap-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing">
          {[0,1,2].map(r => (
            <div key={r} className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </div>
          ))}
        </div>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            value={q.text}
            onChange={e => onChange(q.localId, { text: e.target.value })}
            placeholder={`Question ${index + 1}`}
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />
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

          {/* Psychometric metadata row */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">Factor:</span>
              <FactorSelect
                value={q.factor}
                factorNames={factorNames}
                onChange={name => onChange(q.localId, { factor: name })}
                onCreateFactor={onCreateFactor}
              />
            </div>
            {isLikert && (
              <>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={q.reverse_scored}
                    onChange={e => onChange(q.localId, { reverse_scored: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-[11px] font-medium text-slate-500">Reverse scored</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-400">Weight:</span>
                  <input
                    type="number"
                    value={q.score_weight}
                    min="0"
                    step="0.1"
                    onChange={e => onChange(q.localId, { score_weight: parseFloat(e.target.value) || 1.0 })}
                    className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
              </>
            )}
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={q.is_demographic}
                onChange={e => onChange(q.localId, { is_demographic: e.target.checked, demographic_key: e.target.checked ? q.demographic_key : "" })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
              />
              <span className="text-[11px] font-medium text-slate-500">Demographic</span>
            </label>
            {q.is_demographic && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400">Key:</span>
                <input
                  value={q.demographic_key}
                  onChange={e => onChange(q.localId, { demographic_key: e.target.value })}
                  placeholder="e.g. department"
                  className="w-32 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                />
              </div>
            )}
          </div>

          {isLikert && (
            <div className="flex gap-1.5">
              {Array.from({ length: q.question_type === "likert_5" ? 5 : 7 }, (_, i) => (
                <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold ${
                  q.reverse_scored ? "border-amber-200 bg-amber-50 text-amber-500" : "border-slate-200 bg-slate-50 text-slate-400"
                }`}>
                  {q.reverse_scored ? (q.question_type === "likert_5" ? 5 : 7) - i : i + 1}
                </div>
              ))}
              {q.reverse_scored && (
                <span className="self-center text-[10px] text-amber-500 font-medium">reversed</span>
              )}
            </div>
          )}

          {isFC && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-indigo-50 p-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Label A</label>
                <input value={q.forced_choice_labels[0]} onChange={e => setLabel(0, e.target.value)}
                  placeholder="e.g. Most like me"
                  className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Label B</label>
                <input value={q.forced_choice_labels[1]} onChange={e => setLabel(1, e.target.value)}
                  placeholder="e.g. Least like me"
                  className="w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              </div>
            </div>
          )}
          {isRanking && (
            <p className="text-[11px] text-slate-400">Respondents will drag these items into their preferred order.</p>
          )}
          {needsList && (
            <div className="space-y-2">
              {hasScores && (
                <div className="flex items-center gap-2 px-0.5">
                  <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    {isFC ? "Item" : "Option"}
                  </span>
                  <span className="w-16 text-right text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    {isFC ? "Weight" : "Score"}
                  </span>
                </div>
              )}
              {q.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-slate-400 font-medium">
                    {isRanking ? i + 1 : isFC ? "·" : q.question_type === "multiple_choice" ? "☐" : "○"}
                  </span>
                  <input value={opt} onChange={e => setOption(i, e.target.value)}
                    placeholder={`${itemLabel} ${i + 1}`}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100" />
                  {hasScores && (
                    <input
                      type="number"
                      value={q.option_scores[i] ?? 0}
                      step="0.1"
                      onChange={e => setOptionScore(i, e.target.value)}
                      placeholder="0"
                      title={isFC ? "Weight for this item" : "Score for this option"}
                      className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                    />
                  )}
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
// Factor row (in Factors tab)
// ---------------------------------------------------------------------------

interface FactorRowProps {
  factor: SurveyFactor
  onSave: (id: string, name: string, description: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function FactorRow({ factor, onSave, onDelete }: FactorRowProps) {
  const [name, setName] = useState(factor.name)
  const [description, setDescription] = useState(factor.description ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = name !== factor.name || description !== (factor.description ?? "")

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(factor.id, name.trim(), description.trim()) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await onDelete(factor.id) }
    finally { setDeleting(false) }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex-1 space-y-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (dirty && name.trim()) handleSave() }}
          placeholder="Factor name"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={() => { if (dirty) handleSave() }}
          placeholder="Description (optional)"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
        />
      </div>
      {saving && <span className="mt-2 text-xs text-slate-400">Saving…</span>}
      <button type="button" onClick={handleDelete} disabled={deleting}
        className="mt-1 rounded p-1 text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scoring algorithm form (one per factor)
// ---------------------------------------------------------------------------

interface ScoringFormProps {
  surveyId: string
  factor: SurveyFactor
  existing: ScoringAlgorithm | null
  onSaved: (algo: ScoringAlgorithm) => void
}

const DEFAULT_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

function ScoringAlgorithmForm({ surveyId, factor, existing, onSaved }: ScoringFormProps) {
  const [minPossible, setMinPossible] = useState(existing?.min_possible ?? 1)
  const [maxPossible, setMaxPossible] = useState(existing?.max_possible ?? 5)
  const [normMin, setNormMin] = useState(existing?.normalized_min ?? 0)
  const [normMax, setNormMax] = useState(existing?.normalized_max ?? 100)
  const [labels, setLabels] = useState<LabelThreshold[]>(existing?.labels ?? [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function addLabel() {
    const color = DEFAULT_COLORS[labels.length % DEFAULT_COLORS.length]
    setLabels(prev => [...prev, { threshold: 0, label: "", color }])
  }
  function removeLabel(i: number) {
    setLabels(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateLabel(i: number, patch: Partial<LabelThreshold>) {
    setLabels(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  async function handleSave() {
    if (maxPossible <= minPossible) { setErr("Max must be greater than min."); return }
    setErr(null); setSaving(true)
    try {
      const payload = {
        factor_id: factor.id,
        min_possible: minPossible,
        max_possible: maxPossible,
        normalized_min: normMin,
        normalized_max: normMax,
        labels: labels.length > 0 ? labels : null,
      }
      const algo = existing
        ? await updateAlgorithm(surveyId, existing.id, payload)
        : await createAlgorithm(surveyId, payload)
      onSaved(algo)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Live preview: normalize 0% to 100% of raw range and show label segments
  const sortedLabels = [...labels].sort((a, b) => a.threshold - b.threshold)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">{factor.name}</h3>

      {/* Raw score range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Min possible score
          </label>
          <input
            type="number"
            value={minPossible}
            step="0.1"
            onChange={e => setMinPossible(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Max possible score
          </label>
          <input
            type="number"
            value={maxPossible}
            step="0.1"
            onChange={e => setMaxPossible(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
          />
        </div>
      </div>

      {/* Normalized scale */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Normalized min
          </label>
          <input
            type="number"
            value={normMin}
            step="1"
            onChange={e => setNormMin(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Normalized max
          </label>
          <input
            type="number"
            value={normMax}
            step="1"
            onChange={e => setNormMax(parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-100 transition"
          />
        </div>
      </div>

      {/* Label thresholds */}
      <div>
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Label thresholds (on normalized scale)
        </label>
        {labels.length === 0 && (
          <p className="text-xs text-slate-400 mb-2">No labels defined. Scores will be shown as numbers only.</p>
        )}
        <div className="space-y-2">
          {labels.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 w-14">Threshold</span>
                <input
                  type="number"
                  value={l.threshold}
                  min={normMin}
                  max={normMax}
                  step="1"
                  onChange={e => updateLabel(i, { threshold: parseFloat(e.target.value) || 0 })}
                  className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
              <input
                value={l.label}
                onChange={e => updateLabel(i, { label: e.target.value })}
                placeholder="Label"
                className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={l.color}
                  onChange={e => updateLabel(i, { color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-slate-200 p-0.5"
                  title="Label color"
                />
              </div>
              <button type="button" onClick={() => removeLabel(i)}
                className="text-slate-300 hover:text-red-400 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLabel}
          className="mt-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add threshold
        </button>
      </div>

      {/* Live preview */}
      {labels.length > 0 && (
        <div>
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Preview
          </label>
          <div className="relative h-8 w-full overflow-hidden rounded-lg bg-slate-100">
            {sortedLabels.map((l, i) => {
              const next = sortedLabels[i + 1]
              const start = ((l.threshold - normMin) / (normMax - normMin)) * 100
              const end = next ? ((next.threshold - normMin) / (normMax - normMin)) * 100 : 100
              const width = Math.max(0, end - start)
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${start}%`,
                    width: `${width}%`,
                    height: "100%",
                    backgroundColor: l.color,
                    opacity: 0.85,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="text-[10px] font-semibold text-white drop-shadow truncate px-1">{l.label}</span>
                </div>
              )
            })}
            {/* Below-all-thresholds zone */}
            {sortedLabels.length > 0 && sortedLabels[0].threshold > normMin && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  width: `${((sortedLabels[0].threshold - normMin) / (normMax - normMin)) * 100}%`,
                  height: "100%",
                  backgroundColor: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span className="text-[10px] text-slate-400 truncate px-1">—</span>
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{normMin}</span>
            <span>{normMax}</span>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      <button type="button" onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
        {saving ? "Saving…" : existing ? "Update algorithm" : "Save algorithm"}
        {!saving && (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EditSurveyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<SurveyStatus>("draft")
  const [questions, setQuestions] = useState<EditDraft[]>([])
  const [originalServerIds, setOriginalServerIds] = useState<Set<string>>(new Set())
  const [factors, setFactors] = useState<SurveyFactor[]>([])
  const [algorithms, setAlgorithms] = useState<ScoringAlgorithm[]>([])
  const [activeTab, setActiveTab] = useState<"questions" | "factors" | "scoring">("questions")

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Drag state
  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const factorNames = factors.map(f => f.name)

  // Load survey + factors + algorithms on mount
  useEffect(() => {
    Promise.all([getSurvey(id), getFactors(id), getAlgorithms(id)])
      .then(([survey, loadedFactors, loadedAlgos]) => {
        setTitle(survey.name)
        setDescription(survey.description ?? "")
        setStatus(survey.status)
        const sorted = [...survey.questions].sort((a, b) => a.position - b.position)
        setQuestions(sorted.map((q, i) => questionOutToEditDraft(q, i + 1)))
        setOriginalServerIds(new Set(survey.questions.map(q => q.id)))
        setFactors(loadedFactors)
        setAlgorithms(loadedAlgos)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingData(false))
  }, [id])

  // ── Factor operations (immediate API sync) ────────────────────────────────

  async function handleAddFactor() {
    const f = await createFactor(id, { name: "New factor", description: null })
    setFactors(prev => [...prev, f])
  }

  async function handleSaveFactor(factorId: string, name: string, desc: string) {
    const updated = await updateFactor(id, factorId, { name, description: desc || null })
    setFactors(prev => prev.map(f => f.id === factorId ? updated : f))
  }

  async function handleDeleteFactor(factorId: string) {
    await deleteFactor(id, factorId)
    setFactors(prev => prev.filter(f => f.id !== factorId))
  }

  async function handleCreateFactorInline(name: string) {
    const f = await createFactor(id, { name, description: null })
    setFactors(prev => [...prev, f])
  }

  // ── Question operations ───────────────────────────────────────────────────

  function addNewQuestion(type: QuestionType) {
    setQuestions(prev => [...prev, newDraft(prev.length + 1, type)])
  }

  function onChange(localId: string, patch: Partial<EditDraft>) {
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

  function buildOptionScores(q: EditDraft): Record<string, number> | null {
    if (!SCORED_OPTIONS.includes(q.question_type)) return null
    const hasNonZero = q.option_scores.some(s => s !== 0)
    if (!hasNonZero) return null
    const map: Record<string, number> = {}
    q.options.forEach((opt, i) => {
      const key = opt.trim()
      if (key) map[key] = q.option_scores[i] ?? 0
    })
    return Object.keys(map).length ? map : null
  }

  function buildQuestionPayload(q: EditDraft) {
    const base = {
      text: q.text.trim() || `Question ${q.position}`,
      question_type: q.question_type,
      position: q.position,
      factor: q.factor || null,
      reverse_scored: q.reverse_scored,
      score_weight: q.score_weight,
      option_scores: buildOptionScores(q),
      is_demographic: q.is_demographic,
      demographic_key: q.is_demographic ? (q.demographic_key.trim() || null) : null,
    }
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
  }

  async function handleSave() {
    if (!title.trim()) { setSaveError("Survey title is required."); return }
    setSaveError(null); setSaving(true)
    try {
      // 1. Update survey metadata
      await updateSurvey(id, { name: title.trim(), description: description.trim() || null, status })

      // 2. Delete removed questions
      const currentServerIds = new Set(questions.filter(q => q.serverId).map(q => q.serverId!))
      const toDelete = Array.from(originalServerIds).filter(sid => !currentServerIds.has(sid))
      await Promise.all(toDelete.map(sid => deleteQuestion(sid)))

      // 3. Update or create questions sequentially to preserve order
      for (const q of questions) {
        const payload = buildQuestionPayload(q)
        if (q.serverId) {
          await updateQuestion(q.serverId, payload)
        } else {
          await addQuestion(id, payload)
        }
      }

      router.push(`/surveys/${id}/results`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/surveys" backLabel="Surveys" />
        <main className="flex flex-1 items-center justify-center py-20 text-sm text-slate-400">
          Loading survey…
        </main>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/surveys" backLabel="Surveys" />
        <main className="flex flex-1 items-center justify-center py-20">
          <p className="text-sm text-red-600">{loadError}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit Survey</h1>
            <p className="mt-1 text-sm text-slate-500">Changes are saved when you click Save.</p>
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
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Status</label>
              <div className="flex gap-3">
                {(["draft", "published"] as SurveyStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors capitalize ${
                      status === s
                        ? s === "published" ? "bg-emerald-600 text-white" : "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {([
              ["questions", `Questions (${questions.length})`],
              ["factors", `Factors (${factors.length})`],
              ["scoring", "Scoring"],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === tab
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Questions tab */}
          {activeTab === "questions" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
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
                  <QuestionCard
                    q={q} index={index} total={questions.length}
                    factorNames={factorNames}
                    onChange={onChange} onDelete={onDelete} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
                    onCreateFactor={handleCreateFactorInline}
                  />
                </div>
              ))}

              {/* Add question palette */}
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-4">
                <p className="mb-3 text-center text-xs font-medium text-slate-400">Add question</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUESTION_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => addNewQuestion(t.value)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">
                      <span>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Factors tab */}
          {activeTab === "factors" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Define the factors (subscales) of your instrument. Changes are saved immediately.
              </p>

              {factors.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">No factors defined yet.</p>
                  <p className="mt-1 text-xs text-slate-400">Add a factor below, or create one inline from any question card.</p>
                </div>
              )}

              {factors.map(f => (
                <FactorRow
                  key={f.id}
                  factor={f}
                  onSave={handleSaveFactor}
                  onDelete={handleDeleteFactor}
                />
              ))}

              <button type="button" onClick={handleAddFactor}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-xs font-medium text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add factor
              </button>
            </div>
          )}

          {/* Scoring tab */}
          {activeTab === "scoring" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Configure how each factor&apos;s raw mean score is normalized and mapped to interpretable labels.
              </p>
              {factors.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">No factors defined yet.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Add factors in the Factors tab first, then configure scoring here.
                  </p>
                </div>
              ) : (
                factors.map(factor => {
                  const existing = algorithms.find(a => a.factor_id === factor.id) ?? null
                  return (
                    <ScoringAlgorithmForm
                      key={factor.id}
                      surveyId={id}
                      factor={factor}
                      existing={existing}
                      onSaved={algo =>
                        setAlgorithms(prev => {
                          const without = prev.filter(a => a.id !== algo.id)
                          return [...without, algo]
                        })
                      }
                    />
                  )
                })
              )}
            </div>
          )}

          {saveError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{saveError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => router.back()} disabled={saving}
              className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
              {!saving && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
