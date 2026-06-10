"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { IconArrowLeft, IconPlus } from "@tabler/icons-react"
import Header from "@/components/Header"
import { useAuth } from "@/components/AuthProvider"
import {
  deleteCompetency,
  getCompetencies,
  getFramework,
  listBenchmarks,
} from "@/lib/api"
import type {
  BenchmarkOut,
  CompetencyListItem,
  CompetencyOut,
  CompetencyStatus,
  FrameworkOut,
} from "@/lib/types"
import CompetencyDetailDrawer from "../components/CompetencyDetailDrawer"
import LibraryPickerDrawer from "../components/LibraryPickerDrawer"
import { iconForCluster } from "../lib/cluster-icon-hash"
import { colourForCluster } from "../lib/cluster-palette"

/**
 * Framework editing surface — relocated from the previous dashboard.
 *
 * Hosts the existing drawer + picker + custom-competency form so editing
 * of a created framework remains possible. The /frameworks/[id] summary
 * view is read-only and intentionally has no editing affordances.
 *
 * Hooks + data sources unchanged:
 *   getFramework, listBenchmarks, getCompetencies, deleteCompetency
 *   + CompetencyDetailDrawer (full detail + custom-edit affordance)
 *   + LibraryPickerDrawer    (search/filter + import + create custom)
 */
