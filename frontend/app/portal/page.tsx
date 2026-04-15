"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import { getMyProfiles, getEmployeeGrowth } from "@/lib/api"
import type { EmployeeProfileOut, GrowthProfile } from "@/lib/types"

// ---------------------------------------------------------------------------
// Mini gap bar — horizontal bar showing current vs benchmark
// ---------------------------------------------------------------------------

function MiniBar({
  score,
  benchmark,
  label,
}: {
  score: number | null
  benchmark: number | null
  label: string
}) {
  const pct = score ?? 0
  const bPct = benchmark ?? null
  const statusColor =
    score === null ? "rgba(91,33,182,0.2)"
    : benchmark === null ? "#5b21b6"
    : score >= benchmark + 10 ? "#059669"
    : score >= benchmark ? "#2563eb"
    : score >= benchmark - 20 ? "#f59e0b"
    : "#ef4444"

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: "#1e1b4b" }}>{label}</span>
        <span style={{ color: "rgba(30,27,75,0.45)" }}>
          {score !== null ? `${score.toFixed(0)}${benchmark !== null ? ` / ${benchmark.toFixed(0)}` : ""}` : "—"}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "rgba(91,33,182,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: statusColor }}
        />
        {bPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5"
            style={{ left: `${bPct}%`, background: "rgba(30,27,75,0.3)" }}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

function ProfileCard({ profile }: { profile: GrowthProfile }) {
  const assessed = profile.competency_trends.filter(t => t.current_score !== null)
  const improving = profile.competency_trends.filter(t => t.trend === "improving").length
  const hasBenchmarks = profile.competency_trends.some(t => t.benchmark_score !== null)
  const onTarget = profile.competency_trends.filter(
    t => t.benchmark_status === "meeting" || t.benchmark_status === "exceeding"
  ).length
  const belowTarget = profile.competency_trends.filter(t => t.benchmark_status === "below").length

  return (
    <div className="card p-5">
      {/* Framework label */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{profile.framework_title}</p>
          {profile.role_title && (
            <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>{profile.role_title}</p>
          )}
        </div>
        <Link
          href={`/employees/${profile.employee_id}/growth`}
          className="btn-ghost shrink-0 text-xs px-3 py-1.5"
          style={{ position: "relative", zIndex: 1 }}
        >
          Full Report →
        </Link>
      </div>

      {/* Quick stats */}
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl py-2" style={{ background: "rgba(91,33,182,0.04)" }}>
          <p className="label-caps mb-0.5">Assessed</p>
          <p className="text-sm font-bold" style={{ color: "#1e1b4b" }}>{assessed.length}/{profile.competency_trends.length}</p>
        </div>
        <div className="rounded-xl py-2" style={{ background: improving > 0 ? "rgba(34,197,94,0.06)" : "rgba(91,33,182,0.04)" }}>
          <p className="label-caps mb-0.5">Improving</p>
          <p className="text-sm font-bold" style={{ color: improving > 0 ? "#16a34a" : "rgba(30,27,75,0.35)" }}>{improving}</p>
        </div>
        {hasBenchmarks ? (
          <div className="rounded-xl py-2" style={{ background: belowTarget > 0 ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)" }}>
            <p className="label-caps mb-0.5">{belowTarget > 0 ? "Gaps" : "On target"}</p>
            <p className="text-sm font-bold" style={{ color: belowTarget > 0 ? "#dc2626" : "#16a34a" }}>
              {belowTarget > 0 ? belowTarget : onTarget}
            </p>
          </div>
        ) : (
          <div className="rounded-xl py-2" style={{ background: "rgba(91,33,182,0.04)" }}>
            <p className="label-caps mb-0.5">Skills</p>
            <p className="text-sm font-bold" style={{ color: "#1e1b4b" }}>{profile.competency_trends.length}</p>
          </div>
        )}
      </div>

      {/* Competency bars */}
      {assessed.length > 0 && (
        <div>
          <p className="label-caps mb-2">Competency Scores</p>
          {profile.competency_trends.map(t => (
            <MiniBar
              key={t.competency_id}
              score={t.current_score}
              benchmark={t.benchmark_score}
              label={t.competency_name}
            />
          ))}
          {hasBenchmarks && (
            <p className="mt-2 text-[9px]" style={{ color: "rgba(30,27,75,0.35)" }}>
              Vertical line = benchmark target
            </p>
          )}
        </div>
      )}

      {assessed.length === 0 && (
        <div className="rounded-xl py-5 text-center" style={{ background: "rgba(91,33,182,0.04)" }}>
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>No assessments recorded yet.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PortalPage() {
  const [profiles, setProfiles] = useState<EmployeeProfileOut[]>([])
  const [growthData, setGrowthData] = useState<GrowthProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const myProfiles = await getMyProfiles()
        setProfiles(myProfiles)
        // Load growth data for each profile in parallel
        const growthResults = await Promise.allSettled(
          myProfiles.map(p => getEmployeeGrowth(p.id))
        )
        setGrowthData(
          growthResults
            .filter((r): r is PromiseFulfilledResult<GrowthProfile> => r.status === "fulfilled")
            .map(r => r.value)
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
          Loading your profile…
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header pageTitle="My Portal" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          {/* Hero */}
          <div className="mb-8">
            <p className="eyebrow mb-1">Employee Portal</p>
            <h1 className="page-title">Your Growth Profile</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              Track your competency development and progress toward role benchmarks.
            </p>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {/* No profiles */}
          {profiles.length === 0 && !loading && (
            <div className="card p-10 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "rgba(91,33,182,0.08)" }}
              >
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "#5b21b6" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="section-heading mb-2">You&apos;re not enrolled yet</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                Ask your manager to add you to a competency framework to start tracking your growth.
              </p>
            </div>
          )}

          {/* Growth cards */}
          {growthData.length > 0 && (
            <div className="space-y-6">
              {growthData.map(gp => (
                <ProfileCard key={gp.employee_id} profile={gp} />
              ))}
            </div>
          )}

          {/* Profiles with no growth data yet */}
          {profiles.length > 0 && growthData.length === 0 && (
            <div className="space-y-3">
              {profiles.map(p => (
                <div key={p.id} className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{p.name}</p>
                      {p.role_title && (
                        <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>{p.role_title}</p>
                      )}
                    </div>
                    <Link
                      href={`/employees/${p.id}/growth`}
                      className="btn-ghost text-xs px-3 py-1.5"
                      style={{ position: "relative", zIndex: 1 }}
                    >
                      View Growth →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Encouragement footer */}
          {profiles.length > 0 && (
            <div
              className="mt-8 rounded-[14px] p-5 text-center"
              style={{ background: "rgba(91,33,182,0.04)", border: "0.5px solid rgba(91,33,182,0.12)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>
                Growth is a journey, not a destination.
              </p>
              <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>
                Every assessment is a snapshot of where you are today — not a verdict on who you can become.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
