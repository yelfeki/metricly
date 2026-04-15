"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import { getFramework, getTeamGapReport } from "@/lib/api"
import type { CompetencyTeamStats, FrameworkOut, TeamGapReport, TeamHeatmapRow } from "@/lib/types"

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "rgba(239,68,68,0.18)",   text: "#dc2626", label: "L1" },
  2: { bg: "rgba(245,158,11,0.18)",  text: "#d97706", label: "L2" },
  3: { bg: "rgba(59,130,246,0.15)",  text: "#2563eb", label: "L3" },
  4: { bg: "rgba(34,197,94,0.15)",   text: "#16a34a", label: "L4" },
  5: { bg: "rgba(16,185,129,0.18)",  text: "#059669", label: "L5" },
}

function levelStyle(level: number | null) {
  if (level === null) return { bg: "rgba(30,27,75,0.05)", text: "rgba(30,27,75,0.25)" }
  const c = LEVEL_COLORS[Math.min(Math.max(level, 1), 5)]
  return c ? { bg: c.bg, text: c.text } : { bg: "rgba(30,27,75,0.05)", text: "rgba(30,27,75,0.25)" }
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

function Heatmap({
  rows,
  competencies,
  requiredLevel,
}: {
  rows: TeamHeatmapRow[]
  competencies: { id: string; name: string }[]
  requiredLevel: number
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "rgba(30,27,75,0.4)" }}>
        No employees assessed yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th
              className="py-2 pr-4 text-left font-semibold sticky left-0"
              style={{ color: "rgba(30,27,75,0.5)", background: "transparent", minWidth: 140 }}
            >
              Employee
            </th>
            {competencies.map(c => (
              <th
                key={c.id}
                className="py-2 px-2 text-center font-semibold"
                style={{ color: "rgba(30,27,75,0.5)", minWidth: 80 }}
                title={c.name}
              >
                <span className="block max-w-[72px] truncate mx-auto">{c.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.employee_id}>
              <td
                className="py-1.5 pr-4 font-medium sticky left-0"
                style={{ color: "#1e1b4b", background: "transparent" }}
              >
                {row.employee_name}
              </td>
              {competencies.map(c => {
                const level = row.scores[c.id] ?? null
                const style = levelStyle(level)
                const belowRequired = level !== null && level < requiredLevel
                return (
                  <td key={c.id} className="py-1 px-2 text-center">
                    <span
                      className="inline-flex h-7 w-14 items-center justify-center rounded-md text-[10px] font-bold"
                      style={{
                        background: style.bg,
                        color: style.text,
                        outline: belowRequired ? "1.5px solid rgba(239,68,68,0.4)" : "none",
                      }}
                      title={level === null ? "Not assessed" : `Level ${level}`}
                    >
                      {level === null ? "—" : `L${level}`}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {Object.entries(LEVEL_COLORS).map(([lvl, c]) => (
          <span key={lvl} className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c.bg, border: `1px solid ${c.text}` }} />
            <span style={{ color: c.text }}>{c.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
          <span
            className="inline-block h-3 w-5 rounded-sm"
            style={{ background: "rgba(30,27,75,0.05)", outline: "1.5px solid rgba(239,68,68,0.4)" }}
          />
          <span style={{ color: "rgba(30,27,75,0.45)" }}>Below req.</span>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Level distribution bar chart
// ---------------------------------------------------------------------------

function DistributionBar({ stats, maxLevel }: { stats: CompetencyTeamStats; maxLevel: number }) {
  const levels = Array.from({ length: maxLevel }, (_, i) => i + 1)

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight" style={{ color: "#1e1b4b" }}>
          {stats.competency_name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {stats.critical && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(239,68,68,0.12)", border: "0.5px solid rgba(239,68,68,0.3)", color: "#dc2626" }}
            >
              Critical
            </span>
          )}
          {stats.mean_score !== null && (
            <span className="text-xs font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>
              avg {stats.mean_score.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-16">
        {levels.map(level => {
          const pct = stats.level_distribution[String(level)] ?? 0
          const style = levelStyle(level)
          return (
            <div key={level} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] font-semibold" style={{ color: style.text }}>
                {pct > 0 ? `${Math.round(pct)}%` : ""}
              </span>
              <div
                className="w-full rounded-t-sm transition-all duration-700"
                style={{
                  height: `${Math.max(pct, 2)}%`,
                  background: style.bg,
                  border: `1px solid ${style.text}`,
                  minHeight: pct > 0 ? 4 : 2,
                  opacity: pct === 0 ? 0.25 : 1,
                }}
              />
              <span className="text-[9px]" style={{ color: "rgba(30,27,75,0.4)" }}>L{level}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamReportPage() {
  const { id } = useParams<{ id: string }>()
  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [report, setReport] = useState<TeamGapReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [fw, rpt] = await Promise.all([getFramework(id), getTeamGapReport(id)])
      setFramework(fw)
      setReport(rpt)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/frameworks" backLabel="Frameworks" />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
          Loading…
        </div>
      </div>
    )
  }

  const maxLevel = framework?.proficiency_levels.length ?? 5
  const competencies = framework?.competencies.map(c => ({ id: c.id, name: c.name })) ?? []

  // Required level = 60th percentile of scale
  const requiredLevel = Math.max(1, Math.round(maxLevel * 0.6))

  const avgReadiness =
    report && report.competency_stats.length > 0
      ? report.competency_stats.reduce((sum, s) => sum + (s.mean_score ?? 0), 0) / report.competency_stats.length
      : null

  const readinessColor =
    avgReadiness === null ? "#1e1b4b"
    : avgReadiness >= 80 ? "#059669"
    : avgReadiness >= 60 ? "#3b82f6"
    : avgReadiness >= 40 ? "#f59e0b"
    : "#ef4444"

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/frameworks" backLabel="Frameworks" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">

          {/* Title */}
          <div className="mb-8">
            <p className="eyebrow mb-1">Team Gap Analysis</p>
            <h1 className="page-title">{framework?.title ?? "…"}</h1>
            {framework?.role_title && (
              <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{framework.role_title}</p>
            )}
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {report && (
            <>
              {/* Summary row */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="card p-5 text-center">
                  <p className="label-caps mb-1">Employees</p>
                  <p className="metric-value text-3xl font-bold" style={{ color: "#1e1b4b" }}>
                    {report.employee_count}
                  </p>
                </div>
                <div className="card p-5 text-center">
                  <p className="label-caps mb-1">Avg Score</p>
                  <p className="metric-value text-3xl font-bold" style={{ color: readinessColor }}>
                    {avgReadiness !== null ? `${avgReadiness.toFixed(0)}` : "—"}
                  </p>
                </div>
                <div className="card p-5 text-center">
                  <p className="label-caps mb-1">Critical Gaps</p>
                  <p
                    className="metric-value text-3xl font-bold"
                    style={{ color: report.critical_gaps.length > 0 ? "#dc2626" : "#059669" }}
                  >
                    {report.critical_gaps.length}
                  </p>
                </div>
              </div>

              {/* Critical gaps alert */}
              {report.critical_gaps.length > 0 && (
                <div className="mb-6 card p-5" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.2)" }}>
                  <div className="mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#dc2626" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <h2 className="section-heading" style={{ color: "#dc2626" }}>Critical Gaps</h2>
                  </div>
                  <p className="mb-3 text-xs" style={{ color: "rgba(30,27,75,0.55)" }}>
                    Over 50% of the team is below the required proficiency level for these competencies.
                  </p>
                  <div className="space-y-2">
                    {report.critical_gaps.map(gap => (
                      <div key={gap.competency_id} className="flex items-center justify-between gap-4">
                        <span className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{gap.competency_name}</span>
                        <div className="flex items-center gap-3">
                          {gap.mean_score !== null && (
                            <span className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
                              avg {gap.mean_score.toFixed(0)}
                            </span>
                          )}
                          {/* % below required */}
                          {(() => {
                            const belowPct = Object.entries(gap.level_distribution)
                              .filter(([lvl]) => parseInt(lvl) < requiredLevel)
                              .reduce((sum, [, pct]) => sum + pct, 0)
                            return (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}
                              >
                                {Math.round(belowPct)}% below L{requiredLevel}
                              </span>
                            )
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heatmap */}
              {report.heatmap.length > 0 && (
                <div className="card mb-6 p-5">
                  <h2 className="section-heading mb-4">Proficiency Heatmap</h2>
                  <Heatmap
                    rows={report.heatmap}
                    competencies={competencies}
                    requiredLevel={requiredLevel}
                  />
                </div>
              )}

              {/* Distribution charts */}
              {report.competency_stats.length > 0 && (
                <div>
                  <h2 className="section-heading mb-3">Level Distribution by Competency</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {report.competency_stats.map(stats => (
                      <DistributionBar key={stats.competency_id} stats={stats} maxLevel={maxLevel} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state — no employees */}
              {report.employee_count === 0 && (
                <div className="card p-8 text-center">
                  <p className="section-heading mb-2">No employees assessed yet</p>
                  <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                    Add employees and submit assessment scores in the{" "}
                    <a href={`/frameworks/${id}/gap-report`} className="underline" style={{ color: "#5b21b6" }}>
                      individual gap report
                    </a>{" "}
                    to populate this dashboard.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
