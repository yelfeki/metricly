"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconDownload,
  IconEdit,
  IconListCheck,
  IconRocket,
  IconShare,
  IconShieldCheck,
} from "@tabler/icons-react"
import Header from "@/components/Header"
import {
  getFramework,
  getFrameworkCompetencyDetail,
  listBenchmarks,
  type CompetencyDetailView,
} from "@/lib/api"
import type { BenchmarkOut, CompetencyOut, FrameworkOut } from "@/lib/types"
import { iconForCluster } from "./lib/cluster-icon-hash"
import { colourForCluster } from "./lib/cluster-palette"

/**
 * Framework summary — client-facing presentational view.
 *
 *   Header → 4 metric cards → cluster composition + proficiency histogram
 *   → competencies grid with cluster filter pills → proficiency scale legend
 *   → footer (grounding note + Edit / Share)
 *
 * Read-only. No edit/add/remove affordances. Cards deep-link to the
 * proficiency view; the Edit button routes to /edit. See
 * design/mockups/data-mapping.md §3 for the full data-source decisions.
 */

// Proficiency 1→5 ramp, on-palette (navy / cobalt / olive / butter / persimmon).
// Cool → warm reads as novice → expert. SCALE_BG is the light tint used as cell
// background; SCALE_FG is the dark companion text colour for contrast on that
// tint; HISTOGRAM_FILL is the saturated pigment for solid bar fills.
const SCALE_BG = [
  "rgba(15,40,65,0.10)",    // L1 navy tint
  "rgba(42,91,168,0.14)",   // L2 cobalt tint
  "rgba(126,138,85,0.18)",  // L3 olive tint
  "rgba(226,177,70,0.22)",  // L4 butter tint
  "rgba(221,99,52,0.18)",   // L5 persimmon tint
]
const SCALE_FG = [
  "#0A1E33", // L1 ink (on navy tint)
  "#042C53", // L2 cobalt-deep
  "#3F4A2A", // L3 olive-deep
  "#5A3A0C", // L4 butter-deep
  "#4A1B0C", // L5 persimmon-deep
]
const HISTOGRAM_FILL = [
  "#0F2841", // L1 navy
  "#2A5BA8", // L2 cobalt
  "#7E8A55", // L3 olive
  "#E2B146", // L4 butter
  "#DD6334", // L5 persimmon
]

const DEFAULT_LEVEL_LABELS = ["Novice", "Developing", "Proficient", "Advanced", "Expert"]

