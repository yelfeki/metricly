"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import React, { useState } from "react"
import {
  IconBook2,
  IconBuildingCommunity,
  IconChartArrows,
  IconChevronDown,
  IconChevronLeft,
  IconCompass,
  IconFlask,
  IconLogout,
  IconMenu2,
  IconRocket,
  IconSparkles,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react"
import { en } from "@/lib/i18n"
import { useAuth } from "@/components/AuthProvider"
import { createClient } from "@/lib/supabase/client"
import MetriclyMark from "@/components/MetriclyMark"

// ---------------------------------------------------------------------------
// Nav structure
// ---------------------------------------------------------------------------

interface NavItem {
  label: string
  href: string
  description: string
  Icon: typeof IconSparkles
}

interface NavGroup {
  id: string
  label: string
  Icon: typeof IconSparkles
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "explore",
    label: "Explore",
    Icon: IconCompass,
    items: [
      {
        label: "Skills Explorer",
        href: "/skills-explorer",
        description: "AI diagnostic chatbot for instrument recommendations",
        Icon: IconSparkles,
      },
      {
        label: "Scale Library",
        href: "/library",
        description: "Browse 25+ validated psychometric instruments",
        Icon: IconBook2,
      },
      {
        label: "Industry Library",
        href: "/library/industries",
        description: "71 industry-specific psychological scales",
        Icon: IconBuildingCommunity,
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    Icon: IconChartArrows,
    items: [
      {
        label: "Competency Builder",
        href: "/straw-man",
        description: "Generate role-specific assessment blueprints",
        Icon: IconChartArrows,
      },
      {
        label: "Competency Frameworks",
        href: "/competencies",
        description: "Browse Korn Ferry, O*NET, and core behavioural frameworks",
        Icon: IconBook2,
      },
      {
        label: "My Frameworks",
        href: "/frameworks",
        description: "Your custom competency and gap-analysis frameworks",
        Icon: IconBuildingCommunity,
      },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    Icon: IconRocket,
    items: [
      {
        label: "Surveys",
        href: "/surveys",
        description: "Create, send, and manage assessments",
        Icon: IconRocket,
      },
      {
        label: "My Growth",
        href: "/portal",
        description: "Your personal assessment results and growth tracking",
        Icon: IconTrendingUp,
      },
    ],
  },
]

const GROUP_PREFIXES: Record<string, string[]> = {
  explore: ["/skills-explorer", "/library"],
  build: ["/straw-man", "/competencies", "/frameworks"],
  deploy: ["/surveys", "/portal"],
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeaderProps {
  backHref?: string
  backLabel?: string
  pageTitle?: string
}

// ---------------------------------------------------------------------------
// Header
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

  const activeGroupId = (() => {
    for (const [groupId, prefixes] of Object.entries(GROUP_PREFIXES)) {
      if (prefixes.some(p => pathname.startsWith(p))) return groupId
    }
    return null
  })()

  const avatarInitial = user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <>
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(255,252,246,0.92)",  // var(--mx-surface) at 92%
          borderBottom: "1px solid var(--mx-line)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6">
          {/* Brand — gradient-stroke "M" mark + lowercase italic Instrument Serif
              wordmark with persimmon period (the product's "beauty mark"). The
              wordmark text is hard-coded here (not i18n) because it IS the brand
              and never localises. */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label={en.brand.name}
          >
            <MetriclyMark size={36} variant="gradient" />
            <span
              style={{
                fontFamily: "var(--mx-font-display)",
                fontSize: 36,
                fontStyle: "italic",
                fontWeight: 400,
                letterSpacing: "-0.018em",
                color: "var(--mx-ink)",
                lineHeight: 1,
              }}
            >
              metricly<span style={{ color: "var(--mx-clay)" }}>.</span>
            </span>
            <span
              className="hidden sm:inline-flex"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--mx-ink)",
                background: "rgba(226,177,70,0.18)",
                border: "1px solid rgba(226,177,70,0.4)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              Beta
            </span>
          </Link>

          {/* Breadcrumb (when backHref or pageTitle is set) */}
          {(backHref || pageTitle) && (
            <>
              <span style={{ color: "var(--mx-ink-3)", fontSize: 14 }}>/</span>
              {backHref ? (
                <Link
                  href={backHref}
                  className="flex items-center gap-1.5 transition-colors"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    color: "var(--mx-ink-2)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--mx-ink)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--mx-ink-2)")}
                >
                  <IconChevronLeft size={14} stroke={1.6} />
                  {backLabel ?? en.nav.backToDashboard}
                </Link>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--mx-ink)",
                  }}
                >
                  {pageTitle}
                </span>
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
                const GroupIcon = group.Icon
                return (
                  <div
                    key={group.id}
                    className="relative"
                    onMouseEnter={() => openGroup(group.id)}
                    onMouseLeave={scheduleClose}
                  >
                    <button
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        background:
                          isActive || isOpen ? "var(--mx-paper-2)" : "transparent",
                        color: isActive ? "var(--mx-ink)" : "var(--mx-ink-2)",
                      }}
                    >
                      <GroupIcon size={14} stroke={1.6} />
                      {group.label}
                      <IconChevronDown
                        size={11}
                        stroke={1.8}
                        style={{
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform var(--mx-dur-fast) var(--mx-ease)",
                          color: "var(--mx-ink-3)",
                        }}
                      />
                    </button>

                    {/* Dropdown — pt-2 bridges hover gap */}
                    {isOpen && (
                      <div className="absolute left-1/2 top-full w-72 -translate-x-1/2 pt-2">
                        <div
                          style={{
                            background: "var(--mx-surface)",
                            border: "1px solid var(--mx-line)",
                            borderRadius: "var(--mx-r-lg)",
                            boxShadow: "var(--mx-shadow-pop)",
                            padding: 8,
                          }}
                        >
                          <div className="px-3 pb-1.5 pt-1">
                            <p className="mx-eyebrow">{group.label}</p>
                          </div>
                          {group.items.map(item => (
                            <DropdownItem
                              key={item.href}
                              item={item}
                              onClose={() => setActiveGroup(null)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Admin badge — butter accent */}
              {isAdmin && (
                <Link
                  href="/alpha"
                  className="ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all"
                  style={{
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 12,
                    fontWeight: 500,
                    background: "rgba(226,177,70,0.14)",
                    color: "var(--mx-ink)",
                    border: "1px solid rgba(226,177,70,0.35)",
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = "rgba(226,177,70,0.22)")
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = "rgba(226,177,70,0.14)")
                  }
                >
                  <IconFlask size={13} stroke={1.6} />
                  Psychometrics
                </Link>
              )}
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* API docs — dev only — sage status */}
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1 sm:flex"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 11,
                fontWeight: 500,
                background: "var(--mx-paper-2)",
                border: "1px solid var(--mx-line)",
                color: "var(--mx-ink-2)",
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
              API
            </a>

            {user && (
              <>
                {/* Avatar + sign-out hover card */}
                <div className="relative group">
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: "var(--mx-grad-cool)",
                      color: "var(--mx-paper)",
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                    title={user.email ?? ""}
                  >
                    {avatarInitial}
                  </button>
                  <div
                    className="absolute right-0 top-full mt-2 hidden min-w-[200px] group-hover:block"
                    style={{
                      background: "var(--mx-surface)",
                      border: "1px solid var(--mx-line)",
                      borderRadius: "var(--mx-r-lg)",
                      boxShadow: "var(--mx-shadow-pop)",
                      padding: 8,
                    }}
                  >
                    <p
                      className="truncate px-3 py-1.5"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 11,
                        color: "var(--mx-ink-3)",
                      }}
                    >
                      {user.email}
                    </p>
                    <hr style={{ border: 0, borderTop: "1px solid var(--mx-line)" }} />
                    <button
                      onClick={handleLogout}
                      className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-all"
                      style={{
                        fontFamily: "var(--mx-font-sans)",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--mx-rose)",
                        background: "transparent",
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = "rgba(194,78,78,0.07)")
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <IconLogout size={13} stroke={1.6} />
                      Sign out
                    </button>
                  </div>
                </div>

                {/* Mobile hamburger */}
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full sm:hidden"
                  style={{
                    background: "var(--mx-paper-2)",
                    border: "1px solid var(--mx-line)",
                    color: "var(--mx-ink)",
                  }}
                  onClick={() => setMobileOpen(o => !o)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <IconX size={15} stroke={1.6} /> : <IconMenu2 size={15} stroke={1.6} />}
                </button>
              </>
            )}

            {!user && (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "var(--mx-grad-cool)",
                  color: "var(--mx-paper)",
                  boxShadow: "var(--mx-shadow-card)",
                }}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && user && (
        <div
          className="fixed inset-x-0 top-16 z-30 sm:hidden"
          style={{
            background: "var(--mx-surface)",
            borderBottom: "1px solid var(--mx-line)",
            boxShadow: "var(--mx-shadow-hover)",
          }}
        >
          <div className="space-y-4 px-4 py-4">
            {NAV_GROUPS.map(group => (
              <div key={group.id}>
                <p className="mx-eyebrow mb-2 px-1">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const ItemIcon = item.Icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-all"
                        style={{
                          fontFamily: "var(--mx-font-sans)",
                          color: "var(--mx-ink)",
                        }}
                        onMouseEnter={e =>
                          (e.currentTarget.style.background = "var(--mx-paper-2)")
                        }
                        onMouseLeave={e =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]"
                          style={{
                            background: "var(--mx-paper-2)",
                            color: "var(--mx-forest)",
                          }}
                        >
                          <ItemIcon size={15} stroke={1.6} />
                        </div>
                        <div className="min-w-0">
                          <p style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</p>
                          <p style={{ fontSize: 10, color: "var(--mx-ink-3)" }}>
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
            {isAdmin && (
              <Link
                href="/alpha"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-[10px] px-3 py-2.5"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  background: "rgba(226,177,70,0.14)",
                  color: "var(--mx-ink)",
                  border: "1px solid rgba(226,177,70,0.35)",
                }}
              >
                <IconFlask size={14} stroke={1.6} />
                Psychometrics (Admin)
              </Link>
            )}
            <div style={{ borderTop: "1px solid var(--mx-line)", paddingTop: 12 }}>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--mx-rose)",
                }}
              >
                <IconLogout size={14} stroke={1.6} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Dropdown item
// ---------------------------------------------------------------------------

function DropdownItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const ItemIcon = item.Icon
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className="flex items-start gap-3 rounded-[10px] px-3 py-2.5 transition-all"
      style={{
        fontFamily: "var(--mx-font-sans)",
        color: "var(--mx-ink)",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--mx-paper-2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: "var(--mx-paper-2)",
          color: "var(--mx-forest)",
        }}
      >
        <ItemIcon size={15} stroke={1.6} />
      </div>
      <div className="min-w-0">
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--mx-ink)" }}>
          {item.label}
        </p>
        <p
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: "var(--mx-ink-3)",
            marginTop: 2,
          }}
        >
          {item.description}
        </p>
      </div>
    </Link>
  )
}
