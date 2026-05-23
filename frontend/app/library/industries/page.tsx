"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import { getIndustries } from "@/lib/api"
import type { IndustryOut } from "@/lib/types"

const ICON_MAP: Record<string, string> = {
  briefcase: "💼",
  heart: "❤️",
  book: "📚",
  shield: "🛡️",
  "trending-up": "📈",
  cpu: "💻",
  megaphone: "📣",
  landmark: "🏛️",
  star: "⭐",
  users: "👥",
  "credit-card": "💳",
  umbrella: "☂️",
}

export default function IndustriesPage() {
  const [industries, setIndustries] = useState<IndustryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getIndustries()
      .then(setIndustries)
      .catch(() => setError("Failed to load industries."))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f0eeff 0%, #e8f4ff 100%)" }}>
      <Header backHref="/library" backLabel="Assessment Library" />

      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🏭</span>
            <div>
              <h1 className="text-2xl font-bold font-playfair" style={{ color: "#1e1b4b" }}>
                Industry Library
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "rgba(30,27,75,0.55)" }}>
                Validated psychological scales curated for 12 industry verticals
              </p>
            </div>
          </div>

          <div
            className="mt-6 rounded-2xl px-5 py-4 text-sm"
            style={{
              background: "rgba(91,33,182,0.06)",
              border: "0.5px solid rgba(91,33,182,0.15)",
              color: "rgba(30,27,75,0.7)",
            }}
          >
            <strong>71 validated instruments</strong> across 12 industries — from legal ethics and clinical burnout
            to algorithmic bias and military cohesion. Each scale is mapped by relevance score and use-case context.
          </div>
        </div>

        {/* Grid */}
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

        {!loading && !error && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((ind) => (
              <Link key={ind.id} href={`/library/industries/${ind.slug}`} className="group block">
                <div
                  className="h-full rounded-2xl p-5 transition-all duration-200 group-hover:shadow-lg"
                  style={{
                    background: "rgba(255,255,255,0.65)",
                    border: "0.5px solid rgba(255,255,255,0.8)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  {/* Color stripe */}
                  <div
                    className="mb-4 h-1.5 w-12 rounded-full"
                    style={{ background: ind.color_hex ?? "linear-gradient(135deg, #5b21b6, #7c3aed)" }}
                  />

                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{ICON_MAP[ind.icon_name ?? ""] ?? "🏭"}</span>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-sm" style={{ color: "#1e1b4b" }}>{ind.name}</h2>
                      {ind.description && (
                        <p
                          className="mt-1 text-xs leading-relaxed line-clamp-2"
                          style={{ color: "rgba(30,27,75,0.55)" }}
                        >
                          {ind.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
                    >
                      {ind.instrument_count} instruments
                    </span>
                    <span
                      className="text-xs font-medium group-hover:underline"
                      style={{ color: "rgba(91,33,182,0.7)" }}
                    >
                      Browse →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
