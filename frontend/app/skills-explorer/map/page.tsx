"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import CollectionTrayComponent from "@/components/CollectionTray"
import { useCollection } from "@/lib/useCollection"
import type { CollectionItem } from "@/lib/useCollection"
import { deployInstrument, getIndustryInstruments, getLibrary, requestAssessment } from "@/lib/api"
import type { IndustryInstrumentOut, InstrumentListItem, LibraryGrouped, SkillsProfile } from "@/lib/types"

// ---------------------------------------------------------------------------
// Theme grouping — map library categories → up to 3 thematic clusters
// ---------------------------------------------------------------------------

const CATEGORY_TO_THEME: Record<string, string> = {
  "Leadership":             "Leadership & Management",
  "Team Effectiveness":     "Team & Culture",
  "Well-being":             "Team & Culture",
  "Organizational Health":  "Team & Culture",
  "Personality":            "Individual Performance",
  "Skills & Competencies":  "Individual Performance",
  "Cognitive":              "Individual Performance",
}

const THEME_COLORS: Record<string, { bg: string; border: string; accent: string; pill: string }> = {
  "Leadership & Management": {
    bg: "rgba(15,40,65,0.05)",
    border: "rgba(15,40,65,0.18)",
    accent: "#0F2841",
    pill: "rgba(15,40,65,0.1)",
  },
  "Team & Culture": {
    bg: "rgba(5,150,105,0.05)",
    border: "rgba(5,150,105,0.18)",
    accent: "#7E8A55",
    pill: "rgba(5,150,105,0.1)",
  },
  "Individual Performance": {
    bg: "rgba(217,119,6,0.05)",
    border: "rgba(217,119,6,0.18)",
    accent: "#E2B146",
    pill: "rgba(217,119,6,0.1)",
  },
}

