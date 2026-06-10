"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconDownload,
  IconMailForward,
  IconSparkles,
  IconUserCheck,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import type { IconProps } from "@tabler/icons-react"
import Header from "@/components/Header"
import {
  getCompetencies,
  getCompetencyFrameworks,
  generateStrawMan,
  exportStrawMan,
  requestAssessment,
} from "@/lib/api"
import type {
  BlueprintPurpose,
  CompetencyFrameworkListItem,
  CompetencyListItem,
  SeniorityLevel,
  StrawManRequest,
  StrawManResponse,
  StrawManRow,
} from "@/lib/types"
import { colourForCluster } from "@/app/frameworks/[id]/lib/cluster-palette"

// ---------------------------------------------------------------------------
// Static option lists
// ---------------------------------------------------------------------------

const SENIORITY_OPTS: { value: SeniorityLevel; label: string; desc: string }[] = [
  { value: "junior",    label: "Junior / Entry Level", desc: "1–3 years, building foundational skills" },
  { value: "mid",       label: "Mid Level",            desc: "3–7 years, operating independently" },
  { value: "senior",    label: "Senior / Lead",        desc: "7+ years, leading projects or teams" },
  { value: "executive", label: "Executive",            desc: "Director+ managing teams or functions" },
]

const PURPOSE_OPTS: {
  value: BlueprintPurpose
  label: string
  desc: string
  Icon: ComponentType<IconProps>
}[] = [
  { value: "selection",   label: "Selection",      desc: "Hiring assessment — what does this person need to demonstrate?", Icon: IconCircleCheck },
  { value: "development", label: "Development",    desc: "Growth planning — where should we invest in this person?",        Icon: IconUserCheck },
  { value: "360",         label: "360° Feedback",  desc: "Multi-rater feedback — how do others experience this person?",   Icon: IconUsersGroup },
]

// ---------------------------------------------------------------------------
// Step 1 — Input form
// ---------------------------------------------------------------------------

