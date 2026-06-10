"use client"

import { useEffect, useState } from "react"
import {
  getCompetency,
  getFrameworkCompetencyDetail,
  getFrameworkUsage,
  type CompetencyDetailView,
} from "@/lib/api"
import type { CompetencyDetail } from "@/lib/types"
import ProficiencyLadder from "./ProficiencyLadder"
import CustomCompetencyForm from "./CustomCompetencyForm"

interface Props {
  frameworkId: string
  competencyId: string | null
  /** The framework's benchmark target level for the open competency, or null if unset. */
  targetLevel: number | null
  /** Current user's ID — used to decide whether to render the Edit button. */
  currentUserId: string | null
  onClose: () => void
  /** Called after a successful edit so the parent can refetch framework data. */
  onEdited?: () => void
}

/**
 * Read-only side panel showing the full detail of one framework competency:
 *   - name, description
 *   - cluster, library provenance (framework_source citation if imported)
 *   - all 5 proficiency levels with descriptors and behavioural indicators
 *   - linked survey (if any)
 *
 * Intentionally has NO edit affordances or disabled inputs — editing lands
 * in its own task with the override-table design (see the deferred-#3 notes).
 */
export default function CompetencyDetailDrawer({
  frameworkId,
  competencyId,
  targetLevel,
  currentUserId,
  onClose,
  onEdited,
}: Props) {
  const [detail, setDetail] = useState<CompetencyDetailView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit-flow state
  const [editing, setEditing] = useState<CompetencyDetail | null>(null)
  const [openingEdit, setOpeningEdit] = useState(false)

  function loadDetail(cid: string) {
    setLoading(true)
    setError(null)
    getFrameworkCompetencyDetail(frameworkId, cid)
      .then(d => setDetail(d))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!competencyId) {
      setDetail(null)
      return
    }
    loadDetail(competencyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkId, competencyId])

  const isEditable =
    detail?.library_competency_id != null &&
    detail.library_is_custom &&
    currentUserId !== null &&
    detail.library_organization_id === currentUserId

  const isDraft = detail?.library_status === "draft"

  async function handleOpenEdit() {
    if (!detail?.library_competency_id) return
    setOpeningEdit(true)
    try {
      // Usage confirmation when used by 2+ frameworks
      const usage = await getFrameworkUsage(detail.library_competency_id)
      if (usage.framework_count >= 2) {
        const titles = usage.framework_titles.join(", ")
        const ok = window.confirm(
          `This competency is used in ${usage.framework_count} frameworks (${titles}). ` +
          `Changes will apply to all of them. Continue?`,
        )
        if (!ok) {
          setOpeningEdit(false)
          return
        }
      }
      // Load the editable representation (CompetencyDetail from /api/v1/competencies/{id})
      const fullDetail = await getCompetency(detail.library_competency_id)
      setEditing(fullDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open edit form")
    } finally {
      setOpeningEdit(false)
    }
  }

  function handleSaved() {
    setEditing(null)
    if (competencyId) loadDetail(competencyId)
    onEdited?.()
  }

  // Esc to close
  useEffect(() => {
    if (!competencyId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [competencyId, onClose])

  const isOpen = competencyId !== null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!isOpen}
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: "rgba(10,30,51,0.25)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 h-full overflow-y-auto transition-transform duration-300"
        style={{
          width: "min(560px, 100vw)",
          background: "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))",
          borderLeft: "0.5px solid rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          boxShadow: "-12px 0 40px rgba(15,40,65,0.18)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{
            background: "rgba(15,40,65,0.08)",
            color: "#0F2841",
          }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          {loading && (
            <div className="space-y-3">
              <div className="h-5 w-40 animate-pulse rounded" style={{ background: "rgba(15,40,65,0.1)" }} />
              <div className="h-3 w-full animate-pulse rounded" style={{ background: "rgba(15,40,65,0.06)" }} />
              <div className="h-3 w-3/4 animate-pulse rounded" style={{ background: "rgba(15,40,65,0.06)" }} />
            </div>
          )}

          {error && <div className="alert-error">{error}</div>}

          {detail && !loading && (
            <>
              {/* Header */}
              <div className="mb-6 pr-12">
                {detail.cluster && (
                  <div className="eyebrow mb-1">{detail.cluster}</div>
                )}
                <h2 className="page-title text-xl">{detail.name}</h2>
                {detail.description && (
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: "rgba(10,30,51,0.7)" }}
                  >
                    {detail.description}
                  </p>
                )}
              </div>

              {/* Draft banner */}
              {isDraft && (
                <div
                  className="mb-5 flex items-start gap-3 rounded-xl p-4"
                  style={{
                    background: "rgba(226,177,70,0.10)",
                    border: "0.5px solid rgba(226,177,70,0.35)",
                  }}
                >
                  <div className="flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#5A3A0C" }}>
                        Draft
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "#5A3A0C" }}>
                      Complete proficiency levels and indicators to enable assessment linking and gap analysis.
                    </p>
                  </div>
                  {isEditable && (
                    <button
                      onClick={handleOpenEdit}
                      disabled={openingEdit}
                      className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #0F2841, #2A5BA8)" }}
                    >
                      {openingEdit ? "…" : "Complete now"}
                    </button>
                  )}
                </div>
              )}

              {/* Edit button (when editable + not in draft banner already) */}
              {isEditable && !isDraft && (
                <div className="mb-5">
                  <button
                    onClick={handleOpenEdit}
                    disabled={openingEdit}
                    className="btn-ghost text-xs"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {openingEdit ? "Loading…" : "Edit competency"}
                  </button>
                </div>
              )}

              {/* Library provenance */}
              {detail.library_competency_id && (
                <div className="card mb-6 p-4">
                  <div className="label-caps mb-2">Source</div>
                  <div className="space-y-1 text-xs" style={{ color: "rgba(10,30,51,0.75)" }}>
                    {detail.library_framework_name && (
                      <div>
                        <span className="font-semibold">Library:</span>{" "}
                        {detail.library_framework_name}
                      </div>
                    )}
                    {detail.library_role_family && (
                      <div>
                        <span className="font-semibold">Role family:</span>{" "}
                        {detail.library_role_family}
                      </div>
                    )}
                    {detail.library_framework_source && (
                      <div>
                        <span className="font-semibold">Original source:</span>{" "}
                        {detail.library_framework_source}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Proficiency ladder (vertical bands; click to expand) */}
              <div className="mb-6">
                <div className="label-caps mb-3">Proficiency levels</div>
                <ProficiencyLadder levels={detail.levels} targetLevel={targetLevel} />
              </div>

              {/* Linked survey */}
              {detail.linked_survey && (
                <div className="card p-4">
                  <div className="label-caps mb-2">Linked assessment</div>
                  <div className="text-sm" style={{ color: "rgba(10,30,51,0.85)" }}>
                    {detail.linked_survey.survey_name ?? `Survey ${detail.linked_survey.survey_id.slice(0, 8)}…`}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <CustomCompetencyForm
        open={editing !== null}
        editing={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </>
  )
}
