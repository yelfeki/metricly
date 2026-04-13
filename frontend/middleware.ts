import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Routes under /surveys that are always public (no login needed)
const PUBLIC_SURVEY_PATTERN = /^\/surveys\/[^/]+\/respond(\/.*)?$/

export async function middleware(request: NextRequest) {
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

  // ── Protected: anything under /surveys except the respond page ──────────
  const isSurveysRoute = pathname.startsWith("/surveys")
  const isPublicSurveyRoute = PUBLIC_SURVEY_PATTERN.test(pathname)

  if (isSurveysRoute && !isPublicSurveyRoute && !user) {
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
     * Match all paths except Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
