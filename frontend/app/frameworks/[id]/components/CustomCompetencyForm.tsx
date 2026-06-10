"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createCustomCompetency,
  getClusterOptions,
  updateCustomCompetency,
  type ClusterOptions,
  type CustomCompetencyLevelInput,
} from "@/lib/api"
import type { CompetencyDetail } from "@/lib/types"

// ---------------------------------------------------------------------------
// Constants — kept in sync with backend (LEVEL_LABELS in api/competencies.py)
// ---------------------------------------------------------------------------

const LEVEL_LABELS: Record<number, string> = {
  1: "Novice",
  2: "Developing",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
}
const LEVELS = [1, 2, 3, 4, 5]

const ROLE_FAMILY_OPTIONS = [
  "Sales",
  "Technical/Engineering",
  "People Management",
  "Customer Service and Success",
  "Operations and Project Management",
  "Human Resources and People Operations",
  "Finance and Accounting",
  "Marketing and Communications",
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LevelDraft {
  descriptor: string
  indicators: string[]  // free-text rows; empty rows are dropped on submit
  examples: string[]
}

function emptyLevels(): Record<number, LevelDraft> {
  const out: Record<number, LevelDraft> = {}
  for (const lv of LEVELS) {
    out[lv] = { descriptor: "", indicators: ["", ""], examples: [""] }
  }
  return out
}

function levelsFromDetail(detail: CompetencyDetail): Record<number, LevelDraft> {
  const out = emptyLevels()
  for (const pl of detail.proficiency_levels) {
    out[pl.level] = {
      descriptor: pl.descriptor ?? "",
      indicators: pl.behavioral_indicators.length > 0 ? pl.behavioral_indicators : ["", ""],
      examples: pl.example_behaviors.length > 0 ? pl.example_behaviors : [""],
    }
  }
  return out
}

function toLevelInputs(drafts: Record<number, LevelDraft>): CustomCompetencyLevelInput[] {
  const out: CustomCompetencyLevelInput[] = []
  for (const lv of LEVELS) {
    const d = drafts[lv]
    const indicators = d.indicators.map(s => s.trim()).filter(Boolean)
    const examples = d.examples.map(s => s.trim()).filter(Boolean)
    const hasAny = d.descriptor.trim() || indicators.length > 0 || examples.length > 0
    if (!hasAny) continue
    out.push({
      level: lv,
      label: LEVEL_LABELS[lv],
      descriptor: d.descriptor.trim() || null,
      behavioral_indicators: indicators,
      example_behaviors: examples,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  /** Pre-populate for editing; undefined for create. */
  editing?: CompetencyDetail
  onClose: () => void
  /** Called after a successful save. Receives the saved competency so the caller can act on it. */
  onSaved: (saved: CompetencyDetail) => void
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export default function CustomCompetencyForm({ open, editing, onClose, onSaved }: Props) {
  const [name, setName] = useState("")
  const [definition, setDefinition] = useState("")
  const [roleFamily, setRoleFamily] = useState("")
  const [cluster, setCluster] = useState("")
  const [frameworkSource, setFrameworkSource] = useState("")
  const [levels, setLevels] = useState<Record<number, LevelDraft>>(emptyLevels())

  const [clusterOptions, setClusterOptions] = useState<ClusterOptions | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load cluster options once when opened
  useEffect(() => {
    if (!open) return
    if (clusterOptions) return
    getClusterOptions()
      .then(setClusterOptions)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load clusters"))
  }, [open, clusterOptions])

  // Initialise form state when opened (or when switching between create/edit)
  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setName(editing.name)
      setDefinition(editing.definition ?? "")
      setRoleFamily(editing.role_family ?? "")
      setCluster(editing.cluster ?? "")
      setFrameworkSource(editing.framework_source ?? "")
      setLevels(levelsFromDetail(editing))
    } else {
      setName("")
      setDefinition("")
      setRoleFamily("")
      setCluster("")
      setFrameworkSource("")
      setLevels(emptyLevels())
    }
  }, [open, editing])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  const availableClusters = useMemo<string[]>(() => {
    if (!clusterOptions || !roleFamily) return []
    return clusterOptions.options[roleFamily] ?? []
  }, [clusterOptions, roleFamily])

  // Required-field validation for "Save" — matches backend draft requirement.
  const canSave = name.trim() && definition.trim() && roleFamily && cluster

  function updateLevel(lv: number, patch: Partial<LevelDraft>) {
    setLevels(prev => ({ ...prev, [lv]: { ...prev[lv], ...patch } }))
  }

  async function handleSubmit() {
    if (!canSave || submitting) return
    setSubmitting(true)
    setError(null)
    const levelInputs = toLevelInputs(levels)
    try {
      const saved = editing
        ? await updateCustomCompetency(editing.id, {
            name: name.trim(),
            definition: definition.trim(),
            role_family: roleFamily,
            cluster: cluster,
            framework_source: frameworkSource.trim() || null,
            levels: levelInputs.length > 0 ? levelInputs : [],
          })
        : await createCustomCompetency({
            name: name.trim(),
            definition: definition.trim(),
            role_family: roleFamily,
            cluster: cluster,
            framework_source: frameworkSource.trim() || null,
            levels: levelInputs,
          })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50"
        style={{ background: "rgba(10,30,51,0.35)", backdropFilter: "blur(4px)" }}
      />
      <div
        className="fixed inset-x-0 top-12 z-50 mx-auto max-w-2xl rounded-3xl"
        style={{
          maxHeight: "calc(100vh - 6rem)",
          background: "linear-gradient(145deg, rgba(255,255,255,0.97), rgba(255,255,255,0.88))",
          border: "0.5px solid rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 20px 60px rgba(15,40,65,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "rgba(15,40,65,0.08)" }}
        >
          <div>
            <h2 className="page-title text-lg">
              {editing ? "Edit competency" : "Create custom competency"}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "rgba(10,30,51,0.5)" }}>
              Saved to your organisation&apos;s library — usable across all frameworks.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close form"
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "rgba(15,40,65,0.08)", color: "#0F2841" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && <div className="alert-error">{error}</div>}

          {/* Required section */}
          <section>
            <div className="label-caps mb-3">Required</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Cross-Cultural Negotiation"
                  className="field"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                  Description
                </label>
                <textarea
                  value={definition}
                  onChange={e => setDefinition(e.target.value)}
                  rows={2}
                  placeholder="One or two sentences."
                  className="field"
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                    Role family
                  </label>
                  <select
                    value={roleFamily}
                    onChange={e => {
                      setRoleFamily(e.target.value)
                      setCluster("")
                    }}
                    className="field"
                  >
                    <option value="">Select…</option>
                    {ROLE_FAMILY_OPTIONS.map(rf => (
                      <option key={rf} value={rf}>{rf}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                    Cluster
                  </label>
                  <select
                    value={cluster}
                    onChange={e => setCluster(e.target.value)}
                    disabled={!roleFamily || !clusterOptions}
                    className="field"
                  >
                    <option value="">
                      {!roleFamily ? "Pick a role family first" : "Select…"}
                    </option>
                    {availableClusters.map(cl => (
                      <option key={cl} value={cl}>{cl}</option>
                    ))}
                    {roleFamily && availableClusters.length === 0 && clusterOptions && (
                      <option disabled value="">
                        No clusters yet for this family
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Optional — framework source */}
          <section>
            <div className="label-caps mb-3">Optional</div>
            <div>
              <label className="mb-1 block text-xs font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                Framework source <span className="font-normal" style={{ color: "rgba(10,30,51,0.4)" }}>(citation)</span>
              </label>
              <input
                type="text"
                value={frameworkSource}
                onChange={e => setFrameworkSource(e.target.value)}
                placeholder="e.g., Internal — Org Values 2024"
                className="field"
              />
            </div>
          </section>

          {/* Optional — proficiency levels */}
          <section>
            <div className="mb-1 flex items-baseline justify-between">
              <div className="label-caps">Proficiency levels</div>
              <span className="text-[10px]" style={{ color: "rgba(10,30,51,0.45)" }}>
                Fill all 5 with indicators to mark as active. Otherwise saves as draft.
              </span>
            </div>
            <div className="space-y-3">
              {LEVELS.map(lv => (
                <LevelEditor
                  key={lv}
                  level={lv}
                  label={LEVEL_LABELS[lv]}
                  draft={levels[lv]}
                  onChange={patch => updateLevel(lv, patch)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 border-t px-6 py-4"
          style={{ borderColor: "rgba(15,40,65,0.08)" }}
        >
          <button onClick={onClose} disabled={submitting} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave || submitting}
            className="btn-primary text-xs"
          >
            {submitting ? "Saving…" : editing ? "Save changes" : "Create competency"}
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Per-level editor
// ---------------------------------------------------------------------------

function LevelEditor({
  level,
  label,
  draft,
  onChange,
}: {
  level: number
  label: string
  draft: LevelDraft
  onChange: (patch: Partial<LevelDraft>) => void
}) {
  function setIndicator(idx: number, val: string) {
    const next = [...draft.indicators]
    next[idx] = val
    onChange({ indicators: next })
  }
  function addIndicator() {
    if (draft.indicators.length >= 5) return
    onChange({ indicators: [...draft.indicators, ""] })
  }
  function removeIndicator(idx: number) {
    if (draft.indicators.length <= 1) return
    const next = draft.indicators.filter((_, i) => i !== idx)
    onChange({ indicators: next })
  }
  function setExample(idx: number, val: string) {
    const next = [...draft.examples]
    next[idx] = val
    onChange({ examples: next })
  }
  function addExample() {
    if (draft.examples.length >= 3) return
    onChange({ examples: [...draft.examples, ""] })
  }
  function removeExample(idx: number) {
    if (draft.examples.length <= 1) return
    const next = draft.examples.filter((_, i) => i !== idx)
    onChange({ examples: next })
  }

  return (
    <details
      className="rounded-xl"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "0.5px solid rgba(255,255,255,0.8)",
      }}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-xs">
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
        >
          L{level}
        </span>
        <span className="font-semibold" style={{ color: "#0A1E33" }}>{label}</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(10,30,51,0.5)" }}>
            Descriptor
          </label>
          <textarea
            value={draft.descriptor}
            onChange={e => onChange({ descriptor: e.target.value })}
            rows={2}
            placeholder="Brief description of what this level looks like."
            className="field"
            style={{ resize: "vertical" }}
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(10,30,51,0.5)" }}>
            Behavioural indicators
          </label>
          <div className="space-y-1.5">
            {draft.indicators.map((ind, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ind}
                  onChange={e => setIndicator(i, e.target.value)}
                  placeholder={`Indicator ${i + 1}`}
                  className="field"
                />
                {draft.indicators.length > 1 && (
                  <button
                    onClick={() => removeIndicator(i)}
                    className="shrink-0 rounded-full px-2 py-1 text-[10px]"
                    style={{ color: "rgba(10,30,51,0.4)" }}
                    aria-label="Remove indicator"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {draft.indicators.length < 5 && (
            <button
              onClick={addIndicator}
              className="mt-1.5 text-[10px] font-semibold"
              style={{ color: "#0F2841" }}
            >
              + Add another
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(10,30,51,0.5)" }}>
            Example behaviours
          </label>
          <div className="space-y-1.5">
            {draft.examples.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ex}
                  onChange={e => setExample(i, e.target.value)}
                  placeholder={`Example ${i + 1}`}
                  className="field"
                />
                {draft.examples.length > 1 && (
                  <button
                    onClick={() => removeExample(i)}
                    className="shrink-0 rounded-full px-2 py-1 text-[10px]"
                    style={{ color: "rgba(10,30,51,0.4)" }}
                    aria-label="Remove example"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {draft.examples.length < 3 && (
            <button
              onClick={addExample}
              className="mt-1.5 text-[10px] font-semibold"
              style={{ color: "#0F2841" }}
            >
              + Add another
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
