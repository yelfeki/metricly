"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Header from "@/components/Header"
import { getInstrument, deployInstrument } from "@/lib/api"
import type { InstrumentOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LicenseBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open:          { label: "Open Access",    bg: "rgba(34,197,94,0.1)",  color: "#16a34a" },
    public_domain: { label: "Public Domain",  bg: "rgba(59,130,246,0.1)", color: "#2563eb" },
    proprietary:   { label: "Metricly",       bg: "rgba(91,33,182,0.1)",  color: "#5b21b6" },
  }
  const s = map[type] ?? map.open
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
      <span className="label-caps w-36 shrink-0 mt-0.5">{label}</span>
      <span className="text-sm" style={{ color: "#1e1b4b" }}>{String(value)}</span>
    </div>
  )
}

function FormatLabel(format: string) {
  const labels: Record<string, string> = {
    likert5: "Likert 1–5",
    likert7: "Likert 1–7 (or 0–6 for UWES)",
    forced_choice: "Forced Choice",
    other: "Mixed Format",
  }
  return labels[format] ?? format
}

function ScoringLabel(type: string) {
  const labels: Record<string, string> = {
    sum: "Sum score",
    mean: "Mean score",
    subscale: "Subscale scores",
  }
  return labels[type] ?? type
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InstrumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [instrument, setInstrument] = useState<InstrumentOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getInstrument(id)
      .then(setInstrument)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDeployAll() {
    setDeploying(true); setDeployError(null)
    try {
      const result = await deployInstrument(id, { item_ids: null })
      router.push(`/surveys/${result.survey_id}/edit`)
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e))
      setDeploying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/library" backLabel="Library" />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>Loading…</div>
      </div>
    )
  }

  if (error || !instrument) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/library" backLabel="Library" />
        <div className="flex flex-1 items-center justify-center">
          <div className="alert-error max-w-sm">{error ?? "Instrument not found."}</div>
        </div>
      </div>
    )
  }

  // Parse languages / validated_populations
  let langs: string[] = []
  let pops: string[] = []
  try { langs = JSON.parse(instrument.languages ?? "[]") } catch { langs = [] }
  try { pops = JSON.parse(instrument.validated_populations ?? "[]") } catch { pops = [] }

  const subscaleMap = Object.fromEntries(instrument.subscales.map(ss => [ss.id, ss.name]))

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/library" backLabel="Library" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-1">{instrument.short_name}</p>
              <h1 className="page-title leading-tight">{instrument.name}</h1>
              {instrument.construct_measured && (
                <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{instrument.construct_measured}</p>
              )}
              <div className="mt-2">
                <LicenseBadge type={instrument.license_type} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={handleDeployAll}
                disabled={deploying}
                className="btn-primary disabled:opacity-50"
              >
                {deploying ? "Deploying…" : "Deploy as Survey"}
              </button>
              <Link
                href={`/library/${id}/customize`}
                className="btn-ghost text-center text-xs"
              >
                Customize Items
              </Link>
            </div>
          </div>

          {deployError && <div className="alert-error mb-4">{deployError}</div>}

          {instrument.description && (
            <p className="mb-6 text-sm leading-relaxed" style={{ color: "rgba(30,27,75,0.6)" }}>
              {instrument.description}
            </p>
          )}

          {/* Quick stats */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Items</p>
              <p className="text-2xl font-bold" style={{ color: "#1e1b4b" }}>{instrument.total_items}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Time</p>
              <p className="text-2xl font-bold" style={{ color: "#1e1b4b" }}>
                {instrument.estimated_minutes ? `${instrument.estimated_minutes}m` : "—"}
              </p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">α reliability</p>
              <p className="text-2xl font-bold" style={{ color: "#5b21b6" }}>
                {instrument.reliability_alpha != null ? instrument.reliability_alpha.toFixed(2) : "—"}
              </p>
            </div>
          </div>

          {/* Psychometric properties */}
          <div className="card mb-6 overflow-hidden">
            <div className="border-b px-5 py-3" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
              <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>Psychometric Properties</p>
            </div>
            <div className="px-5">
              <MetaRow label="Response Format" value={FormatLabel(instrument.response_format)} />
              <MetaRow label="Scoring" value={ScoringLabel(instrument.scoring_type)} />
              {instrument.subscales.length > 0 && (
                <MetaRow label="Subscales" value={instrument.subscales.map(s => s.name).join(" · ")} />
              )}
              <MetaRow label="Languages" value={langs.join(", ")} />
              <MetaRow label="Validated In" value={pops.join(", ")} />
              {instrument.theoretical_framework && (
                <MetaRow label="Framework" value={instrument.theoretical_framework} />
              )}
              {instrument.source_citation && (
                <MetaRow label="Citation" value={instrument.source_citation} />
              )}
            </div>
          </div>

          {/* Subscales */}
          {instrument.subscales.length > 0 && (
            <div className="card mb-6">
              <div className="border-b px-5 py-3" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
                <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>Subscales</p>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
                {instrument.subscales.map(ss => (
                  <div key={ss.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#1e1b4b" }}>{ss.name}</p>
                      {ss.description && (
                        <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>{ss.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>{ss.item_count} items</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          {instrument.items.length > 0 && (
            <div className="card mb-6">
              <div className="border-b px-5 py-3 flex items-center justify-between" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
                <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>Items ({instrument.items.length})</p>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
                {instrument.items.map((item, idx) => {
                  const ssName = item.subscale_id ? subscaleMap[item.subscale_id] : null
                  return (
                    <div key={item.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 shrink-0 text-[10px] font-bold tabular-nums"
                          style={{ color: "rgba(30,27,75,0.3)" }}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="flex-1">
                          <p className="text-xs leading-relaxed" style={{ color: "#1e1b4b" }}>{item.item_text}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {ssName && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
                              >
                                {ssName}
                              </span>
                            )}
                            {item.is_reverse_scored && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}
                              >
                                R
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Deploy CTA */}
          <div
            className="rounded-[14px] p-5 text-center"
            style={{ background: "rgba(91,33,182,0.04)", border: "0.5px solid rgba(91,33,182,0.12)" }}
          >
            <p className="mb-3 text-sm font-semibold" style={{ color: "#1e1b4b" }}>Ready to use this instrument?</p>
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={handleDeployAll}
                disabled={deploying}
                className="btn-primary disabled:opacity-50"
              >
                {deploying ? "Deploying…" : "Deploy Full Instrument"}
              </button>
              <Link href={`/library/${id}/customize`} className="btn-ghost">
                Customize Item Selection
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
