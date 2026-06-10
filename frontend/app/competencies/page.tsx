"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  IconChartBar,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import Header from "@/components/Header"
import {
  getCompetencyFrameworks,
  getCompetencies,
  getCompetency,
} from "@/lib/api"
import type {
  CompetencyDetail,
  CompetencyFrameworkListItem,
  CompetencyListItem,
} from "@/lib/types"
import {
  colourForCluster,
  type ClusterColour,
} from "@/app/frameworks/[id]/lib/cluster-palette"

// ---------------------------------------------------------------------------
// Palette helpers — every taxonomy chip resolves to an mx pigment via the
// shared hash. Stable across renders, on-brand by construction.
// ---------------------------------------------------------------------------

function factorColor(key: string | null): ClusterColour {
  return colourForCluster(key)
}

// Proficiency 1→5 progresses through the mx pigments from neutral to warm —
// roughly "novice → expert" reads as quieter → louder.
const LEVEL_PIGMENT: Record<number, ClusterColour> = {
  1: { main: "rgba(10,30,51,0.5)", bg: "rgba(10,30,51,0.06)",   text: "rgba(10,30,51,0.75)" },
  2: { main: "#2A5BA8",            bg: "rgba(42,91,168,0.10)",  text: "#042C53" },
  3: { main: "#7E8A55",            bg: "rgba(126,138,85,0.14)", text: "#3F4A2A" },
  4: { main: "#E2B146",            bg: "rgba(226,177,70,0.18)", text: "#5A3A0C" },
  5: { main: "#DD6334",            bg: "rgba(221,99,52,0.12)",  text: "#4A1B0C" },
}

// ---------------------------------------------------------------------------
// Competency card
// ---------------------------------------------------------------------------

function CompetencyCard({
  comp,
  onClick,
  selected,
}: {
  comp: CompetencyListItem
  onClick: () => void
  selected: boolean
}) {
  const fc = factorColor(comp.factor ?? comp.category)
  return (
    <button
      onClick={onClick}
      className="mx-card mx-card-hover w-full text-left"
      style={{
        padding: 16,
        background: selected ? "var(--mx-paper)" : "var(--mx-paper-2)",
        borderColor: selected ? "var(--mx-forest)" : undefined,
        boxShadow: selected ? "var(--mx-shadow-hover)" : undefined,
      }}
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(comp.factor ?? comp.category) && (
          <span
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 999,
              background: fc.bg,
              color: fc.text,
            }}
          >
            {comp.factor ?? comp.category}
          </span>
        )}
        {comp.cluster && (
          <span
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--mx-paper)",
              border: "1px solid var(--mx-line)",
              color: "var(--mx-ink-2)",
            }}
          >
            {comp.cluster}
          </span>
        )}
        {comp.is_leadership && (
          <span
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(226,177,70,0.18)",
              color: "#5A3A0C",
            }}
          >
            Leadership
          </span>
        )}
      </div>

      <p
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "var(--mx-ink)",
        }}
      >
        {comp.name}
      </p>
      {comp.definition && (
        <p
          className="mt-1 line-clamp-2"
          style={{
            fontFamily: "var(--mx-font-sans)",
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--mx-ink-2)",
          }}
        >
          {comp.definition}
        </p>
      )}

      {comp.primary_instrument && (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className="mx-eyebrow"
            style={{ margin: 0, fontSize: 9, letterSpacing: "0.18em" }}
          >
            Measured by
          </span>
          <span
            className="mx-tnum"
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--mx-paper)",
              border: "1px solid var(--mx-line)",
              color: "var(--mx-forest)",
            }}
          >
            {comp.primary_instrument}
          </span>
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Proficiency rubric (inside detail panel)
// ---------------------------------------------------------------------------

