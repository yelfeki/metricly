"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getCompetencies,
  getCompetencyFrameworks,
  generateStrawMan,
  exportStrawMan,
  requestAssessment,
} from "@/lib/api"
import type {
  BlueprintPurpose,
  CompetencyFrameworkListItem,
  CompetencyListItem,
  SeniorityLevel,
  StrawManRequest,
  StrawManResponse,
  StrawManRow,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENIORITY_OPTS: { value: SeniorityLevel; label: string; desc: string }[] = [
  { value: "junior", label: "Junior / Entry Level", desc: "1–3 years, building foundational skills" },
  { value: "mid", label: "Mid Level", desc: "3–7 years, operating independently" },
  { value: "senior", label: "Senior / Lead", desc: "7+ years, leading projects or teams" },
  { value: "executive", label: "Executive", desc: "Director+ managing teams or functions" },
]

const PURPOSE_OPTS: { value: BlueprintPurpose; label: string; desc: string; icon: string }[] = [
  { value: "selection", label: "Selection", desc: "Hiring assessment — what does this person need to demonstrate?", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { value: "development", label: "Development", desc: "Growth planning — where should we invest in this person?", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
  { value: "360", label: "360° Feedback", desc: "Multi-rater feedback — how do others experience this person?", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
]

const FACTOR_COLORS: Record<string, string> = {
  Thought: "#1e40af",
  Results: "#065f46",
  People: "#4c1d95",
  Self: "#78350f",
  "Content Skills": "#991b1b",
  "Process Skills": "#713f12",
  "Social Skills": "#14532d",
  "Complex Problem Solving": "#0c4a6e",
  "Technical Skills": "#3b0764",
  "Systems Skills": "#881337",
  "Resource Management": "#14532d",
}

const FACTOR_BG: Record<string, string> = {
  Thought: "rgba(219,234,254,0.5)",
  Results: "rgba(209,250,229,0.5)",
  People: "rgba(237,233,254,0.5)",
  Self: "rgba(254,243,199,0.5)",
  "Content Skills": "rgba(254,226,226,0.5)",
  "Process Skills": "rgba(254,249,195,0.5)",
  "Social Skills": "rgba(220,252,231,0.5)",
  "Complex Problem Solving": "rgba(224,242,254,0.5)",
  "Technical Skills": "rgba(243,232,255,0.5)",
  "Systems Skills": "rgba(255,228,230,0.5)",
  "Resource Management": "rgba(240,253,244,0.5)",
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Novice", 2: "Developing", 3: "Proficient", 4: "Advanced", 5: "Expert",
}

function factorBg(factor: string | null) { return FACTOR_BG[factor ?? ""] ?? "rgba(249,250,251,0.5)" }
function factorFg(factor: string | null) { return FACTOR_COLORS[factor ?? ""] ?? "#374151" }

// ---------------------------------------------------------------------------
// Step 1 — Input form
// ---------------------------------------------------------------------------

function StepInput({
  form,
  onChange,
  onSubmit,
  loading,
  frameworks,
  allComps,
  selectedCompIds,
  onCompToggle,
}: {
  form: StrawManRequest
  onChange: (updates: Partial<StrawManRequest>) => void
  onSubmit: () => void
  loading: boolean
  frameworks: CompetencyFrameworkListItem[]
  allComps: CompetencyListItem[]
  selectedCompIds: Set<string>
  onCompToggle: (id: string) => void
}) {
  const [showCompPicker, setShowCompPicker] = useState(false)
  const [compSearch, setCompSearch] = useState("")
  const [fwFilter, setFwFilter] = useState("")

  const filteredComps = allComps.filter(c => {
    if (fwFilter && c.framework_id !== fwFilter) return false
    if (compSearch && !c.name.toLowerCase().includes(compSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Role / initiative */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
        <h2 className="text-base font-semibold" style={{ color: "#1e1b4b" }}>What are you assessing for?</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.6)" }}>Role title (optional)</label>
            <input
              type="text"
              placeholder="e.g. Sales Manager, Software Engineer, CHRO…"
              value={form.role_title ?? ""}
              onChange={e => onChange({ role_title: e.target.value || null })}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(209,213,219,0.5)", color: "#1e1b4b" }}
            />
          </div>
          <div className="text-center text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>or</div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.6)" }}>Initiative / programme name (optional)</label>
            <input
              type="text"
              placeholder="e.g. High-Potential Leadership Programme, Succession Planning…"
              value={form.initiative ?? ""}
              onChange={e => onChange({ initiative: e.target.value || null })}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(209,213,219,0.5)", color: "#1e1b4b" }}
            />
          </div>
        </div>
      </div>

      {/* Seniority */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "#1e1b4b" }}>Seniority level</h2>
        <div className="grid grid-cols-2 gap-2">
          {SENIORITY_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ seniority_level: opt.value })}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: form.seniority_level === opt.value ? "rgba(91,33,182,0.08)" : "rgba(255,255,255,0.4)",
                border: form.seniority_level === opt.value ? "1.5px solid rgba(91,33,182,0.35)" : "1px solid rgba(209,213,219,0.4)",
              }}
            >
              <p className="text-xs font-semibold" style={{ color: form.seniority_level === opt.value ? "#5b21b6" : "#1e1b4b" }}>{opt.label}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(30,27,75,0.45)" }}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Purpose */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "#1e1b4b" }}>Assessment purpose</h2>
        <div className="space-y-2">
          {PURPOSE_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ purpose: opt.value })}
              className="w-full rounded-xl p-3 text-left flex items-center gap-3 transition-all"
              style={{
                background: form.purpose === opt.value ? "rgba(91,33,182,0.08)" : "rgba(255,255,255,0.4)",
                border: form.purpose === opt.value ? "1.5px solid rgba(91,33,182,0.35)" : "1px solid rgba(209,213,219,0.4)",
              }}
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: form.purpose === opt.value ? "rgba(91,33,182,0.12)" : "rgba(243,244,246,0.8)" }}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  style={{ color: form.purpose === opt.value ? "#5b21b6" : "#6b7280" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: form.purpose === opt.value ? "#5b21b6" : "#1e1b4b" }}>{opt.label}</p>
                <p className="text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Optional competency picker */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#1e1b4b" }}>Specific competencies</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(30,27,75,0.45)" }}>
              {selectedCompIds.size > 0
                ? `${selectedCompIds.size} selected — will override auto-suggestion`
                : "Optional — leave empty for AI-suggested competencies"}
            </p>
          </div>
          <button
            onClick={() => setShowCompPicker(v => !v)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6", border: "1px solid rgba(91,33,182,0.2)" }}
          >
            {showCompPicker ? "Done" : selectedCompIds.size > 0 ? `Edit (${selectedCompIds.size})` : "Browse"}
          </button>
        </div>

        {selectedCompIds.size > 0 && !showCompPicker && (
          <div className="flex flex-wrap gap-1.5">
            {allComps.filter(c => selectedCompIds.has(c.id)).map(c => (
              <span key={c.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium flex items-center gap-1"
                style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6", border: "0.5px solid rgba(91,33,182,0.2)" }}>
                {c.name}
                <button onClick={() => onCompToggle(c.id)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
        )}

        {showCompPicker && (
          <div className="mt-3 space-y-3">
            {/* Framework filter */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFwFilter("")}
                className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                style={{ background: !fwFilter ? "rgba(91,33,182,0.12)" : "rgba(243,244,246,0.8)", color: !fwFilter ? "#5b21b6" : "#6b7280" }}>
                All
              </button>
              {frameworks.map(fw => (
                <button key={fw.id} onClick={() => setFwFilter(fw.id)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                  style={{ background: fwFilter === fw.id ? "rgba(91,33,182,0.12)" : "rgba(243,244,246,0.8)", color: fwFilter === fw.id ? "#5b21b6" : "#6b7280" }}>
                  {fw.name.split(" ").slice(0, 2).join(" ")}
                </button>
              ))}
            </div>
            <input type="text" placeholder="Search competencies…" value={compSearch}
              onChange={e => setCompSearch(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-xs outline-none"
              style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(209,213,219,0.5)", color: "#1e1b4b" }} />
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {filteredComps.slice(0, 50).map(c => (
                <button key={c.id} onClick={() => onCompToggle(c.id)}
                  className="w-full text-left rounded-lg px-3 py-2 flex items-center gap-2 transition-all"
                  style={{
                    background: selectedCompIds.has(c.id) ? "rgba(91,33,182,0.08)" : "rgba(255,255,255,0.4)",
                    border: selectedCompIds.has(c.id) ? "1px solid rgba(91,33,182,0.25)" : "1px solid rgba(209,213,219,0.3)",
                  }}>
                  <div className="h-3.5 w-3.5 rounded flex-shrink-0 flex items-center justify-center"
                    style={{ background: selectedCompIds.has(c.id) ? "#5b21b6" : "rgba(209,213,219,0.6)" }}>
                    {selectedCompIds.has(c.id) && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-medium" style={{ color: "#1e1b4b" }}>{c.name}</span>
                    {c.factor && <span className="ml-1.5 text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>{c.factor}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full rounded-full py-3.5 text-sm font-semibold transition-all relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
          color: "white",
          boxShadow: "0 4px 24px rgba(91,33,182,0.35)",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Generating blueprint…
          </span>
        ) : (
          "Generate Assessment Blueprint"
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blueprint row component
// ---------------------------------------------------------------------------

function BlueprintRow({
  row,
  index,
  onRemove,
}: {
  row: StrawManRow
  index: number
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const bg = factorBg(row.factor)
  const fg = factorFg(row.factor)

  return (
    <div className="rounded-2xl overflow-hidden transition-all"
      style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(8px)" }}>
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: bg, color: fg }}>
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{row.competency}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {row.factor && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: bg, color: fg }}>
                    {row.factor}
                  </span>
                )}
                {row.cluster && (
                  <span className="rounded-full px-2 py-0.5 text-[10px]"
                    style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
                    {row.cluster}
                  </span>
                )}
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}>
                  Level {row.required_proficiency_level} — {row.proficiency_label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded-full transition-all"
                style={{ color: "rgba(30,27,75,0.4)" }}
                title={expanded ? "Collapse" : "Expand"}
              >
                <svg className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={onRemove}
                className="p-1.5 rounded-full transition-all"
                style={{ color: "rgba(30,27,75,0.3)" }}
                title="Remove"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Instruments summary */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.primary_instrument ? (
              <span className="rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(91,33,182,0.1)", color: "#5b21b6" }}>
                {row.primary_instrument.short_name}
                {row.primary_instrument.subscale && ` (${row.primary_instrument.subscale})`}
              </span>
            ) : (
              <span className="rounded-lg px-2 py-1 text-[11px]"
                style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
                Behavioural Interview
              </span>
            )}
            {row.supporting_instruments.slice(0, 2).map(s => (
              <span key={s.short_name} className="rounded-lg px-2 py-1 text-[11px]"
                style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
                + {s.short_name}
              </span>
            ))}
            <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.35)" }}>
              {row.assessment_method}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(209,213,219,0.3)" }}>
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Behavioral indicators */}
            {row.behavioral_indicators.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(30,27,75,0.4)" }}>
                  Behavioural Indicators (Level {row.required_proficiency_level})
                </p>
                <ul className="space-y-1">
                  {row.behavioral_indicators.map((ind, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: fg }} />
                      <span className="text-xs leading-relaxed" style={{ color: "rgba(30,27,75,0.65)" }}>{ind}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Instruments detail */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(30,27,75,0.4)" }}>Measurement</p>
              {row.primary_instrument && (
                <div className="rounded-lg p-2.5 mb-2"
                  style={{ background: "rgba(91,33,182,0.06)", border: "0.5px solid rgba(91,33,182,0.15)" }}>
                  <p className="text-xs font-bold" style={{ color: "#5b21b6" }}>{row.primary_instrument.short_name}
                    <span className="font-normal text-[10px] ml-1" style={{ color: "rgba(30,27,75,0.4)" }}>Primary</span>
                  </p>
                  {row.primary_instrument.subscale && (
                    <p className="text-[10px]" style={{ color: "rgba(30,27,75,0.5)" }}>Subscale: {row.primary_instrument.subscale}</p>
                  )}
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>{row.primary_instrument.items} items</span>
                    {row.primary_instrument.alpha && (
                      <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>α = {row.primary_instrument.alpha.toFixed(2)}</span>
                    )}
                  </div>
                  {row.primary_instrument.rationale && (
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "rgba(30,27,75,0.55)" }}>
                      {row.primary_instrument.rationale}
                    </p>
                  )}
                </div>
              )}
              {row.supporting_instruments.map(s => (
                <div key={s.short_name} className="rounded-lg px-2.5 py-2 mb-1.5"
                  style={{ background: "rgba(243,244,246,0.6)", border: "0.5px solid rgba(209,213,219,0.4)" }}>
                  <p className="text-xs font-medium" style={{ color: "#374151" }}>
                    {s.short_name}
                    {s.subscale && <span className="font-normal text-[10px] ml-1" style={{ color: "rgba(30,27,75,0.4)" }}>({s.subscale})</span>}
                    <span className="ml-1 text-[10px]" style={{ color: "#6b7280" }}>Supporting</span>
                  </p>
                </div>
              ))}

              {/* Rationale */}
              {row.rationale && (
                <p className="text-[11px] mt-2 leading-relaxed italic" style={{ color: "rgba(30,27,75,0.5)" }}>
                  "{row.rationale}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Request modal
// ---------------------------------------------------------------------------

function buildBlueprintSummary(blueprint: StrawManResponse): string {
  const lines = [
    blueprint.title,
    `Seniority: ${blueprint.seniority_level} | Purpose: ${blueprint.purpose}`,
    "",
    "COMPETENCIES:",
  ]
  blueprint.rows.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.competency} (${row.framework})` +
      ` — Required Level ${row.required_proficiency_level}: ${row.proficiency_label}` +
      (row.primary_instrument ? ` | Primary measure: ${row.primary_instrument.short_name}` : "")
    )
  })
  return lines.join("\n")
}

function RequestModal({
  blueprint,
  roleName,
  onClose,
}: {
  blueprint: StrawManResponse
  roleName: string
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const summary = buildBlueprintSummary(blueprint)
      const context = [
        `Requester: ${name.trim()}`,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
        "",
        summary,
      ].filter(Boolean).join("\n")

      await requestAssessment(
        `Competency Measurement Plan: ${roleName}`,
        context,
        email.trim(),
      )
      setSubmitted(true)
    } catch {
      setError("Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(30,27,75,0.35)", backdropFilter: "blur(4px)" }}
        onClick={submitted ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && submitted && onClose()}
      >
        <div
          className="w-full max-w-md rounded-2xl p-6 relative"
          style={{
            background: "rgba(248,246,255,0.98)",
            border: "1px solid rgba(255,255,255,0.8)",
            boxShadow: "0 24px 64px rgba(30,27,75,0.2)",
            backdropFilter: "blur(24px)",
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full transition-all"
            style={{ color: "rgba(30,27,75,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,33,182,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "")}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {submitted ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center"
                style={{ background: "rgba(91,33,182,0.1)" }}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  style={{ color: "#5b21b6" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold font-playfair mb-2" style={{ color: "#1e1b4b" }}>Request submitted!</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(30,27,75,0.6)" }}>
                An IO psychologist will review your blueprint and recommend validated measures within 2–3 business days.
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-full px-5 py-2 text-xs font-semibold transition-all"
                style={{ background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)", color: "white" }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-base font-bold font-playfair mb-1" style={{ color: "#1e1b4b" }}>
                Request Competency Measurement Plan
              </h3>
              <p className="text-xs mb-5" style={{ color: "rgba(30,27,75,0.5)" }}>
                An IO psychologist will review your blueprint and recommend validated measures.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.6)" }}>
                    Your name <span style={{ color: "#7c3aed" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(209,213,219,0.6)", color: "#1e1b4b" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.6)" }}>
                    Email address <span style={{ color: "#7c3aed" }}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="jane@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(209,213,219,0.6)", color: "#1e1b4b" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "rgba(30,27,75,0.6)" }}>
                    Additional notes <span style={{ color: "rgba(30,27,75,0.35)" }}>(optional)</span>
                  </label>
                  <textarea
                    placeholder="Any context that would help — team size, timeline, constraints…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(209,213,219,0.6)", color: "#1e1b4b" }}
                  />
                </div>
              </div>

              {error && (
                <p className="mt-3 text-xs" style={{ color: "#991b1b" }}>{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim() || !email.trim()}
                className="mt-5 w-full rounded-full py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
                  color: "white",
                  boxShadow: "0 2px 12px rgba(91,33,182,0.3)",
                  opacity: submitting || !name.trim() || !email.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  "Submit Request"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Blueprint review
// ---------------------------------------------------------------------------

function StepReview({
  blueprint,
  roleName,
  onBack,
  onRowRemove,
  onExport,
  exporting,
}: {
  blueprint: StrawManResponse
  roleName: string
  onBack: () => void
  onRowRemove: (id: string) => void
  onExport: () => void
  exporting: boolean
}) {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Blueprint header */}
      <div className="rounded-2xl p-6 mb-6"
        style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.8)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-playfair" style={{ color: "#1e1b4b" }}>{blueprint.title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}>
                {blueprint.seniority_level} level
              </span>
              <span className="rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}>
                {blueprint.purpose === "360" ? "360° Feedback" : blueprint.purpose}
              </span>
              <span className="rounded-full px-2.5 py-1 text-xs"
                style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
                {blueprint.rows.length} competenc{blueprint.rows.length === 1 ? "y" : "ies"}
              </span>
            </div>
          </div>
          <button onClick={onBack}
            className="rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-all"
            style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280", border: "1px solid rgba(209,213,219,0.5)" }}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Edit
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-4 pt-4 border-t" style={{ borderColor: "rgba(209,213,219,0.3)" }}>
          <button
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(91,33,182,0.2)",
              color: "#5b21b6",
            }}
          >
            {exporting ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500/40 border-t-violet-500 animate-spin" />
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {exporting ? "Generating…" : "Download Excel"}
          </button>

          <button
            onClick={() => setShowModal(true)}
            disabled={blueprint.rows.length === 0}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
              color: "white",
              boxShadow: "0 2px 12px rgba(91,33,182,0.3)",
              opacity: blueprint.rows.length === 0 ? 0.6 : 1,
            }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Request Competency Measurement Plan
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {blueprint.rows.map((row, i) => (
          <BlueprintRow
            key={row.competency_id}
            row={row}
            index={i}
            onRemove={() => onRowRemove(row.competency_id)}
          />
        ))}
      </div>

      {blueprint.rows.length === 0 && (
        <div className="rounded-2xl p-10 text-center" style={{ background: "rgba(255,255,255,0.5)" }}>
          <p className="text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>All rows removed. Go back to regenerate.</p>
        </div>
      )}

      {showModal && (
        <RequestModal
          blueprint={blueprint}
          roleName={roleName}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StrawManPage() {
  const searchParams = useSearchParams()

  const [form, setForm] = useState<StrawManRequest>({
    role_title: null,
    initiative: null,
    competency_ids: null,
    seniority_level: "mid",
    purpose: "development",
  })

  const [selectedCompIds, setSelectedCompIds] = useState<Set<string>>(new Set())
  const [frameworks, setFrameworks] = useState<CompetencyFrameworkListItem[]>([])
  const [allComps, setAllComps] = useState<CompetencyListItem[]>([])

  const [loading, setLoading] = useState(false)
  const [blueprint, setBlueprint] = useState<StrawManResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)

  // Pre-select from URL param
  useEffect(() => {
    const compId = searchParams.get("competency")
    if (compId) setSelectedCompIds(new Set([compId]))
  }, [searchParams])

  // Load frameworks and all competencies for the picker
  useEffect(() => {
    Promise.all([getCompetencyFrameworks(), getCompetencies()])
      .then(([fws, comps]) => { setFrameworks(fws); setAllComps(comps) })
      .catch(() => {})
  }, [])

  const handleCompToggle = useCallback((id: string) => {
    setSelectedCompIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const body: StrawManRequest = {
        ...form,
        competency_ids: selectedCompIds.size > 0 ? Array.from(selectedCompIds) : null,
      }
      const result = await generateStrawMan(body)
      setBlueprint(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  const handleRowRemove = (competencyId: string) => {
    if (!blueprint) return
    setBlueprint({ ...blueprint, rows: blueprint.rows.filter(r => r.competency_id !== competencyId) })
  }

  const handleExport = async () => {
    if (!blueprint) return
    setExporting(true)
    try {
      const body: StrawManRequest = {
        ...form,
        competency_ids: blueprint.rows.map(r => r.competency_id),
      }
      const blob = await exportStrawMan(body)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const role = form.role_title || form.initiative || "Blueprint"
      a.download = `Metricly_Assessment_Blueprint_${role.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError("Export failed. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: "linear-gradient(135deg, #f0eeff 0%, #e8e4ff 50%, #ede9ff 100%)" }}>
      <Header pageTitle="Blueprint Generator" />

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)" }}>
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold font-playfair" style={{ color: "#1e1b4b" }}>Assessment Blueprint Generator</h1>
          </div>
          <p className="text-sm ml-11" style={{ color: "rgba(30,27,75,0.55)" }}>
            Generate a structured assessment blueprint with competencies, proficiency targets, and instrument recommendations.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: "rgba(254,226,226,0.8)", border: "1px solid rgba(252,165,165,0.5)" }}>
            <p className="text-xs" style={{ color: "#991b1b" }}>{error}</p>
          </div>
        )}

        {!blueprint ? (
          <StepInput
            form={form}
            onChange={updates => setForm(prev => ({ ...prev, ...updates }))}
            onSubmit={handleSubmit}
            loading={loading}
            frameworks={frameworks}
            allComps={allComps}
            selectedCompIds={selectedCompIds}
            onCompToggle={handleCompToggle}
          />
        ) : (
          <StepReview
            blueprint={blueprint}
            roleName={form.role_title || form.initiative || "Assessment"}
            onBack={() => setBlueprint(null)}
            onRowRemove={handleRowRemove}
            onExport={handleExport}
            exporting={exporting}
          />
        )}
      </div>
    </div>
  )
}
