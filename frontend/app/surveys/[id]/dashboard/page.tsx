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

const GROUP_COLORS = [
  "#0F2841", "#E2B146", "#7E8A55", "#DD6334",
  "#2A5BA8", "#f97316", "#84cc16", "#ec4899",
]

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-5">
        <h2 className="section-heading">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Overview cards
// ---------------------------------------------------------------------------

function OverviewCards({ data }: { data: DashboardData }) {
  const hasComp = data.average_composite !== null
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="card p-5">
        <p className="label-caps">Responses</p>
        <p className="metric-value mt-2 text-4xl font-black tabular-nums" style={{ color: "#0A1E33" }}>
          {data.response_count}
        </p>
      </div>

      <div
        className="card p-5"
        style={hasComp && data.composite_color ? {
          background: `linear-gradient(145deg, ${data.composite_color}15 0%, rgba(255,255,255,0.55) 100%)`,
        } : {}}
      >
        <p className="label-caps">Avg. Score</p>
        <p
          className="metric-value mt-2 text-4xl font-black tabular-nums"
          style={{ color: data.composite_color ?? "#0F2841" }}
        >
          {fmt(data.average_composite)}
        </p>
        {data.composite_label && (
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: data.composite_color ?? "#0F2841" }}
          >
            {data.composite_label}
          </span>
        )}
      </div>

      <div className="card p-5">
        <p className="label-caps">First Response</p>
        <p className="metric-value mt-2 text-sm font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
          {fmtDate(data.date_range_start)}
        </p>
      </div>

      <div className="card p-5">
        <p className="label-caps">Latest Response</p>
        <p className="metric-value mt-2 text-sm font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
          {fmtDate(data.date_range_end)}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Factor performance
// ---------------------------------------------------------------------------

function FactorPerformance({ factors }: { factors: FactorDistribution[] }) {
  if (factors.filter(f => f.mean !== null).length === 0) {
    return <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>No factor scores available yet.</p>
  }

  return (
    <div className="space-y-3">
      {factors.filter(f => f.mean !== null).map(f => (
        <div key={f.factor_name}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "rgba(10,30,51,0.75)" }}>{f.factor_name}</span>
            <div className="flex items-center gap-2">
              {f.label && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: f.color ?? "#0F2841" }}
                >
                  {f.label}
                </span>
              )}
              <span className="text-xs tabular-nums" style={{ color: "rgba(10,30,51,0.45)" }}>
                {fmt(f.mean)} <span style={{ color: "rgba(10,30,51,0.3)" }}>± {fmt(f.sd)}</span>
                <span className="ml-1" style={{ color: "rgba(10,30,51,0.25)" }}>n={f.n}</span>
              </span>
            </div>
          </div>
          {/* Bar with SD range */}
          <div className="relative h-6 w-full overflow-hidden rounded-full" style={{ background: "rgba(15,40,65,0.06)" }}>
            {f.sd !== null && f.mean !== null && (
              <div
                className="absolute top-1.5 h-3 rounded-full opacity-20"
                style={{
                  left: `${Math.max(0, f.mean - f.sd)}%`,
                  width: `${Math.min(100, f.mean + f.sd) - Math.max(0, f.mean - f.sd)}%`,
                  backgroundColor: f.color ?? "#0F2841",
                }}
              />
            )}
            <div
              className="absolute top-0 h-full rounded-full transition-all duration-500"
              style={{ width: `${f.mean ?? 0}%`, backgroundColor: f.color ?? "#0F2841", opacity: 0.8 }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px]" style={{ color: "rgba(10,30,51,0.25)" }}>
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