function ProficiencyRubric({
  levels,
}: {
  levels: CompetencyDetail["proficiency_levels"]
}) {
  return (
    <div className="space-y-3">
      {levels.map((pl) => {
        const badge = LEVEL_PIGMENT[pl.level] ?? LEVEL_PIGMENT[3]
        return (
          <div
            key={pl.level}
            className="rounded-[12px] p-3"
            style={{
              background: "var(--mx-paper-2)",
              border: "1px solid var(--mx-line)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.text,
                }}
              >
                {pl.level} — {pl.label}
              </span>
            </div>
            <ul className="space-y-1">
              {pl.behavioral_indicators.slice(0, 2).map((ind, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full"
                    style={{ background: badge.main }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      color: "var(--mx-ink-2)",
                    }}
                  >
                    {ind}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Side detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  detail,
  onClose,
}: {
  detail: CompetencyDetail
  onClose: () => void
}) {
  const fc = factorColor(detail.factor ?? detail.category)
  const primary = detail.instrument_mappings.filter(
    (m) => m.mapping_strength === "primary"
  )
  const supporting = detail.instrument_mappings.filter(
    (m) => m.mapping_strength === "supporting"
  )

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto"
      style={{
        background: "var(--mx-paper)",
        borderLeft: "1px solid var(--mx-line)",
        boxShadow: "-24px 0 48px rgba(10,30,51,0.10)",
      }}
    >
      <div
        className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4"
        style={{
          background: "var(--mx-paper)",
          borderBottom: "1px solid var(--mx-line)",
        }}
      >
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {(detail.factor ?? detail.category) && (
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: fc.bg,
                  color: fc.text,
                }}
              >
                {detail.factor ?? detail.category}
              </span>
            )}
            {detail.cluster && (
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  color: "var(--mx-ink-2)",
                }}
              >
                {detail.cluster}
              </span>
            )}
          </div>
          <h2
            style={{
              fontFamily: "var(--mx-font-display)",
              fontSize: 22,
              lineHeight: 1.15,
              letterSpacing: "-0.018em",
              color: "var(--mx-ink)",
            }}
          >
            {detail.name}
          </h2>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--mx-ink-3)",
            }}
          >
            {detail.framework_name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-1 flex-shrink-0 rounded-full p-1.5 transition-colors hover:bg-[var(--mx-paper-2)]"
          style={{ color: "var(--mx-ink-3)" }}
          aria-label="Close"
        >
          <IconX size={18} stroke={1.8} />
        </button>
      </div>

      <div className="space-y-6 px-6 py-5">
        {detail.definition && (
          <div>
            <p className="mx-eyebrow mb-2">Definition</p>
            <p
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--mx-ink)",
              }}
            >
              {detail.definition}
            </p>
          </div>
        )}

        {detail.instrument_mappings.length > 0 && (
          <div>
            <p className="mx-eyebrow mb-3">Metricly instruments</p>
            <div className="space-y-2">
              {primary.map((m) => (
                <div
                  key={m.instrument_id}
                  className="rounded-[12px] p-3"
                  style={{
                    background: "var(--mx-paper-2)",
                    border: "1px solid var(--mx-line)",
                  }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--mx-forest)",
                      }}
                    >
                      {m.instrument_short_name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "var(--mx-forest)",
                        color: "var(--mx-paper)",
                      }}
                    >
                      Primary
                    </span>
                    {m.subscale_focus && (
                      <span
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontSize: 10,
                          color: "var(--mx-ink-3)",
                        }}
                      >
                        · {m.subscale_focus}
                      </span>
                    )}
                  </div>
                  {m.rationale && (
                    <p
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: "var(--mx-ink-2)",
                      }}
                    >
                      {m.rationale}
                    </p>
                  )}
                  <div className="mt-2 flex gap-3">
                    <span
                      className="mx-tnum"
                      style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                    >
                      {m.total_items} items
                    </span>
                    {m.reliability_alpha && (
                      <span
                        className="mx-tnum"
                        style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                      >
                        α = {m.reliability_alpha.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {supporting.map((m) => (
                <div
                  key={m.instrument_id}
                  className="rounded-[12px] p-3"
                  style={{
                    background: "var(--mx-paper)",
                    border: "1px solid var(--mx-line)",
                  }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--mx-ink)",
                      }}
                    >
                      {m.instrument_short_name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "var(--mx-paper-2)",
                        border: "1px solid var(--mx-line)",
                        color: "var(--mx-ink-2)",
                      }}
                    >
                      Supporting
                    </span>
                    {m.subscale_focus && (
                      <span
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontSize: 10,
                          color: "var(--mx-ink-3)",
                        }}
                      >
                        · {m.subscale_focus}
                      </span>
                    )}
                  </div>
                  {m.rationale && (
                    <p
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: "var(--mx-ink-2)",
                      }}
                    >
                      {m.rationale}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mx-eyebrow mb-3">Proficiency rubric</p>
          <ProficiencyRubric levels={detail.proficiency_levels} />
        </div>

        <div className="pt-2">
          <Link
            href={`/straw-man?competency=${detail.id}`}
            className="block w-full rounded-[999px] py-2.5 text-center transition-all"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 13,
              fontWeight: 500,
              background: "var(--mx-forest)",
              color: "var(--mx-paper)",
              boxShadow: "var(--mx-shadow-card)",
            }}
          >
            Build blueprint with this competency
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CompetenciesPage() {
  const [frameworks, setFrameworks] = useState<CompetencyFrameworkListItem[]>([])
  const [selectedFramework, setSelectedFramework] = useState<string>("")
  const [competencies, setCompetencies] = useState<CompetencyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedFactor, setSelectedFactor] = useState<string>("")
  const [selectedCluster, setSelectedCluster] = useState<string>("")
  const [search, setSearch] = useState("")

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CompetencyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    getCompetencyFrameworks()
      .then((fws) => {
        setFrameworks(fws)
        if (fws.length > 0) setSelectedFramework(fws[0].id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFramework) return
    setLoading(true)
    setSelectedFactor("")
    setSelectedCluster("")
    getCompetencies({ framework_id: selectedFramework })
      .then(setCompetencies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedFramework])

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    getCompetency(detailId)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [detailId])

  const factors = Array.from(
    new Set(competencies.map((c) => c.factor ?? c.category).filter(Boolean))
  ) as string[]
  const clusters = Array.from(
    new Set(
      competencies
        .filter(
          (c) => !selectedFactor || (c.factor ?? c.category) === selectedFactor
        )
        .map((c) => c.cluster)
        .filter(Boolean)
    )
  ) as string[]

  const filtered = competencies.filter((c) => {
    if (selectedFactor && (c.factor ?? c.category) !== selectedFactor)
      return false
    if (selectedCluster && c.cluster !== selectedCluster) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()))
      return false
    return true
  })

  const currentFramework = frameworks.find((f) => f.id === selectedFramework)
  const factorLabel = currentFramework?.name.includes("O*NET")
    ? "Category"
    : "Factor"

  return (
    <div className="min-h-screen">
      {/* No page-bg override — atelier washes from <html> bleed through. */}
      <Header pageTitle="Competency Builder" />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Subpage hero — light cream card */}
        <section className="mx-hero mb-6" style={{ padding: "28px 32px" }}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mx-eyebrow mb-2">Workforce development</p>
              <h1 className="mx-h2" style={{ fontSize: 32, lineHeight: 1.1 }}>
                Competency <em className="mx-text-grad-warm">database.</em>
              </h1>
              <p className="mx-caption mt-2 max-w-xl" style={{ fontSize: 13 }}>
                Browse validated frameworks with five-level behavioural rubrics
                and instrument mappings.
              </p>
            </div>
            <Link
              href="/straw-man"
              className="inline-flex items-center gap-1.5 rounded-[999px] px-4 py-2 transition-all"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 13,
                fontWeight: 500,
                background: "var(--mx-forest)",
                color: "var(--mx-paper)",
                boxShadow: "var(--mx-shadow-card)",
              }}
            >
              <IconSparkles size={14} stroke={1.8} />
              Generate blueprint
            </Link>
          </div>
        </section>

        {/* Framework tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {frameworks.map((fw) => {
            const active = selectedFramework === fw.id
            return (
              <button
                key={fw.id}
                onClick={() => setSelectedFramework(fw.id)}
                className="rounded-[999px] px-4 py-1.5 transition-all"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  fontWeight: 500,
                  background: active ? "var(--mx-forest)" : "var(--mx-paper)",
                  color: active ? "var(--mx-paper)" : "var(--mx-ink-2)",
                  border: active
                    ? "1px solid var(--mx-forest)"
                    : "1px solid var(--mx-line)",
                  boxShadow: active ? "var(--mx-shadow-card)" : "none",
                }}
              >
                {fw.name}
                <span
                  className="ml-1.5"
                  style={{ opacity: active ? 0.75 : 0.55 }}
                >
                  ({fw.competency_count})
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-56 flex-shrink-0 space-y-4">
            <div className="mx-card" style={{ padding: 12 }}>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  color: "var(--mx-ink)",
                }}
              />
            </div>

            {currentFramework?.description && (
              <div className="mx-card" style={{ padding: 12 }}>
                <p
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "var(--mx-ink-2)",
                  }}
                >
                  {currentFramework.description.slice(0, 180)}
                  {currentFramework.description.length > 180 ? "…" : ""}
                </p>
                {currentFramework.source && (
                  <p
                    className="mt-1.5"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--mx-ink-3)",
                    }}
                  >
                    Source: {currentFramework.source}
                  </p>
                )}
              </div>
            )}

            {factors.length > 0 && (
              <div className="mx-card space-y-0.5" style={{ padding: 12 }}>
                <p
                  className="mx-eyebrow mb-2"
                  style={{ fontSize: 9, letterSpacing: "0.22em" }}
                >
                  {factorLabel}
                </p>
                <button
                  onClick={() => {
                    setSelectedFactor("")
                    setSelectedCluster("")
                  }}
                  className="w-full rounded-md px-2 py-1 text-left transition-colors"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 12,
                    background: !selectedFactor ? "var(--mx-paper-2)" : "transparent",
                    color: !selectedFactor ? "var(--mx-forest)" : "var(--mx-ink-2)",
                    fontWeight: !selectedFactor ? 600 : 400,
                  }}
                >
                  All
                </button>
                {factors.map((f) => {
                  const fc = factorColor(f)
                  const isActive = selectedFactor === f
                  return (
                    <button
                      key={f}
                      onClick={() => {
                        setSelectedFactor(f)
                        setSelectedCluster("")
                      }}
                      className="w-full rounded-md px-2 py-1 text-left transition-colors"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        background: isActive ? fc.bg : "transparent",
                        color: isActive ? fc.text : "var(--mx-ink-2)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {f}
                    </button>
                  )
                })}
              </div>
            )}

            {selectedFactor && clusters.length > 0 && (
              <div className="mx-card space-y-0.5" style={{ padding: 12 }}>
                <p
                  className="mx-eyebrow mb-2"
                  style={{ fontSize: 9, letterSpacing: "0.22em" }}
                >
                  Cluster
                </p>
                <button
                  onClick={() => setSelectedCluster("")}
                  className="w-full rounded-md px-2 py-1 text-left"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 12,
                    background: !selectedCluster ? "var(--mx-paper-2)" : "transparent",
                    color: !selectedCluster ? "var(--mx-forest)" : "var(--mx-ink-2)",
                    fontWeight: !selectedCluster ? 600 : 400,
                  }}
                >
                  All clusters
                </button>
                {clusters.map((cl) => {
                  const isActive = selectedCluster === cl
                  return (
                    <button
                      key={cl}
                      onClick={() => setSelectedCluster(cl)}
                      className="w-full rounded-md px-2 py-1 text-left"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        background: isActive ? "var(--mx-paper-2)" : "transparent",
                        color: isActive ? "var(--mx-forest)" : "var(--mx-ink-2)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {cl}
                    </button>
                  )
                })}
              </div>
            )}
          </aside>

          {/* Grid */}
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className="mx-card h-28 animate-pulse"
                    style={{ background: "var(--mx-paper-2)" }}
                  />
                ))}
              </div>
            ) : error ? (
              <div
                className="rounded-[14px] px-4 py-3"
                style={{
                  background: "rgba(194,78,78,0.06)",
                  border: "1px solid rgba(194,78,78,0.25)",
                  color: "var(--mx-rose)",
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : (
              <>
                <p
                  className="mb-3 flex items-center gap-1.5"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 11,
                    color: "var(--mx-ink-3)",
                  }}
                >
                  <IconChartBar size={12} stroke={1.6} />
                  <span className="mx-tnum">{filtered.length}</span>{" "}
                  competenc{filtered.length === 1 ? "y" : "ies"}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((c) => (
                    <CompetencyCard
                      key={c.id}
                      comp={c}
                      selected={detailId === c.id}
                      onClick={() =>
                        setDetailId(detailId === c.id ? null : c.id)
                      }
                    />
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div
                    className="mx-card p-10 text-center"
                    style={{
                      color: "var(--mx-ink-3)",
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 13,
                    }}
                  >
                    No competencies match your filters.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Side panel + scrim */}
      {detailId && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{
              background: "rgba(10,30,51,0.25)",
              backdropFilter: "blur(2px)",
            }}
            onClick={() => setDetailId(null)}
          />
          {detailLoading ? (
            <div
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg items-center justify-center"
              style={{
                background: "var(--mx-paper)",
                borderLeft: "1px solid var(--mx-line)",
              }}
            >
              <div
                className="h-8 w-8 animate-spin rounded-full"
                style={{
                  border: "2px solid var(--mx-line)",
                  borderTopColor: "var(--mx-forest)",
                }}
              />
            </div>
          ) : detail ? (
            <DetailPanel detail={detail} onClose={() => setDetailId(null)} />
          ) : null}
        </>
      )}
    </div>
  )
}
