"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import React, { useState } from "react"
import { en } from "@/lib/i18n"
import { useAuth } from "@/components/AuthProvider"
import { createClient } from "@/lib/supabase/client"

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

interface NavItem {
  label: string
  href: string
  description: string
  icon: React.ReactNode
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

function IconExplore() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  )
}
function IconBuild() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
function IconDeploy() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "explore",
    label: "Explore",
    items: [
      {
        label: "Skills Explorer",
        href: "/skills-explorer",
        description: "AI diagnostic chatbot for instrument recommendations",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
        ),
      },
      {
        label: "Scale Library",
        href: "/library",
        description: "Browse 25+ validated psychometric instruments",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
      },
      {
        label: "Industry Library",
        href: "/library/industries",
        description: "71 industry-specific psychological scales",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    items: [
      {
        label: "Competency Builder",
        href: "/straw-man",
        description: "Generate role-specific assessment blueprints",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        ),
      },
      {
        label: "Competency Frameworks",
        href: "/competencies",
        description: "Browse Korn Ferry, O*NET, and core behavioral frameworks",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        label: "My Frameworks",
        href: "/frameworks",
        description: "Your custom competency and gap-analysis frameworks",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    items: [
      {
        label: "Surveys",
        href: "/surveys",
        description: "Create, send, and manage assessments",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
      {
        label: "My Growth",
        href: "/portal",
        description: "Your personal assessment results and growth tracking",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        ),
      },
    ],
  },
]

// Routes that activate each group
const GROUP_PREFIXES: Record<string, string[]> = {
  explore: ["/skills-explorer", "/library"],
  build: ["/straw-man", "/competencies", "/frameworks"],
  deploy: ["/surveys", "/portal"],
}

// ---------------------------------------------------------------------------
// Header props
// ---------------------------------------------------------------------------

interface HeaderProps {
  backHref?: string
  backLabel?: string
  pageTitle?: string
}

// ---------------------------------------------------------------------------
// Desktop dropdown item
// ---------------------------------------------------------------------------

function DropdownItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all"
      style={{ color: "rgba(30,27,75,0.75)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,33,182,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
      >
        {item.icon}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "#1e1b4b" }}>{item.label}</p>
        <p className="text-[11px] leading-snug mt-0.5" style={{ color: "rgba(30,27,75,0.5)" }}>
          {item.description}
        </p>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main Header
// ---------------------------------------------------------------------------

