"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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
// Glass card style (shared)
// ---------------------------------------------------------------------------

const GLASS: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.65), rgba(255,255,255,0.30))",
  border: "0.5px solid rgba(255,255,255,0.85)",
  borderRadius: 14,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 2px 20px rgba(91,33,182,0.07)",
}

// ---------------------------------------------------------------------------
// Section 2 — Action cards
// ---------------------------------------------------------------------------

interface ActionCard {
  title: string
  body: string
  href: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
}

const ACTION_CARDS: ActionCard[] = [
  {
    title: "Assess skills or attitudes",
    body: "Let our AI recommend the right validated instruments for your org",
    href: "/skills-explorer",
    iconBg: "rgba(91,33,182,0.07)",
    iconColor: "#5b21b6",
    icon: (
      // Compass rose
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
      </svg>
    ),
  },
  {
    title: "Build an assessment framework",
    body: "Generate a role-based competency blueprint with matched instruments",
    href: "/straw-man",
    iconBg: "rgba(5,150,105,0.07)",
    iconColor: "#059669",
    icon: (
      // Layout/grid
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    title: "Deploy a survey",
    body: "Create a new survey from scratch or from the instrument library",
    href: "/surveys/new",
    iconBg: "rgba(55,119,168,0.08)",
    iconColor: "#3777A8",
    icon: (
      // Send / paper plane
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
      </svg>
    ),
  },
]

// ---------------------------------------------------------------------------
// Section 3 — Status badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  if (status === "closed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "rgba(239,68,68,0.09)", color: "#b91c1c" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Closed
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: "rgba(30,27,75,0.06)", color: "rgba(30,27,75,0.45)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(30,27,75,0.25)" }} />
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
      .then(data => { setSurveys(data); setSurveysLoaded(true) })
      .catch(() => setSurveysLoaded(true))
    getLibrary()
      .then(lib => setLibraryCount(lib.total_instruments))
      .catch(() => setLibraryCount(null))
  }, [user?.id])

  const greeting = getGreeting()
  const firstName = getFirstName(user?.email)

  // Stats derived from surveys
  const totalSurveys = surveys.length
  const totalResponses = surveys.reduce((sum, s) => sum + s.response_count, 0)
  const liveNow = surveys.filter(s => s.status === "published").length

  // Recent surveys: newest 5 by created_at
  const recentSurveys = [...surveys]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-5xl space-y-10">

          {/* ── Section 1: Hero greeting ────────────────────────────────────── */}
          <section>
            <p className="eyebrow mb-2">Dashboard</p>
            <h1
              className="text-4xl font-bold leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-playfair, Georgia, serif)", color: "#1e1b4b" }}
            >
              {greeting}, {firstName}
            </h1>
            <p className="mt-2 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              What would you like to do today?
            </p>
          </section>

          {/* ── Section 2: Action cards ─────────────────────────────────────── */}
          <section>
            <div className="grid gap-4 sm:grid-cols-3">
              {ACTION_CARDS.map(card => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group block p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={GLASS}
                >
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105"
                    style={{ background: card.iconBg, color: card.iconColor }}
                  >
                    {card.icon}
                  </div>
                  <h3
                    className="mb-2 text-[18px] font-semibold leading-snug"
                    style={{ fontFamily: "var(--font-playfair, Georgia, serif)", color: "#1e1b4b" }}
                  >
                    {card.title}
                  </h3>
                  <p className="mb-5 text-[13px] leading-relaxed" style={{ color: "rgba(30,27,75,0.5)" }}>
                    {card.body}
                  </p>
                  <span
                    className="flex items-center gap-1 text-xs font-semibold transition-all group-hover:gap-2"
                    style={{ color: "#3777A8" }}
                  >
                    Get started
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Section 3: Pick up where you left off ──────────────────────── */}
          <section>
            <h2
              className="mb-4 text-2xl font-semibold"
              style={{ fontFamily: "var(--font-playfair, Georgia, serif)", color: "#1e1b4b" }}
            >
              Pick up where you left off
            </h2>

            <div style={GLASS} className="overflow-hidden">
              {!surveysLoaded ? (
                <div className="flex items-center justify-center py-12 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
                  Loading…
                </div>
              ) : recentSurveys.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>No surveys yet</p>
                  <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>
                    Start by{" "}
                    <Link href="/library" className="underline" style={{ color: "#3777A8" }}>
                      exploring the library
                    </Link>{" "}
                    or running the{" "}
                    <Link href="/skills-explorer" className="underline" style={{ color: "#3777A8" }}>
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
                        borderTop: idx > 0 ? "0.5px solid rgba(91,33,182,0.06)" : "none",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                    >
                      {/* Document icon */}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "rgba(91,33,182,0.07)", color: "#5b21b6" }}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: "#1e1b4b" }}>
                          {survey.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <StatusBadge status={survey.status} />
                          <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.38)" }}>
                            {timeAgo(survey.created_at)}
                          </span>
                          {survey.response_count > 0 && (
                            <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.38)" }}>
                              · {survey.response_count} response{survey.response_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Edit button */}
                      <Link
                        href={`/surveys/${survey.id}/edit`}
                        className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                        style={{
                          background: "rgba(255,255,255,0.55)",
                          border: "0.5px solid rgba(91,33,182,0.12)",
                          color: "rgba(30,27,75,0.6)",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.85)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.55)")}
                      >
                        Edit
                      </Link>
                    </div>
                  ))}

                  {/* View all link */}
                  <div
                    className="px-5 py-3 text-center"
                    style={{ borderTop: "0.5px solid rgba(91,33,182,0.06)" }}
                  >
                    <Link href="/surveys" className="text-xs font-semibold" style={{ color: "#3777A8" }}>
                      View all {surveys.length} survey{surveys.length !== 1 ? "s" : ""} →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── Section 4: Quick stats ──────────────────────────────────────── */}
          <section>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                {
                  label: "Surveys Created",
                  value: surveysLoaded ? String(totalSurveys) : "—",
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ),
                },
                {
                  label: "Responses Collected",
                  value: surveysLoaded ? String(totalResponses) : "—",
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ),
                },
                {
                  label: "Assessments Live",
                  value: surveysLoaded ? String(liveNow) : "—",
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                },
                {
                  label: "Library Instruments",
                  value: libraryCount !== null ? String(libraryCount) : "—",
                  icon: (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  ),
                },
              ].map(stat => (
                <div key={stat.label} className="p-5" style={GLASS}>
                  <div
                    className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: "rgba(91,33,182,0.07)", color: "#5b21b6" }}
                  >
                    {stat.icon}
                  </div>
                  <p
                    className="text-3xl font-bold leading-none"
                    style={{ fontFamily: "var(--font-playfair, Georgia, serif)", color: "#1e1b4b" }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className="mt-1.5 text-[9px] font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(30,27,75,0.4)" }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Footer */}
          <p className="text-center text-[10px]" style={{ color: "rgba(30,27,75,0.22)" }}>
            Metricly · Psychometric Intelligence for the Arab World
          </p>

        </div>
      </main>
    </div>
  )
}
