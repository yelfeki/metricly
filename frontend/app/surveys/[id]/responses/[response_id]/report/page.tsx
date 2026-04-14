"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getParticipantReport } from "@/lib/api"
import type { FactorReport, ParticipantReport } from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 1): string {
  return n !== null && n !== undefined ? n.toFixed(decimals) : "—"
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// Readable answer value (strip JSON brackets for multi-select etc.)
function displayValue(value: string): string {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join(", ")
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
    }
  } catch {
    // not JSON, return as-is
  }
  return value
}

// ---------------------------------------------------------------------------
// Radar / Spider chart (SVG)
// ---------------------------------------------------------------------------

interface RadarChartProps {
  factors: FactorReport[]
  size?: number
}

function RadarChart({ factors, size = 280 }: RadarChartProps) {
  const scored = factors.filter(f => f.normalized !== null)
  if (scored.length < 3) return null

  const cx = size / 2
  const cy = size / 2
  const R = size * 0.38       // outer ring radius
  const labelR = size * 0.48  // label orbit
  const n = scored.length
  const rings = [25, 50, 75, 100]

  function polar(score: number, i: number, total: number, radius: number) {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2
    const r = (score / 100) * radius
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  }

  function axisEnd(i: number) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) }
  }

  function labelPos(i: number) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return { x: cx + labelR * Math.cos(angle), y: cy + labelR * Math.sin(angle) }
  }

  // Ring polygons
  const ringPaths = rings.map(pct => {
    const pts = Array.from({ length: n }, (_, i) => polar(pct, i, n, R))
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"
  })

  // Score polygon
  const scorePts = scored.map((f, i) => polar(f.normalized!, i, n, R))
  const scorePath = scorePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto print:mx-0"
      aria-label="Factor radar chart"
    >
      {/* Grid rings */}
      {ringPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      ))}

      {/* Ring labels */}
      {rings.map(pct => (
        <text
          key={pct}
          x={cx + 4}
          y={cy - (pct / 100) * R - 3}
          fontSize={7}
          fill="#94a3b8"
        >
          {pct}
        </text>
      ))}

      {/* Axes */}
      {Array.from({ length: n }, (_, i) => {
        const end = axisEnd(i)
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x.toFixed(1)} y2={end.y.toFixed(1)}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        )
      })}

      {/* Score polygon fill */}
      <path d={scorePath} fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" />

      {/* Score dots */}
      {scorePts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={4} fill="#6366f1" />
      ))}

      {/* Factor labels */}
      {scored.map((f, i) => {
        const lp = labelPos(i)
        const anchor =
          lp.x < cx - 5 ? "end" : lp.x > cx + 5 ? "start" : "middle"
        const words = f.factor_name.split(" ")
        return (
          <text
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={9}
            fontWeight={600}
            fill="#475569"
          >
            {words.length <= 2 ? (
              f.factor_name
            ) : (
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
      className="relative overflow-hidden rounded-2xl p-6 text-center shadow-sm print:shadow-none print:border print:border-slate-200"
      style={{
        background: hasScore && composite.color
          ? `linear-gradient(135deg, ${composite.color}18 0%, ${composite.color}08 100%)`
          : "linear-gradient(135deg, #f1f5f9 0%, #f8fafc 100%)",
        border: `2px solid ${hasScore && composite.color ? composite.color + "40" : "#e2e8f0"}`,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Overall Score
      </p>
      <p
        className="mt-2 text-6xl font-black tabular-nums leading-none"
        style={{ color: composite.color ?? "#6366f1" }}
      >
        {hasScore ? fmt(composite.normalized, 1) : "—"}
      </p>
      <p className="mt-1 text-sm text-slate-500">/ 100</p>
      {composite.label && (
        <span
          className="mt-3 inline-block rounded-full px-4 py-1 text-sm font-bold text-white"
          style={{ backgroundColor: composite.color ?? "#6366f1" }}
        >
          {composite.label}
        </span>
      )}
      {!hasScore && (
        <p className="mt-3 text-xs text-slate-400">
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
      <p className="text-xs text-slate-400">
        No factor scores available. Assign questions to factors and configure scoring algorithms.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {factors.map(f => (
        <div key={f.factor_name}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700 truncate">{f.factor_name}</span>
            <div className="flex items-center gap-2 shrink-0">
              {f.label && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: f.color ?? "#64748b" }}
                >
                  {f.label}
                </span>
              )}
              <span className="w-10 text-right text-xs tabular-nums font-semibold text-slate-600">
                {fmt(f.normalized)}
              </span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${f.normalized ?? 0}%`,
                backgroundColor: f.color ?? "#6366f1",
              }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
            <span>0</span>
            <span className="text-slate-400">
              raw: {fmt(f.raw_mean, 2)} · {f.item_count} item{f.item_count !== 1 ? "s" : ""}
            </span>
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
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              {fname}
            </h4>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 w-1/2">Question</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Response</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">Raw score</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">Normalized</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-500">Label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(ans => (
                    <tr key={ans.question_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700 leading-snug">
                        {ans.question_text}
                        {ans.reverse_scored && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">R</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate" title={displayValue(ans.value)}>
                        {displayValue(ans.value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {ans.raw_score !== null ? fmt(ans.raw_score, 2) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {ans.normalized !== null ? fmt(ans.normalized, 1) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ans.label ? (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: ans.color ?? "#64748b" }}
                          >
                            {ans.label}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading report…
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
          {error ?? "Report not found."}
        </div>
      </div>
    )
  }

  const respondentLabel = report.respondent_ref ?? report.response_id.slice(0, 8)

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {/* Print/nav bar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link
            href={`/surveys/${id}/results`}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to results
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
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

        {/* ── Report header ── */}
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6 print:pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 print:text-indigo-600">
              Assessment Report
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 print:text-2xl">
              {report.survey_title}
            </h1>
            {report.survey_description && (
              <p className="mt-1 text-sm text-slate-500">{report.survey_description}</p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-slate-400 space-y-1">
            <p>
              <span className="font-semibold text-slate-600">Respondent</span>
              <br />{respondentLabel}
            </p>
            <p>
              <span className="font-semibold text-slate-600">Date</span>
              <br />{fmtDate(report.submitted_at)}
            </p>
          </div>
        </div>

        {/* ── Composite + charts row ── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2">
          <CompositeCard report={report} />

          {/* Radar chart */}
          {report.factors.filter(f => f.normalized !== null).length >= 3 ? (
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none">
              <RadarChart factors={report.factors} size={260} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none">
              <p className="text-center text-xs text-slate-400">
                Radar chart requires at least 3 factors with normalized scores.
              </p>
            </div>
          )}
        </div>

        {/* ── Factor score bars ── */}
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Factor Scores
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
            <FactorBars factors={report.factors} />
          </div>
        </section>

        {/* ── Item detail ── */}
        {report.answers.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
              Item Detail
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
              <ItemTable report={report} />
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400 print:block">
          Generated by Metricly · {report.survey_title} · {fmtDate(report.submitted_at)}
        </footer>
      </div>
    </div>
  )
}