export default function EditFrameworkPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const frameworkId = params.id
  const currentUserId = user?.id ?? null

  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkOut[]>([])
  const [libraryItems, setLibraryItems] = useState<CompetencyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [drawerCompetencyId, setDrawerCompetencyId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([
      getFramework(frameworkId),
      listBenchmarks(frameworkId),
      getCompetencies(),
    ])
      .then(([fw, bms, lib]) => {
        setFramework(fw)
        setBenchmarks(bms)
        setLibraryItems(lib)
        setError(null)
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [frameworkId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  async function handleRemove(c: CompetencyOut) {
    const ok = window.confirm(
      `Remove "${c.name}" from this framework? The library entry is unaffected.`,
    )
    if (!ok) return
    setRemovingId(c.id)
    try {
      await deleteCompetency(frameworkId, c.id)
      reload()
      if (drawerCompetencyId === c.id) setDrawerCompetencyId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    } finally {
      setRemovingId(null)
    }
  }

  const targetByCompetency = useMemo(() => {
    const m = new Map<string, number>()
    for (const bm of benchmarks) m.set(bm.competency_id, bm.required_level)
    return m
  }, [benchmarks])

  const statusByLibraryCompetency = useMemo(() => {
    const m = new Map<string, CompetencyStatus>()
    for (const c of libraryItems) m.set(c.id, c.status)
    return m
  }, [libraryItems])

  // Group competencies by cluster for the list (Uncategorised last)
  const grouped = useMemo(() => {
    if (!framework) return []
    const m = new Map<string, CompetencyOut[]>()
    for (const c of framework.competencies) {
      const key = c.cluster ?? "Uncategorised"
      const arr = m.get(key) ?? []
      arr.push(c)
      m.set(key, arr)
    }
    return Array.from(m.entries()).sort(([a], [b]) => {
      if (a === "Uncategorised") return 1
      if (b === "Uncategorised") return -1
      return a.localeCompare(b)
    })
  }, [framework])

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--mx-paper)" }}
    >
      <Header />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {loading && (
          <div className="space-y-3">
            <div className="h-7 w-72 animate-pulse rounded" style={{ background: "var(--mx-paper-2)" }} />
            <div className="h-4 w-96 animate-pulse rounded" style={{ background: "var(--mx-paper-2)" }} />
          </div>
        )}

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
            {/* Back link */}
            <button
              onClick={() => router.push(`/frameworks/${frameworkId}`)}
              className="mx-pill mb-5"
              style={{ fontFamily: "var(--mx-font-sans)" }}
            >
              <IconArrowLeft size={13} stroke={1.6} />
              Back to summary
            </button>

            {/* Header */}
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mx-eyebrow mb-2">Edit framework</div>
                <h1 className="mx-h2" style={{ fontSize: 36 }}>
                  {framework.role_title ?? framework.title}
                </h1>
                {framework.description && (
                  <p className="mx-caption mt-2 max-w-2xl" style={{ fontSize: 13 }}>
                    {framework.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-2 rounded-[999px] px-4 py-2 text-[13px] font-medium"
                style={{
                  background: "var(--mx-grad-cool)",
                  color: "var(--mx-paper)",
                  boxShadow: "var(--mx-shadow-hover)",
                }}
              >
                <IconPlus size={14} stroke={1.8} />
                Add from library
              </button>
            </div>

            {/* Competency list grouped by cluster */}
            {framework.competencies.length === 0 ? (
              <div className="mx-card p-8 text-center">
                <p className="mx-body" style={{ color: "var(--mx-ink-2)" }}>
                  No competencies yet. Add some from the library to get started.
                </p>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[999px] px-4 py-2 text-[13px] font-medium"
                  style={{
                    background: "var(--mx-grad-cool)",
                    color: "var(--mx-paper)",
                  }}
                >
                  <IconPlus size={14} stroke={1.8} />
                  Add from library
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(([cluster, items]) => {
                  const colour = colourForCluster(cluster === "Uncategorised" ? null : cluster)
                  return (
                    <section key={cluster} className="mx-card" style={{ padding: 18 }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: colour.main }}
                        />
                        <div className="mx-caps">{cluster}</div>
                        <span
                          className="mx-tnum"
                          style={{
                            fontSize: 11,
                            color: "var(--mx-ink-3)",
                            marginLeft: 2,
                          }}
                        >
                          {items.length}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {items
                          .sort((a, b) => a.order_index - b.order_index)
                          .map(c => {
                            const Icon = iconForCluster(c.cluster)
                            const target = targetByCompetency.get(c.id) ?? null
                            const isDraft =
                              c.library_competency_id &&
                              statusByLibraryCompetency.get(c.library_competency_id) === "draft"
                            return (
                              <li
                                key={c.id}
                                className="flex items-start justify-between gap-3 rounded-[10px] px-3 py-2.5"
                                style={{
                                  background: "var(--mx-paper-2)",
                                  border: "1px solid var(--mx-line)",
                                }}
                              >
                                <button
                                  onClick={() => setDrawerCompetencyId(c.id)}
                                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                >
                                  <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                                    style={{ background: colour.bg, color: colour.main }}
                                  >
                                    <Icon size={16} stroke={1.6} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="mx-body"
                                        style={{ fontWeight: 500, fontSize: 13 }}
                                      >
                                        {c.name}
                                      </span>
                                      {isDraft && (
                                        <span
                                          className="rounded-[999px] px-1.5 py-0.5"
                                          style={{
                                            background: "rgba(226,177,70,0.18)",
                                            border: "1px solid rgba(226,177,70,0.4)",
                                            color: "var(--mx-ink)",
                                            fontSize: 9,
                                            fontWeight: 500,
                                            letterSpacing: "0.16em",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Draft
                                        </span>
                                      )}
                                    </div>
                                    {c.description && (
                                      <p
                                        className="mx-caption mt-0.5 line-clamp-2"
                                        style={{ fontSize: 12 }}
                                      >
                                        {c.description}
                                      </p>
                                    )}
                                  </div>
                                </button>
                                <div className="flex shrink-0 items-center gap-2">
                                  {target !== null && (
                                    <span
                                      className="mx-tnum rounded-[6px] px-1.5 py-0.5"
                                      style={{
                                        background: colour.main,
                                        color: "var(--mx-paper)",
                                        fontSize: 10,
                                        fontWeight: 500,
                                      }}
                                    >
                                      L{target}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleRemove(c)}
                                    disabled={removingId === c.id}
                                    className="rounded-[999px] px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50"
                                    style={{
                                      border: "1px solid rgba(194,78,78,0.3)",
                                      color: "var(--mx-rose)",
                                      background: "transparent",
                                    }}
                                  >
                                    {removingId === c.id ? "…" : "Remove"}
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <CompetencyDetailDrawer
        frameworkId={frameworkId}
        competencyId={drawerCompetencyId}
        targetLevel={
          drawerCompetencyId ? targetByCompetency.get(drawerCompetencyId) ?? null : null
        }
        currentUserId={currentUserId}
        onClose={() => setDrawerCompetencyId(null)}
        onEdited={reload}
      />
      <LibraryPickerDrawer
        frameworkId={frameworkId}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdded={reload}
        onCustomAutoImported={() => {
          setToast("Added to framework · also saved to your library")
        }}
      />

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
          style={{ animation: "edit-toast-in 200ms cubic-bezier(.4,0,.2,1) forwards" }}
        >
          <div
            className="rounded-[999px] px-4 py-2 text-xs font-semibold"
            style={{
              background: "var(--mx-grad-cool)",
              color: "var(--mx-paper)",
              boxShadow: "var(--mx-shadow-pop)",
            }}
          >
            {toast}
          </div>
          <style>{`
            @keyframes edit-toast-in {
              from { opacity: 0; transform: translate(-50%, 8px); }
              to   { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
