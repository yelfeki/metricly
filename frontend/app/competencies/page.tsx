"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
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

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const FACTOR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Thought:   { bg: "rgba(219,234,254,0.6)", text: "#1e40af", border: "rgba(147,197,253,0.5)" },
  Results:   { bg: "rgba(209,250,229,0.6)", text: "#065f46", border: "rgba(110,231,183,0.5)" },
  People:    { bg: "rgba(237,233,254,0.6)", text: "#4c1d95", border: "rgba(167,139,250,0.5)" },
  Self:      { bg: "rgba(254,243,199,0.6)", text: "#78350f", border: "rgba(252,211,77,0.5)" },
  "Content Skills":          { bg: "rgba(254,226,226,0.6)", text: "#991b1b", border: "rgba(252,165,165,0.5)" },
  "Process Skills":          { bg: "rgba(254,249,195,0.6)", text: "#713f12", border: "rgba(253,224,71,0.5)" },
  "Social Skills":           { bg: "rgba(220,252,231,0.6)", text: "#14532d", border: "rgba(134,239,172,0.5)" },
  "Complex Problem Solving": { bg: "rgba(224,242,254,0.6)", text: "#0c4a6e", border: "rgba(125,211,252,0.5)" },
  "Technical Skills":        { bg: "rgba(243,232,255,0.6)", text: "#3b0764", border: "rgba(196,181,253,0.5)" },
  "Systems Skills":          { bg: "rgba(255,228,230,0.6)", text: "#881337", border: "rgba(251,113,133,0.5)" },
  "Resource Management":     { bg: "rgba(240,253,244,0.6)", text: "#14532d", border: "rgba(134,239,172,0.5)" },
}

function factorColor(key: string | null) {
  return FACTOR_COLORS[key ?? ""] ?? { bg: "rgba(249,250,251,0.6)", text: "#374151", border: "rgba(209,213,219,0.5)" }
}

// ---------------------------------------------------------------------------
// Proficiency level pill
// ---------------------------------------------------------------------------

const LEVEL_BADGE: Record<number, { bg: string; text: string }> = {
  1: { bg: "rgba(243,244,246,0.8)", text: "#6b7280" },
  2: { bg: "rgba(219,234,254,0.8)", text: "#1d4ed8" },
  3: { bg: "rgba(209,250,229,0.8)", text: "#047857" },
  4: { bg: "rgba(237,233,254,0.8)", text: "#6d28d9" },
  5: { bg: "rgba(254,243,199,0.8)", text: "#b45309" },
}

// ---------------------------------------------------------------------------
// Components
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
      className="w-full text-left rounded-2xl p-4 transition-all"
      style={{
        background: selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
        border: selected ? "1.5px solid rgba(91,33,182,0.4)" : "1px solid rgba(255,255,255,0.7)",
        boxShadow: selected
          ? "0 4px 24px rgba(91,33,182,0.15)"
          : "0 1px 4px rgba(30,27,75,0.06)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Factor / cluster badges */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(comp.factor ?? comp.category) && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: fc.bg, color: fc.text, border: `0.5px solid ${fc.border}` }}
          >
            {comp.factor ?? comp.category}
          </span>
        )}
        {comp.cluster && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
            {comp.cluster}
          </span>
        )}
        {comp.is_leadership && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(254,243,199,0.8)", color: "#92400e" }}>
            Leadership
          </span>
        )}
      </div>

      <p className="text-sm font-semibold mb-1" style={{ color: "#1e1b4b" }}>{comp.name}</p>
      {comp.definition && (
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "rgba(30,27,75,0.55)" }}>
          {comp.definition}
        </p>
      )}

      {comp.primary_instrument && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>Measured by</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
          >
            {comp.primary_instrument}
          </span>
        </div>
      )}
    </button>
  )
}

