"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import { getLibrary, getLibraryCategories, deployInstrument } from "@/lib/api"
import type { CategoryGroup, InstrumentCategoryOut, InstrumentListItem, LibraryGrouped } from "@/lib/types"

// ---------------------------------------------------------------------------
// License badge
// ---------------------------------------------------------------------------

function LicenseBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open:          { label: "Open",           bg: "rgba(34,197,94,0.1)",    color: "#16a34a" },
    public_domain: { label: "Public Domain",  bg: "rgba(59,130,246,0.1)",   color: "#2563eb" },
    proprietary:   { label: "Metricly",       bg: "rgba(91,33,182,0.1)",    color: "#5b21b6" },
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
// Response format label
// ---------------------------------------------------------------------------

function FormatLabel({ format }: { format: string }) {
  const labels: Record<string, string> = {
    likert5: "Likert 1–5",
    likert7: "Likert 1–7",
    forced_choice: "Forced Choice",
    other: "Mixed Format",
  }
  return <span>{labels[format] ?? format}</span>
}

// ---------------------------------------------------------------------------
// Instrument card
// ---------------------------------------------------------------------------

function InstrumentCard({ instrument }: { instrument: InstrumentListItem }) {
  const router = useRouter()
  const alpha = instrument.reliability_alpha
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  async function handleDeploy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDeploying(true)
    setDeployError(null)
    try {
      const result = await deployInstrument(instrument.id, { item_ids: null })
      router.push(`/surveys/${result.survey_id}/edit`)
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err))
      setDeploying(false)
    }
  }

  return (
    <div className="card p-5 flex flex-col transition-all hover:shadow-md">
      <Link href={`/library/${instrument.id}`} className="block flex-1">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug" style={{ color: "#1e1b4b" }}>{instrument.name}</p>
            {instrument.construct_measured && (
              <p className="mt-0.5 text-[11px]" style={{ color: "rgba(30,27,75,0.5)" }}>{instrument.construct_measured}</p>
            )}
          </div>
          <LicenseBadge type={instrument.license_type} />
        </div>

        {instrument.description && (
          <p
            className="mb-3 text-xs line-clamp-2"
            style={{ color: "rgba(30,27,75,0.55)" }}
          >
            {instrument.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "rgba(30,27,75,0.45)" }}>
          <span>{instrument.total_items} items</span>
          {instrument.estimated_minutes && <span>~{instrument.estimated_minutes} min</span>}
          <FormatLabel format={instrument.response_format} />
          {instrument.subscale_count > 0 && <span>{instrument.subscale_count} subscales</span>}
          {alpha !== null && alpha !== undefined && (
            <span style={{ color: "#5b21b6" }}>α = {alpha.toFixed(2)}</span>
          )}
        </div>
      </Link>

      {deployError && (
        <p className="mt-2 text-[11px]" style={{ color: "#dc2626" }}>{deployError}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="btn-primary flex-1 text-xs py-1.5 disabled:opacity-50"
        >
          {deploying ? "Deploying…" : "Deploy Survey"}
        </button>
        <Link
          href={`/library/${instrument.id}/customize`}
          className="btn-ghost text-xs py-1.5"
        >
          Customize
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

function CategorySection({ group }: { group: CategoryGroup }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="section-heading" style={{ color: "#1e1b4b" }}>{group.category.name}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(91,33,182,0.08)", color: "rgba(30,27,75,0.5)" }}
        >
          {group.instruments.length}
        </span>
      </div>
      {group.category.description && (
        <p className="mb-4 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{group.category.description}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {group.instruments.map(inst => (
          <InstrumentCard key={inst.id} instrument={inst} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  const [library, setLibrary] = useState<LibraryGrouped | null>(null)
  const [categories, setCategories] = useState<InstrumentCategoryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  async function load(searchVal = search, catId = selectedCategoryId) {
    setLoading(true); setError(null)
    try {
      const data = await getLibrary({
        search: searchVal || undefined,
        category_id: catId || undefined,
      })
      setLibrary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getLibraryCategories()
      .then(setCategories)
      .catch(() => {})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load(search, selectedCategoryId)
  }

  function selectCategory(id: string | null) {
    setSelectedCategoryId(id)
    load(search, id)
  }

  const visibleGroups = library?.categories.filter(g => g.instruments.length > 0) ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">

          {/* Hero */}
          <div className="mb-8">
            <p className="eyebrow mb-1">Assessment Library</p>
            <h1 className="page-title">Validated Psychometric Instruments</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              Browse {library?.total_instruments ?? "—"} validated instruments. Browse, review psychometric properties,
              and deploy directly as a survey — as-is or customized.
            </p>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-6 flex gap-2">
            <input
              type="search"
              placeholder="Search by name or construct…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field flex-1"
            />
            <button type="submit" className="btn-primary shrink-0">Search</button>
            {(search || selectedCategoryId) && (
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  setSearch("")
                  setSelectedCategoryId(null)
                  load("", null)
                }}
              >
                Clear
              </button>
            )}
          </form>

          {/* Category filter tabs */}
          {categories.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <button
                onClick={() => selectCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${!selectedCategoryId ? "btn-primary" : "btn-ghost"}`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${selectedCategoryId === cat.id ? "btn-primary" : "btn-ghost"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {error && <div className="alert-error mb-6">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
              Loading library…
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="section-heading mb-2">No instruments found</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>Try a different search term or clear the filter.</p>
            </div>
          ) : (
            visibleGroups.map(group => (
              <CategorySection key={group.category.id || "uncategorised"} group={group} />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
