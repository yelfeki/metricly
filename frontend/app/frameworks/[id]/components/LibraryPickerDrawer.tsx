"use client"

import { useEffect, useMemo, useState } from "react"
import {
  getPickerCandidates,
  importCompetencyFromLibrary,
  type PickerCandidate,
} from "@/lib/api"
import type { CompetencyDetail } from "@/lib/types"
import CustomCompetencyForm from "./CustomCompetencyForm"

interface Props {
  frameworkId: string
  open: boolean
  onClose: () => void
  /** Called after a successful import so the parent can refetch the framework. */
  onAdded: () => void
  /** Toast hook — called when an org-created competency is auto-imported. */
  onCustomAutoImported?: (saved: CompetencyDetail) => void
}

const ROLE_FAMILY_FILTER_OPTIONS = [
  "Sales",
  "Technical/Engineering",
  "People Management",
  "Customer Service and Success",
  "Operations and Project Management",
  "Human Resources and People Operations",
  "Finance and Accounting",
  "Marketing and Communications",
]

/**
 * Right-side drawer for adding library competencies to a framework.
 *
 *   - Excludes competencies already in this framework (server-side via picker-candidates).
 *   - Filterable by role_family + cluster (server-side filters).
 *   - Substring search on name + definition (server-side q= param).
 *   - One-click Add per result; in-flight state shown per row.
 *
 * Remove is NOT in this drawer — remove is a first-class action on each
 * competency row in the dashboard page itself.
 */
export default function LibraryPickerDrawer({
  frameworkId,
  open,
  onClose,
  onAdded,
  onCustomAutoImported,
}: Props) {
  const [candidates, setCandidates] = useState<PickerCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [roleFamilyFilter, setRoleFamilyFilter] = useState<string>("")
  const [clusterFilter, setClusterFilter] = useState<string>("")

  // Track which candidate IDs are currently being added
  const [adding, setAdding] = useState<Set<string>>(new Set())

  // Custom-competency form state
  const [formOpen, setFormOpen] = useState(false)

  async function handleCustomSaved(saved: CompetencyDetail) {
    // Auto-import the newly created competency into this framework, then close form
    try {
      await importCompetencyFromLibrary(frameworkId, {
        library_competency_id: saved.id,
      })
      onAdded()
      onCustomAutoImported?.(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Created — but failed to add to framework")
    } finally {
      setFormOpen(false)
    }
  }

  // Refetch when filters change (debounced for search)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const id = setTimeout(() => {
      setLoading(true)
      setError(null)
      getPickerCandidates(frameworkId, {
        role_family: roleFamilyFilter || undefined,
        cluster: clusterFilter || undefined,
        q: search || undefined,
      })
        .then(rows => {
          if (!cancelled) setCandidates(rows)
        })
        .catch(e => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load")
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, search ? 220 : 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [open, frameworkId, search, roleFamilyFilter, clusterFilter])

  // Cluster options derived from current candidates (so the filter narrows naturally)
  const availableClusters = useMemo(() => {
    if (!candidates) return []
    const set = new Set<string>()
    candidates.forEach(c => {
      if (c.cluster) set.add(c.cluster)
    })
    return Array.from(set).sort()
  }, [candidates])

  async function handleAdd(c: PickerCandidate) {
    setAdding(prev => new Set(prev).add(c.library_competency_id))
    try {
      await importCompetencyFromLibrary(frameworkId, {
        library_competency_id: c.library_competency_id,
      })
      // Remove from local list optimistically
      setCandidates(prev =>
        prev ? prev.filter(x => x.library_competency_id !== c.library_competency_id) : prev,
      )
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add")
    } finally {
      setAdding(prev => {
        const next = new Set(prev)
        next.delete(c.library_competency_id)
        return next
      })
    }
  }

  // Esc to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: "rgba(10,30,51,0.25)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          backdropFilter: "blur(4px)",
        }}
      />

      <aside
        className="fixed right-0 top-0 z-50 h-full overflow-y-auto transition-transform duration-300"
        style={{
          width: "min(640px, 100vw)",
          background: "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))",
          borderLeft: "0.5px solid rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          boxShadow: "-12px 0 40px rgba(15,40,65,0.18)",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close library picker"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(15,40,65,0.08)", color: "#0F2841" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8 pr-16">
          <h2 className="page-title text-xl">Add from library</h2>
          <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.5)" }}>
            Competencies already in this framework are hidden.
          </p>

          {/* Create new — primary affordance at the top */}
          <button
            onClick={() => setFormOpen(true)}
            className="btn-primary mt-4 w-full text-xs"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create new competency
          </button>

          {/* Filters */}
          <div className="mt-5 space-y-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or definition…"
              className="field"
            />

            <div className="flex flex-wrap gap-2">
              <select
                value={roleFamilyFilter}
                onChange={e => setRoleFamilyFilter(e.target.value)}
                className="field"
                style={{ width: "auto", flex: "1 1 200px" }}
              >
                <option value="">All role families</option>
                {ROLE_FAMILY_FILTER_OPTIONS.map(rf => (
                  <option key={rf} value={rf}>
                    {rf}
                  </option>
                ))}
              </select>

              <select
                value={clusterFilter}
                onChange={e => setClusterFilter(e.target.value)}
                className="field"
                style={{ width: "auto", flex: "1 1 200px" }}
              >
                <option value="">All clusters</option>
                {availableClusters.map(cl => (
                  <option key={cl} value={cl}>
                    {cl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="mt-5">
            {error && <div className="alert-error">{error}</div>}

            {loading && (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl"
                    style={{ background: "rgba(15,40,65,0.06)" }}
                  />
                ))}
              </div>
            )}

            {!loading && candidates && candidates.length === 0 && (
              <p className="text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
                No competencies match these filters.
              </p>
            )}

            {!loading && candidates && candidates.length > 0 && (
              <ul className="space-y-2">
                {candidates.map(c => {
                  const isAdding = adding.has(c.library_competency_id)
                  return (
                    <li
                      key={c.library_competency_id}
                      className="card p-3"
                      style={{ animation: "msg-fadein 0.2s ease-out forwards" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold" style={{ color: "#0A1E33" }}>
                              {c.name}
                            </span>
                            {c.role_family && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{
                                  background: "rgba(15,40,65,0.1)",
                                  color: "#0F2841",
                                }}
                              >
                                {c.role_family}
                              </span>
                            )}
                            {c.cluster && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{
                                  background: "rgba(42,91,168,0.10)",
                                  color: "#2A5BA8",
                                }}
                              >
                                {c.cluster}
                              </span>
                            )}
                            {c.is_custom && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
                              >
                                Custom
                              </span>
                            )}
                            {c.status === "draft" && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{ background: "rgba(226,177,70,0.18)", color: "#5A3A0C" }}
                              >
                                Draft
                              </span>
                            )}
                          </div>
                          {c.definition && (
                            <p
                              className="mt-1 text-xs"
                              style={{ color: "rgba(10,30,51,0.6)" }}
                            >
                              {c.definition}
                            </p>
                          )}
                          <p className="mt-1 text-[10px]" style={{ color: "rgba(10,30,51,0.4)" }}>
                            {c.framework_name}
                          </p>
                        </div>
                        <button
                          onClick={() => handleAdd(c)}
                          disabled={isAdding}
                          className="btn-primary shrink-0 text-xs disabled:opacity-50"
                        >
                          {isAdding ? "Adding…" : "+ Add"}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <style>{`
          @keyframes msg-fadein {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </aside>

      <CustomCompetencyForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleCustomSaved}
      />
    </>
  )
}
