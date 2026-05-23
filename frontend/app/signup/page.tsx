"use client"

import { useState, FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function SignupPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (!signInError) {
      router.push("/surveys")
      router.refresh()
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="card w-full max-w-sm p-8 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(16,185,129,0.12)" }}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#059669" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="section-heading">Check your email</h2>
          <p className="mt-2 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
            We sent a confirmation link to{" "}
            <span className="font-semibold" style={{ color: "#1e1b4b" }}>{email}</span>.
            Click the link to activate your account, then{" "}
            <Link href="/login" className="font-semibold" style={{ color: "#5b21b6" }}>sign in</Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="font-playfair text-2xl font-bold gradient-text">Metricly</span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
            style={{
              background: "rgba(91,33,182,0.1)",
              border: "0.5px solid rgba(91,33,182,0.2)",
              color: "#5b21b6",
            }}
          >
            Beta
          </span>
        </Link>
        <p className="mt-2 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
          Psychometric intelligence for the Arab world
        </p>
      </div>

      {/* Card */}
      <div className="card w-full max-w-sm overflow-hidden">
        <div
          className="border-b px-6 py-5"
          style={{ borderColor: "rgba(255,255,255,0.35)" }}
        >
          <h1 className="section-heading">Create your account</h1>
          <p className="mt-0.5 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold" style={{ color: "#5b21b6" }}>
              Sign in
            </Link>
          </p>
        </div>

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
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="label-caps mb-1.5 block">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
                Creating account…
              </>
            ) : "Create account"}
          </button>
        </form>
      </div>
    </div>
  )
}