function ProficiencyRubric({ levels }: { detail: CompetencyDetail; levels: CompetencyDetail["proficiency_levels"] }) {
  return (
    <div className="space-y-3">
      {levels.map((pl) => {
        const badge = LEVEL_BADGE[pl.level] ?? LEVEL_BADGE[3]
        return (
          <div key={pl.level} className="rounded-xl p-3" style={{ background: "rgba(249,250,251,0.7)", border: "0.5px solid rgba(209,213,219,0.4)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: badge.bg, color: badge.text }}
              >
                {pl.level} — {pl.label}
              </span>
            </div>
            <ul className="space-y-1">
              {pl.behavioral_indicators.slice(0, 2).map((ind, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 rounded-full flex-shrink-0" style={{ background: badge.text }} />
                  <span className="text-xs" style={{ color: "rgba(30,27,75,0.65)" }}>{ind}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function DetailPanel({
  detail,
  onClose,
}: {
  detail: CompetencyDetail
  onClose: () => void
}) {
  const fc = factorColor(detail.factor ?? detail.category)
  const primary = detail.instrument_mappings.filter(m => m.mapping_strength === "primary")
  const supporting = detail.instrument_mappings.filter(m => m.mapping_strength === "supporting")

  return (
    <div
      className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto z-50"
      style={{ background: "rgba(240,238,255,0.97)", borderLeft: "1px solid rgba(91,33,182,0.12)", backdropFilter: "blur(24px)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between gap-4"
        style={{ background: "rgba(240,238,255,0.95)", borderBottom: "0.5px solid rgba(91,33,182,0.1)", backdropFilter: "blur(16px)" }}>
        <div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {(detail.factor ?? detail.category) && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: fc.bg, color: fc.text, border: `0.5px solid ${fc.border}` }}>
                {detail.factor ?? detail.category}
              </span>
            )}
            {detail.cluster && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "rgba(243,244,246,0.8)", color: "#6b7280" }}>
                {detail.cluster}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold font-playfair" style={{ color: "#1e1b4b" }}>{detail.name}</h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(30,27,75,0.55)" }}>{detail.framework_name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full transition-all mt-1 flex-shrink-0"
          style={{ color: "rgba(30,27,75,0.5)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,33,182,0.08)")}
          onMouseLeave={e => (e.currentTarget.style.background = "")}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Definition */}
        {detail.definition && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(30,27,75,0.4)" }}>Definition</p>
            <p className="text-sm leading-relaxed" style={{ color: "#1e1b4b" }}>{detail.definition}</p>
          </div>
        )}

        {/* Instruments */}
        {detail.instrument_mappings.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(30,27,75,0.4)" }}>Metricly Instruments</p>
            <div className="space-y-2">
              {primary.map(m => (
                <div key={m.instrument_id} className="rounded-xl p-3"
                  style={{ background: "rgba(91,33,182,0.06)", border: "0.5px solid rgba(91,33,182,0.15)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: "#5b21b6" }}>{m.instrument_short_name}</span>
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background: "rgba(91,33,182,0.15)", color: "#5b21b6" }}>Primary</span>
                    {m.subscale_focus && (
                      <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>· {m.subscale_focus}</span>
                    )}
                  </div>
                  {m.rationale && <p className="text-xs leading-relaxed" style={{ color: "rgba(30,27,75,0.6)" }}>{m.rationale}</p>}
                  <div className="flex gap-3 mt-2">
                    <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>{m.total_items} items</span>
                    {m.reliability_alpha && <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>α = {m.reliability_alpha.toFixed(2)}</span>}
                  </div>
                </div>
              ))}
              {supporting.map(m => (
                <div key={m.instrument_id} className="rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.5)", border: "0.5px solid rgba(209,213,219,0.4)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: "#374151" }}>{m.instrument_short_name}</span>
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ background: "rgba(243,244,246,0.9)", color: "#6b7280" }}>Supporting</span>
                    {m.subscale_focus && (
                      <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>· {m.subscale_focus}</span>
                    )}
                  </div>
                  {m.rationale && <p className="text-xs leading-relaxed" style={{ color: "rgba(30,27,75,0.6)" }}>{m.rationale}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proficiency rubric */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(30,27,75,0.4)" }}>Proficiency Rubric</p>
          <ProficiencyRubric detail={detail} levels={detail.proficiency_levels} />
        </div>

        {/* Action */}
        <div className="pt-2">
          <Link
            href={`/straw-man?competency=${detail.id}`}
            className="block w-full rounded-full py-2.5 text-center text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
              color: "white",
              boxShadow: "0 2px 12px rgba(91,33,182,0.3)",
            }}
          >
            Build Blueprint with this Competency
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

  // Load frameworks on mount
  useEffect(() => {
    getCompetencyFrameworks()
      .then(fws => {
        setFrameworks(fws)
        if (fws.length > 0) setSelectedFramework(fws[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Load competencies when framework changes
  useEffect(() => {
    if (!selectedFramework) return
    setLoading(true)
    setSelectedFactor("")
    setSelectedCluster("")
    getCompetencies({ framework_id: selectedFramework })
      .then(setCompetencies)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedFramework])

  // Load detail when selected
  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    setDetailLoading(true)
    getCompetency(detailId)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setDetailLoading(false))
  }, [detailId])

  // Derived data
  const factors = Array.from(new Set(competencies.map(c => c.factor ?? c.category).filter(Boolean))) as string[]
  const clusters = Array.from(new Set(
    competencies
      .filter(c => !selectedFactor || (c.factor ?? c.category) === selectedFactor)
      .map(c => c.cluster)
      .filter(Boolean)
  )) as string[]

  const filtered = competencies.filter(c => {
    if (selectedFactor && (c.factor ?? c.category) !== selectedFactor) return false
    if (selectedCluster && c.cluster !== selectedCluster) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const currentFramework = frameworks.find(f => f.id === selectedFramework)

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0eeff 0%, #e8e4ff 50%, #ede9ff 100%)" }}>
      <Header pageTitle="Competency Builder" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)" }}>
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold font-playfair" style={{ color: "#1e1b4b" }}>Competency Framework Database</h1>
          </div>
          <p className="text-sm ml-11" style={{ color: "rgba(30,27,75,0.55)" }}>
            Browse validated competency frameworks with 5-level behavioural rubrics and instrument mappings.
          </p>
          <div className="ml-11 mt-3">
            <Link
              href="/straw-man"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all"
              style={{
                background: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
                color: "white",
                boxShadow: "0 2px 12px rgba(91,33,182,0.3)",
              }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Generate Assessment Blueprint
            </Link>
          </div>
        </div>

        {/* Framework tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {frameworks.map(fw => (
            <button
              key={fw.id}
              onClick={() => setSelectedFramework(fw.id)}
              className="rounded-full px-4 py-2 text-xs font-semibold transition-all"
              style={{
                background: selectedFramework === fw.id
                  ? "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)"
                  : "rgba(255,255,255,0.55)",
                color: selectedFramework === fw.id ? "white" : "rgba(30,27,75,0.65)",
                border: selectedFramework === fw.id ? "none" : "1px solid rgba(255,255,255,0.7)",
                boxShadow: selectedFramework === fw.id ? "0 2px 12px rgba(91,33,182,0.3)" : "0 1px 3px rgba(30,27,75,0.06)",
              }}
            >
              {fw.name}
              <span className="ml-1.5 opacity-70">({fw.competency_count})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Sidebar filters */}
          <div className="w-52 flex-shrink-0 space-y-4">
            {/* Search */}
            <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs bg-transparent outline-none placeholder-gray-400"
                style={{ color: "#1e1b4b" }}
              />
            </div>

            {/* Framework description */}
            {currentFramework?.description && (
              <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.6)" }}>
                <p className="text-[10px] leading-relaxed" style={{ color: "rgba(30,27,75,0.55)" }}>
                  {currentFramework.description.slice(0, 180)}{currentFramework.description.length > 180 ? "…" : ""}
                </p>
                {currentFramework.source && (
                  <p className="text-[10px] mt-1.5 font-medium" style={{ color: "rgba(30,27,75,0.4)" }}>
                    Source: {currentFramework.source}
                  </p>
                )}
              </div>
            )}

            {/* Factor / category filter */}
            {factors.length > 0 && (
              <div className="rounded-2xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(30,27,75,0.4)" }}>
                  {selectedFramework && frameworks.find(f => f.id === selectedFramework)?.name.includes("O*NET") ? "Category" : "Factor"}
                </p>
                <button
                  onClick={() => { setSelectedFactor(""); setSelectedCluster("") }}
                  className="w-full text-left text-xs py-1 px-2 rounded-lg transition-all"
                  style={{ background: !selectedFactor ? "rgba(91,33,182,0.1)" : "transparent", color: !selectedFactor ? "#5b21b6" : "rgba(30,27,75,0.6)", fontWeight: !selectedFactor ? 600 : 400 }}
                >
                  All
                </button>
                {factors.map(f => {
                  const fc = factorColor(f)
                  return (
                    <button
                      key={f}
                      onClick={() => { setSelectedFactor(f); setSelectedCluster("") }}
                      className="w-full text-left text-xs py-1 px-2 rounded-lg transition-all"
                      style={{
                        background: selectedFactor === f ? fc.bg : "transparent",
                        color: selectedFactor === f ? fc.text : "rgba(30,27,75,0.6)",
                        fontWeight: selectedFactor === f ? 600 : 400,
                      }}
                    >
                      {f}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Cluster filter */}
            {selectedFactor && clusters.length > 0 && (
              <div className="rounded-2xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(12px)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(30,27,75,0.4)" }}>Cluster</p>
                <button
                  onClick={() => setSelectedCluster("")}
                  className="w-full text-left text-xs py-1 px-2 rounded-lg"
                  style={{ background: !selectedCluster ? "rgba(91,33,182,0.1)" : "transparent", color: !selectedCluster ? "#5b21b6" : "rgba(30,27,75,0.6)", fontWeight: !selectedCluster ? 600 : 400 }}
                >
                  All clusters
                </button>
                {clusters.map(cl => (
                  <button
                    key={cl}
                    onClick={() => setSelectedCluster(cl)}
                    className="w-full text-left text-xs py-1 px-2 rounded-lg"
                    style={{ background: selectedCluster === cl ? "rgba(91,33,182,0.1)" : "transparent", color: selectedCluster === cl ? "#5b21b6" : "rgba(30,27,75,0.6)", fontWeight: selectedCluster === cl ? 600 : 400 }}
                  >
                    {cl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Competency grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="rounded-2xl h-28 animate-pulse" style={{ background: "rgba(255,255,255,0.4)" }} />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.5)" }}>
                <p className="text-sm" style={{ color: "#991b1b" }}>{error}</p>
              </div>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: "rgba(30,27,75,0.4)" }}>
                  {filtered.length} competenc{filtered.length === 1 ? "y" : "ies"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map(c => (
                    <CompetencyCard
                      key={c.id}
                      comp={c}
                      selected={detailId === c.id}
                      onClick={() => setDetailId(detailId === c.id ? null : c.id)}
                    />
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="rounded-2xl p-10 text-center" style={{ background: "rgba(255,255,255,0.45)" }}>
                    <p className="text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>No competencies match your filters.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Side panel */}
      {detailId && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(30,27,75,0.2)", backdropFilter: "blur(2px)" }}
            onClick={() => setDetailId(null)}
          />
          {detailLoading ? (
            <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 flex items-center justify-center"
              style={{ background: "rgba(240,238,255,0.97)" }}>
              <div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            </div>
          ) : detail ? (
            <DetailPanel detail={detail} onClose={() => setDetailId(null)} />
          ) : null}
        </>
      )}
    </div>
  )
}
