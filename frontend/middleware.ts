import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Routes under /surveys that are always public (no login needed)
const PUBLIC_SURVEY_PATTERN = /^\/surveys\/[^/]+\/respond(\/.*)?$/

export async function middleware(request: NextRequest) {
  // Skip for backend API proxy routes — they auth via Bearer token and the
  // Supabase cookie handling here would consume the POST body before it's
  // forwarded, causing 500s on any mutating request.
  if (request.nextUrl.pathname.startsWith("/api/v1")) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies to both the request (so subsequent middleware sees them)
          // and the response (so the browser receives them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not call supabase.auth.getSession() — use getUser() which
  // re-validates the token with the Supabase server on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Protected routes (login required) ───────────────────────────────────
  const isSurveysRoute = pathname.startsWith("/surveys")
  const isPublicSurveyRoute = PUBLIC_SURVEY_PATTERN.test(pathname)
  const isSkillsExplorerRoute = pathname.startsWith("/skills-explorer")
  const isCompetenciesRoute = pathname.startsWith("/competencies")
  const isStrawManRoute = pathname.startsWith("/straw-man")
  const isLibraryRoute = pathname.startsWith("/library")

  const isProtected =
    (isSurveysRoute && !isPublicSurveyRoute) ||
    isSkillsExplorerRoute ||
    isCompetenciesRoute ||
    isStrawManRoute ||
    isLibraryRoute

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Redirect authenticated users away from /login and /signup ───────────
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const url = request.nextUrl.clone()
    url.pathname = "/surveys"
    url.searchParams.delete("next")
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals, static files, and backend
     * API proxy routes (/api/v1/*). Backend API routes handle their own auth
     * via Bearer tokens — running the Supabase session middleware on them
     * blocks POST/PUT requests before they reach the backend.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
