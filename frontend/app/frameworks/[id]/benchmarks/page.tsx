"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getFramework,
  listBenchmarks,
  upsertBenchmark,
  listEmployees,
} from "@/lib/api"
import type { CompetencyOut, EmployeeProfileOut, FrameworkOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Score-to-level helper (mirrors backend logic)
// ---------------------------------------------------------------------------

function scoreToLevel(score: number, maxLevel: number): number {
  if (maxLevel <= 1) return 1
  for (let level = maxLevel; level >= 1; level--) {
    const threshold = Math.round(((level - 1) / (maxLevel - 1)) * 100 * 10) / 10
    if (score >= threshold) return level
  }
  return 1
}

// ---------------------------------------------------------------------------
// Per-competency benchmark row
// ---------------------------------------------------------------------------

function BenchmarkRow({
  competency,
  currentScore,
  maxLevel,
  onChange,
}: {
  competency: CompetencyOut
  currentScore: number
  maxLevel: number
  onChange: (score: number) => void
}) {
  const level = scoreToLevel(currentScore, maxLevel)
  const levelColors = ["", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#059669"]
  const color = levelColors[Math.min(level, 5)] ?? "#5b21b6"

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{competency.name}</p>
          {competency.description && (
            <p className="mt-0.5 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>{competency.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: `${color}18`, color }}
          >
            L{level}
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0} max={100} step={1}
              className="field w-20 text-center text-sm"
              value={currentScore}
              onChange={e => {
                const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                onChange(v)
              }}
            />
            <span className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>/ 100</span>
          </div>
        </div>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "rgba(91,33,182,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${currentScore}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BenchmarksPage() {
  const { id } = useParams<{ id: string }>()
  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [employees, setEmployees] = useState<EmployeeProfileOut[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [fw, benchmarks, emps] = await Promise.all([
        getFramework(id),
        listBenchmarks(id),
        listEmployees(id),
      ])
      setFramework(fw)
      setEmployees(emps)
      const initial: Record<string, number> = {}
      for (const comp of fw.competencies) {
        const existing = benchmarks.find(b => b.competency_id === comp.id)
        initial[comp.id] = existing?.required_score ?? 60
      }
      setScores(initial)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function saveAll() {
    if (!framework) return
    setSaving(true); setError(null)
    try {
      const maxLevel = framework.proficiency_levels.length || 5
      for (const comp of framework.competencies) {
        const score = scores[comp.id] ?? 60
        const level = scoreToLevel(score, maxLevel)
        await upsertBenchmark(id, {
          competency_id: comp.id,
          required_score: score,
          required_level: level,
        })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/frameworks" backLabel="Frameworks" />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>Loading…</div>
      </div>
    )
  }

  const maxLevel = framework?.proficiency_levels.length || 5

  // Preview: % of employees meeting each benchmark (based on latest scores — but we don't have them here,
  // so this is a conceptual preview based on the set threshold)
  const competencyCount = framework?.competencies.length ?? 0

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/frameworks" backLabel="Frameworks" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-1">Role Benchmarks</p>
              <h1 className="page-title">{framework?.title ?? "…"}</h1>
              {framework?.role_title && (
                <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{framework.role_title}</p>
              )}
            </div>
            <button
              onClick={saveAll}
              disabled={saving}
              className="btn-primary shrink-0 disabled:opacity-50"
            >
              {saved ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              ) : saving ? "Saving…" : "Save Benchmarks"}
            </button>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {/* Info card */}
          <div
            className="mb-6 rounded-[14px] p-4 text-sm"
            style={{ background: "rgba(91,33,182,0.06)", border: "0.5px solid rgba(91,33,182,0.15)", color: "rgba(30,27,75,0.6)" }}
          >
            Set the minimum required score (0–100) for each competency. The proficiency level is derived automatically.
            These benchmarks are used in individual and team benchmark reports.
          </div>

          {/* Summary */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Competencies</p>
              <p className="metric-value text-2xl font-bold" style={{ color: "#1e1b4b" }}>{competencyCount}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Avg Target</p>
              <p className="metric-value text-2xl font-bold" style={{ color: "#5b21b6" }}>
                {competencyCount > 0
                  ? Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / competencyCount)
                  : "—"}
              </p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Employees</p>
              <p className="metric-value text-2xl font-bold" style={{ color: "#1e1b4b" }}>{employees.length}</p>
            </div>
          </div>

          {/* Benchmark sliders */}
          {framework?.competencies.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="section-heading mb-1">No competencies</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>Add competencies to this framework first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {framework?.competencies.map(comp => (
                <BenchmarkRow
                  key={comp.id}
                  competency={comp}
                  currentScore={scores[comp.id] ?? 60}
                  maxLevel={maxLevel}
                  onChange={v => setScores(prev => ({ ...prev, [comp.id]: v }))}
                />
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={saveAll}
              disabled={saving || competencyCount === 0}
              className="btn-primary disabled:opacity-50"
            >
              {saved ? "Saved ✓" : saving ? "Saving…" : "Save All Benchmarks"}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
