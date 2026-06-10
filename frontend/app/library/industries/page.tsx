"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  IconArrowRight,
  IconBook,
  IconBriefcase,
  IconBuildingBank,
  IconBuildingFactory2,
  IconCpu,
  IconCreditCard,
  IconHeart,
  IconShield,
  IconSpeakerphone,
  IconStar,
  IconTrendingUp,
  IconUmbrella,
  IconUsers,
  type IconProps,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import Header from "@/components/Header"
import { getIndustries } from "@/lib/api"
import type { IndustryOut } from "@/lib/types"
import { colourForCluster } from "@/app/frameworks/[id]/lib/cluster-palette"

// Tabler icons — no emoji per design-system spec.
const ICON_MAP: Record<string, ComponentType<IconProps>> = {
  briefcase: IconBriefcase,
  heart: IconHeart,
  book: IconBook,
  shield: IconShield,
  "trending-up": IconTrendingUp,
  cpu: IconCpu,
  megaphone: IconSpeakerphone,
  landmark: IconBuildingBank,
  star: IconStar,
  users: IconUsers,
  "credit-card": IconCreditCard,
  umbrella: IconUmbrella,
}

function industryIcon(name: string | null | undefined): ComponentType<IconProps> {
  return (name && ICON_MAP[name]) || IconBuildingFactory2
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
    <div className="min-h-screen">
      {/* No page-level background override — atelier washes (on <html>) show through. */}
      <Header backHref="/library" backLabel="Assessment Library" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Subpage hero — atelier-wash "HELLO card" treatment from the
            design-system bundle. Same recipe everywhere via .mx-hero. */}
        <section className="mx-hero mb-6" style={{ padding: "32px 36px" }}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mx-eyebrow mb-2">Assessment library</p>
              <h1 className="mx-h2" style={{ fontSize: 36, lineHeight: 1.1 }}>
                Industry <em className="mx-text-grad-warm">library.</em>
              </h1>
              <p
                className="mx-caption mt-2 max-w-2xl"
                style={{ fontSize: 13 }}
              >
                Validated psychological scales curated for twelve industry verticals.
              </p>
            </div>
          </div>

          {/* Inline stat callout: 71 instruments · 12 industries — uses the mx
              eyebrow + mono numerals pattern, matches the home-stats vocab. */}
          <div
            className="mt-5 flex flex-wrap items-center gap-6 border-t pt-4"
            style={{ borderColor: "var(--mx-line)" }}
          >
            <div>
              <p className="mx-eyebrow mb-0.5">Instruments</p>
              <p
                className="mx-num mx-text-grad-cool"
                style={{ fontSize: 24, lineHeight: 1 }}
              >
                71
              </p>
            </div>
            <div>
              <p className="mx-eyebrow mb-0.5">Industries</p>
              <p
                className="mx-num"
                style={{ fontSize: 24, lineHeight: 1, color: "var(--mx-ink)" }}
              >
                {loading ? "—" : industries.length}
              </p>
            </div>
            <p
              className="max-w-md"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--mx-ink-2)",
              }}
            >
              From legal ethics and clinical burnout to algorithmic bias and military
              cohesion. Each scale is mapped by relevance score and use-case context.
            </p>
          </div>
        </section>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full"
              style={{
                border: "2px solid var(--mx-line)",
                borderTopColor: "var(--mx-forest)",
              }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-[14px] px-4 py-3"
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

        {/* Industry grid */}
        {!loading && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((ind) => {
              const Icon = industryIcon(ind.icon_name)
              const colour = colourForCluster(ind.slug)
              return (
                <Link
                  key={ind.id}
                  href={`/library/industries/${ind.slug}`}
                  className="group block"
                >
                  <article
                    className="mx-card mx-card-hover h-full"
                    style={{ padding: 20, transition: "all var(--mx-dur-base) var(--mx-ease)" }}
                  >
                    {/* Pigment stripe — replaces the old DB color_hex stripe */}
                    <div
                      className="mb-4 h-1.5 w-12 rounded-full"
                      style={{ background: colour.main }}
                    />

                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center"
                        style={{
                          background: colour.bg,
                          color: colour.main,
                          borderRadius: "var(--mx-r-md)",
                        }}
                      >
                        <Icon size={18} stroke={1.6} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2
                          style={{
                            fontFamily: "var(--mx-font-sans)",
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: "var(--mx-ink)",
                          }}
                        >
                          {ind.name}
                        </h2>
                        {ind.description && (
                          <p
                            className="mt-1 line-clamp-2"
                            style={{
                              fontFamily: "var(--mx-font-sans)",
                              fontSize: 12,
                              lineHeight: 1.5,
                              color: "var(--mx-ink-2)",
                            }}
                          >
                            {ind.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div
                      className="mt-4 flex items-center justify-between border-t pt-3"
                      style={{ borderColor: "var(--mx-line)" }}
                    >
                      <span
                        className="mx-tnum"
                        style={{
                          background: colour.bg,
                          color: colour.text,
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "3px 9px",
                          borderRadius: 999,
                        }}
                      >
                        {ind.instrument_count}{" "}
                        instrument{ind.instrument_count === 1 ? "" : "s"}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5"
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--mx-cobalt)",
                        }}
                      >
                        Browse
                        <IconArrowRight size={12} stroke={1.8} />
                      </span>
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
