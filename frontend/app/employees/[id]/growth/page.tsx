"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import Header from "@/components/Header"
import { getEmployeeGrowth } from "@/lib/api"
import type { CompetencyTrend, GrowthProfile } from "@/lib/types"

// ---------------------------------------------------------------------------
// Trend badge
// ---------------------------------------------------------------------------

function TrendBadge({ trend }: { trend: CompetencyTrend["trend"] }) {
  const map: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    improving:          { label: "Improving",   bg: "rgba(34,197,94,0.1)",   color: "#16a34a", icon: "↑" },
    stable:             { label: "Stable",      bg: "rgba(59,130,246,0.1)",  color: "#2563eb", icon: "→" },
    declining:          { label: "Declining",   bg: "rgba(239,68,68,0.1)",   color: "#dc2626", icon: "↓" },
    insufficient_data:  { label: "No trend",   bg: "rgba(30,27,75,0.07)",   color: "rgba(30,27,75,0.4)", icon: "—" },
  }
  const s = map[trend] ?? map.insufficient_data
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {s.icon} {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Benchmark status badge
// ---------------------------------------------------------------------------

function BenchmarkBadge({ status }: { status: CompetencyTrend["benchmark_status"] }) {
  if (!status) return null
  const map: Record<string, { label: string; bg: string; color: string }> = {
    exceeding: { label: "Exceeding target", bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
    meeting:   { label: "Meeting target",   bg: "rgba(59,130,246,0.1)", color: "#2563eb" },
    below:     { label: "Below target",     bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
  }
  const s = map[status]
  if (!s) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Competency growth card
// ---------------------------------------------------------------------------

function CompetencyCard({ trend }: { trend: CompetencyTrend }) {
  const hasHistory = trend.scores.length >= 2
  const chartData = trend.scores.map((s, i) => ({
    name: i === 0 ? "Baseline" : `Pulse ${i}`,
    score: Math.round(s.normalized_score * 10) / 10,
    date: new Date(s.assessed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }))

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{trend.competency_name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TrendBadge trend={trend.trend} />
            <BenchmarkBadge status={trend.benchmark_status} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          {trend.current_score !== null ? (
            <>
              <span className="metric-value text-2xl font-bold" style={{ color: "#1e1b4b" }}>
                {trend.current_score.toFixed(0)}
              </span>
              {trend.benchmark_score !== null && (
                <span className="block text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>
                  target {trend.benchmark_score.toFixed(0)}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>Not assessed</span>
          )}
        </div>
      </div>

      {hasHistory ? (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,33,182,0.08)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: "rgba(30,27,75,0.4)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: "rgba(30,27,75,0.4)" }}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <Tooltip
                contentStyle={{ background: "rgba(240,238,255,0.95)", border: "0.5px solid rgba(91,33,182,0.2)", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`${Number(v).toFixed(1)}`, "Score"]}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? label}
              />
              {trend.benchmark_score !== null && (
                <ReferenceLine
                  y={trend.benchmark_score}
                  stroke="rgba(91,33,182,0.35)"
                  strokeDasharray="4 3"
                  label={{ value: "target", position: "insideTopRight", fontSize: 8, fill: "rgba(91,33,182,0.5)" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="score"
                stroke="#5b21b6"
                strokeWidth={2}
                dot={{ fill: "#5b21b6", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : trend.scores.length === 1 ? (
        <div className="mt-2 flex items-center justify-center rounded-xl py-4" style={{ background: "rgba(91,33,182,0.04)" }}>
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
            Baseline recorded — more data needed for trend.
          </p>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-center rounded-xl py-4" style={{ background: "rgba(91,33,182,0.04)" }}>
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Not yet assessed.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GrowthPage() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<GrowthProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    getEmployeeGrowth(id)
      .then(setProfile)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>Loading…</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="alert-error max-w-sm">{error ?? "Profile not found."}</div>
        </div>
      </div>
    )
  }

  const assessed = profile.competency_trends.filter(t => t.current_score !== null)
  const improving = assessed.filter(t => t.trend === "improving").length
  const meeting = assessed.filter(t => t.benchmark_status === "meeting" || t.benchmark_status === "exceeding").length
  const hasBenchmarks = profile.competency_trends.some(t => t.benchmark_score !== null)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-8">
            <p className="eyebrow mb-1">Growth Profile</p>
            <h1 className="page-title">{profile.employee_name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              {profile.role_title && <span>{profile.role_title}</span>}
              {profile.role_title && profile.department && <span style={{ color: "rgba(30,27,75,0.25)" }}>·</span>}
              {profile.department && <span>{profile.department}</span>}
              <span style={{ color: "rgba(30,27,75,0.25)" }}>·</span>
              <span style={{ color: "rgba(30,27,75,0.4)" }}>{profile.framework_title}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Assessed</p>
              <p className="metric-value text-2xl font-bold" style={{ color: "#1e1b4b" }}>
                {assessed.length}/{profile.competency_trends.length}
              </p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Improving</p>
              <p className="metric-value text-2xl font-bold" style={{ color: improving > 0 ? "#16a34a" : "rgba(30,27,75,0.3)" }}>
                {improving}
              </p>
            </div>
            {hasBenchmarks ? (
              <div className="card p-4 text-center">
                <p className="label-caps mb-1">On Target</p>
                <p className="metric-value text-2xl font-bold" style={{ color: meeting > 0 ? "#2563eb" : "rgba(30,27,75,0.3)" }}>
                  {meeting}
                </p>
              </div>
            ) : (
              <div className="card p-4 text-center">
                <p className="label-caps mb-1">Competencies</p>
                <p className="metric-value text-2xl font-bold" style={{ color: "#1e1b4b" }}>
                  {profile.competency_trends.length}
                </p>
              </div>
            )}
          </div>

          {/* Competency cards */}
          <div className="space-y-4">
            {profile.competency_trends.map(trend => (
              <CompetencyCard key={trend.competency_id} trend={trend} />
            ))}
          </div>

          {profile.competency_trends.length === 0 && (
            <div className="card p-8 text-center">
              <p className="section-heading mb-1">No competencies</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                This framework has no competencies defined.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