function ScoreDistribution({ data }: { data: DashboardData }) {
  const histData = data.composite_histogram.map(b => ({
    name: `${b.start}–${b.end}`,
    count: b.count,
  }))

  if (data.composite_histogram.every(b => b.count === 0)) {
    return <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>No composite scores yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={histData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,40,65,0.07)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(10,30,51,0.4)" }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(10,30,51,0.4)" }} allowDecimals={false} width={24} />
        <Tooltip
          formatter={(v: unknown) => { const n = v as number; return [`${n} respondent${n !== 1 ? "s" : ""}`, "Count"] }}
          contentStyle={{ fontSize: 11, borderRadius: 12, border: "0.5px solid rgba(255,255,255,0.8)", background: "rgba(240,238,255,0.9)", backdropFilter: "blur(12px)" }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {histData.map((_, i) => (
            <Cell key={i} fill="#0F2841" fillOpacity={0.7} />
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
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(10,30,51,0.07)", color: "rgba(10,30,51,0.5)" }}
      >
        No significant difference
      </span>
    )
  }
  const isLarge = fc.interpretation.includes("large")
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: isLarge ? "#DD6334" : "#E2B146" }}
    >
      {fc.effect_size_type === "cohen_d"
        ? `Cohen's d = ${fmt(fc.effect_size, 2)}`
        : `η² = ${fmt(fc.effect_size, 3)}`}
      {" · "}p = {fmt(fc.p_value, 3)}
    </span>
  )
}

