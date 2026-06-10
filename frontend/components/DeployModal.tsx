"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { batchDeploy } from "@/lib/api"
import type { CollectionItem } from "@/lib/useCollection"

interface DeployModalProps {
  items: CollectionItem[]
  onClose: () => void
  onSuccess: () => void
}

export default function DeployModal({ items, onClose, onSuccess }: DeployModalProps) {
  const router = useRouter()
  const titleRef = useRef<HTMLInputElement>(null)

  const defaultTitle = items.map(i => i.short_name).join(" + ")
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.select()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { survey_id } = await batchDeploy({
        instrument_ids: items.map(i => i.id),
        survey_title: title.trim(),
      })
      onSuccess()
      router.push(`/surveys/${survey_id}/edit`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed. Please try again.")
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,12,40,0.55)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Panel */}
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "rgba(248,246,255,0.98)",
          border: "0.5px solid rgba(15,40,65,0.15)",
          boxShadow: "0 24px 64px rgba(10,30,51,0.22)",
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-0.5">Deploy as Survey</p>
            <h2 className="section-heading">Create survey from {items.length} instrument{items.length !== 1 ? "s" : ""}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all"
            style={{ background: "rgba(10,30,51,0.07)" }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Selected instruments summary */}
        <div
          className="mb-5 flex flex-wrap gap-1.5 rounded-xl p-3"
          style={{ background: "rgba(15,40,65,0.05)", border: "0.5px solid rgba(15,40,65,0.1)" }}
        >
          {items.map(item => (
            <span
              key={item.id}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
            >
              {item.short_name}
            </span>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">Survey title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="field w-full"
              placeholder="e.g. Leadership Readiness Assessment"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="label-caps mb-1.5 block">
              Description <span style={{ color: "rgba(10,30,51,0.35)" }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="field w-full resize-none"
              rows={2}
              placeholder="Briefly describe the purpose of this survey…"
              disabled={loading}
            />
          </div>

          {error && (
            <div
              className="rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "rgba(239,68,68,0.07)", color: "#DD6334" }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating survey…
                </span>
              ) : (
                "Create Survey →"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-ghost disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
