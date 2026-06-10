"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import CollectionTray from "@/components/CollectionTray"
import { useCollection } from "@/lib/useCollection"
import type { CollectionItem } from "@/lib/useCollection"
import { deployInstrument, getLibrary, getLibraryCategories } from "@/lib/api"
import type { CategoryGroup, InstrumentCategoryOut, InstrumentListItem, LibraryGrouped } from "@/lib/types"

// ---------------------------------------------------------------------------
// License badge
// ---------------------------------------------------------------------------

function LicenseBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open:          { label: "Open",          bg: "rgba(34,197,94,0.1)",  color: "#7E8A55" },
    public_domain: { label: "Public Domain", bg: "rgba(59,130,246,0.1)", color: "#2A5BA8" },
    proprietary:   { label: "Metricly",      bg: "rgba(15,40,65,0.1)",  color: "#0F2841" },
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
// Instrument card
// ---------------------------------------------------------------------------

interface InstrumentCardProps {
  instrument: InstrumentListItem
  inCollection: boolean
  onToggle: (item: CollectionItem) => void
}

function InstrumentCard({ instrument, inCollection, onToggle }: InstrumentCardProps) {
  const router = useRouter()
  const alpha = instrument.reliability_alpha
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  const collectionItem: CollectionItem = {
    id: instrument.id,
    name: instrument.name,
    short_name: instrument.short_name,
  }

  async function handleDeployOne(e: React.MouseEvent) {
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
    <div
      className="flex flex-col rounded-[14px] p-5 transition-all hover:shadow-md"
      style={{
        background: inCollection ? "rgba(15,40,65,0.07)" : "rgba(255,255,255,0.65)",
        border: inCollection ? "0.5px solid rgba(15,40,65,0.25)" : "0.5px solid rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link href={`/library/${instrument.id}`} className="block flex-1">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug" style={{ color: "#0A1E33" }}>
              {instrument.name}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold" style={{ color: "rgba(10,30,51,0.4)" }}>
              {instrument.short_name}
            </p>
            {instrument.construct_measured && (
              <p className="mt-0.5 text-[11px]" style={{ color: "rgba(10,30,51,0.5)" }}>
                {instrument.construct_measured}
              </p>
            )}
          </div>
          <LicenseBadge type={instrument.license_type} />
        </div>

        {instrument.description && (
          <p className="mb-3 text-xs line-clamp-2" style={{ color: "rgba(10,30,51,0.55)" }}>
            {instrument.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "rgba(10,30,51,0.45)" }}>
          <span>{instrument.total_items} items</span>
          {instrument.estimated_minutes && <span>~{instrument.estimated_minutes} min</span>}
          {instrument.subscale_count > 0 && <span>{instrument.subscale_count} subscales</span>}
          {alpha !== null && alpha !== undefined && (
            <span style={{ color: "#0F2841" }}>α = {alpha.toFixed(2)}</span>
          )}
        </div>
      </Link>

      {deployError && (
        <p className="mt-2 text-[11px]" style={{ color: "#DD6334" }}>{deployError}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {/* Add / remove from collection */}
        <button
          onClick={() => onToggle(collectionItem)}
          className="flex-1 rounded-full py-1.5 text-xs font-bold transition-all"
          style={inCollection ? {
            background: "rgba(34,197,94,0.12)",
            color: "#7E8A55",
            border: "0.5px solid rgba(34,197,94,0.3)",
          } : {
            background: "rgba(15,40,65,0.08)",
            color: "#0F2841",
          }}
        >
          {inCollection ? "✓ Added" : "+ Add to Collection"}
        </button>
        {/* Deploy this instrument alone */}
        <button
          onClick={handleDeployOne}
          disabled={deploying}
          className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "0.5px solid rgba(15,40,65,0.15)",
            color: "rgba(10,30,51,0.6)",
          }}
        >
          {deploying ? "…" : "Deploy"}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  group: CategoryGroup
  isInCollection: (id: string) => boolean
  onToggle: (item: CollectionItem) => void
}

function CategorySection({ group, isInCollection, onToggle }: CategorySectionProps) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="section-heading" style={{ color: "#0A1E33" }}>{group.category.name}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(15,40,65,0.08)", color: "rgba(10,30,51,0.5)" }}
        >
          {group.instruments.length}
        </span>
      </div>
      {group.category.description && (
        <p className="mb-4 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
          {group.category.description}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {group.instruments.map(inst => (
          <InstrumentCard
            key={inst.id}
            instrument={inst}
            inCollection={isInCollection(inst.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  const { list, toggle, remove, clear, isInCollection } = useCollection()

  const [library, setLibrary] = useState<LibraryGrouped | null>(null)
  const [categories, setCategories] = useState<InstrumentCategoryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  async function load(searchVal = search, catId = selectedCategoryId) {
    setLoading(true)
    setError(null)
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
    getLibraryCategories().then(setCategories).catch(() => {})
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

      <main className="flex-1 px-6 py-10 pb-36">
        <div className="mx-auto max-w-4xl">

          {/* Hero */}
          <div className="mb-8">
            <p className="eyebrow mb-1">Scale Library</p>
            <h1 className="page-title">Validated Psychometric Instruments</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
              Browse {library?.total_instruments ?? "—"} validated instruments. Add instruments to your collection,
              then deploy them together as a single survey — or deploy any instrument individually.
            </p>
            <div className="mt-4">
              <Link
                href="/library/industries"
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: "#0F2841" }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Also browse 71 industry-specific instruments →
              </Link>
            </div>
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
                onClick={() => { setSearch(""); setSelectedCategoryId(null); load("", null) }}
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
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>
              Loading library…
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="section-heading mb-2">No instruments found</p>
              <p className="text-sm" style={{ color: "rgba(10,30,51,0.45)" }}>Try a different search term or clear the filter.</p>
            </div>
          ) : (
            visibleGroups.map(group => (
              <CategorySection
                key={group.category.id || "uncategorised"}
                group={group}
                isInCollection={isInCollection}
                onToggle={toggle}
              />
            ))
          )}
        </div>
      </main>

      <CollectionTray list={list} onRemove={remove} onClear={clear} />
    </div>
  )
}
