"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getFramework,
  getFrameworkCompetencyDetail,
  listBenchmarks,
  type CompetencyDetailView,
} from "@/lib/api"
import type { BenchmarkOut, FrameworkOut } from "@/lib/types"
import CompetencyPills from "../components/proficiency/CompetencyPills"
import CompetencyHeaderCard from "../components/proficiency/CompetencyHeaderCard"
import LevelTabs from "../components/proficiency/LevelTabs"
import DotLadder from "../components/proficiency/DotLadder"
import LevelDetailCard from "../components/proficiency/LevelDetailCard"
import TargetGapFooter from "../components/proficiency/TargetGapFooter"
import CompareGrid from "../components/proficiency/CompareGrid"
import ViewToggle, { type ProficiencyView } from "../components/proficiency/ViewToggle"

/**
 * Proficiency-levels page — re-skinned to the Metricly Design System
 * (editorial-modern; cream paper + navy ink + Instrument Serif headings).
 * See design/mockups/data-mapping.md § 1 for data-source decisions.
 */
export default function ProficiencyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const frameworkId = params.id
  const urlCompId = searchParams.get("competencyId")

  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentCompId, setCurrentCompId] = useState<string | null>(urlCompId)
  const [currentLevel, setCurrentLevel] = useState<number>(3)
  const [view, setView] = useState<ProficiencyView>("ladder")

  const [detailCache, setDetailCache] = useState<Map<string, CompetencyDetailView>>(() => new Map())
  const [detailLoading, setDetailLoading] = useState(false)

  // Load framework + benchmarks in parallel
  useEffect(() => {
    setLoading(true)
    Promise.all([getFramework(frameworkId), listBenchmarks(frameworkId)])
      .then(([fw, bms]) => {
        setFramework(fw)
        setBenchmarks(bms)
        setError(null)
        if (fw.competencies.length > 0) {
          const wanted = urlCompId && fw.competencies.find(c => c.id === urlCompId)
          setCurrentCompId(wanted ? wanted.id : fw.competencies[0].id)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkId])

  // Lazy-load detail for the current competency
  useEffect(() => {
    if (!currentCompId) return
    if (detailCache.has(currentCompId)) return
    setDetailLoading(true)
    getFrameworkCompetencyDetail(frameworkId, currentCompId)
      .then(d => {
        setDetailCache(prev => {
          const next = new Map(prev)
          next.set(currentCompId, d)
          return next
        })
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load competency detail"))
      .finally(() => setDetailLoading(false))
  }, [currentCompId, frameworkId, detailCache])

  const targetByCompetency = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of benchmarks) m.set(b.competency_id, b.required_level)
    return m
  }, [benchmarks])

  const currentTarget = currentCompId ? targetByCompetency.get(currentCompId) ?? null : null

  useEffect(() => {
    if (currentTarget !== null) setCurrentLevel(currentTarget)
    else setCurrentLevel(3)
  }, [currentCompId, currentTarget])

  const selectCompetency = useCallback(
    (id: string) => {
      setCurrentCompId(id)
      const url = new URL(window.location.href)
      url.searchParams.set("competencyId", id)
      router.replace(url.pathname + url.search, { scroll: false })
    },
    [router],
  )

  const currentComp = framework?.competencies.find(c => c.id === currentCompId) ?? null
  const currentDetail = currentCompId ? detailCache.get(currentCompId) : undefined
  const currentLevelView = currentDetail?.levels.find(lv => lv.level === currentLevel)

  // ────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--mx-paper)" }}
    >
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
            {/* Page header */}
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mx-eyebrow mb-2">Metricly · Behavioural anchors</div>
                <h1
                  className="mx-h2"
                  style={{ fontSize: 44, lineHeight: 1.05 }}
                >
                  Proficiency levels per{" "}
                  <em className="mx-text-grad-warm">competency.</em>
                </h1>
                <p
                  className="mx-caption mt-2 max-w-xl"
                  style={{ fontSize: 13 }}
                >
                  Pick a competency, then walk the ladder from foundational to expert.
                </p>
              </div>
              <ViewToggle view={view} onChange={setView} />
            </div>

            {/* Tab bar — re-skinned: navy active state on cream tab-bar */}
            <div className="mx-tab-bar mb-7">
              <button
                className="mx-tab"
                onClick={() => router.push(`/frameworks/${frameworkId}`)}
              >
                Competencies
              </button>
              <button className="mx-tab" data-active="true">
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

            {/* Empty state */}
            {framework.competencies.length === 0 && (
              <div
                className="mx-card p-8 text-center"
                style={{ borderRadius: "var(--mx-r-lg)" }}
              >
                <p className="mx-body" style={{ color: "var(--mx-ink-2)" }}>
                  No competencies in this framework yet. Add some from the library on the Competencies tab.
                </p>
                <button
                  onClick={() => router.push(`/frameworks/${frameworkId}`)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[999px] px-4 py-2 text-[13px] font-medium"
                  style={{
                    background: "var(--mx-grad-cool)",
                    color: "var(--mx-paper)",
                    boxShadow: "var(--mx-shadow-hover)",
                  }}
                >
                  Go to Competencies
                </button>
              </div>
            )}

            {/* Main */}
            {currentComp && currentDetail && (
              <>
                <div className="mb-5">
                  <CompetencyPills
                    competencies={framework.competencies}
                    currentId={currentComp.id}
                    onSelect={selectCompetency}
                  />
                </div>

                {view === "ladder" && (
                  <>
                    <div className="mb-4">
                      <CompetencyHeaderCard
                        competency={currentComp}
                        framework={framework}
                        targetLevel={currentTarget}
                      />
                    </div>

                    <div className="mb-4">
                      <LevelTabs
                        levels={currentDetail.levels}
                        currentLevel={currentLevel}
                        onSelect={setCurrentLevel}
                      />
                    </div>

                    <div className="mb-4">
                      <DotLadder
                        levels={currentDetail.levels}
                        currentLevel={currentLevel}
                        targetLevel={currentTarget}
                        onSelect={setCurrentLevel}
                      />
                    </div>

                    <div className="mb-4">
                      <LevelDetailCard
                        level={currentLevelView}
                        currentLevel={currentLevel}
                        isTarget={currentTarget === currentLevel}
                      />
                    </div>

                    <TargetGapFooter targetLevel={currentTarget} currentLevel={currentLevel} />
                  </>
                )}

                {view === "compare" && (
                  <CompareGrid levels={currentDetail.levels} targetLevel={currentTarget} />
                )}
              </>
            )}

            {currentComp && !currentDetail && detailLoading && (
              <div
                className="mx-card p-8 text-center"
                style={{
                  fontFamily: "var(--mx-font-display)",
                  fontSize: 16,
                  fontStyle: "italic",
                  color: "var(--mx-ink-3)",
                }}
              >
                Loading proficiency rubric…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div
        className="h-7 w-72 animate-pulse rounded"
        style={{ background: "var(--mx-paper-2)" }}
      />
      <div
        className="h-4 w-96 animate-pulse rounded"
        style={{ background: "var(--mx-paper-2)" }}
      />
      <div
        className="mt-4 h-16 animate-pulse"
        style={{ background: "var(--mx-paper-2)", borderRadius: "var(--mx-r-lg)" }}
      />
    </div>
  )
}