function StepInput({
  form,
  onChange,
  onSubmit,
  loading,
  frameworks,
  allComps,
  selectedCompIds,
  onCompToggle,
}: {
  form: StrawManRequest
  onChange: (updates: Partial<StrawManRequest>) => void
  onSubmit: () => void
  loading: boolean
  frameworks: CompetencyFrameworkListItem[]
  allComps: CompetencyListItem[]
  selectedCompIds: Set<string>
  onCompToggle: (id: string) => void
}) {
  const [showCompPicker, setShowCompPicker] = useState(false)
  const [compSearch, setCompSearch] = useState("")
  const [fwFilter, setFwFilter] = useState("")

  const filteredComps = allComps.filter((c) => {
    if (fwFilter && c.framework_id !== fwFilter) return false
    if (compSearch && !c.name.toLowerCase().includes(compSearch.toLowerCase()))
      return false
    return true
  })

  const inputStyle = {
    fontFamily: "var(--mx-font-sans)",
    fontSize: 13,
    color: "var(--mx-ink)",
    background: "var(--mx-paper)",
    border: "1px solid var(--mx-line)",
    borderRadius: 12,
    padding: "10px 12px",
    width: "100%",
    outline: "none" as const,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Role / initiative */}
      <section className="mx-card space-y-4" style={{ padding: 24 }}>
        <h2
          style={{
            fontFamily: "var(--mx-font-display)",
            fontSize: 18,
            letterSpacing: "-0.018em",
            color: "var(--mx-ink)",
          }}
        >
          What are you assessing for?
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mx-eyebrow mb-1.5 block">Role title (optional)</label>
            <input
              type="text"
              placeholder="e.g. Sales Manager, Software Engineer, CHRO…"
              value={form.role_title ?? ""}
              onChange={(e) => onChange({ role_title: e.target.value || null })}
              style={inputStyle}
            />
          </div>
          <div
            className="text-center"
            style={{
              fontFamily: "var(--mx-font-display)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--mx-ink-3)",
            }}
          >
            or
          </div>
          <div>
            <label className="mx-eyebrow mb-1.5 block">
              Initiative / programme (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. High-Potential Leadership Programme, Succession Planning…"
              value={form.initiative ?? ""}
              onChange={(e) => onChange({ initiative: e.target.value || null })}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      {/* Seniority */}
      <section className="mx-card" style={{ padding: 24 }}>
        <h2
          className="mb-4"
          style={{
            fontFamily: "var(--mx-font-display)",
            fontSize: 18,
            letterSpacing: "-0.018em",
            color: "var(--mx-ink)",
          }}
        >
          Seniority level
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {SENIORITY_OPTS.map((opt) => {
            const active = form.seniority_level === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ seniority_level: opt.value })}
                className="rounded-[12px] p-3 text-left transition-all"
                style={{
                  background: active ? "var(--mx-paper)" : "var(--mx-paper-2)",
                  border: active
                    ? "1.5px solid var(--mx-forest)"
                    : "1px solid var(--mx-line)",
                  boxShadow: active ? "var(--mx-shadow-card)" : "none",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: active ? "var(--mx-forest)" : "var(--mx-ink)",
                  }}
                >
                  {opt.label}
                </p>
                <p
                  className="mt-0.5"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 10.5,
                    color: "var(--mx-ink-3)",
                    lineHeight: 1.45,
                  }}
                >
                  {opt.desc}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Purpose */}
      <section className="mx-card" style={{ padding: 24 }}>
        <h2
          className="mb-4"
          style={{
            fontFamily: "var(--mx-font-display)",
            fontSize: 18,
            letterSpacing: "-0.018em",
            color: "var(--mx-ink)",
          }}
        >
          Assessment purpose
        </h2>
        <div className="space-y-2">
          {PURPOSE_OPTS.map((opt) => {
            const active = form.purpose === opt.value
            const Icon = opt.Icon
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ purpose: opt.value })}
                className="flex w-full items-center gap-3 rounded-[12px] p-3 text-left transition-all"
                style={{
                  background: active ? "var(--mx-paper)" : "var(--mx-paper-2)",
                  border: active
                    ? "1.5px solid var(--mx-forest)"
                    : "1px solid var(--mx-line)",
                  boxShadow: active ? "var(--mx-shadow-card)" : "none",
                }}
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center"
                  style={{
                    background: active
                      ? "rgba(15,40,65,0.10)"
                      : "var(--mx-paper)",
                    color: active ? "var(--mx-forest)" : "var(--mx-ink-3)",
                    borderRadius: "var(--mx-r-md)",
                    border: "1px solid var(--mx-line)",
                  }}
                >
                  <Icon size={16} stroke={1.6} />
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: active ? "var(--mx-forest)" : "var(--mx-ink)",
                    }}
                  >
                    {opt.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11,
                      color: "var(--mx-ink-3)",
                      lineHeight: 1.45,
                    }}
                  >
                    {opt.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Optional competency picker */}
      <section className="mx-card" style={{ padding: 24 }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2
              style={{
                fontFamily: "var(--mx-font-display)",
                fontSize: 18,
                letterSpacing: "-0.018em",
                color: "var(--mx-ink)",
              }}
            >
              Specific competencies
            </h2>
            <p
              className="mt-0.5"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 11.5,
                color: "var(--mx-ink-3)",
              }}
            >
              {selectedCompIds.size > 0
                ? `${selectedCompIds.size} selected — will override auto-suggestion`
                : "Optional — leave empty for AI-suggested competencies"}
            </p>
          </div>
          <button
            onClick={() => setShowCompPicker((v) => !v)}
            className="mx-pill flex-shrink-0"
            style={{ fontSize: 11 }}
          >
            {showCompPicker
              ? "Done"
              : selectedCompIds.size > 0
              ? `Edit (${selectedCompIds.size})`
              : "Browse"}
          </button>
        </div>

        {selectedCompIds.size > 0 && !showCompPicker && (
          <div className="flex flex-wrap gap-1.5">
            {allComps
              .filter((c) => selectedCompIds.has(c.id))
              .map((c) => {
                const fc = colourForCluster(c.factor ?? c.category)
                return (
                  <span
                    key={c.id}
                    className="flex items-center gap-1"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px 2px 8px",
                      borderRadius: 999,
                      background: fc.bg,
                      color: fc.text,
                    }}
                  >
                    {c.name}
                    <button
                      onClick={() => onCompToggle(c.id)}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Remove"
                    >
                      <IconX size={11} stroke={2} />
                    </button>
                  </span>
                )
              })}
          </div>
        )}

        {showCompPicker && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFwFilter("")}
                className="rounded-[999px] px-2.5 py-1"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 10,
                  fontWeight: 500,
                  background: !fwFilter ? "var(--mx-forest)" : "var(--mx-paper-2)",
                  color: !fwFilter ? "var(--mx-paper)" : "var(--mx-ink-2)",
                  border: "1px solid var(--mx-line)",
                }}
              >
                All
              </button>
              {frameworks.map((fw) => {
                const active = fwFilter === fw.id
                return (
                  <button
                    key={fw.id}
                    onClick={() => setFwFilter(fw.id)}
                    className="rounded-[999px] px-2.5 py-1"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 10,
                      fontWeight: 500,
                      background: active ? "var(--mx-forest)" : "var(--mx-paper-2)",
                      color: active ? "var(--mx-paper)" : "var(--mx-ink-2)",
                      border: "1px solid var(--mx-line)",
                    }}
                  >
                    {fw.name.split(" ").slice(0, 2).join(" ")}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              placeholder="Search competencies…"
              value={compSearch}
              onChange={(e) => setCompSearch(e.target.value)}
              style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }}
            />
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {filteredComps.slice(0, 60).map((c) => {
                const checked = selectedCompIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => onCompToggle(c.id)}
                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors"
                    style={{
                      background: checked
                        ? "var(--mx-paper)"
                        : "var(--mx-paper-2)",
                      border: checked
                        ? "1px solid var(--mx-forest)"
                        : "1px solid var(--mx-line)",
                    }}
                  >
                    <div
                      className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center"
                      style={{
                        background: checked
                          ? "var(--mx-forest)"
                          : "var(--mx-paper)",
                        border: "1px solid var(--mx-line)",
                        borderRadius: 4,
                      }}
                    >
                      {checked && (
                        <IconCheck
                          size={10}
                          stroke={3}
                          style={{ color: "var(--mx-paper)" }}
                        />
                      )}
                    </div>
                    <div>
                      <span
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--mx-ink)",
                        }}
                      >
                        {c.name}
                      </span>
                      {c.factor && (
                        <span
                          className="ml-1.5"
                          style={{
                            fontFamily: "var(--mx-font-sans)",
                            fontSize: 10,
                            color: "var(--mx-ink-3)",
                          }}
                        >
                          {c.factor}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={loading}
        className="relative w-full overflow-hidden rounded-[999px] py-3.5 transition-all"
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 14,
          fontWeight: 500,
          background: "var(--mx-forest)",
          color: "var(--mx-paper)",
          boxShadow: "var(--mx-shadow-hover)",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="h-4 w-4 animate-spin rounded-full"
              style={{
                border: "2px solid rgba(250,247,242,0.4)",
                borderTopColor: "var(--mx-paper)",
              }}
            />
            Generating blueprint…
          </span>
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <IconSparkles size={15} stroke={1.8} />
            Generate assessment blueprint
          </span>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blueprint row
// ---------------------------------------------------------------------------

function BlueprintRow({
  row,
  index,
  onRemove,
}: {
  row: StrawManRow
  index: number
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const fc = colourForCluster(row.factor)

  return (
    <div className="mx-card overflow-hidden" style={{ padding: 0 }}>
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            fontFamily: "var(--mx-font-mono)",
            fontSize: 12,
            fontWeight: 600,
            fontFeatureSettings: '"tnum"',
            background: fc.bg,
            color: fc.text,
          }}
        >
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--mx-ink)",
                  lineHeight: 1.3,
                }}
              >
                {row.competency}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {row.factor && (
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
                    {row.factor}
                  </span>
                )}
                {row.cluster && (
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
                    {row.cluster}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--mx-forest)",
                    color: "var(--mx-paper)",
                  }}
                >
                  Level {row.required_proficiency_level} — {row.proficiency_label}
                </span>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--mx-paper-2)]"
                style={{ color: "var(--mx-ink-3)" }}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                <IconChevronDown
                  size={15}
                  stroke={1.8}
                  style={{
                    transform: expanded ? "rotate(180deg)" : "none",
                    transition: "transform var(--mx-dur-fast) var(--mx-ease)",
                  }}
                />
              </button>
              <button
                onClick={onRemove}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--mx-paper-2)]"
                style={{ color: "var(--mx-ink-3)" }}
                aria-label="Remove"
              >
                <IconX size={15} stroke={1.8} />
              </button>
            </div>
          </div>

          {/* Instrument chips summary */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.primary_instrument ? (
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(15,40,65,0.10)",
                  color: "var(--mx-forest)",
                }}
              >
                {row.primary_instrument.short_name}
                {row.primary_instrument.subscale &&
                  ` (${row.primary_instrument.subscale})`}
              </span>
            ) : (
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  color: "var(--mx-ink-2)",
                }}
              >
                Behavioural Interview
              </span>
            )}
            {row.supporting_instruments.slice(0, 2).map((s) => (
              <span
                key={s.short_name}
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  color: "var(--mx-ink-2)",
                }}
              >
                + {s.short_name}
              </span>
            ))}
            <span
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 10,
                color: "var(--mx-ink-3)",
              }}
            >
              {row.assessment_method}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          className="border-t px-4 pb-4"
          style={{ borderColor: "var(--mx-line)" }}
        >
          <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
            {row.behavioral_indicators.length > 0 && (
              <div>
                <p className="mx-eyebrow mb-2">
                  Behavioural indicators (level {row.required_proficiency_level})
                </p>
                <ul className="space-y-1">
                  {row.behavioral_indicators.map((ind, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span
                        className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full"
                        style={{ background: fc.main }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: "var(--mx-ink-2)",
                        }}
                      >
                        {ind}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mx-eyebrow mb-2">Measurement</p>
              {row.primary_instrument && (
                <div
                  className="mb-2 rounded-[10px] p-2.5"
                  style={{
                    background: "var(--mx-paper-2)",
                    border: "1px solid var(--mx-line)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--mx-forest)",
                    }}
                  >
                    {row.primary_instrument.short_name}
                    <span
                      className="ml-1"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontWeight: 400,
                        fontSize: 10,
                        color: "var(--mx-ink-3)",
                      }}
                    >
                      Primary
                    </span>
                  </p>
                  {row.primary_instrument.subscale && (
                    <p
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 10,
                        color: "var(--mx-ink-3)",
                      }}
                    >
                      Subscale: {row.primary_instrument.subscale}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3">
                    <span
                      className="mx-tnum"
                      style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                    >
                      {row.primary_instrument.items} items
                    </span>
                    {row.primary_instrument.alpha && (
                      <span
                        className="mx-tnum"
                        style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                      >
                        α = {row.primary_instrument.alpha.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {row.primary_instrument.rationale && (
                    <p
                      className="mt-1"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 11,
                        lineHeight: 1.55,
                        color: "var(--mx-ink-2)",
                      }}
                    >
                      {row.primary_instrument.rationale}
                    </p>
                  )}
                </div>
              )}
              {row.supporting_instruments.map((s) => (
                <div
                  key={s.short_name}
                  className="mb-1.5 rounded-[10px] px-2.5 py-2"
                  style={{
                    background: "var(--mx-paper)",
                    border: "1px solid var(--mx-line)",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--mx-ink)",
                    }}
                  >
                    {s.short_name}
                    {s.subscale && (
                      <span
                        className="ml-1"
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontWeight: 400,
                          fontSize: 10,
                          color: "var(--mx-ink-3)",
                        }}
                      >
                        ({s.subscale})
                      </span>
                    )}
                    <span
                      className="ml-1"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 10,
                        color: "var(--mx-ink-3)",
                      }}
                    >
                      Supporting
                    </span>
                  </p>
                </div>
              ))}

              {row.rationale && (
                <p
                  className="mt-2 italic"
                  style={{
                    fontFamily: "var(--mx-font-display)",
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: "var(--mx-ink-2)",
                  }}
                >
                  &ldquo;{row.rationale}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Request modal
// ---------------------------------------------------------------------------

function buildBlueprintSummary(blueprint: StrawManResponse): string {
  const lines = [
    blueprint.title,
    `Seniority: ${blueprint.seniority_level} | Purpose: ${blueprint.purpose}`,
    "",
    "COMPETENCIES:",
  ]
  blueprint.rows.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.competency} (${row.framework})` +
        ` — Required Level ${row.required_proficiency_level}: ${row.proficiency_label}` +
        (row.primary_instrument
          ? ` | Primary measure: ${row.primary_instrument.short_name}`
          : "")
    )
  })
  return lines.join("\n")
}

function RequestModal({
  blueprint,
  roleName,
  onClose,
}: {
  blueprint: StrawManResponse
  roleName: string
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle = {
    fontFamily: "var(--mx-font-sans)",
    fontSize: 13,
    color: "var(--mx-ink)",
    background: "var(--mx-paper)",
    border: "1px solid var(--mx-line)",
    borderRadius: 12,
    padding: "10px 12px",
    width: "100%",
    outline: "none" as const,
  }

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const summary = buildBlueprintSummary(blueprint)
      const context = [
        `Requester: ${name.trim()}`,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
        "",
        summary,
      ]
        .filter(Boolean)
        .join("\n")

      await requestAssessment(
        `Competency Measurement Plan: ${roleName}`,
        context,
        email.trim()
      )
      setSubmitted(true)
    } catch {
      setError("Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{
          background: "rgba(10,30,51,0.4)",
          backdropFilter: "blur(4px)",
        }}
        onClick={submitted ? onClose : undefined}
      />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && submitted && onClose()}
      >
        <div
          className="relative w-full max-w-md"
          style={{
            background: "var(--mx-paper)",
            border: "1px solid var(--mx-line)",
            borderRadius: "var(--mx-r-xl)",
            padding: 28,
            boxShadow: "0 24px 64px rgba(10,30,51,0.20)",
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 transition-colors hover:bg-[var(--mx-paper-2)]"
            style={{ color: "var(--mx-ink-3)" }}
            aria-label="Close"
          >
            <IconX size={16} stroke={1.8} />
          </button>

          {submitted ? (
            <div className="py-4 text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  background: "rgba(126,138,85,0.18)",
                  color: "#3F4A2A",
                }}
              >
                <IconCircleCheck size={24} stroke={1.6} />
              </div>
              <h3
                className="mb-2"
                style={{
                  fontFamily: "var(--mx-font-display)",
                  fontSize: 20,
                  letterSpacing: "-0.018em",
                  color: "var(--mx-ink)",
                }}
              >
                Request <em className="mx-text-grad-warm">submitted.</em>
              </h3>
              <p
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--mx-ink-2)",
                }}
              >
                An IO psychologist will review your blueprint and recommend
                validated measures within 2–3 business days.
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-[999px] px-5 py-2"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "var(--mx-forest)",
                  color: "var(--mx-paper)",
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <h3
                style={{
                  fontFamily: "var(--mx-font-display)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  color: "var(--mx-ink)",
                  lineHeight: 1.15,
                }}
              >
                Request measurement{" "}
                <em className="mx-text-grad-warm">plan.</em>
              </h3>
              <p
                className="mb-5 mt-1"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  color: "var(--mx-ink-3)",
                }}
              >
                An IO psychologist will review your blueprint and recommend
                validated measures.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mx-eyebrow mb-1.5 block">
                    Your name <span style={{ color: "var(--mx-clay)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mx-eyebrow mb-1.5 block">
                    Email <span style={{ color: "var(--mx-clay)" }}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="jane@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mx-eyebrow mb-1.5 block">
                    Additional notes <span style={{ color: "var(--mx-ink-3)" }}>(optional)</span>
                  </label>
                  <textarea
                    placeholder="Any context that would help — team size, timeline, constraints…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: "none" }}
                  />
                </div>
              </div>

              {error && (
                <p
                  className="mt-3"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 12,
                    color: "var(--mx-rose)",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim() || !email.trim()}
                className="mt-5 w-full rounded-[999px] py-2.5 transition-all"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--mx-forest)",
                  color: "var(--mx-paper)",
                  boxShadow: "var(--mx-shadow-card)",
                  opacity:
                    submitting || !name.trim() || !email.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full"
                      style={{
                        border: "2px solid rgba(250,247,242,0.4)",
                        borderTopColor: "var(--mx-paper)",
                      }}
                    />
                    Submitting…
                  </span>
                ) : (
                  "Submit request"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Review
// ---------------------------------------------------------------------------

function StepReview({
  blueprint,
  roleName,
  onBack,
  onRowRemove,
  onExport,
  exporting,
}: {
  blueprint: StrawManResponse
  roleName: string
  onBack: () => void
  onRowRemove: (id: string) => void
  onExport: () => void
  exporting: boolean
}) {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <section className="mx-card mb-6" style={{ padding: 24 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mx-eyebrow mb-2">Assessment blueprint</p>
            <h2
              style={{
                fontFamily: "var(--mx-font-display)",
                fontSize: 26,
                letterSpacing: "-0.018em",
                lineHeight: 1.1,
                color: "var(--mx-ink)",
              }}
            >
              {blueprint.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(15,40,65,0.10)",
                  color: "var(--mx-forest)",
                  textTransform: "capitalize",
                }}
              >
                {blueprint.seniority_level} level
              </span>
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(15,40,65,0.10)",
                  color: "var(--mx-forest)",
                  textTransform: "capitalize",
                }}
              >
                {blueprint.purpose === "360"
                  ? "360° Feedback"
                  : blueprint.purpose}
              </span>
              <span
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  color: "var(--mx-ink-2)",
                }}
              >
                {blueprint.rows.length} competenc
                {blueprint.rows.length === 1 ? "y" : "ies"}
              </span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="mx-pill flex flex-shrink-0 items-center gap-1.5"
            style={{ fontSize: 11 }}
          >
            <IconArrowLeft size={12} stroke={1.8} />
            Edit
          </button>
        </div>

        <div
          className="mt-4 flex flex-wrap gap-3 border-t pt-4"
          style={{ borderColor: "var(--mx-line)" }}
        >
          <button
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-[999px] px-4 py-2 transition-all"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 12,
              fontWeight: 500,
              background: "var(--mx-paper)",
              border: "1px solid var(--mx-forest)",
              color: "var(--mx-forest)",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? (
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full"
                style={{
                  border: "2px solid rgba(15,40,65,0.25)",
                  borderTopColor: "var(--mx-forest)",
                }}
              />
            ) : (
              <IconDownload size={13} stroke={1.8} />
            )}
            {exporting ? "Generating…" : "Download Excel"}
          </button>

          <button
            onClick={() => setShowModal(true)}
            disabled={blueprint.rows.length === 0}
            className="inline-flex items-center gap-2 rounded-[999px] px-4 py-2 transition-all"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 12,
              fontWeight: 500,
              background: "var(--mx-forest)",
              color: "var(--mx-paper)",
              boxShadow: "var(--mx-shadow-card)",
              opacity: blueprint.rows.length === 0 ? 0.5 : 1,
            }}
          >
            <IconMailForward size={13} stroke={1.8} />
            Request measurement plan
          </button>
        </div>
      </section>

      {/* Rows */}
      <div className="space-y-3">
        {blueprint.rows.map((row, i) => (
          <BlueprintRow
            key={row.competency_id}
            row={row}
            index={i}
            onRemove={() => onRowRemove(row.competency_id)}
          />
        ))}
      </div>

      {blueprint.rows.length === 0 && (
        <div
          className="mx-card p-10 text-center"
          style={{
            fontFamily: "var(--mx-font-sans)",
            fontSize: 13,
            color: "var(--mx-ink-3)",
          }}
        >
          All rows removed. Go back to regenerate.
        </div>
      )}

      {showModal && (
        <RequestModal
          blueprint={blueprint}
          roleName={roleName}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StrawManPage() {
  const searchParams = useSearchParams()

  const [form, setForm] = useState<StrawManRequest>({
    role_title: null,
    initiative: null,
    competency_ids: null,
    seniority_level: "mid",
    purpose: "development",
  })

  const [selectedCompIds, setSelectedCompIds] = useState<Set<string>>(new Set())
  const [frameworks, setFrameworks] = useState<CompetencyFrameworkListItem[]>([])
  const [allComps, setAllComps] = useState<CompetencyListItem[]>([])

  const [loading, setLoading] = useState(false)
  const [blueprint, setBlueprint] = useState<StrawManResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const compId = searchParams.get("competency")
    if (compId) setSelectedCompIds(new Set([compId]))
  }, [searchParams])

  useEffect(() => {
    Promise.all([getCompetencyFrameworks(), getCompetencies()])
      .then(([fws, comps]) => {
        setFrameworks(fws)
        setAllComps(comps)
      })
      .catch(() => {})
  }, [])

  const handleCompToggle = useCallback((id: string) => {
    setSelectedCompIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const body: StrawManRequest = {
        ...form,
        competency_ids:
          selectedCompIds.size > 0 ? Array.from(selectedCompIds) : null,
      }
      const result = await generateStrawMan(body)
      setBlueprint(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  const handleRowRemove = (competencyId: string) => {
    if (!blueprint) return
    setBlueprint({
      ...blueprint,
      rows: blueprint.rows.filter((r) => r.competency_id !== competencyId),
    })
  }

  const handleExport = async () => {
    if (!blueprint) return
    setExporting(true)
    try {
      const body: StrawManRequest = {
        ...form,
        competency_ids: blueprint.rows.map((r) => r.competency_id),
      }
      const blob = await exportStrawMan(body)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const role = form.role_title || form.initiative || "Blueprint"
      a.download = `Metricly_Assessment_Blueprint_${role.replace(/\s+/g, "_")}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Export failed. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen pb-20">
      {/* No page-bg override — atelier washes show through from <html>. */}
      <Header pageTitle="Blueprint Generator" />

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Subpage hero — light cream card */}
        <section className="mx-hero mb-6" style={{ padding: "28px 32px" }}>
          <p className="mx-eyebrow mb-2">Plan an assessment</p>
          <h1 className="mx-h2" style={{ fontSize: 32, lineHeight: 1.1 }}>
            Blueprint <em className="mx-text-grad-warm">generator.</em>
          </h1>
          <p className="mx-caption mt-2 max-w-xl" style={{ fontSize: 13 }}>
            Generate a structured blueprint with competencies, proficiency
            targets, and instrument recommendations.
          </p>
        </section>

        {error && (
          <div
            className="mb-4 rounded-[14px] px-4 py-3"
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
        )}

        {!blueprint ? (
          <StepInput
            form={form}
            onChange={(updates) => setForm((prev) => ({ ...prev, ...updates }))}
            onSubmit={handleSubmit}
            loading={loading}
            frameworks={frameworks}
            allComps={allComps}
            selectedCompIds={selectedCompIds}
            onCompToggle={handleCompToggle}
          />
        ) : (
          <StepReview
            blueprint={blueprint}
            roleName={form.role_title || form.initiative || "Assessment"}
            onBack={() => setBlueprint(null)}
            onRowRemove={handleRowRemove}
            onExport={handleExport}
            exporting={exporting}
          />
        )}
      </main>
    </div>
  )
}
