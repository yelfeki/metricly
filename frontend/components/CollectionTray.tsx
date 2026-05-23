"use client"

import { useState } from "react"
import DeployModal from "@/components/DeployModal"
import type { CollectionItem } from "@/lib/useCollection"

interface CollectionTrayProps {
  list: CollectionItem[]
  onRemove: (id: string) => void
  onClear: () => void
}

export default function CollectionTray({ list, onRemove, onClear }: CollectionTrayProps) {
  const [showModal, setShowModal] = useState(false)

  if (list.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes tray-slide-up {
          from { opacity: 0; transform: translate(-50%, 16px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <div
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
        style={{ animation: "tray-slide-up 0.3s ease-out forwards" }}
      >
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: "rgba(22,18,55,0.94)",
            backdropFilter: "blur(20px)",
            border: "0.5px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 40px rgba(30,27,75,0.45)",
            maxWidth: "min(90vw, 720px)",
          }}
        >
          {/* Count badge */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #5b21b6, #3777A8)" }}
          >
            {list.length}
          </div>

          {/* Instrument chips — scrollable */}
          <div className="flex items-center gap-1.5 overflow-x-auto" style={{ maxWidth: "320px", scrollbarWidth: "none" }}>
            {list.map(item => (
              <span
                key={item.id}
                className="flex shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-semibold text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                {item.short_name}
                <button
                  onClick={() => onRemove(item.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full transition-all"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                  title={`Remove ${item.short_name}`}
                >
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>

          {/* Deploy button */}
          <button
            onClick={() => setShowModal(true)}
            className="flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #5b21b6, #3777A8)", boxShadow: "0 2px 12px rgba(91,33,182,0.4)" }}
          >
            Deploy as Survey
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          {/* Clear all */}
          <button
            onClick={onClear}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all"
            style={{ background: "rgba(255,255,255,0.1)" }}
            title="Clear all"
          >
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showModal && (
        <DeployModal
          items={list}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onClear() }}
        />
      )}
    </>
  )
}
