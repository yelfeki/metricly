"use client"

import { useState, FormEvent, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/surveys"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
      {error && <div className="alert-error">{error}</div>}

      <div>
        <label htmlFor="email" className="label-caps mb-1.5 block">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="field"
        />
      </div>

      <div>
        <label htmlFor="password" className="label-caps mb-1.5 block">Password</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          className="field"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Signing in…
          </>
        ) : "Sign in"}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="font-playfair text-2xl font-bold gradient-text">Metricly</span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
            style={{
              background: "rgba(15,40,65,0.1)",
              border: "0.5px solid rgba(15,40,65,0.2)",
              color: "#0F2841",
            }}
          >
            Beta
          </span>
        </Link>
        <p className="mt-2 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
          Psychometric intelligence for the Arab world
        </p>
      </div>

      {/* Card */}
      <div className="card w-full max-w-sm overflow-hidden">
        <div
          className="border-b px-6 py-5"
          style={{ borderColor: "rgba(255,255,255,0.35)" }}
        >
          <h1 className="section-heading">Sign in to your account</h1>
          <p className="mt-0.5 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold" style={{ color: "#0F2841" }}>
              Sign up
            </Link>
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
