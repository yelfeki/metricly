"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createSurvey, downloadImportTemplate, importSurveyFile } from "@/lib/api"
import type { ImportedQuestion, ImportedQuestionType, ImportResult } from "@/lib/types"
import type { QuestionCreatePayload } from "@/lib/api"

interface ImportModalProps {
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Local review state
// ---------------------------------------------------------------------------

interface ReviewQuestion {
  id: string
  text: string
  question_type: ImportedQuestionType
  likert_min: number
  likert_max: number
  options: string[]
  reverse_scored: boolean
  subscale: string
}

function toReview(iq: ImportedQuestion, idx: number): ReviewQuestion {
  return {
    id: `${idx}-${Math.random()}`,
    text: iq.text,
    question_type: iq.question_type,
    likert_min: iq.likert_min ?? 1,
    likert_max: iq.likert_max ?? 5,
    options: iq.options.length
      ? iq.options
      : iq.question_type === "yes_no"
        ? ["Yes", "No"]
        : iq.question_type === "true_false"
          ? ["True", "False"]
          : [],
    reverse_scored: iq.reverse_scored,
    subscale: iq.subscale ?? "",
  }
}

function toPayload(rq: ReviewQuestion, pos: number): QuestionCreatePayload {
  const base: Omit<QuestionCreatePayload, "question_type"> = {
    text: rq.text || `Question ${pos}`,
    position: pos,
    reverse_scored: rq.reverse_scored,
    score_weight: 1.0,
    factor: rq.subscale || null,
    is_demographic: false,
    demographic_key: null,
  }
  switch (rq.question_type) {
    case "likert":
      return { ...base, question_type: rq.likert_max >= 7 ? "likert_7" : "likert_5", options: null }
    case "single_choice":
      return { ...base, question_type: "single_choice", options: rq.options.filter(Boolean) }
    case "multiple_choice":
      return { ...base, question_type: "multiple_choice", options: rq.options.filter(Boolean) }
    case "forced_choice":
      return {
        ...base,
        question_type: "forced_choice",
        forced_choice_config: {
          items: rq.options.slice(0, 2).filter(Boolean),
          labels: ["Most like me", "Least like me"],
        },
        options: null,
      }
    case "yes_no":
      return { ...base, question_type: "single_choice", options: ["Yes", "No"] }
    case "true_false":
      return { ...base, question_type: "single_choice", options: ["True", "False"] }
    case "rating":
      return { ...base, question_type: "likert_5", options: null }
    default:
      return { ...base, question_type: "text", options: null }
  }
}

// ---------------------------------------------------------------------------
// Type label map
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<ImportedQuestionType, string> = {
  likert:          "Likert",
  single_choice:   "Single Choice",
  multiple_choice: "Multiple Choice",
  forced_choice:   "Forced Choice",
  yes_no:          "Yes / No",
  true_false:      "True / False",
  text:            "Open Text",
  rating:          "Rating Scale",
}

const ALL_TYPES: ImportedQuestionType[] = [
  "likert", "single_choice", "multiple_choice", "forced_choice",
  "yes_no", "true_false", "text", "rating",
]

// ---------------------------------------------------------------------------
// Review row component
// ---------------------------------------------------------------------------

interface ReviewRowProps {
  rq: ReviewQuestion
  index: number
  onChange: (id: string, patch: Partial<ReviewQuestion>) => void
}

function ReviewRow({ rq, index, onChange }: ReviewRowProps) {
  const needsOptions = rq.question_type === "single_choice" || rq.question_type === "multiple_choice"
  const isFC = rq.question_type === "forced_choice"
  const isLikert = rq.question_type === "likert"
  const isFixed = rq.question_type === "yes_no" || rq.question_type === "true_false"
  const maxOptions = isFC ? 2 : 6

  function setOption(i: number, v: string) {
    const next = [...rq.options]
    next[i] = v
    onChange(rq.id, { options: next })
  }

  function addOption() {
    if (rq.options.length < maxOptions) {
      onChange(rq.id, { options: [...rq.options, ""] })
    }
  }

  function removeOption(i: number) {
    const next = rq.options.filter((_, idx) => idx !== i)
    onChange(rq.id, { options: next })
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        background: "rgba(255,255,255,0.6)",
        border: "0.5px solid rgba(15,40,65,0.1)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-1"
          style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          {/* Question text */}
          <textarea
            value={rq.text}
            onChange={e => onChange(rq.id, { text: e.target.value })}
            rows={2}
            className="field w-full resize-none text-sm"
          />
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type selector */}
            <select
              value={rq.question_type}
              onChange={e => onChange(rq.id, { question_type: e.target.value as ImportedQuestionType })}
              className="rounded-lg border px-2 py-1 text-xs font-semibold focus:outline-none"
              style={{ background: "rgba(15,40,65,0.07)", borderColor: "rgba(15,40,65,0.2)", color: "#0F2841" }}
            >
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>

            {/* Subscale */}
            {rq.subscale && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(10,30,51,0.07)", color: "rgba(10,30,51,0.55)" }}
              >
                {rq.subscale}
              </span>
            )}

