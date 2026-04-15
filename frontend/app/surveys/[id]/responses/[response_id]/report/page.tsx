"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { generateInterpretiveReport, getInterpretiveReport, getParticipantReport } from "@/lib/api"
import type {
  FactorNarrative,
  FactorReport,
  InterpretiveReportData,
  InterpretiveReportOut,
  ParticipantReport,
  ReportPurpose,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 1): string {
  return n !== null && n !== undefined ? n.toFixed(decimals) : "—"
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  })
}

function displayValue(value: string): string {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join(", ")
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(" · ")
    }
  } catch { /* not JSON */ }
  return value
}

// ---------------------------------------------------------------------------
// Radar / Spider chart (SVG)
// ---------------------------------------------------------------------------

interface RadarChartProps { factors: FactorReport[]; size?: number }

function RadarChart({ factors, size = 280 }: RadarChartProps) {
  const scored = factors.filter(f => f.normalized !== null)
  if (scored.length < 3) return null

  const cx = size / 2
  const cy = size / 2
  const R = size * 0.38
  const labelR = size * 0.48
  const n = scored.length
  const rings = [25, 50, 75, 100]

  function polar(score: number, i: number, total: number, radius: number) {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2
    const r = (score / 100) * radius
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  function axisEnd(i: number) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) }
  }

  function labelPos(i: number) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: cx + labelR * Math.cos(angle), y: cy + labelR * Math.sin(angle) }
  }

  const ringPaths = rings.map(pct => {
    const pts = Array.from({ length: n }, (_, i) => polar(pct, i, n, R))
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"
  })

  const scorePts = scored.map((f, i) => polar(f.normalized!, i, n, R))
  const scorePath = scorePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto print:mx-0" aria-label="Factor radar chart">
      {ringPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(91,33,182,0.12)" strokeWidth={1} />
      ))}
      {rings.map(pct => (
        <text key={pct} x={cx + 4} y={cy - (pct / 100) * R - 3} fontSize={7} fill="rgba(30,27,75,0.3)">{pct}</text>
      ))}
      {Array.from({ length: n }, (_, i) => {
        const end = axisEnd(i)
        return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke="rgba(91,33,182,0.12)" strokeWidth={1} />
      })}
      <path d={scorePath} fill="rgba(91,33,182,0.15)" stroke="#7c3aed" strokeWidth={2} strokeLinejoin="round" />
      {scorePts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={4} fill="#7c3aed" />
      ))}
      {scored.map((f, i) => {
        const lp = labelPos(i)
        const anchor = lp.x < cx - 5 ? "end" : lp.x > cx + 5 ? "start" : "middle"
        const words = f.factor_name.split(" ")
        return (
          <text key={i} x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle" fontSize={9} fontWeight={600} fill="rgba(30,27,75,0.6)">
            {words.length <= 2 ? f.factor_name : (
              <>
                <tspan x={lp.x.toFixed(1)} dy="-6">{words.slice(0, Math.ceil(words.length / 2)).join(" ")}</tspan>
                <tspan x={lp.x.toFixed(1)} dy="12">{words.slice(Math.ceil(words.length / 2)).join(" ")}</tspan>
              </>
            )}
          </text>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Composite score card
// ---------------------------------------------------------------------------

function CompositeCard({ report }: { report: ParticipantReport }) {
  const { composite } = report
  const hasScore = composite.normalized !== null

  return (
    <div
      className="card relative overflow-hidden p-6 text-center print:border print:border-slate-200 print:shadow-none"
      style={hasScore && composite.color ? {
        background: `linear-gradient(135deg, ${composite.color}18 0%, rgba(255,255,255,0.55) 100%)`,
      } : {}}
    >
      <p className="eyebrow">Overall Score</p>
      <p
        className="metric-value mt-2 text-6xl font-black tabular-nums leading-none"
        style={{ color: composite.color ?? "#5b21b6" }}
      >
        {hasScore ? fmt(composite.normalized, 1) : "—"}
      </p>
      <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>/ 100</p>
      {composite.label && (
        <span
          className="mt-3 inline-block rounded-full px-4 py-1 text-sm font-bold text-white"
          style={{ backgroundColor: composite.color ?? "#5b21b6" }}
        >
          {composite.label}
        </span>
      )}
      {!hasScore && (
        <p className="mt-3 text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
          Configure a composite scoring algorithm to see an overall score.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Factor bar chart
// ---------------------------------------------------------------------------

function FactorBars({ factors }: { factors: FactorReport[] }) {
  const scored = factors.filter(f => f.normalized !== null)
  if (scored.length === 0) {
    return (
      <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
        No factor scores available. Assign questions to factors and configure scoring algorithms.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {factors.map(f => (
        <div key={f.factor_name}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate" style={{ color: "rgba(30,27,75,0.75)" }}>{f.factor_name}</span>
            <div className="flex items-center gap-2 shrink-0">
              {f.label && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: f.color ?? "#5b21b6" }}>
                  {f.label}
                </span>
              )}
              <span className="w-10 text-right text-xs tabular-nums font-semibold" style={{ color: "rgba(30,27,75,0.65)" }}>
                {fmt(f.normalized)}
              </span>
            </div>
          </div>
          <div className="bar-track" style={{ height: "10px" }}>
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{ width: `${f.normalized ?? 0}%`, backgroundColor: f.color ?? "#5b21b6" }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px]" style={{ color: "rgba(30,27,75,0.3)" }}>
            <span>0</span>
            <span>{`raw: ${fmt(f.raw_mean, 2)} · ${f.item_count} item${f.item_count !== 1 ? "s" : ""}`}</span>
            <span>100</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Item detail table
// ---------------------------------------------------------------------------

function ItemTable({ report }: { report: ParticipantReport }) {
  const seen = new Set<string>()
  const factorNames: string[] = []
  for (const a of report.answers) {
    const f = a.factor ?? "—"
    if (!seen.has(f)) { seen.add(f); factorNames.push(f) }
  }

  return (
    <div className="space-y-6">
      {factorNames.map(fname => {
        const items = report.answers.filter(a => (a.factor ?? "—") === fname)
        return (
          <div key={fname}>
            <h4 className="label-caps mb-2">{fname}</h4>
            <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid rgba(255,255,255,0.4)" }}>
              <table className="min-w-full text-xs">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.3)" }}>
                    <th className="px-3 py-2 text-left label-caps w-1/2">Question</th>
                    <th className="px-3 py-2 text-left label-caps">Response</th>
                    <th className="px-3 py-2 text-right label-caps whitespace-nowrap">Raw score</th>
                    <th className="px-3 py-2 text-right label-caps whitespace-nowrap">Normalized</th>
                    <th className="px-3 py-2 text-center label-caps">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(ans => (
                    <tr key={ans.question_id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.3)" }}>
                      <td className="px-3 py-2 leading-snug" style={{ color: "rgba(30,27,75,0.75)" }}>
                        {ans.question_text}
                        {ans.reverse_scored && (
                          <span
                            className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold"
                            style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}
                          >R</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[160px] truncate" style={{ color: "rgba(30,27,75,0.6)" }} title={displayValue(ans.value)}>
                        {displayValue(ans.value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "rgba(30,27,75,0.6)" }}>
                        {ans.raw_score !== null ? fmt(ans.raw_score, 2) : <span style={{ color: "rgba(30,27,75,0.2)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "rgba(30,27,75,0.6)" }}>
                        {ans.normalized !== null ? fmt(ans.normalized, 1) : <span style={{ color: "rgba(30,27,75,0.2)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ans.label ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: ans.color ?? "#5b21b6" }}>
                            {ans.label}
                          </span>
                        ) : <span style={{ color: "rgba(30,27,75,0.2)" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Interpretive Report — context form
// ---------------------------------------------------------------------------

interface AIContextFormProps {
  onSubmit: (role: string, industry: string, purpose: ReportPurpose) => void
  onCancel: () => void
  loading: boolean
  initialRole?: string
  initialIndustry?: string
  initialPurpose?: ReportPurpose
}

function AIContextForm({
  onSubmit, onCancel, loading,
  initialRole = "", initialIndustry = "", initialPurpose = "development",
}: AIContextFormProps) {
  const [role, setRole] = useState(initialRole)
  const [industry, setIndustry] = useState(initialIndustry)
  const [purpose, setPurpose] = useState<ReportPurpose>(initialPurpose)

  return (
    <div
      className="rounded-[18px] p-6"
      style={{
        background: "linear-gradient(135deg, rgba(91,33,182,0.06) 0%, rgba(124,58,237,0.04) 100%)",
        border: "0.5px solid rgba(91,33,182,0.18)",
      }}
    >
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "rgba(91,33,182,0.12)" }}
        >
          <svg className="h-4 w-4" style={{ color: "#5b21b6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: "#1e1b4b" }}>Generate AI Interpretive Report</p>
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
            Optional context improves report specificity
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label-caps mb-1 block">Role</label>
          <input
            className="field w-full"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="e.g. Sales Manager"
          />
        </div>
        <div>
          <label className="label-caps mb-1 block">Industry</label>
          <input
            className="field w-full"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            placeholder="e.g. Financial Services"
          />
        </div>
        <div>
          <label className="label-caps mb-1 block">Purpose</label>
          <select
            className="field w-full"
            value={purpose}
            onChange={e => setPurpose(e.target.value as ReportPurpose)}
          >
            <option value="development">Development</option>
            <option value="hiring">Hiring</option>
            <option value="research">Research</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm">
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onSubmit(role, industry, purpose)}
          className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating report…
            </>
          ) : "Generate Report"}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Interpretive Report — rendered report
// ---------------------------------------------------------------------------

function HiringBadge({ recommendation }: { recommendation: string }) {
  const lower = recommendation.toLowerCase()
  const config = lower.includes("do not")
    ? { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", color: "#dc2626", icon: "✕" }
    : lower.includes("consider")
    ? { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", color: "#b45309", icon: "~" }
    : { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", color: "#16a34a", icon: "✓" }

  return (
    <div
      className="flex items-center gap-4 rounded-[14px] p-5"
      style={{ background: config.bg, border: `0.5px solid ${config.border}` }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-black"
        style={{ background: config.bg, color: config.color, border: `2px solid ${config.color}` }}
      >
        {config.icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: config.color }}>
          Hiring Recommendation
        </p>
        <p className="mt-0.5 text-lg font-bold" style={{ color: config.color }}>
          {recommendation}
        </p>
      </div>
    </div>
  )
}

function FactorNarrativeCard({ fn }: { fn: FactorNarrative }) {
  const scoreWidth = Math.min(100, Math.max(0, fn.score))
  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "0.5px solid rgba(91,33,182,0.1)",
      }}
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-semibold" style={{ color: "#1e1b4b" }}>{fn.factor_name}</h4>
        <div className="flex items-center gap-2 shrink-0">
          {fn.label && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: "#5b21b6" }}
            >
              {fn.label}
            </span>
          )}
          <span className="text-sm font-bold tabular-nums" style={{ color: "#5b21b6" }}>
            {fn.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-4 h-1.5 rounded-full" style={{ background: "rgba(91,33,182,0.1)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${scoreWidth}%`, background: "linear-gradient(90deg, #7c3aed, #5b21b6)" }}
        />
      </div>

      {/* Narrative */}
      <p className="mb-4 text-sm leading-relaxed" style={{ color: "rgba(30,27,75,0.75)" }}>
        {fn.narrative}
      </p>

      {/* Strengths + Watch-outs */}
      <div className="grid gap-4 sm:grid-cols-2">
        {fn.strengths.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#16a34a" }}>
              Strengths
            </p>
            <ul className="space-y-1">
              {fn.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "rgba(30,27,75,0.7)" }}>
                  <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: "#16a34a" }}>●</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {fn.watch_outs.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#d97706" }}>
              Watch-outs
            </p>
            <ul className="space-y-1">
              {fn.watch_outs.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "rgba(30,27,75,0.7)" }}>
                  <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: "#d97706" }}>●</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

interface AIReportRendererProps {
  aiReport: InterpretiveReportOut
  onRegenerate: () => void
}

function AIReportRenderer({ aiReport, onRegenerate }: AIReportRendererProps) {
  const { report, context, generated_at, model_used } = aiReport
  const purposeLabel =
    context.purpose === "hiring" ? "Hiring" :
    context.purpose === "research" ? "Research" : "Development"

  return (
    <div className="space-y-6 print:space-y-8">
      {/* AI Report header bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: "rgba(91,33,182,0.12)" }}
          >
            <svg className="h-3.5 w-3.5" style={{ color: "#5b21b6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
            <span className="font-semibold" style={{ color: "#5b21b6" }}>AI Interpretive Report</span>
            {" · "}{purposeLabel}
            {context.role && <span> · {context.role}</span>}
            {context.industry && <span> · {context.industry}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.3)" }}>
            {new Date(generated_at).toLocaleDateString()}
          </span>
          <button
            onClick={onRegenerate}
            className="btn-ghost text-xs py-1 px-2.5"
          >
            Regenerate
          </button>
        </div>
      </div>

      {/* Hiring recommendation — shown first if present */}
      {report.hiring_recommendation && (
        <HiringBadge recommendation={report.hiring_recommendation} />
      )}

      {/* Overall summary */}
      <div
        className="rounded-[18px] p-6"
        style={{
          background: "linear-gradient(135deg, rgba(91,33,182,0.07) 0%, rgba(124,58,237,0.04) 100%)",
          border: "0.5px solid rgba(91,33,182,0.15)",
        }}
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(91,33,182,0.7)" }}>
          Executive Summary
        </p>
        <p className="text-base leading-relaxed font-medium" style={{ color: "#1e1b4b" }}>
          {report.overall_summary}
        </p>
      </div>

      {/* Factor narratives */}
      {report.factor_narratives.length > 0 && (
        <div>
          <h3 className="section-heading mb-4">Factor Analysis</h3>
          <div className="space-y-4">
            {report.factor_narratives.map((fn, i) => (
              <FactorNarrativeCard key={i} fn={fn} />
            ))}
          </div>
        </div>
      )}

      {/* Role fit notes */}
      {report.role_fit_notes && (
        <div
          className="rounded-[14px] p-5"
          style={{
            background: "rgba(59,130,246,0.05)",
            border: "0.5px solid rgba(59,130,246,0.15)",
          }}
        >
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>
            Role Fit: {context.role}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(30,27,75,0.75)" }}>
            {report.role_fit_notes}
          </p>
        </div>
      )}

      {/* Development suggestions */}
      {report.development_suggestions.length > 0 && (
        <div
          className="rounded-[18px] p-6"
          style={{
            background: "rgba(255,255,255,0.55)",
            border: "0.5px solid rgba(91,33,182,0.1)",
          }}
        >
          <h3 className="mb-4 text-sm font-bold" style={{ color: "#1e1b4b" }}>
            Development Recommendations
          </h3>
          <ol className="space-y-3">
            {report.development_suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: "#5b21b6" }}
                >
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed" style={{ color: "rgba(30,27,75,0.75)" }}>
                  {s}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Attribution */}
      <p className="text-[10px] text-center print:block" style={{ color: "rgba(30,27,75,0.25)" }}>
        Generated by {model_used} · {new Date(generated_at).toLocaleString()}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Report section — orchestrates form / loading / rendered states
// ---------------------------------------------------------------------------

interface AIReportSectionProps {
  surveyId: string
  responseId: string
}

function AIReportSection({ surveyId, responseId }: AIReportSectionProps) {
  const [phase, setPhase] = useState<"idle" | "form" | "loading" | "done">("idle")
  const [aiReport, setAiReport] = useState<InterpretiveReportOut | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedContext, setSavedContext] = useState({ role: "", industry: "", purpose: "development" as ReportPurpose })
  const reportRef = useRef<HTMLDivElement>(null)

  // On mount: check if a cached report already exists
  useEffect(() => {
    getInterpretiveReport(surveyId, responseId)
      .then(r => { setAiReport(r); setPhase("done") })
      .catch(() => { /* 404 = no report yet, stay in idle */ })
  }, [surveyId, responseId])

  async function handleGenerate(role: string, industry: string, purpose: ReportPurpose, force = false) {
    setPhase("loading")
    setError(null)
    setSavedContext({ role, industry, purpose })
    try {
      const result = await generateInterpretiveReport(surveyId, responseId, {
        role: role || null,
        industry: industry || null,
        purpose,
        force,
      })
      setAiReport(result)
      setPhase("done")
      // Scroll to the rendered report
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase("form")
    }
  }

  function handleRegenerate() {
    setPhase("form")
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] py-8 text-center"
        style={{ background: "rgba(91,33,182,0.03)", border: "0.5px dashed rgba(91,33,182,0.2)" }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "rgba(91,33,182,0.1)" }}
        >
          <svg className="h-5 w-5" style={{ color: "#5b21b6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>AI Interpretive Report</p>
          <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>
            Transform scores into a professional narrative — written like a Hogan or CliftonStrengths report
          </p>
        </div>
        <button onClick={() => setPhase("form")} className="btn-primary text-sm mt-1">
          Generate AI Report
        </button>
      </div>
    )
  }

  if (phase === "form") {
    return (
      <div>
        {error && (
          <div className="alert-error mb-4">{error}</div>
        )}
        <AIContextForm
          onSubmit={(r, i, p) => handleGenerate(r, i, p, !!aiReport)}
          onCancel={() => setPhase(aiReport ? "done" : "idle")}
          loading={false}
          initialRole={savedContext.role}
          initialIndustry={savedContext.industry}
          initialPurpose={savedContext.purpose}
        />
      </div>
    )
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[18px] py-12"
        style={{ background: "rgba(91,33,182,0.03)", border: "0.5px solid rgba(91,33,182,0.12)" }}
      >
        <svg className="h-8 w-8 animate-spin" style={{ color: "#5b21b6" }} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>Generating report…</p>
          <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
            Claude is analyzing the factor profile
          </p>
        </div>
      </div>
    )
  }

  // phase === "done"
  if (!aiReport) return null

  return (
    <div ref={reportRef}>
      <AIReportRenderer aiReport={aiReport} onRegenerate={handleRegenerate} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ParticipantReportPage() {
  const { id, response_id } = useParams<{ id: string; response_id: string }>()
  const [report, setReport] = useState<ParticipantReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getParticipantReport(id, response_id)
      .then(setReport)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id, response_id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
        Loading report…
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="alert-error px-6 py-5">{error ?? "Report not found."}</div>
      </div>
    )
  }

  const respondentLabel = report.respondent_ref ?? report.response_id.slice(0, 8)

  return (
    <div className="min-h-screen print:bg-white">
      {/* Nav bar */}
      <div
        className="print:hidden sticky top-0 z-10 border-b px-6 py-3"
        style={{
          background: "rgba(240,238,255,0.8)",
          borderColor: "rgba(255,255,255,0.5)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href={`/surveys/${id}/results`}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: "rgba(30,27,75,0.5)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to results
          </Link>
          <button
            onClick={() => window.print()}
            className="btn-primary text-xs px-4 py-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Report body */}
      <div className="mx-auto max-w-4xl px-6 py-10 print:px-8 print:py-6 space-y-10">

        {/* Header */}
        <div
          className="flex items-start justify-between gap-6 pb-6"
          style={{ borderBottom: "0.5px solid rgba(255,255,255,0.4)" }}
        >
          <div>
            <p className="eyebrow">Assessment Report</p>
            <h1 className="mt-1 font-playfair text-3xl font-black tracking-tight print:text-2xl" style={{ color: "#1e1b4b" }}>
              {report.survey_title}
            </h1>
            {report.survey_description && (
              <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{report.survey_description}</p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs space-y-1" style={{ color: "rgba(30,27,75,0.45)" }}>
            <p>
              <span className="font-semibold" style={{ color: "rgba(30,27,75,0.65)" }}>Respondent</span>
              <br />{respondentLabel}
            </p>
            <p>
              <span className="font-semibold" style={{ color: "rgba(30,27,75,0.65)" }}>Date</span>
              <br />{fmtDate(report.submitted_at)}
            </p>
          </div>
        </div>

        {/* Composite + radar row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2">
          <CompositeCard report={report} />
          {report.factors.filter(f => f.normalized !== null).length >= 3 ? (
            <div className="card flex items-center justify-center p-4">
              <RadarChart factors={report.factors} size={260} />
            </div>
          ) : (
            <div className="card flex items-center justify-center p-4">
              <p className="text-center text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
                Radar chart requires at least 3 factors with normalized scores.
              </p>
            </div>
          )}
        </div>

        {/* Factor score bars */}
        <section>
          <h2 className="section-heading mb-4">Factor Scores</h2>
          <div className="card p-5">
            <FactorBars factors={report.factors} />
          </div>
        </section>

        {/* ── AI Interpretive Report section ─────────────────────────────── */}
        <section>
          <h2 className="section-heading mb-4">Interpretive Report</h2>
          <AIReportSection surveyId={id} responseId={response_id} />
        </section>

        {/* Item detail */}
        {report.answers.length > 0 && (
          <section>
            <h2 className="section-heading mb-4">Item Detail</h2>
            <div className="card p-5">
              <ItemTable report={report} />
            </div>
          </section>
        )}

        {/* Footer */}
        <footer
          className="pt-4 text-center text-[10px] print:block"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.35)", color: "rgba(30,27,75,0.3)" }}
        >
          Generated by Metricly · {report.survey_title} · {fmtDate(report.submitted_at)}
        </footer>
      </div>
    </div>
  )
}
