"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { en } from "@/lib/i18n"
import { useAuth } from "@/components/AuthProvider"
import { createClient } from "@/lib/supabase/client"

interface HeaderProps {
  backHref?: string
  backLabel?: string
  pageTitle?: string
}

export default function Header({ backHref, backLabel, pageTitle }: HeaderProps) {
  const { user, role } = useAuth()
  const router = useRouter()
  const isAdmin = role === "admin"

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: "rgba(240,238,255,0.7)",
        borderColor: "rgba(255,255,255,0.5)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="text-lg font-bold tracking-tight font-playfair gradient-text"
          >
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

        {/* Breadcrumb */}
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

        {/* Nav */}
        {user && (
          <nav className="hidden items-center gap-1 sm:flex" style={{ position: "relative", zIndex: 1 }}>
            <Link
              href="/surveys"
              className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
              style={{ color: "rgba(30,27,75,0.6)", position: "relative" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.4)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              Assessments
            </Link>
            <Link
              href="/frameworks"
              className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
              style={{ color: "rgba(30,27,75,0.6)", position: "relative" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.4)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              Frameworks
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/alpha"
                  className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                  style={{ color: "rgba(30,27,75,0.6)", position: "relative" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.4)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  Psychometrics
                </Link>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                  style={{
                    background: "rgba(245,158,11,0.1)",
                    border: "0.5px solid rgba(245,158,11,0.3)",
                    color: "#b45309",
                  }}
                >
                  Admin
                </span>
              </>
            )}
          </nav>
        )}

        {/* Right */}
        <div className="flex items-center gap-3">
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
            API Docs
          </a>

          {user && (
            <>
              <span
                className="hidden text-xs sm:block truncate max-w-[160px]"
                style={{ color: "rgba(30,27,75,0.4)" }}
                title={user.email}
              >
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  background: "rgba(255,255,255,0.45)",
                  border: "0.5px solid rgba(255,255,255,0.75)",
                  color: "rgba(30,27,75,0.6)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