            {/* Reverse scored toggle for Likert */}
            {isLikert && (
              <label className="flex cursor-pointer items-center gap-1 text-[11px]" style={{ color: "rgba(10,30,51,0.55)" }}>
                <input
                  type="checkbox"
                  checked={rq.reverse_scored}
                  onChange={e => onChange(rq.id, { reverse_scored: e.target.checked })}
                  className="h-3 w-3 rounded"
                />
                Reverse scored
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Likert min/max */}
      {isLikert && (
        <div className="flex items-center gap-3 pl-9">
          <span className="text-xs font-medium" style={{ color: "rgba(10,30,51,0.5)" }}>Scale:</span>
          <select
            value={`${rq.likert_min}-${rq.likert_max}`}
            onChange={e => {
              const [mn, mx] = e.target.value.split("-").map(Number)
              onChange(rq.id, { likert_min: mn, likert_max: mx })
            }}
            className="rounded-lg border px-2 py-0.5 text-xs focus:outline-none"
            style={{ background: "rgba(255,255,255,0.7)", borderColor: "rgba(15,40,65,0.2)", color: "#0A1E33" }}
          >
            <option value="1-5">1 – 5</option>
            <option value="1-7">1 – 7</option>
            <option value="1-10">1 – 10</option>
          </select>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(rq.likert_max, 5) }, (_, i) => (
              <div
                key={i}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
                style={{ background: "rgba(15,40,65,0.08)", color: "rgba(10,30,51,0.5)" }}
              >
                {i + 1}
              </div>
            ))}
            {rq.likert_max > 5 && (
              <span className="self-center text-[10px]" style={{ color: "rgba(10,30,51,0.4)" }}>…{rq.likert_max}</span>
            )}
          </div>
        </div>
      )}

      {/* Fixed options (yes/no, true/false) */}
      {isFixed && (
        <div className="flex gap-2 pl-9">
          {rq.options.map((opt, i) => (
            <span
              key={i}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "rgba(10,30,51,0.07)", color: "rgba(10,30,51,0.55)" }}
            >
              {opt}
            </span>
          ))}
        </div>
      )}

      {/* Option inputs for MC / FC / single_choice */}
      {(needsOptions || isFC) && (
        <div className="space-y-1.5 pl-9">
          {rq.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-medium w-4 text-right shrink-0" style={{ color: "rgba(10,30,51,0.35)" }}>
                {i + 1}
              </span>
              <input
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="field flex-1 text-xs"
              />
              {rq.options.length > (isFC ? 2 : 1) && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="shrink-0"
                  style={{ color: "rgba(10,30,51,0.25)" }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {!isFC && rq.options.length < maxOptions && (
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: "#0F2841" }}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add option
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ImportModal
// ---------------------------------------------------------------------------

export default function ImportModal({ onClose }: ImportModalProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [questions, setQuestions] = useState<ReviewQuestion[]>([])
  const [surveyTitle, setSurveyTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleDownload() {
    setDownloading(true)
    try { await downloadImportTemplate() }
    catch (e) { alert(e instanceof Error ? e.message : "Download failed") }
    finally { setDownloading(false) }
  }

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const parsed = await importSurveyFile(file)
      setResult(parsed)
      setQuestions(parsed.questions.map(toReview))
      setSurveyTitle(file.name.replace(/\.(xlsx?|docx?)$/i, "").replace(/[_-]/g, " "))
      setStep(2)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function updateQuestion(id: string, patch: Partial<ReviewQuestion>) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!surveyTitle.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const survey = await createSurvey({
        name: surveyTitle.trim(),
        description: null,
        status: "draft",
        questions: questions.map((rq, i) => toPayload(rq, i + 1)),
      })
      onClose()
      router.push(`/surveys/${survey.id}/edit`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create survey")
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,12,40,0.55)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col"
        style={{
          background: "rgba(248,246,255,0.98)",
          border: "0.5px solid rgba(15,40,65,0.15)",
          boxShadow: "0 24px 64px rgba(10,30,51,0.22)",
          maxHeight: "90vh",
        }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
          <div>
            <p className="eyebrow mb-0.5">Import Survey</p>
            <h2 className="section-heading">
              {step === 1 ? "Upload a file" : `Review ${questions.length} question${questions.length !== 1 ? "s" : ""}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all"
            style={{ background: "rgba(10,30,51,0.07)" }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pb-4 shrink-0">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                style={step === s
                  ? { background: "linear-gradient(135deg, #0F2841, #2A5BA8)", color: "#fff" }
                  : step > s
                    ? { background: "rgba(34,197,94,0.15)", color: "#7E8A55" }
                    : { background: "rgba(15,40,65,0.08)", color: "rgba(10,30,51,0.3)" }
                }
              >
                {step > s ? "✓" : s}
              </div>
              <span className="text-xs" style={{ color: step === s ? "#0F2841" : "rgba(10,30,51,0.35)" }}>
                {s === 1 ? "Upload" : "Review & Create"}
              </span>
              {s < 2 && <div className="h-px w-6" style={{ background: "rgba(15,40,65,0.15)" }} />}
            </div>
          ))}
        </div>

        <div className="border-t" style={{ borderColor: "rgba(15,40,65,0.08)" }} />

        {/* ------------------------------------------------------------------ */}
        {/* STEP 1 */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <div className="flex flex-col gap-5 p-6 overflow-y-auto">
            {/* Download template button */}
            <div
              className="rounded-xl px-4 py-4"
              style={{ background: "rgba(15,40,65,0.05)", border: "0.5px solid rgba(15,40,65,0.12)" }}
            >
              <p className="mb-1 text-sm font-semibold" style={{ color: "#0A1E33" }}>
                Start with the Metricly template
              </p>
              <p className="mb-3 text-xs" style={{ color: "rgba(10,30,51,0.55)" }}>
                Fill in the template, then upload it here. Or upload any Excel document and we'll detect questions automatically.
              </p>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)", color: "#fff" }}
              >
                {downloading ? (
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {downloading ? "Downloading…" : "Download Excel Template"}
              </button>
            </div>

            {/* Upload zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl py-10 text-center transition-all"
              style={{
                background: dragging ? "rgba(15,40,65,0.07)" : "rgba(255,255,255,0.4)",
                border: dragging ? "1.5px solid rgba(15,40,65,0.4)" : "1.5px dashed rgba(15,40,65,0.2)",
              }}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <svg className="h-8 w-8 animate-spin" style={{ color: "#0F2841" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-semibold" style={{ color: "#0F2841" }}>Parsing file…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="h-10 w-10" style={{ color: "rgba(15,40,65,0.25)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-semibold" style={{ color: "rgba(10,30,51,0.6)" }}>
                    Drop your file here, or click to browse
                  </p>
                  <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>.xlsx files supported</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {uploadError && (
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{ background: "rgba(239,68,68,0.07)", color: "#DD6334" }}
              >
                {uploadError}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 2 */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && result && (
          <form onSubmit={handleCreate} className="flex flex-col overflow-hidden">
            {/* Source banner */}
            <div className="px-6 pt-4 pb-3 shrink-0">
              {result.source === "template" ? (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#7E8A55", border: "0.5px solid rgba(34,197,94,0.2)" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Template detected — questions imported precisely. Review and adjust below if needed.
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold"
                  style={{ background: "rgba(59,130,246,0.09)", color: "#2A5BA8", border: "0.5px solid rgba(59,130,246,0.2)" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Questions detected automatically — please review and adjust types before creating.
                </div>
              )}
            </div>

            {/* Scrollable question list */}
            <div className="overflow-y-auto px-6 space-y-3" style={{ maxHeight: "44vh" }}>
              {questions.map((rq, i) => (
                <ReviewRow key={rq.id} rq={rq} index={i} onChange={updateQuestion} />
              ))}
            </div>

            {/* Footer: survey title + create */}
            <div
              className="shrink-0 px-6 pt-4 pb-6 space-y-4 border-t mt-4"
              style={{ borderColor: "rgba(15,40,65,0.08)" }}
            >
              <div>
                <label className="label-caps mb-1.5 block">Survey title</label>
                <input
                  type="text"
                  value={surveyTitle}
                  onChange={e => setSurveyTitle(e.target.value)}
                  placeholder="e.g. Employee Engagement Survey"
                  className="field w-full"
                  required
                  disabled={creating}
                  autoFocus
                />
              </div>

              {createError && (
                <div
                  className="rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: "rgba(239,68,68,0.07)", color: "#DD6334" }}
                >
                  {createError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={creating || !surveyTitle.trim()}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {creating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating survey…
                    </span>
                  ) : (
                    `Create Survey (${questions.length} question${questions.length !== 1 ? "s" : ""}) →`
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={creating}
                  className="btn-ghost disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