function DemographicBreakdown({ surveyId, demographicKeys }: { surveyId: string; demographicKeys: string[] }) {
  const [selectedKey, setSelectedKey] = useState(demographicKeys[0] ?? "")
  const [compData, setCompData] = useState<GroupComparisonData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (key: string) => {
    if (!key) return
    setLoading(true); setError(null)
    try { setCompData(await getGroupComparison(surveyId, key)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [surveyId])

  useEffect(() => { if (selectedKey) load(selectedKey) }, [selectedKey, load])

  if (demographicKeys.length === 0) {
    return (
      <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>
        No demographic questions found. Mark questions as demographic in the survey editor to enable group comparison.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold" style={{ color: "rgba(10,30,51,0.5)" }}>Compare by:</label>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          className="field"
          style={{ width: "auto", paddingTop: "0.375rem", paddingBottom: "0.375rem" }}
        >
          {demographicKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {loading && <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>Loading…</p>}
      {error && <p className="text-xs" style={{ color: "#DD6334" }}>{error}</p>}

      {compData && compData.factors.length === 0 && (
        <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>
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
              <h4 className="text-sm font-semibold" style={{ color: "#0A1E33" }}>{fc.factor_name}</h4>
              <SignificanceBadge fc={fc} />
              <div className="flex gap-2 text-[10px]" style={{ color: "rgba(10,30,51,0.35)" }}>
                {fc.groups.map(g => <span key={g.group_value}>{g.group_value}: n={g.n}</span>)}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,40,65,0.07)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(10,30,51,0.4)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(10,30,51,0.4)" }} width={24} />
                <Tooltip
                  formatter={(v: unknown, _n: unknown, props: { payload?: { n: number } }) => [
                    `${(v as number).toFixed(1)} (n=${props.payload?.n ?? "?"})`,
                    "Mean score",
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 12, border: "0.5px solid rgba(255,255,255,0.8)", background: "rgba(240,238,255,0.9)", backdropFilter: "blur(12px)" }}
                />
                <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} fillOpacity={0.8} />
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

function RespondentsTable({ surveyId, factorNames }: { surveyId: string; factorNames: string[] }) {
  const [data, setData] = useState<RespondentsData | null>(null)
  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await getRespondents(surveyId, page, 20, sortDir)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [surveyId, page, sortDir])

  useEffect(() => { load() }, [load])

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "rgba(10,30,51,0.45)" }}>
          {data ? `${data.total} respondent${data.total !== 1 ? "s" : ""}` : ""}
        </p>
        <button
          onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
          className="btn-ghost text-xs px-2.5 py-1"
        >
          Score {sortDir === "desc" ? "↓" : "↑"}
        </button>
      </div>

      {loading && <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>Loading…</p>}
      {error && <p className="text-xs" style={{ color: "#DD6334" }}>{error}</p>}

      {data && data.rows.length === 0 && (
        <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>No responses yet.</p>
      )}

      {data && data.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl" style={{ border: "0.5px solid rgba(255,255,255,0.4)" }}>
            <table className="min-w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.3)" }}>
                  <th className="px-3 py-2 text-left label-caps whitespace-nowrap">Respondent</th>
                  <th className="px-3 py-2 text-left label-caps whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-right label-caps whitespace-nowrap">Composite</th>
                  {factorNames.map(f => (
                    <th key={f} className="px-3 py-2 text-right label-caps whitespace-nowrap max-w-[90px] truncate" title={f}>
                      {f.length > 12 ? f.slice(0, 11) + "…" : f}
                    </th>
                  ))}
                  {data.rows[0] && Object.keys(data.rows[0].demographics).map(k => (
                    <th key={k} className="px-3 py-2 text-left label-caps whitespace-nowrap capitalize">{k}</th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: RespondentRow) => (
                  <tr key={row.response_id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.3)" }}>
                    <td className="px-3 py-2 font-mono" style={{ color: "rgba(10,30,51,0.6)" }}>
                      {row.respondent_ref ?? row.response_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "rgba(10,30,51,0.45)" }}>
                      {new Date(row.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="tabular-nums font-semibold" style={{ color: row.composite_color ?? "rgba(10,30,51,0.5)" }}>
                          {fmt(row.composite_score)}
                        </span>
                        {row.composite_label && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                            style={{ backgroundColor: row.composite_color ?? "#0F2841" }}
                          >
                            {row.composite_label}
                          </span>
                        )}
                      </div>
                    </td>
                    {factorNames.map(f => {
                      const entry = row.factor_scores[f]
                      return (
                        <td key={f} className="px-3 py-2 text-right tabular-nums" style={{ color: "rgba(10,30,51,0.6)" }}>
                          {entry?.normalized !== null && entry?.normalized !== undefined
                            ? fmt(entry.normalized)
                            : <span style={{ color: "rgba(10,30,51,0.2)" }}>—</span>}
                        </td>
                      )
                    })}
                    {Object.entries(data.rows[0].demographics).map(([k]) => (
                      <td key={k} className="px-3 py-2" style={{ color: "rgba(10,30,51,0.6)" }}>
                        {row.demographics[k] ?? <span style={{ color: "rgba(10,30,51,0.2)" }}>—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Link
                        href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors whitespace-nowrap"
                        style={{ color: "#0F2841", background: "rgba(15,40,65,0.08)" }}
                      >
                        Report →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-ghost text-xs px-2.5 py-1 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs" style={{ color: "rgba(10,30,51,0.5)" }}>{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="btn-ghost text-xs px-2.5 py-1 disabled:opacity-40"
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
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/surveys/${id}/results`} backLabel="Results" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-6">

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="page-title">Company Dashboard</h1>
              <p className="mt-1 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
                Cohort analytics and demographic breakdown
              </p>
            </div>
            <Link href={`/surveys/${id}/results`} className="btn-ghost text-xs px-3 py-1.5">
              ← Individual results
            </Link>
          </div>

          {loading && (
            <div className="flex justify-center py-20 text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>
              Loading dashboard…
            </div>
          )}

          {error && <div className="alert-error">{error}</div>}

          {data && (
            <>
              <OverviewCards data={data} />

              <Section
                title="Factor Performance"
                subtitle="Mean normalized score per factor. Error bands show ± 1 SD."
              >
                <FactorPerformance factors={data.factor_distributions} />
              </Section>

              <Section
                title="Score Distribution"
                subtitle="Histogram of composite scores across all respondents (0–100 scale)."
              >
                <ScoreDistribution data={data} />
              </Section>

              <Section
                title="Demographic Breakdown"
                subtitle="Between-group comparison using Welch's t-test (2 groups) or one-way ANOVA (3+ groups)."
              >
                <DemographicBreakdown surveyId={id} demographicKeys={data.demographic_keys} />
              </Section>

              <Section
                title="All Respondents"
                subtitle="Sortable by composite score. Click Report to view individual assessment."
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
