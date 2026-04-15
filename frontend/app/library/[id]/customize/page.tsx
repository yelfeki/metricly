"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Header from "@/components/Header"
import { getInstrument, deployInstrument } from "@/lib/api"
import type { InstrumentItemOut, InstrumentOut, InstrumentSubscaleOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Psychometric warning logic (mirrors backend service)
// ---------------------------------------------------------------------------

function getWarning(total: number, selected: number, alpha: number | null): string | null {
  if (selected >= total) return null
  const pctRemoved = 1 - selected / total
  if (pctRemoved > 0.3) {
    return `You have removed ${total - selected} of ${total} items (${Math.round(pctRemoved * 100)}%). Removing more than 30% of items may substantially reduce validity and affect psychometric properties. Use with caution.`
  }
  if (alpha !== null && alpha > 0.7) {
    return "Removing items from a validated instrument may affect its reliability and construct validity. The reported α applies to the full item set only."
  }
  return null
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  checked,
  onChange,
}: {
  item: InstrumentItemOut
  checked: boolean
  onChange: (id: string, checked: boolean) => void
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors"
      style={{ background: checked ? "rgba(91,33,182,0.04)" : "transparent" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(item.id, e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[#5b21b6]"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed" style={{ color: "#1e1b4b" }}>{item.item_text}</p>
        {item.is_reverse_scored && (
          <span
            className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}
          >
            Reverse scored
          </span>
        )}
      </div>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Subscale section
// ---------------------------------------------------------------------------

function SubscaleSection({
  subscale,
  items,
  selected,
  onToggle,
  onToggleAll,
}: {
  subscale: InstrumentSubscaleOut | null
  items: InstrumentItemOut[]
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onToggleAll: (ids: string[], checked: boolean) => void
}) {
  const allChecked = items.every(i => selected.has(i.id))
  const someChecked = items.some(i => selected.has(i.id))
  const selectedCount = items.filter(i => selected.has(i.id)).length

  return (
    <div className="mb-4">
      {subscale && (
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold" style={{ color: "#5b21b6" }}>{subscale.name}</span>
            <span className="ml-2 text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>
              {selectedCount}/{items.length} selected
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleAll(items.map(i => i.id), !allChecked)}
            className="text-[10px] font-semibold transition-colors"
            style={{ color: someChecked && !allChecked ? "#5b21b6" : "rgba(30,27,75,0.4)" }}
          >
            {allChecked ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}
      <div className="space-y-0.5">
        {items.map(item => (
          <ItemRow key={item.id} item={item} checked={selected.has(item.id)} onChange={onToggle} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CustomizePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [instrument, setInstrument] = useState<InstrumentOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setLoading(true)
    getInstrument(id)
      .then(inst => {
        setInstrument(inst)
        // Select all items by default
        setSelected(new Set(inst.items.map(i => i.id)))
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [id])

  function handleToggle(itemId: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  function handleToggleAll(ids: string[], checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function handleDeploy() {
    if (selected.size === 0) return
    setDeploying(true); setDeployError(null)
    try {
      const selectedIds = Array.from(selected)
      const isFullSet = instrument && selectedIds.length === instrument.items.length
      const result = await deployInstrument(id, {
        item_ids: isFullSet ? null : selectedIds,
        customization_notes: notes || null,
      })
      router.push(`/surveys/${result.survey_id}/edit`)
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e))
      setDeploying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref={`/library/${id}`} backLabel="Instrument" />
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

  const warning = getWarning(instrument.items.length, selected.size, instrument.reliability_alpha)

  // Group items by subscale
  const groups: { subscale: InstrumentSubscaleOut | null; items: InstrumentItemOut[] }[] = []
  if (instrument.subscales.length > 0) {
    for (const ss of instrument.subscales) {
      const ssItems = instrument.items.filter(i => i.subscale_id === ss.id)
      if (ssItems.length > 0) groups.push({ subscale: ss, items: ssItems })
    }
    const unassigned = instrument.items.filter(i => !i.subscale_id)
    if (unassigned.length > 0) groups.push({ subscale: null, items: unassigned })
  } else {
    groups.push({ subscale: null, items: instrument.items })
  }

  const allSelected = selected.size === instrument.items.length
  const noneSelected = selected.size === 0

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/library/${id}`} backLabel="Instrument" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-6">
            <p className="eyebrow mb-1">Customize</p>
            <h1 className="page-title">{instrument.name}</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              Select the items you want to include. {selected.size} of {instrument.items.length} items selected.
            </p>
          </div>

          {/* Psychometric warning */}
          {warning && (
            <div
              className="mb-6 rounded-[14px] p-4 text-sm"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "0.5px solid rgba(245,158,11,0.3)",
                color: "#92400e",
              }}
            >
              <div className="flex gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p>{warning}</p>
              </div>
            </div>
          )}

          {/* Select all / none */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>
              {selected.size} / {instrument.items.length} items
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(instrument.items.map(i => i.id)))}
                disabled={allSelected}
                className="text-xs font-semibold transition-colors disabled:opacity-30"
                style={{ color: "#5b21b6" }}
              >
                Select all
              </button>
              <span style={{ color: "rgba(30,27,75,0.2)" }}>·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={noneSelected}
                className="text-xs font-semibold transition-colors disabled:opacity-30"
                style={{ color: "rgba(30,27,75,0.4)" }}
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Item groups */}
          <div className="card mb-6 p-4">
            {groups.map((group, gi) => (
              <SubscaleSection
                key={group.subscale?.id ?? `group-${gi}`}
                subscale={group.subscale}
                items={group.items}
                selected={selected}
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
              />
            ))}
          </div>

          {/* Optional notes */}
          <div className="mb-6">
            <label className="label-caps mb-1 block">Customization Notes (optional)</label>
            <textarea
              className="field w-full resize-none"
              rows={3}
              placeholder="Describe your customization rationale…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {deployError && <div className="alert-error mb-4">{deployError}</div>}

          {/* Deploy button */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
              {selected.size === 0
                ? "Select at least one item to deploy."
                : `Deploy ${selected.size} item${selected.size === 1 ? "" : "s"} as a new survey.`}
            </p>
            <button
              onClick={handleDeploy}
              disabled={deploying || selected.size === 0}
              className="btn-primary disabled:opacity-50"
            >
              {deploying ? "Deploying…" : "Deploy Survey"}
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}
