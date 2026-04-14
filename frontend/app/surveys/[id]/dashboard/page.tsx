"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Header from "@/components/Header"
import {
  getDashboard,
  getGroupComparison,
  getRespondents,
} from "@/lib/api"
import type {
  DashboardData,
  FactorDistribution,
  FactorGroupComparison,
  GroupComparisonData,
  RespondentRow,
  RespondentsData,
} from "@/lib/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, d = 1): string {
  return n !== null && n !== undefined ? n.toFixed(d) : "—"
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Distinct colors for grouped bar chart groups
const GROUP_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
]

// ---------------------------------------------------------------------------
// Section 1 — Overview cards
// ---------------------------------------------------------------------------

function OverviewCards({ data }: { data: DashboardData }) {
  const hasComp = data.average_composite !== null
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {/* Total responses */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Responses</p>
        <p className="mt-2 text-4xl font-black tabular-nums text-slate-900">{data.response_count}</p>
      </div>

      {/* Average composite */}
      <div
        className="rounded-2xl border p-5 shadow-sm"
        style={{
          borderColor: hasComp && data.composite_color ? `${data.composite_color}40` : "#e2e8f0",
          background: hasComp && data.composite_color
            ? `linear-gradient(135deg, ${data.composite_color}12 0%, #ffffff 100%)`
            : "#ffffff",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg. Score</p>
        <p
          className="mt-2 text-4xl font-black tabular-nums"
          style={{ color: data.composite_color ?? "#6366f1" }}
        >
          {fmt(data.average_composite)}
        </p>
        {data.composite_label && (
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: data.composite_color ?? "#6366f1" }}
          >
            {data.composite_label}
          </span>
        )}
      </div>

      {/* Date range start */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">First Response</p>
        <p className="mt-2 text-sm font-semibold text-slate-700">{fmtDate(data.date_range_start)}</p>
      </div>

      {/* Date range end */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Latest Response</p>
        <p className="mt-2 text-sm font-semibold text-slate-700">{fmtDate(data.date_range_end)}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Factor performance (horizontal bar chart)
// ---------------------------------------------------------------------------

function FactorPerformance({ factors }: { factors: FactorDistribution[] }) {
  const chartData = factors
    .filter(f => f.mean !== null)
    .map(f => ({
      name: f.factor_name,
      mean: f.mean!,
      sd: f.sd ?? 0,
      label: f.label,
      color: f.color ?? "#6366f1",
    }))

  if (chartData.length === 0) {
    return <p className="text-xs text-slate-400">No factor scores available yet.</p>
  }

  return (
    <div className="space-y-3">
      {factors.filter(f => f.mean !== null).map(f => (
        <div key={f.factor_name}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{f.factor_name}</span>
            <div className="flex items-center gap-2">
              {f.label && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: f.color ?? "#64748b" }}
                >
                  {f.label}
                </span>
              )}
              <span className="text-xs tabular-nums text-slate-500">
                {fmt(f.mean)} <span className="text-slate-400">± {fmt(f.sd)}</span>
                <span className="ml-1 text-slate-300">n={f.n}</span>
              </span>
            </div>
          </div>
          {/* Bar with SD range */}
          <div className="relative h-6 w-full overflow-hidden rounded-full bg-slate-100">
            {/* SD range */}
            {f.sd !== null && f.mean !== null && (
              <div
                className="absolute top-1.5 h-3 rounded-full opacity-30"
                style={{
                  left: `${Math.max(0, f.mean - f.sd)}%`,
                  width: `${Math.min(100, f.mean + f.sd) - Math.max(0, f.mean - f.sd)}%`,
                  backgroundColor: f.color ?? "#6366f1",
                }}
              />
            )}
            {/* Mean bar */}
            <div
              className="absolute top-0 h-full rounded-full transition-all duration-500"
              style={{
                width: `${f.mean ?? 0}%`,
                backgroundColor: f.color ?? "#6366f1",
                opacity: 0.85,
              }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
            <span>0</span><span>100</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Score distribution histogram
// ---------------------------------------------------------------------------

const LABEL_BAND_COLORS = ["#ef4444", "#f59e0b", "#22c55e"]

function ScoreDistribution({ data }: { data: DashboardData }) {
  const histData = data.composite_histogram.map(b => ({
    name: `${b.start}–${b.end}`,
    count: b.count,
    start: b.start,
  }))

  if (data.composite_histogram.every(b => b.count === 0)) {
    return <p className="text-xs text-slate-400">No composite scores yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={histData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} width={24} />
        <Tooltip
          formatter={(v: unknown) => { const n = v as number; return [`${n} respondent${n !== 1 ? "s" : ""}`, "Count"] }}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {histData.map((entry, i) => (
            <Cell key={i} fill="#6366f1" fillOpacity={0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Demographic breakdown
// ---------------------------------------------------------------------------

function SignificanceBadge({ fc }: { fc: FactorGroupComparison }) {
  if (!fc.significant) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        No significant difference
      </span>
    )
  }
  const isLarge = fc.interpretation.includes("large")
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
        isLarge ? "bg-red-500" : "bg-amber-500"
      }`}
    >
      {fc.effect_size_type === "cohen_d"
        ? `Cohen's d = ${fmt(fc.effect_size, 2)}`
        : `η² = ${fmt(fc.effect_size, 3)}`}
      {" · "}p = {fmt(fc.p_value, 3)}
    </span>
  )
}

function DemographicBreakdown({
  surveyId,
  demographicKeys,
}: {
  surveyId: string
  demographicKeys: string[]
}) {
  const [selectedKey, setSelectedKey] = useState(demographicKeys[0] ?? "")
  const [compData, setCompData] = useState<GroupComparisonData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (key: string) => {
    if (!key) return
    setLoading(true); setError(null)
    try {
      setCompData(await getGroupComparison(surveyId, key))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => { if (selectedKey) load(selectedKey) }, [selectedKey, load])

  if (demographicKeys.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No demographic questions found. Mark questions as demographic in the survey editor to enable group comparison.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Key selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-500">Compare by:</label>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {demographicKeys.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {compData && compData.factors.length === 0 && (
        <p className="text-xs text-slate-400">
          No factor scores available for comparison. Assign scoring algorithms to factors first.
        </p>
      )}

      {compData && compData.factors.map(fc => {
        const chartData = compData.group_values.map(gv => {
          const gs = fc.groups.find(g => g.group_value === gv)
          return { name: gv, mean: gs?.mean ?? 0, n: gs?.n ?? 0, sd: gs?.sd ?? 0 }
        })

        return (
          <div key={fc.factor_name} className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="text-sm font-semibold text-slate-700">{fc.factor_name}</h4>
              <SignificanceBadge fc={fc} />
              <div className="flex gap-2 text-[10px] text-slate-400">
                {fc.groups.map(g => (
                  <span key={g.group_value}>{g.group_value}: n={g.n}</span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} width={24} />
                <Tooltip
                  formatter={(v: unknown, _name: unknown, props: { payload?: { n: number } }) => [
                    `${(v as number).toFixed(1)} (n=${props.payload?.n ?? "?"})`,
                    "Mean score",
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 5 — Respondents table
// ---------------------------------------------------------------------------

function RespondentsTable({
  surveyId,
  factorNames,
}: {
  surveyId: string
  factorNames: string[]
}) {
  const [data, setData] = useState<RespondentsData | null>(null)
  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setData(await getRespondents(surveyId, page, 20, sortDir))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [surveyId, page, sortDir])

  useEffect(() => { load() }, [load])

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {data ? `${data.total} respondent${data.total !== 1 ? "s" : ""}` : ""}
        </p>
        <button
          onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Score {sortDir === "desc" ? "↓" : "↑"}
        </button>
      </div>

      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {data && data.rows.length === 0 && (
        <p className="text-xs text-slate-400">No responses yet.</p>
      )}

      {data && data.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">Respondent</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">Composite</th>
                  {factorNames.map(f => (
                    <th key={f} className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap max-w-[90px] truncate" title={f}>
                      {f.length > 12 ? f.slice(0, 11) + "…" : f}
                    </th>
                  ))}
                  {data.rows[0] && Object.keys(data.rows[0].demographics).map(k => (
                    <th key={k} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap capitalize">{k}</th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row: RespondentRow) => (
                  <tr key={row.response_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-600">
                      {row.respondent_ref ?? row.response_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(row.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums font-semibold" style={{ color: row.composite_color ?? "#475569" }}>
                          {fmt(row.composite_score)}
                        </span>
                        {row.composite_label && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                            style={{ backgroundColor: row.composite_color ?? "#64748b" }}
                          >
                            {row.composite_label}
                          </span>
                        )}
                      </div>
                    </td>
                    {factorNames.map(f => {
                      const entry = row.factor_scores[f]
                      return (
                        <td key={f} className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {entry?.normalized !== null && entry?.normalized !== undefined
                            ? fmt(entry.normalized)
                            : <span className="text-slate-300">—</span>}
                        </td>
                      )
                    })}
                    {Object.entries(data.rows[0].demographics).map(([k]) => (
                      <td key={k} className="px-3 py-2 text-slate-600">
                        {row.demographics[k] ?? <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Link
                        href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors whitespace-nowrap"
                      >
                        Report →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard(id)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

  const factorNames = data?.factor_distributions.map(f => f.factor_name) ?? []

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header backHref={`/surveys/${id}/results`} backLabel="Results" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Page title */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Company Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Cohort analytics and demographic breakdown
              </p>
            </div>
            <Link
              href={`/surveys/${id}/results`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              ← Individual results
            </Link>
          </div>

          {loading && (
            <div className="flex justify-center py-20 text-sm text-slate-400">Loading dashboard…</div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Section 1 — Overview */}
              <OverviewCards data={data} />

              {/* Section 2 — Factor performance */}
              <Section
                title="Factor Performance"
                subtitle="Mean normalized score per factor, ranked highest to lowest. Error bands show ± 1 SD."
              >
                <FactorPerformance factors={data.factor_distributions} />
              </Section>

              {/* Section 3 — Score distribution */}
              <Section
                title="Score Distribution"
                subtitle="Histogram of composite scores across all respondents (0–100 scale)."
              >
                <ScoreDistribution data={data} />
              </Section>

              {/* Section 4 — Demographic breakdown */}
              <Section
                title="Demographic Breakdown"
                subtitle="Between-group comparison of factor scores. Uses Welch's t-test (2 groups) or one-way ANOVA (3+ groups)."
              >
                <DemographicBreakdown
                  surveyId={id}
                  demographicKeys={data.demographic_keys}
                />
              </Section>

              {/* Section 5 — Respondents table */}
              <Section
                title="All Respondents"
                subtitle="Sortable by composite score. Click Report to view the individual assessment."
              >
                <RespondentsTable surveyId={id} factorNames={factorNames} />
              </Section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
