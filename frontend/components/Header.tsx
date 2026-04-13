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
  const { user } = useAuth()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            {en.brand.name}
          </span>
          <span className="hidden rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 sm:block">
            Beta
          </span>
        </Link>

        {/* Separator + page breadcrumb */}
        {(backHref || pageTitle) && (
          <>
            <span className="text-slate-300">/</span>
            {backHref ? (
              <Link
                href={backHref}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel ?? en.nav.backToDashboard}
              </Link>
            ) : (
              <span className="text-sm font-medium text-slate-900">{pageTitle}</span>
            )}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-3">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors sm:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            API Docs
          </a>

          {user && (
            <>
              <span className="hidden text-xs text-slate-400 sm:block truncate max-w-[160px]" title={user.email}>
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
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