export default function Header({ backHref, backLabel, pageTitle }: HeaderProps) {
  const { user, role } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isAdmin = role === "admin"

  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function openGroup(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setActiveGroup(id)
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setActiveGroup(null), 150)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  function getActiveGroupId(): string | null {
    for (const [groupId, prefixes] of Object.entries(GROUP_PREFIXES)) {
      if (prefixes.some(p => pathname.startsWith(p))) return groupId
    }
    return null
  }

  const activeGroupId = getActiveGroupId()

  // Derive a short name from email for the avatar
  const avatarInitial = user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: "rgba(240,238,255,0.8)",
          borderColor: "rgba(255,255,255,0.5)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">

          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-bold tracking-tight font-playfair gradient-text">
              {en.brand.name}
            </span>
            <span
              className="hidden rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest sm:block"
              style={{
                background: "rgba(91,33,182,0.1)",
                border: "0.5px solid rgba(91,33,182,0.2)",
                color: "#5b21b6",
              }}
            >
              Beta
            </span>
          </Link>

          {/* Breadcrumb (when backHref or pageTitle is set) */}
          {(backHref || pageTitle) && (
            <>
              <span style={{ color: "rgba(30,27,75,0.2)" }}>/</span>
              {backHref ? (
                <Link
                  href={backHref}
                  className="flex items-center gap-1.5 text-sm transition-colors"
                  style={{ color: "rgba(30,27,75,0.5)" }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {backLabel ?? en.nav.backToDashboard}
                </Link>
              ) : (
                <span className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{pageTitle}</span>
              )}
            </>
          )}

          <div className="flex-1" />

          {/* Desktop grouped nav */}
          {user && !backHref && !pageTitle && (
            <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Main navigation">
              {NAV_GROUPS.map(group => {
                const isActive = activeGroupId === group.id
                const isOpen = activeGroup === group.id

                return (
                  <div
                    key={group.id}
                    className="relative"
                    onMouseEnter={() => openGroup(group.id)}
                    onMouseLeave={scheduleClose}
                  >
                    <button
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                      style={{
                        background: isActive || isOpen ? "rgba(91,33,182,0.1)" : "",
                        color: isActive ? "#5b21b6" : "rgba(30,27,75,0.65)",
                      }}
                    >
                      {group.id === "explore" && <IconExplore />}
                      {group.id === "build" && <IconBuild />}
                      {group.id === "deploy" && <IconDeploy />}
                      {group.label}
                      <svg
                        className="h-3 w-3 transition-transform"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: "rgba(30,27,75,0.35)" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown — pt-2 bridges the gap between button and panel so
                        the mouse never leaves the hover zone while moving down */}
                    {isOpen && (
                      <div className="absolute left-1/2 top-full w-72 -translate-x-1/2 pt-2">
                        <div
                          className="rounded-2xl p-2"
                          style={{
                            background: "rgba(248,246,255,0.97)",
                            border: "0.5px solid rgba(91,33,182,0.12)",
                            boxShadow: "0 8px 32px rgba(30,27,75,0.12), 0 2px 8px rgba(91,33,182,0.08)",
                            backdropFilter: "blur(20px)",
                          }}
                        >
                          {/* Group label */}
                          <div className="px-3 pb-1.5 pt-1">
                            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(91,33,182,0.5)" }}>
                              {group.label}
                            </p>
                          </div>
                          {group.items.map(item => (
                            <DropdownItem key={item.href} item={item} onClose={() => setActiveGroup(null)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Admin badge */}
              {isAdmin && (
                <Link
                  href="/alpha"
                  className="ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                  style={{ color: "#b45309", background: "rgba(245,158,11,0.08)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.14)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.08)")}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                  Psychometrics
                </Link>
              )}
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* API docs — dev only */}
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all sm:flex"
              style={{
                background: "rgba(255,255,255,0.45)",
                border: "0.5px solid rgba(255,255,255,0.75)",
                color: "rgba(30,27,75,0.55)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              API
            </a>

            {user && (
              <>
                {/* Avatar + logout */}
                <div className="relative group">
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #5b21b6, #3777A8)" }}
                    title={user.email ?? ""}
                  >
                    {avatarInitial}
                  </button>
                  {/* Hover card */}
                  <div
                    className="absolute right-0 top-full mt-2 hidden min-w-[180px] rounded-xl p-2 group-hover:block"
                    style={{
                      background: "rgba(248,246,255,0.97)",
                      border: "0.5px solid rgba(91,33,182,0.12)",
                      boxShadow: "0 8px 32px rgba(30,27,75,0.12)",
                      backdropFilter: "blur(20px)",
                    }}
                  >
                    <p className="truncate px-3 py-1.5 text-[11px]" style={{ color: "rgba(30,27,75,0.45)" }}>
                      {user.email}
                    </p>
                    <hr style={{ borderColor: "rgba(91,33,182,0.08)" }} />
                    <button
                      onClick={handleLogout}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition-all"
                      style={{ color: "#dc2626" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                    >
                      Sign out
                    </button>
                  </div>
                </div>

                {/* Mobile hamburger */}
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-all sm:hidden"
                  style={{ background: "rgba(255,255,255,0.45)", border: "0.5px solid rgba(255,255,255,0.7)" }}
                  onClick={() => setMobileOpen(o => !o)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </>
            )}

            {!user && (
              <Link href="/login" className="btn-primary text-xs px-3 py-1.5">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && user && (
        <div
          className="fixed inset-x-0 top-14 z-30 border-b sm:hidden"
          style={{
            background: "rgba(240,238,255,0.97)",
            borderColor: "rgba(255,255,255,0.5)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="px-4 py-4 space-y-4">
            {NAV_GROUPS.map(group => (
              <div key={group.id}>
                <p
                  className="mb-2 text-[9px] font-bold uppercase tracking-widest px-1"
                  style={{ color: "rgba(91,33,182,0.5)" }}
                >
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                      style={{ color: "rgba(30,27,75,0.8)" }}
                    >
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold">{item.label}</p>
                        <p className="text-[10px]" style={{ color: "rgba(30,27,75,0.45)" }}>{item.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {isAdmin && (
              <Link
                href="/alpha"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ color: "#b45309" }}
              >
                <span className="text-[13px] font-semibold">Psychometrics (Admin)</span>
              </Link>
            )}
            <div className="border-t pt-3" style={{ borderColor: "rgba(91,33,182,0.08)" }}>
              <button
                onClick={handleLogout}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold"
                style={{ color: "#dc2626" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
