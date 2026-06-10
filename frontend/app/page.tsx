"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  IconArrowRight,
  IconBook2,
  IconBolt,
  IconChartArrows,
  IconCompass,
  IconFileText,
  IconRocket,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"
import Header from "@/components/Header"
import { useAuth } from "@/components/AuthProvider"
import { getSurveys, getLibrary } from "@/lib/api"
import type { SurveyListItem } from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return "Good morning"
  if (h >= 12 && h < 17) return "Good afternoon"
  return "Good evening"
}

function getFirstName(email: string | null | undefined): string {
  if (!email) return "there"
  const local = email.split("@")[0]
  const first = local.split(/[._]/)[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------

interface ActionCard {
  title: string
  body: string
  href: string
  Icon: typeof IconCompass
}

const ACTION_CARDS: ActionCard[] = [
  {
    title: "Assess skills or attitudes",
    body: "Let our AI recommend the right validated instruments for your org.",
    href: "/skills-explorer",
    Icon: IconCompass,
  },
  {
    title: "Build an assessment framework",
    body: "Generate a role-based competency blueprint with matched instruments.",
    href: "/straw-man",
    Icon: IconChartArrows,
  },
  {
    title: "Deploy a survey",
    body: "Create a new survey from scratch or from the instrument library.",
    href: "/surveys/new",
    Icon: IconRocket,
  },
]

// ---------------------------------------------------------------------------
// Status pill — pigment-mapped per design system semantics
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 10,
          fontWeight: 500,
          background: "rgba(126,138,85,0.14)",  // sage / olive — live + calm
          color: "#3F4A2A",
          padding: "2px 8px",
          borderRadius: 999,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--mx-sage)",
          }}
        />
        Live
      </span>
    )
  }
  if (status === "closed") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          fontFamily: "var(--mx-font-sans)",
          fontSize: 10,
          fontWeight: 500,
          background: "rgba(194,78,78,0.10)",
          color: "var(--mx-rose)",
          padding: "2px 8px",
          borderRadius: 999,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--mx-rose)",
          }}
        />
        Closed
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        fontFamily: "var(--mx-font-sans)",
        fontSize: 10,
        fontWeight: 500,
        background: "var(--mx-paper-2)",
        color: "var(--mx-ink-3)",
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid var(--mx-line)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--mx-ink-3)",
        }}
      />
      Draft
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [surveysLoaded, setSurveysLoaded] = useState(false)
  const [libraryCount, setLibraryCount] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    getSurveys()
      .then(data => {
        setSurveys(data)
        setSurveysLoaded(true)
      })
      .catch(() => setSurveysLoaded(true))
    getLibrary()
      .then(lib => setLibraryCount(lib.total_instruments))
      .catch(() => setLibraryCount(null))
  }, [user?.id])

  const greeting = getGreeting()
  const firstName = getFirstName(user?.email)

  const totalSurveys = surveys.length
  const totalResponses = surveys.reduce((sum, s) => sum + s.response_count, 0)
  const liveNow = surveys.filter(s => s.status === "published").length

  const recentSurveys = [...surveys]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: "2px solid var(--mx-line)",
            borderTopColor: "var(--mx-forest)",
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-5xl space-y-12">
          {/* ── Hero greeting — welcome card per design-system §"Hero / welcome
                cards". Lightened from the original navy radial to a layered
                warm/cool wash on cream (atelier pattern). Eyebrow is muted
                ink; title is ink; the italic first-name keeps the warm
                gradient (persimmon → butter), which reads even more strongly
                on cream than it did on navy. ─── */}
          <section className="mx-hero" style={{ padding: "44px 48px" }}>
            <div className="relative z-10">
              <p className="mx-eyebrow mb-2">Dashboard</p>
              <h1
                className="mx-h1"
                style={{
                  fontSize: 56,
                  lineHeight: 1.02,
                  color: "var(--mx-ink)",
                }}
              >
                {greeting},{" "}
                <em className="mx-text-grad-warm">{firstName}.</em>
              </h1>
              <p
                className="mt-3 max-w-xl"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--mx-ink-2)",
                }}
              >
                What would you like to do today?
              </p>
            </div>
          </section>

          {/* ── Action cards ────────────────────────────────────────────── */}
          <section>
            <div className="grid gap-4 sm:grid-cols-3">
              {ACTION_CARDS.map(card => {
                const Icon = card.Icon
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="group mx-card mx-card-hover block p-6"
                    style={{ transition: "all var(--mx-dur-base) var(--mx-ease)" }}
                  >
                    <div
                      className="mb-5 flex h-11 w-11 items-center justify-center"
                      style={{
                        background: "var(--mx-grad-butter-glow)",
                        color: "var(--mx-forest)",
                        borderRadius: "var(--mx-r-md)",
                      }}
                    >
                      <Icon size={22} stroke={1.6} />
                    </div>
                    <h3
                      className="mx-title mb-2"
                      style={{ fontSize: 18, lineHeight: 1.3 }}
                    >
                      {card.title}
                    </h3>
                    <p
                      className="mb-5"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: "var(--mx-ink-2)",
                      }}
                    >
                      {card.body}
                    </p>
                    <span
                      className="inline-flex items-center gap-1.5 transition-all"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--mx-forest)",
                      }}
                    >
                      Get started
                      <IconArrowRight
                        size={13}
                        stroke={1.8}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* ── Recent surveys ──────────────────────────────────────────── */}
          <section>
            <h2 className="mx-h3 mb-4" style={{ fontSize: 26 }}>
              Pick up where you left off.
            </h2>

            <div className="mx-card overflow-hidden">
              {!surveysLoaded ? (
                <div
                  className="py-12 text-center"
                  style={{
                    fontFamily: "var(--mx-font-display)",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "var(--mx-ink-3)",
                  }}
                >
                  Loading…
                </div>
              ) : recentSurveys.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--mx-ink-2)",
                    }}
                  >
                    No surveys yet
                  </p>
                  <p
                    className="mt-1"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 12,
                      color: "var(--mx-ink-3)",
                    }}
                  >
                    Start by{" "}
                    <Link
                      href="/library"
                      className="underline"
                      style={{ color: "var(--mx-cobalt)" }}
                    >
                      exploring the library
                    </Link>{" "}
                    or running the{" "}
                    <Link
                      href="/skills-explorer"
                      className="underline"
                      style={{ color: "var(--mx-cobalt)" }}
                    >
                      Skills Explorer
                    </Link>
                  </p>
                </div>
              ) : (
                <>
                  {recentSurveys.map((survey, idx) => (
                    <div
                      key={survey.id}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                      style={{
                        borderTop: idx > 0 ? "1px solid var(--mx-line)" : "none",
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = "var(--mx-paper-2)")
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center"
                        style={{
                          background: "var(--mx-paper-2)",
                          color: "var(--mx-forest)",
                          borderRadius: "var(--mx-r-md)",
                        }}
                      >
                        <IconFileText size={16} stroke={1.6} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate"
                          style={{
                            fontFamily: "var(--mx-font-sans)",
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--mx-ink)",
                          }}
                        >
                          {survey.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <StatusBadge status={survey.status} />
                          <span
                            className="mx-tnum"
                            style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                          >
                            {timeAgo(survey.created_at)}
                          </span>
                          {survey.response_count > 0 && (
                            <span
                              className="mx-tnum"
                              style={{ fontSize: 10, color: "var(--mx-ink-3)" }}
                            >
                              · {survey.response_count} response
                              {survey.response_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/surveys/${survey.id}/edit`}
                        className="mx-pill shrink-0"
                        style={{ fontSize: 11 }}
                      >
                        Edit
                      </Link>
                    </div>
                  ))}

                  <div
                    className="px-5 py-3 text-center"
                    style={{ borderTop: "1px solid var(--mx-line)" }}
                  >
                    <Link
                      href="/surveys"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--mx-cobalt)",
                      }}
                    >
                      View all {surveys.length} survey
                      {surveys.length !== 1 ? "s" : ""} →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── Quick stats ─────────────────────────────────────────────── */}
          <section>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                {
                  label: "Surveys created",
                  value: surveysLoaded ? String(totalSurveys) : "—",
                  Icon: IconFileText,
                },
                {
                  label: "Responses collected",
                  value: surveysLoaded ? String(totalResponses) : "—",
                  Icon: IconUsers,
                },
                {
                  label: "Assessments live",
                  value: surveysLoaded ? String(liveNow) : "—",
                  Icon: IconBolt,
                },
                {
                  label: "Library instruments",
                  value: libraryCount !== null ? String(libraryCount) : "—",
                  Icon: IconBook2,
                },
              ].map(stat => {
                const Icon = stat.Icon
                return (
                  <div key={stat.label} className="mx-card p-5">
                    <div
                      className="mb-3 flex h-8 w-8 items-center justify-center"
                      style={{
                        background: "var(--mx-paper-2)",
                        color: "var(--mx-forest)",
                        borderRadius: "var(--mx-r-md)",
                      }}
                    >
                      <Icon size={16} stroke={1.6} />
                    </div>
                    <p
                      className="mx-num mx-text-grad-cool"
                      style={{ fontSize: 32 }}
                    >
                      {stat.value}
                    </p>
                    <p className="mx-eyebrow mt-1.5">{stat.label}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Footer */}
          <p
            className="text-center"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10,
              color: "var(--mx-ink-3)",
            }}
          >
            Metricly · Psychometric intelligence for the Arab world
          </p>
        </div>
      </main>
    </div>
  )
}