const THEME_ICONS: Record<string, React.ReactNode> = {
  "Leadership & Management": (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  "Team & Culture": (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  "Individual Performance": (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
}

const THEME_DESCRIPTIONS: Record<string, string> = {
  "Leadership & Management":
    "Measures leadership quality, manager effectiveness, and the dynamics between leaders and their teams.",
  "Team & Culture":
    "Captures psychological safety, engagement, burnout risk, and the team conditions that drive performance and retention.",
  "Individual Performance":
    "Evaluates personality traits, resilience, self-efficacy, and cognitive styles that predict individual performance and fit.",
}

interface ThemeGroup {
  name: string
  instruments: InstrumentListItem[]
}

function groupByTheme(
  recommendedSkills: string[],
  library: LibraryGrouped,
): ThemeGroup[] {
  const recSet = new Set(recommendedSkills.map(s => s.toLowerCase()))

  // Collect all matching instruments with their category
  const matches: { inst: InstrumentListItem; theme: string }[] = []
  for (const group of library.categories) {
    const theme = CATEGORY_TO_THEME[group.category.name] ?? "Individual Performance"
    for (const inst of group.instruments) {
      if (
        recSet.has(inst.short_name.toLowerCase()) ||
        recSet.has(inst.name.toLowerCase())
      ) {
        matches.push({ inst, theme })
      }
    }
  }

  // Group by theme
  const themeMap: Record<string, InstrumentListItem[]> = {}
  for (const { inst, theme } of matches) {
    themeMap[theme] = themeMap[theme] ?? []
    themeMap[theme].push(inst)
  }

  // If no recommended skills matched the library, fall back to showing
  // all library instruments grouped by the first 3 categories
  if (Object.keys(themeMap).length === 0) {
    const fallback: Record<string, InstrumentListItem[]> = {}
    for (const group of library.categories.slice(0, 3)) {
      const theme = CATEGORY_TO_THEME[group.category.name] ?? group.category.name
      fallback[theme] = group.instruments.slice(0, 4)
    }
    return Object.entries(fallback).map(([name, instruments]) => ({ name, instruments }))
  }

  // Order: Leadership first, then Team, then Individual
  const ORDER = ["Leadership & Management", "Team & Culture", "Individual Performance"]
  return ORDER.filter(t => themeMap[t]?.length).map(t => ({ name: t, instruments: themeMap[t] }))
}

// ---------------------------------------------------------------------------
// Category color helper (for instrument badges)
// ---------------------------------------------------------------------------

const CAT_COLORS: Record<string, string> = {
  "Leadership": "#0F2841",
  "Well-being": "#7E8A55",
  "Personality": "#E2B146",
  "Team Effectiveness": "#2A5BA8",
  "Skills & Competencies": "#0891b2",
  "Cognitive": "#9333ea",
  "Organizational Health": "#db2777",
}

function catColor(name: string | null | undefined): string {
  return CAT_COLORS[name ?? ""] ?? "#6366f1"
}

// ---------------------------------------------------------------------------
// InstrumentCard — shown in the expanded theme section
// ---------------------------------------------------------------------------

interface InstrumentCardProps {
  inst: InstrumentListItem
  contextSummary: string
  inCollection: boolean
  onAddRemove: (item: CollectionItem) => void
  accentColor: string
}

function InstrumentCard({ inst, contextSummary, inCollection, onAddRemove, accentColor }: InstrumentCardProps) {

  return (
    <div
      className="rounded-[14px] p-5 flex flex-col gap-4"
      style={{
        background: "rgba(255,255,255,0.65)",
        border: "0.5px solid rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-sm leading-snug" style={{ color: "#0A1E33" }}>
            {inst.name}
          </h4>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: "rgba(10,30,51,0.4)" }}>
            {inst.short_name}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 justify-end">
          {inst.category_name && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
              style={{ background: catColor(inst.category_name) }}
            >
              {inst.category_name}
            </span>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold"
            style={{
              background: inst.is_proprietary ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
              color: inst.is_proprietary ? "#DD6334" : "#7E8A55",
            }}
          >
            {inst.license_type}
          </span>
        </div>
      </div>

      {/* Why it fits */}
      {inst.construct_measured && (
        <div
          className="rounded-xl p-3"
          style={{ background: `rgba(${accentColor === "#0F2841" ? "91,33,182" : accentColor === "#7E8A55" ? "5,150,105" : "217,119,6"},0.05)` }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: accentColor, opacity: 0.8 }}>
            Why this fits your needs
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(10,30,51,0.75)" }}>
            {inst.construct_measured}
          </p>
        </div>
      )}

      {/* Psychometric properties */}
      <div className="flex items-center gap-4 text-xs">
        <div>
          <span className="label-caps block">Items</span>
          <span className="font-semibold" style={{ color: "#0A1E33" }}>{inst.total_items}</span>
        </div>
        {inst.estimated_minutes && (
          <div>
            <span className="label-caps block">Time</span>
            <span className="font-semibold" style={{ color: "#0A1E33" }}>{inst.estimated_minutes} min</span>
          </div>
        )}
        {inst.reliability_alpha !== null && inst.reliability_alpha !== undefined && (
          <div>
            <span className="label-caps block">α</span>
            <span className="font-semibold" style={{ color: "#0A1E33" }}>{inst.reliability_alpha.toFixed(2)}</span>
          </div>
        )}
        <div>
          <span className="label-caps block">Format</span>
          <span className="font-semibold" style={{ color: "#0A1E33" }}>{inst.response_format}</span>
        </div>
      </div>

      {/* Add to collection */}
      <button
        onClick={() => onAddRemove({ id: inst.id, name: inst.name, short_name: inst.short_name })}
        className="w-full rounded-xl py-2.5 text-sm font-bold transition-all"
        style={inCollection ? {
          background: "rgba(34,197,94,0.1)",
          border: "0.5px solid rgba(34,197,94,0.3)",
          color: "#7E8A55",
        } : {
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
          color: "#fff",
          boxShadow: `0 2px 10px ${accentColor}40`,
        }}
      >
        {inCollection ? "✓ Added to Collection" : "+ Add to Collection"}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme card
// ---------------------------------------------------------------------------

interface ThemeCardProps {
  theme: ThemeGroup
  expanded: boolean
  onExpand: () => void
  contextSummary: string
  isInCollection: (id: string) => boolean
  onAddRemove: (item: CollectionItem) => void
}

function ThemeCard({ theme, expanded, onExpand, contextSummary, isInCollection, onAddRemove }: ThemeCardProps) {
  const colors = THEME_COLORS[theme.name] ?? THEME_COLORS["Individual Performance"]
  const description = THEME_DESCRIPTIONS[theme.name] ?? ""
  const preview = theme.instruments.slice(0, 2).map(i => i.short_name).join(", ")
  const extra = theme.instruments.length > 2 ? ` +${theme.instruments.length - 2} more` : ""

  return (
    <div
      className="flex flex-col rounded-[18px] p-6 transition-all"
      style={{
        background: expanded
          ? "rgba(255,255,255,0.8)"
          : `linear-gradient(145deg, ${colors.bg.replace("0.05", "0.06")}, rgba(255,255,255,0.5))`,
        border: `0.5px solid ${expanded ? colors.accent + "40" : colors.border}`,
        backdropFilter: "blur(12px)",
        boxShadow: expanded ? `0 4px 24px ${colors.accent}18` : "none",
      }}
    >
      {/* Icon + name */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{ background: colors.pill, color: colors.accent }}
          >
            {THEME_ICONS[theme.name]}
          </div>
          <div>
            <h3 className="text-base font-bold leading-tight" style={{ color: "#0A1E33" }}>
              {theme.name}
            </h3>
            <p className="mt-0.5 text-[10px] font-semibold" style={{ color: colors.accent }}>
              {theme.instruments.length} instrument{theme.instruments.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(10,30,51,0.65)" }}>
        {description}
      </p>

      {/* Preview names */}
      <p className="text-xs mb-5" style={{ color: "rgba(10,30,51,0.4)" }}>
        <span className="font-semibold" style={{ color: "rgba(10,30,51,0.6)" }}>Includes: </span>
        {preview}{extra}
      </p>

      <button
        onClick={onExpand}
        className="mt-auto flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        style={expanded ? {
          background: colors.pill,
          color: colors.accent,
        } : {
          background: "rgba(255,255,255,0.6)",
          border: `0.5px solid ${colors.border}`,
          color: colors.accent,
        }}
      >
        {expanded ? "Collapse" : "Explore →"}
        <svg
          className="h-4 w-4 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded instrument cards */}
      {expanded && (
        <div
          className="mt-6 grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {theme.instruments.map(inst => (
            <InstrumentCard
              key={inst.id}
              inst={inst}
              contextSummary={contextSummary}
              inCollection={isInCollection(inst.id)}
              onAddRemove={onAddRemove}
              accentColor={colors.accent}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Not-in-library card
// ---------------------------------------------------------------------------

interface NotInLibraryCardProps {
  skillName: string
  requestState: "idle" | "requesting" | "sent"
  onRequest: () => void
}

function NotInLibraryCard({ skillName, requestState, onRequest }: NotInLibraryCardProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-[14px] p-4"
      style={{
        background: "rgba(255,255,255,0.45)",
        border: "0.5px dashed rgba(15,40,65,0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "rgba(15,40,65,0.08)" }}
      >
        <svg className="h-4 w-4" style={{ color: "rgba(15,40,65,0.4)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#0A1E33" }}>{skillName}</p>
        <span
          className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold"
          style={{ background: "rgba(10,30,51,0.06)", color: "rgba(10,30,51,0.4)" }}
        >
          Not yet available
        </span>
      </div>
      {requestState === "sent" ? (
        <div className="shrink-0 text-center">
          <p className="text-xs font-bold" style={{ color: "#7E8A55" }}>✓ Requested</p>
          <p className="text-[10px]" style={{ color: "rgba(10,30,51,0.4)" }}>We'll notify you</p>
        </div>
      ) : (
        <button
          onClick={onRequest}
          disabled={requestState === "requesting"}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50"
          style={{
            background: "rgba(15,40,65,0.1)",
            color: "#0F2841",
            border: "0.5px solid rgba(15,40,65,0.2)",
          }}
        >
          {requestState === "requesting" ? "Sending…" : "Request Assessment"}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Industry-specific card (4th card — amber theme)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Industry instrument row — shown inside IndustryCard when expanded
// ---------------------------------------------------------------------------

interface IndustryInstrumentRowProps {
  inst: IndustryInstrumentOut
  inCollection: boolean
  onToggle: (item: CollectionItem) => void
}

function IndustryInstrumentRow({ inst, inCollection, onToggle }: IndustryInstrumentRowProps) {
  const router = useRouter()
  const accent = "#E2B146"
  const pill = "rgba(217,119,6,0.1)"
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  async function handleDeploy(e: React.MouseEvent) {
    e.stopPropagation()
    setDeploying(true)
    setDeployError(null)
    try {
      const result = await deployInstrument(inst.id, { item_ids: null })
      router.push(`/surveys/${result.survey_id}/edit`)
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err))
      setDeploying(false)
    }
  }

  return (
    <div
      className="rounded-2xl transition-all duration-200"
      style={{
        background: inCollection ? "rgba(217,119,6,0.06)" : "rgba(255,255,255,0.65)",
        border: inCollection ? "0.5px solid rgba(217,119,6,0.22)" : "0.5px solid rgba(255,255,255,0.8)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Info section */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: "#0A1E33" }}>{inst.name}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: pill, color: accent }}
              >
                {inst.short_name}
              </span>
            </div>
            {inst.construct_measured && (
              <p className="mt-0.5 text-xs" style={{ color: "rgba(10,30,51,0.5)" }}>{inst.construct_measured}</p>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= inst.relevance_score ? accent : "rgba(217,119,6,0.15)" }} />
            ))}
          </div>
        </div>
        {inst.use_case_note && (
          <p className="mt-1.5 text-xs italic" style={{ color: "rgba(10,30,51,0.55)" }}>{inst.use_case_note}</p>
        )}
        <div className="mt-2 flex gap-3 text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>
          <span>{inst.total_items} items</span>
          {inst.estimated_minutes && <span>~{inst.estimated_minutes} min</span>}
          {inst.reliability_alpha !== null && <span>α = {inst.reliability_alpha?.toFixed(2)}</span>}
        </div>
      </div>

      {/* Action row */}
      <div
        className="flex items-center gap-2 border-t px-4 py-2.5"
        style={{ borderColor: "rgba(217,119,6,0.08)" }}
      >
        <button
          onClick={() => onToggle({ id: inst.id, name: inst.name, short_name: inst.short_name })}
          className="flex-1 rounded-full py-1.5 text-xs font-bold transition-all"
          style={inCollection ? {
            background: "rgba(34,197,94,0.12)",
            color: "#7E8A55",
            border: "0.5px solid rgba(34,197,94,0.3)",
          } : {
            background: "rgba(217,119,6,0.08)",
            color: accent,
          }}
        >
          {inCollection ? "✓ Added" : "+ Add to Collection"}
        </button>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "0.5px solid rgba(217,119,6,0.15)",
            color: "rgba(10,30,51,0.6)",
          }}
        >
          {deploying ? "…" : "Deploy"}
        </button>
      </div>

      {deployError && (
        <p className="px-4 pb-2.5 text-[11px]" style={{ color: "#DD6334" }}>{deployError}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Industry-specific card (4th card — amber theme)
// ---------------------------------------------------------------------------

interface IndustryCardProps {
  industryName: string
  slug: string
  instruments: IndustryInstrumentOut[]
  expanded: boolean
  onExpand: () => void
  isInCollection: (id: string) => boolean
  onToggle: (item: CollectionItem) => void
}

function IndustryCard({ industryName, slug, instruments, expanded, onExpand, isInCollection, onToggle }: IndustryCardProps) {
  const accent = "#E2B146"
  const bg = "rgba(217,119,6,0.05)"
  const border = "rgba(217,119,6,0.18)"
  const pill = "rgba(217,119,6,0.1)"
  const preview = instruments.slice(0, 2).map(i => i.short_name).join(", ")
  const extra = instruments.length > 2 ? ` +${instruments.length - 2} more` : ""

  return (
    <div
      className="flex flex-col rounded-[18px] p-6 transition-all"
      style={{
        background: expanded ? "rgba(255,255,255,0.8)" : `linear-gradient(145deg, ${bg}, rgba(255,255,255,0.5))`,
        border: `0.5px solid ${expanded ? accent + "40" : border}`,
        backdropFilter: "blur(12px)",
        boxShadow: expanded ? `0 4px 24px ${accent}18` : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{ background: pill, color: accent }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold leading-tight" style={{ color: "#0A1E33" }}>
              Industry-Specific Scales
            </h3>
            <p className="mt-0.5 text-[10px] font-semibold" style={{ color: accent }}>
              {instruments.length} instruments · {industryName}
            </p>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ background: pill, color: accent }}
        >
          Industry
        </span>
      </div>

      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(10,30,51,0.65)" }}>
        Validated instruments tailored to the {industryName} sector — curated for context-specific psychological measurement.
      </p>

      <p className="text-xs mb-5" style={{ color: "rgba(10,30,51,0.4)" }}>
        <span className="font-semibold" style={{ color: "rgba(10,30,51,0.6)" }}>Includes: </span>
        {preview}{extra}
      </p>

      <button
        onClick={onExpand}
        className="mt-auto flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        style={expanded ? { background: pill, color: accent } : {
          background: "rgba(255,255,255,0.6)",
          border: `0.5px solid ${border}`,
          color: accent,
        }}
      >
        {expanded ? "Collapse" : "Explore →"}
        <svg
          className="h-4 w-4 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-6 space-y-3">
          {instruments.map(inst => (
            <IndustryInstrumentRow
              key={inst.id}
              inst={inst}
              inCollection={isInCollection(inst.id)}
              onToggle={onToggle}
            />
          ))}
          <a
            href={`/library/industries/${slug}`}
            className="block text-center text-xs font-semibold mt-3 py-2 rounded-xl transition-all"
            style={{ background: pill, color: accent }}
          >
            Browse full {industryName} library →
          </a>
        </div>
      )}
    </div>
  )
}

// (CollectionTray is now the shared component from @/components/CollectionTray)

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsMapPage() {
  const [library, setLibrary] = useState<LibraryGrouped | null>(null)
  const [profile, setProfile] = useState<SkillsProfile | null>(null)
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null)
  const [requestStates, setRequestStates] = useState<Record<string, "idle" | "requesting" | "sent">>({})
  const [industryInstruments, setIndustryInstruments] = useState<IndustryInstrumentOut[]>([])
  const [industryName, setIndustryName] = useState<string>("")

  const { list, toggle: handleAddRemove, remove, clear, isInCollection } = useCollection()

  useEffect(() => {
    const stored = sessionStorage.getItem("skills_profile")
    if (stored) {
      try {
        const parsed: SkillsProfile = JSON.parse(stored)
        setProfile(parsed)
        if (parsed.industry_detected) {
          getIndustryInstruments(parsed.industry_detected)
            .then(setIndustryInstruments)
            .catch(() => {})
          setIndustryName(
            parsed.industry_detected
              .split("-")
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          )
        }
      } catch { /* ignore */ }
    }
    getLibrary().then(setLibrary).catch(() => {})
  }, [])

  async function handleRequest(skillName: string) {
    setRequestStates(prev => ({ ...prev, [skillName]: "requesting" }))
    try {
      await requestAssessment(skillName, profile?.context_summary ?? undefined)
      setRequestStates(prev => ({ ...prev, [skillName]: "sent" }))
    } catch {
      const subject = encodeURIComponent(`Metricly — Skills Assessment Request: ${skillName}`)
      const body = encodeURIComponent(
        `Hi,\n\nI'd like to request the following assessment be added to the Metricly library:\n\n${skillName}\n\nContext:\n${profile?.context_summary ?? "N/A"}`
      )
      window.open(`mailto:yelfeki@vt.edu?subject=${subject}&body=${body}`)
      setRequestStates(prev => ({ ...prev, [skillName]: "sent" }))
    }
  }

  const themes = library && profile
    ? groupByTheme(profile.recommended_skills ?? [], library)
    : []

  const notInLibrary = profile?.skills_not_in_library ?? []

  return (
    <>
      <style>{`
        @keyframes page-fadein {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="min-h-screen flex flex-col">
        <Header />

        {/* Progress bar */}
        <div
          className="border-b px-6 py-2 sticky top-14 z-10"
          style={{
            background: "rgba(240,238,255,0.85)",
            borderColor: "rgba(255,255,255,0.4)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center gap-1.5">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                    style={step <= 2 ? {
                      background: "linear-gradient(135deg, #0F2841, #2A5BA8)",
                      color: "#fff",
                    } : {
                      background: "rgba(15,40,65,0.08)",
                      color: "rgba(10,30,51,0.3)",
                      border: "0.5px solid rgba(15,40,65,0.15)",
                    }}
                  >
                    {step < 2 ? "✓" : step}
                  </div>
                  {step < 3 && (
                    <div className="h-px w-8" style={{ background: step < 2 ? "#0F2841" : "rgba(15,40,65,0.15)" }} />
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs font-semibold" style={{ color: "#0F2841" }}>
              Step 2 of 3 — Your Skills Assessment Plan
            </span>
          </div>
        </div>

        {/* Page content */}
        <div
          className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10 pb-32"
          style={{ animation: "page-fadein 0.4s ease-out forwards" }}
        >

          {/* Hero header */}
          <div>
            <p className="eyebrow mb-2">Skills Assessment Plan</p>
            <h1 className="page-title">Your Skills Assessment Plan</h1>
            {profile?.context_summary && (
              <p className="mt-3 text-sm leading-relaxed max-w-2xl" style={{ color: "rgba(10,30,51,0.6)" }}>
                {profile.context_summary}
              </p>
            )}
          </div>

          {/* Loading state */}
          {!library && (
            <div className="flex items-center gap-3 py-8">
              <svg className="h-5 w-5 animate-spin" style={{ color: "#0F2841" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>Loading your assessment plan…</span>
            </div>
          )}

          {/* Theme cards */}
          {themes.length > 0 && (
            <section className="space-y-4">
              <h2 className="section-heading">Recommended Assessments</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map(theme => (
                  <ThemeCard
                    key={theme.name}
                    theme={theme}
                    expanded={expandedTheme === theme.name}
                    onExpand={() => setExpandedTheme(prev => prev === theme.name ? null : theme.name)}
                    contextSummary={profile?.context_summary ?? ""}
                    isInCollection={isInCollection}
                    onAddRemove={handleAddRemove}
                  />
                ))}
                {industryInstruments.length > 0 && (
                  <IndustryCard
                    industryName={industryName}
                    slug={profile?.industry_detected ?? ""}
                    instruments={industryInstruments}
                    expanded={expandedTheme === "__industry__"}
                    onExpand={() => setExpandedTheme(prev => prev === "__industry__" ? null : "__industry__")}
                    isInCollection={isInCollection}
                    onToggle={handleAddRemove}
                  />
                )}
              </div>

              {/* Expanded instrument grid — shows below cards when a theme is open */}
              {expandedTheme && (() => {
                const theme = themes.find(t => t.name === expandedTheme)
                if (!theme) return null
                const colors = THEME_COLORS[theme.name] ?? THEME_COLORS["Individual Performance"]
                return (
                  <div
                    className="rounded-[18px] p-6"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      border: `0.5px solid ${colors.border}`,
                      backdropFilter: "blur(12px)",
                      animation: "page-fadein 0.25s ease-out forwards",
                    }}
                  >
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="section-heading">{theme.name}</h3>
                      <button
                        onClick={() => setExpandedTheme(null)}
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{ background: "rgba(10,30,51,0.06)" }}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {theme.instruments.map(inst => (
                        <InstrumentCard
                          key={inst.id}
                          inst={inst}
                          contextSummary={profile?.context_summary ?? ""}
                          inCollection={isInCollection(inst.id)}
                          onAddRemove={handleAddRemove}
                          accentColor={colors.accent}
                        />
                      ))}
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

          {/* Not in library section */}
          {notInLibrary.length > 0 && (
            <section>
              <div className="mb-4">
                <h2 className="section-heading">Also Recommended — Not Yet in Library</h2>
                <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.45)" }}>
                  These instruments were recommended for your context but aren't in our library yet. Request them and we'll prioritize adding them.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {notInLibrary.map(skillName => (
                  <NotInLibraryCard
                    key={skillName}
                    skillName={skillName}
                    requestState={requestStates[skillName] ?? "idle"}
                    onRequest={() => handleRequest(skillName)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Collection tray */}
        <CollectionTrayComponent
          list={list}
          onRemove={remove}
          onClear={clear}
        />
      </div>
    </>
  )
}