export default function FrameworkSummaryPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const frameworkId = params.id

  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkOut[]>([])
  const [details, setDetails] = useState<Map<string, CompetencyDetailView>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clusterFilter, setClusterFilter] = useState<string>("all")
  const [comingSoonNotice, setComingSoonNotice] = useState<string | null>(null)

  // Load framework + benchmarks first; then fan out to per-competency detail.
  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([getFramework(frameworkId), listBenchmarks(frameworkId)])
      .then(async ([fw, bms]) => {
        setFramework(fw)
        setBenchmarks(bms)
        setError(null)
        if (fw.competencies.length > 0) {
          const pairs = await Promise.all(
            fw.competencies.map(c =>
              getFrameworkCompetencyDetail(frameworkId, c.id)
                .then(d => [c.id, d] as const)
                .catch(() => null),
            ),
          )
          const m = new Map<string, CompetencyDetailView>()
          for (const p of pairs) if (p) m.set(p[0], p[1])
          setDetails(m)
        } else {
          setDetails(new Map())
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [frameworkId])

  useEffect(() => {
    reload()
  }, [reload])

  // Auto-dismiss the "coming soon" toast
  useEffect(() => {
    if (!comingSoonNotice) return
    const id = setTimeout(() => setComingSoonNotice(null), 2500)
    return () => clearTimeout(id)
  }, [comingSoonNotice])

  // ───── Derived data ──────────────────────────────────────────────────────

  const targetByCompetency = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of benchmarks) m.set(b.competency_id, b.required_level)
    return m
  }, [benchmarks])

  /** Per-competency total of behavioural indicators across all 5 levels. */
  const indicatorCountByCompetency = useMemo(() => {
    const m = new Map<string, number>()
    Array.from(details.entries()).forEach(([cid, detail]) => {
      let n = 0
      for (const lv of detail.levels) n += lv.behavioral_indicators.length
      m.set(cid, n)
    })
    return m
  }, [details])

  /** Σ indicators across all competencies — drives metric card 3. */
  const totalIndicators = useMemo(() => {
    let n = 0
    Array.from(indicatorCountByCompetency.values()).forEach(v => {
      n += v
    })
    return n
  }, [indicatorCountByCompetency])

  /** Cluster → count, sorted by count desc then alpha (decision FS3). */
  const clusterBuckets = useMemo(() => {
    if (!framework) return [] as Array<{ key: string; label: string; count: number }>
    const counts = new Map<string, number>()
    for (const c of framework.competencies) {
      const key = c.cluster ?? "__uncat"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: key === "__uncat" ? "Uncategorised" : key,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [framework])

  /** Histogram counts L1..L5 (unbenchmarked → L3 per decision FS2). */
  const histogramData = useMemo(() => {
    if (!framework) return [] as Array<{ level: string; count: number; fill: string }>
    const counts = [0, 0, 0, 0, 0]
    for (const c of framework.competencies) {
      const target = targetByCompetency.get(c.id) ?? 3  // FS2 fallback
      const idx = Math.min(Math.max(target, 1), 5) - 1
      counts[idx] += 1
    }
    return counts.map((count, i) => ({
      level: `L${i + 1}`,
      count,
      fill: HISTOGRAM_FILL[i],
    }))
  }, [framework, targetByCompetency])

  /** L# label lookup honouring stored framework.proficiency_levels (per decision 2). */
  const levelLabels = useMemo(() => {
    if (!framework) return DEFAULT_LEVEL_LABELS
    const out = [...DEFAULT_LEVEL_LABELS]
    for (const pl of framework.proficiency_levels) {
      if (pl.level >= 1 && pl.level <= 5 && pl.label) out[pl.level - 1] = pl.label
    }
    return out
  }, [framework])

  /** Proficiency range string (L3 – L5 / L4 / —). */
  const proficiencyRange = useMemo(() => {
    if (!framework || framework.competencies.length === 0) return "—"
    const targets = framework.competencies.map(c => targetByCompetency.get(c.id) ?? 3)
    const lo = Math.min(...targets)
    const hi = Math.max(...targets)
    return lo === hi ? `L${lo}` : `L${lo} – L${hi}`
  }, [framework, targetByCompetency])

  const visibleCompetencies = useMemo(() => {
    if (!framework) return [] as CompetencyOut[]
    if (clusterFilter === "all") return framework.competencies
    if (clusterFilter === "__uncat")
      return framework.competencies.filter(c => c.cluster === null || c.cluster === undefined)
    return framework.competencies.filter(c => c.cluster === clusterFilter)
  }, [framework, clusterFilter])

  // ───── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col">
      {/* No page-level solid cream — let the atelier washes (set on <html>
          in globals.css) show through. */}
      <Header />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {loading && <LoadingSkeleton />}
        {error && (
          <div
            className="rounded-[14px] px-4 py-3 text-sm"
            style={{
              background: "rgba(194,78,78,0.06)",
              border: "1px solid rgba(194,78,78,0.25)",
              color: "var(--mx-rose)",
              fontFamily: "var(--mx-font-sans)",
            }}
          >
            {error}
          </div>
        )}

        {framework && !loading && (
          <>
            {/* Subpage header — light cream card, no dark hero. Eyebrow stays
                in ink-3; title keeps the warm-gradient italic accent for brand
                continuity but the surface is paper, not navy. CTAs use the
                standard light pill treatment. */}
            <section className="mx-hero mb-6" style={{ padding: "32px 36px" }}>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="min-w-0">
                  <p className="mx-eyebrow mb-2">Your competency framework</p>
                  <h1 className="mx-h2" style={{ fontSize: 36, lineHeight: 1.1 }}>
                    <span className="mx-text-grad-warm">
                      {framework.role_title ?? framework.title}
                    </span>
                  </h1>
                  {framework.description && (
                    <p className="mx-caption mt-2 max-w-2xl" style={{ fontSize: 13 }}>
                      {framework.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setComingSoonNotice("Export — coming soon")}
                    className="mx-pill"
                  >
                    <IconDownload size={13} stroke={1.6} />
                    Export
                  </button>
                  <button
                    onClick={() =>
                      setComingSoonNotice("Launch assessment — coming soon")
                    }
                    className="inline-flex items-center gap-1.5 rounded-[999px] px-4 py-2 transition-all"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      background: "var(--mx-grad-cool)",
                      color: "var(--mx-paper)",
                      boxShadow: "var(--mx-shadow-card)",
                    }}
                  >
                    <IconRocket size={13} stroke={1.8} />
                    Launch assessment
                  </button>
                </div>
              </div>
            </section>

            {/* Sub-route tabs */}
            <div className="mx-tab-bar mb-6">
              <button className="mx-tab" data-active="true">
                Competencies
              </button>
              <button
                className="mx-tab"
                onClick={() => router.push(`/frameworks/${frameworkId}/proficiency`)}
              >
                Proficiency
              </button>
              <button
                className="mx-tab"
                onClick={() => router.push(`/frameworks/${frameworkId}/team-report`)}
              >
                Team report
              </button>
              <button
                className="mx-tab"
                onClick={() => router.push(`/frameworks/${frameworkId}/benchmarks`)}
              >
                Benchmarks
              </button>
              <button
                className="mx-tab"
                onClick={() => router.push(`/frameworks/${frameworkId}/pulse`)}
              >
                Pulse
              </button>
            </div>

            {/* 4 metric cards */}
            <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MetricCard label="Competencies" value={framework.competencies.length} />
              <MetricCard label="Clusters" value={clusterBuckets.length} />
              <MetricCard
                label="Behavioural indicators"
                value={totalIndicators}
                hint={details.size < framework.competencies.length ? "loading…" : undefined}
              />
              <MetricCard label="Proficiency range" value={proficiencyRange} />
            </div>

            {/* Cluster composition + proficiency histogram row */}
            <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="mx-card" style={{ padding: 18 }}>
                <div
                  className="mb-3"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--mx-ink)",
                  }}
                >
                  Cluster composition
                </div>
                <ClusterBars buckets={clusterBuckets} />
              </div>

              <div className="mx-card" style={{ padding: 18 }}>
                <div
                  className="mb-3"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--mx-ink)",
                  }}
                >
                  Proficiency profile
                </div>
                <ProficiencyHistogram data={histogramData} labels={levelLabels} />
              </div>
            </div>

            {/* Competencies grid */}
            <div className="mx-card mb-3" style={{ padding: 18 }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--mx-ink)",
                  }}
                >
                  Competencies
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <FilterPill
                    label="All"
                    count={framework.competencies.length}
                    active={clusterFilter === "all"}
                    onClick={() => setClusterFilter("all")}
                  />
                  {clusterBuckets.map(b => (
                    <FilterPill
                      key={b.key}
                      label={b.label}
                      count={b.count}
                      active={clusterFilter === b.key}
                      onClick={() => setClusterFilter(b.key)}
                    />
                  ))}
                </div>
              </div>

              {visibleCompetencies.length === 0 ? (
                <div
                  className="py-8 text-center"
                  style={{
                    fontFamily: "var(--mx-font-display)",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "var(--mx-ink-3)",
                  }}
                >
                  No competencies in this cluster.
                </div>
              ) : (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
                >
                  {visibleCompetencies.map((c, i) => {
                    const target = targetByCompetency.get(c.id) ?? null
                    const indicators = indicatorCountByCompetency.get(c.id) ?? null
                    return (
                      <CompetencyCard
                        key={c.id}
                        competency={c}
                        target={target}
                        indicatorCount={indicators}
                        levelLabel={target ? levelLabels[target - 1] : ""}
                        animationDelayMs={i * 40}
                        onClick={() =>
                          router.push(`/frameworks/${frameworkId}/proficiency?competencyId=${c.id}`)
                        }
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* Proficiency scale legend */}
            <div className="mx-card mb-3" style={{ padding: 18 }}>
              <div
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--mx-ink)",
                }}
              >
                Proficiency scale
              </div>
              <div className="mb-3 mx-caption" style={{ fontSize: 11, color: "var(--mx-ink-3)" }}>
                Each competency is rated on a five-level behaviourally anchored scale.
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="text-center"
                    style={{
                      background: SCALE_BG[i],
                      color: SCALE_FG[i],
                      borderRadius: "var(--mx-r-md)",
                      padding: 10,
                    }}
                  >
                    <div className="mx-tnum" style={{ fontSize: 11, fontWeight: 500 }}>
                      L{i + 1}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 10,
                        opacity: 0.85,
                        marginTop: 2,
                      }}
                    >
                      {levelLabels[i]}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 pt-4"
              style={{ borderTop: "1px solid var(--mx-line)" }}
            >
              <div
                className="flex items-center gap-1.5"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  color: "var(--mx-ink-3)",
                }}
              >
                <IconShieldCheck size={13} stroke={1.6} />
                Grounded in validated psychometric instruments.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/frameworks/${frameworkId}/edit`)}
                  className="mx-pill"
                >
                  <IconEdit size={13} stroke={1.6} />
                  Edit framework
                </button>
                <button
                  onClick={() => setComingSoonNotice("Share — coming soon")}
                  className="mx-pill"
                >
                  <IconShare size={13} stroke={1.6} />
                  Share
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* "Coming soon" toast for non-functional buttons */}
      {comingSoonNotice && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
          style={{ animation: "summary-toast-in 200ms cubic-bezier(.4,0,.2,1) forwards" }}
        >
          <div
            className="rounded-[999px] px-4 py-2 text-xs font-medium"
            style={{
              background: "var(--mx-ink)",
              color: "var(--mx-paper)",
              boxShadow: "var(--mx-shadow-pop)",
            }}
          >
            {comingSoonNotice}
          </div>
          <style>{`
            @keyframes summary-toast-in {
              from { opacity: 0; transform: translate(-50%, 8px); }
              to   { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <div
      className="mx-card"
      style={{ padding: 14 }}
    >
      <div
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 11,
          color: "var(--mx-ink-2)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="mx-num" style={{ fontSize: 28, color: "var(--mx-ink)" }}>
          {value}
        </span>
        {hint && (
          <span
            className="mx-caption"
            style={{ fontSize: 10, fontStyle: "italic", color: "var(--mx-ink-3)" }}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}

function ClusterBars({
  buckets,
}: {
  buckets: Array<{ key: string; label: string; count: number }>
}) {
  if (buckets.length === 0) {
    return (
      <div
        className="py-4 text-center"
        style={{
          fontFamily: "var(--mx-font-display)",
          fontStyle: "italic",
          fontSize: 13,
          color: "var(--mx-ink-3)",
        }}
      >
        No clusters yet.
      </div>
    )
  }
  const max = Math.max(...buckets.map(b => b.count), 1)
  return (
    <div className="space-y-2">
      {buckets.map(b => {
        const colour = colourForCluster(b.key === "__uncat" ? null : b.key)
        const pct = (b.count / max) * 100
        return (
          <div key={b.key} className="flex items-center gap-2.5">
            <span
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 11,
                color: "var(--mx-ink-2)",
                width: 110,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={b.label}
            >
              {b.label}
            </span>
            <div
              className="flex-1 overflow-hidden"
              style={{
                height: 18,
                background: "var(--mx-paper-2)",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: colour.main,
                  borderRadius: 4,
                  transition: "width 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
            <span
              className="mx-tnum"
              style={{
                width: 18,
                textAlign: "right",
                fontWeight: 500,
                fontSize: 11,
                color: "var(--mx-ink)",
              }}
            >
              {b.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ProficiencyHistogram({
  data,
  labels,
}: {
  data: Array<{ level: string; count: number; fill: string }>
  labels: string[]
}) {
  return (
    <div style={{ height: 150, marginLeft: -8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="level"
            tick={{
              fill: "rgba(54,70,104,0.7)",
              fontSize: 10,
              fontFamily: "var(--mx-font-sans)",
            }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{
              fill: "rgba(54,70,104,0.6)",
              fontSize: 10,
              fontFamily: "var(--mx-font-sans)",
            }}
            axisLine={false}
            tickLine={false}
            width={20}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,40,65,0.04)" }}
            contentStyle={{
              background: "var(--mx-surface)",
              border: "1px solid var(--mx-line)",
              borderRadius: 10,
              fontFamily: "var(--mx-font-sans)",
              fontSize: 12,
              color: "var(--mx-ink)",
              boxShadow: "var(--mx-shadow-pop)",
            }}
            formatter={(value, _name, entry) => {
              const n = typeof value === "number" ? value : Number(value) || 0
              const lvl =
                entry && entry.payload && typeof entry.payload.level === "string"
                  ? entry.payload.level
                  : ""
              const idx = data.findIndex(d => d.level === lvl)
              const label = idx >= 0 ? labels[idx] : ""
              return [`${n} competenc${n === 1 ? "y" : "ies"}`, label]
            }}
            labelFormatter={() => ""}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={28}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 transition-all"
      style={{
        background: active ? "var(--mx-ink)" : "transparent",
        color: active ? "var(--mx-paper)" : "var(--mx-ink-2)",
        border: `1px solid ${active ? "var(--mx-ink)" : "var(--mx-line)"}`,
        borderRadius: 10,
        fontFamily: "var(--mx-font-sans)",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
      <span style={{ opacity: 0.5 }} className="mx-tnum">
        {count}
      </span>
    </button>
  )
}

function CompetencyCard({
  competency,
  target,
  indicatorCount,
  levelLabel,
  animationDelayMs,
  onClick,
}: {
  competency: CompetencyOut
  target: number | null
  indicatorCount: number | null
  levelLabel: string
  animationDelayMs: number
  onClick: () => void
}) {
  const colour = colourForCluster(competency.cluster)
  const Icon = iconForCluster(competency.cluster)
  const clusterLabel = (competency.cluster ?? "uncategorised").toLowerCase()

  return (
    <button
      onClick={onClick}
      className="text-left transition-all"
      style={{
        background: "var(--mx-paper-2)",
        border: "1px solid var(--mx-line)",
        borderRadius: "var(--mx-r-md)",
        padding: 12,
        animation: `comp-fade-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${animationDelayMs}ms both`,
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--mx-surface)"
        e.currentTarget.style.borderColor = "var(--mx-line-2)"
        e.currentTarget.style.transform = "translateY(-1px)"
        e.currentTarget.style.boxShadow = "var(--mx-shadow-hover)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "var(--mx-paper-2)"
        e.currentTarget.style.borderColor = "var(--mx-line)"
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div
          className="flex h-7 w-7 items-center justify-center"
          style={{
            background: colour.bg,
            color: colour.main,
            borderRadius: "var(--mx-r-md)",
          }}
        >
          <Icon size={16} stroke={1.6} />
        </div>
        {target !== null && (
          <span
            className="mx-tnum"
            style={{
              background: colour.main,
              color: "var(--mx-paper)",
              fontSize: 10,
              fontWeight: 500,
              padding: "3px 7px",
              borderRadius: 4,
            }}
          >
            L{target}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--mx-ink)",
          lineHeight: 1.3,
          marginBottom: 3,
        }}
      >
        {competency.name}
      </div>
      <div
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 10,
          color: "var(--mx-ink-3)",
          marginBottom: 9,
        }}
      >
        {levelLabel ? `${levelLabel} · ${clusterLabel}` : clusterLabel}
      </div>

      {/* 5-dot progress */}
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <span
            key={n}
            style={{
              width: 12,
              height: 4,
              borderRadius: 1,
              background: target !== null && n <= target ? colour.main : "var(--mx-line)",
            }}
          />
        ))}
      </div>

      <div
        className="flex items-center gap-1.5"
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 10,
          color: "var(--mx-ink-3)",
        }}
      >
        <IconListCheck size={11} stroke={1.6} />
        <span>
          {indicatorCount === null
            ? "… behavioural indicators"
            : `${indicatorCount} behavioural indicator${indicatorCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <style>{`
        @keyframes comp-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-7 w-72 animate-pulse rounded" style={{ background: "var(--mx-paper-2)" }} />
      <div className="h-4 w-96 animate-pulse rounded" style={{ background: "var(--mx-paper-2)" }} />
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="h-16 animate-pulse"
            style={{ background: "var(--mx-paper-2)", borderRadius: "var(--mx-r-lg)" }}
          />
        ))}
      </div>
    </div>
  )
}
