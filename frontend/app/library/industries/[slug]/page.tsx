"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Header from "@/components/Header"
import CollectionTray from "@/components/CollectionTray"
import { useCollection } from "@/lib/useCollection"
import type { CollectionItem } from "@/lib/useCollection"
import { deployInstrument, getIndustryDetail } from "@/lib/api"
import type { IndustryDetailOut, IndustryInstrumentOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RelevanceDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i <= score ? "#7c3aed" : "rgba(91,33,182,0.15)" }}
        />
      ))}
    </div>
  )
}

function LicenseBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open:          { label: "Open",          bg: "rgba(34,197,94,0.1)",  color: "#16a34a" },
    public_domain: { label: "Public Domain", bg: "rgba(59,130,246,0.1)", color: "#3777A8" },
    proprietary:   { label: "Proprietary",   bg: "rgba(91,33,182,0.1)",  color: "#5b21b6" },
  }
  const s = map[type] ?? map.open
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Instrument card with collection + deploy
// ---------------------------------------------------------------------------

interface InstrumentCardProps {
  inst: IndustryInstrumentOut
  inCollection: boolean
  onToggle: (item: CollectionItem) => void
}

function InstrumentCard({ inst, inCollection, onToggle }: InstrumentCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  const collectionItem: CollectionItem = {
    id: inst.id,
    name: inst.name,
    short_name: inst.short_name,
  }

  async function handleDeployOne(e: React.MouseEvent) {
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
        background: inCollection ? "rgba(91,33,182,0.06)" : "rgba(255,255,255,0.65)",
        border: inCollection ? "0.5px solid rgba(91,33,182,0.22)" : "0.5px solid rgba(255,255,255,0.8)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header row — click to expand detail */}
      <button
        className="w-full px-5 py-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: "#1e1b4b" }}>{inst.name}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
              >
                {inst.short_name}
              </span>
              <LicenseBadge type={inst.license_type} />
            </div>
            {inst.construct_measured && (
              <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
                {inst.construct_measured}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RelevanceDots score={inst.relevance_score} />
            <svg
              className="h-4 w-4 transition-transform"
              style={{
                color: "rgba(30,27,75,0.35)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
          <span>{inst.total_items} items</span>
          {inst.estimated_minutes && <span>~{inst.estimated_minutes} min</span>}
          {inst.reliability_alpha !== null && (
            <span>α = {inst.reliability_alpha.toFixed(2)}</span>
          )}
          {inst.subscale_count > 0 && <span>{inst.subscale_count} subscales</span>}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div
          className="border-t px-5 py-4 space-y-3"
          style={{ borderColor: "rgba(91,33,182,0.08)" }}
        >
          {inst.description && (
            <p className="text-xs leading-relaxed" style={{ color: "rgba(30,27,75,0.65)" }}>
              {inst.description}
            </p>
          )}
          {inst.use_case_note && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "rgba(91,33,182,0.05)", color: "rgba(30,27,75,0.7)" }}
            >
              <span className="font-semibold">Industry use case: </span>
              {inst.use_case_note}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(30,27,75,0.06)", color: "rgba(30,27,75,0.6)" }}
            >
              {inst.response_format.replace("likert", "Likert ").replace("5", "1–5").replace("7", "1–7")}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(30,27,75,0.06)", color: "rgba(30,27,75,0.6)" }}
            >
              {inst.scoring_type} scoring
            </span>
          </div>
        </div>
      )}

      {/* Action row — always visible */}
      <div
        className="flex items-center gap-2 border-t px-5 py-3"
        style={{ borderColor: "rgba(91,33,182,0.06)" }}
      >
        <button
          onClick={() => onToggle(collectionItem)}
          className="flex-1 rounded-full py-1.5 text-xs font-bold transition-all"
          style={inCollection ? {
            background: "rgba(34,197,94,0.12)",
            color: "#16a34a",
            border: "0.5px solid rgba(34,197,94,0.3)",
          } : {
            background: "rgba(91,33,182,0.08)",
            color: "#5b21b6",
          }}
        >
          {inCollection ? "✓ Added" : "+ Add to Collection"}
        </button>
        <button
          onClick={handleDeployOne}
          disabled={deploying}
          className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "0.5px solid rgba(91,33,182,0.15)",
            color: "rgba(30,27,75,0.6)",
          }}
        >
          {deploying ? "…" : "Deploy"}
        </button>
      </div>

      {deployError && (
        <p className="px-5 pb-3 text-[11px]" style={{ color: "#dc2626" }}>{deployError}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IndustryDetailPage() {
  const params = useParams()
  const slug = params.slug as string

  const { list, toggle, remove, clear, isInCollection } = useCollection()
  const [detail, setDetail] = useState<IndustryDetailOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    getIndustryDetail(slug)
      .then(setDetail)
      .catch(() => setError("Industry not found."))
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0eeff 0%, #e8f4ff 100%)" }}>
      <Header backHref="/library/industries" backLabel="Industry Library" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-36">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-xl px-5 py-4 text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {detail && (
          <>
            {/* Page header */}
            <div className="mb-8">
              <div
                className="mb-3 h-1.5 w-16 rounded-full"
                style={{ background: detail.color_hex ?? "linear-gradient(135deg, #5b21b6, #7c3aed)" }}
              />
              <h1 className="text-2xl font-bold font-playfair" style={{ color: "#1e1b4b" }}>
                {detail.name}
              </h1>
              {detail.description && (
                <p className="mt-2 text-sm" style={{ color: "rgba(30,27,75,0.6)" }}>
                  {detail.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
                >
                  {detail.instruments.length} instruments
                </span>
                {list.length > 0 && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}
                  >
                    {list.length} in collection
                  </span>
                )}
                <Link href="/library/industries" className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
                  ← All industries
                </Link>
              </div>
            </div>

            {/* Relevance legend */}
            <div
              className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs rounded-xl px-4 py-2.5"
              style={{ background: "rgba(255,255,255,0.5)", color: "rgba(30,27,75,0.5)" }}
            >
              <span className="font-medium">Relevance:</span>
              <RelevanceDots score={5} />
              <span>= core instrument</span>
              <span>·</span>
              <RelevanceDots score={3} />
              <span>= supporting</span>
              <span className="ml-auto text-[10px]">
                Add to collection → batch deploy as one survey
              </span>
            </div>

            {/* Instrument list */}
            <div className="space-y-3">
              {detail.instruments.map(inst => (
                <InstrumentCard
                  key={inst.id}
                  inst={inst}
                  inCollection={isInCollection(inst.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <CollectionTray list={list} onRemove={remove} onClear={clear} />
    </div>
  )
}
