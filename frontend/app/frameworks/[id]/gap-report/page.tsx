"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getFramework,
  listEmployees,
  getGapReport,
  createEmployee,
  submitCompetencyScore,
} from "@/lib/api"
import type { CompetencyGap, EmployeeProfileOut, FrameworkOut, GapReport } from "@/lib/types"

// ---------------------------------------------------------------------------
// Gap bar component
// ---------------------------------------------------------------------------

function GapBar({ gap }: { gap: CompetencyGap }) {
  const hasData = gap.actual_score !== null
  const actual = gap.actual_score ?? 0
  const required = gap.required_score
  const actualPct = Math.min(actual, 100)
  const requiredPct = Math.min(required, 100)

  const barColor = hasData
    ? actual >= required
      ? "linear-gradient(90deg, #22c55e, #16a34a)"
      : gap.priority
      ? "linear-gradient(90deg, #ef4444, #dc2626)"
      : "linear-gradient(90deg, #f59e0b, #d97706)"
    : "rgba(30,27,75,0.1)"

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {gap.priority && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(239,68,68,0.12)", border: "0.5px solid rgba(239,68,68,0.3)", color: "#dc2626" }}
            >
              High Priority
            </span>
          )}
          {hasData && actual >= required && (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(34,197,94,0.1)", border: "0.5px solid rgba(34,197,94,0.3)", color: "#16a34a" }}
            >
              On Target
            </span>
          )}
        </div>
        <div className="text-right">
          {hasData ? (
            <>
              <span className="metric-value text-lg font-bold" style={{ color: "#1e1b4b" }}>
                {actual.toFixed(0)}
              </span>
              <span className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}> / {required.toFixed(0)}</span>
            </>
          ) : (
            <span className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>Not assessed</span>
          )}
        </div>
      </div>

      <p className="mb-3 text-sm font-semibold" style={{ color: "#1e1b4b" }}>{gap.competency_name}</p>

      {/* Dual-bar: actual vs required */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-16 text-right text-[9px]" style={{ color: "rgba(30,27,75,0.4)" }}>Actual</span>
          <div className="relative flex-1 h-3 overflow-hidden rounded-sm" style={{ background: "rgba(91,33,182,0.08)" }}>
            <div
              className="h-full rounded-sm transition-all duration-700"
              style={{ width: `${actualPct}%`, background: barColor }}
            />
          </div>
          {gap.actual_level && (
            <span className="w-6 text-xs font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>L{gap.actual_level}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-right text-[9px]" style={{ color: "rgba(30,27,75,0.4)" }}>Required</span>
          <div className="relative flex-1 h-3 overflow-hidden rounded-sm" style={{ background: "rgba(91,33,182,0.08)" }}>
            <div
              className="h-full rounded-sm"
              style={{ width: `${requiredPct}%`, background: "rgba(91,33,182,0.25)" }}
            />
          </div>
          <span className="w-6 text-xs font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>L{gap.required_level}</span>
        </div>
      </div>

      {hasData && gap.gap !== null && gap.gap > 0 && (
        <div className="mt-2 flex justify-end">
          <span className="text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>
            Gap: <strong style={{ color: gap.priority ? "#dc2626" : "#d97706" }}>{gap.gap.toFixed(1)} pts</strong>
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add score modal
// ---------------------------------------------------------------------------

function AddScoreForm({
  employeeId,
  frameworkId,
  competencies,
  onDone,
  onCancel,
}: {
  employeeId: string
  frameworkId: string
  competencies: { id: string; name: string }[]
  onDone: () => void
  onCancel: () => void
}) {
  const [competencyId, setCompetencyId] = useState(competencies[0]?.id ?? "")
  const [score, setScore] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const n = parseFloat(score)
    if (isNaN(n) || n < 0 || n > 100) {
      setErr("Score must be between 0 and 100")
      return
    }
    setSaving(true); setErr(null)
    try {
      await submitCompetencyScore(frameworkId, employeeId, {
        competency_id: competencyId,
        normalized_score: n,
      })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,10,40,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="card w-full max-w-sm p-6" style={{ position: "relative", zIndex: 1 }}>
        <h3 className="section-heading mb-4">Add Assessment Score</h3>
        <div className="space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">Competency</label>
            <select className="field" value={competencyId} onChange={e => setCompetencyId(e.target.value)}>
              {competencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-caps mb-1.5 block">Normalized score (0–100)</label>
            <input
              className="field"
              type="number"
              min={0} max={100} step={0.1}
              value={score}
              onChange={e => setScore(e.target.value)}
              placeholder="e.g. 72.5"
            />
          </div>
          {err && <p className="text-xs" style={{ color: "#dc2626" }}>{err}</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-ghost flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GapReportPage() {
  const { id } = useParams<{ id: string }>()
  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [employees, setEmployees] = useState<EmployeeProfileOut[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>("")
  const [report, setReport] = useState<GapReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddScore, setShowAddScore] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [addingEmployee, setAddingEmployee] = useState(false)

  async function loadBase() {
    setLoading(true); setError(null)
    try {
      const [fw, emps] = await Promise.all([getFramework(id), listEmployees(id)])
      setFramework(fw)
      setEmployees(emps)
      if (emps.length > 0) setSelectedEmployee(emps[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadReport(empId: string) {
    setReportLoading(true); setError(null)
    try {
      setReport(await getGapReport(id, empId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => { loadBase() }, [id])
  useEffect(() => {
    if (selectedEmployee) loadReport(selectedEmployee)
    else setReport(null)
  }, [selectedEmployee])

  async function handleAddEmployee() {
    if (!newName.trim()) return
    setAddingEmployee(true)
    try {
      const emp = await createEmployee(id, { name: newName.trim(), email: newEmail.trim() || null })
      setEmployees(prev => [...prev, emp])
      setSelectedEmployee(emp.id)
      setShowAddEmployee(false)
      setNewName(""); setNewEmail("")
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setAddingEmployee(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/frameworks" backLabel="Frameworks" />
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
          Loading…
        </div>
      </div>
    )
  }

  const readinessColor =
    !report ? "#1e1b4b"
    : report.overall_readiness >= 80 ? "#059669"
    : report.overall_readiness >= 60 ? "#3b82f6"
    : report.overall_readiness >= 40 ? "#f59e0b"
    : "#ef4444"

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/frameworks" backLabel="Frameworks" />

      {showAddScore && framework && (
        <AddScoreForm
          employeeId={selectedEmployee}
          frameworkId={id}
          competencies={framework.competencies}
          onDone={() => { setShowAddScore(false); loadReport(selectedEmployee) }}
          onCancel={() => setShowAddScore(false)}
        />
      )}

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          <div className="mb-8">
            <p className="eyebrow mb-1">Gap Analysis</p>
            <h1 className="page-title">{framework?.title ?? "…"}</h1>
            {framework?.role_title && (
              <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{framework.role_title}</p>
            )}
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {/* Employee selector */}
          <div className="card mb-6 p-5">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="label-caps mb-1.5 block">Employee</label>
                {employees.length === 0 ? (
                  <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>No employees yet — add one below.</p>
                ) : (
                  <select
                    className="field"
                    value={selectedEmployee}
                    onChange={e => setSelectedEmployee(e.target.value)}
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` · ${emp.department}` : ""}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {selectedEmployee && (
                  <button onClick={() => setShowAddScore(true)} className="btn-primary text-xs px-3 py-2">
                    + Score
                  </button>
                )}
                <button onClick={() => setShowAddEmployee(v => !v)} className="btn-ghost text-xs px-3 py-2">
                  + Employee
                </button>
              </div>
            </div>

            {showAddEmployee && (
              <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.35)" }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-caps mb-1 block">Name *</label>
                    <input className="field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <label className="label-caps mb-1 block">Email</label>
                    <input className="field" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="employee@company.com" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddEmployee(false)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                  <button onClick={handleAddEmployee} disabled={!newName.trim() || addingEmployee} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                    {addingEmployee ? "Adding…" : "Add Employee"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Readiness summary */}
          {report && !reportLoading && (
            <>
              <div className="card mb-6 p-5">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <p className="label-caps mb-1">Overall Readiness</p>
                    <p className="metric-value text-4xl font-bold" style={{ color: readinessColor }}>
                      {report.overall_readiness.toFixed(0)}%
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>
                      {report.overall_readiness >= 80 ? "On track — meets or exceeds most targets."
                        : report.overall_readiness >= 60 ? "Developing — approaching proficiency."
                        : "Needs development — significant gaps identified."}
                    </p>
                  </div>
                  {/* Radial progress */}
                  <div className="shrink-0">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(91,33,182,0.1)" strokeWidth="8" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke={readinessColor}
                        strokeWidth="8"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - report.overall_readiness / 100)}`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                        style={{ transition: "stroke-dashoffset 0.7s ease" }}
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Top priorities */}
              {report.top_priorities.length > 0 && (
                <div className="mb-6">
                  <h2 className="section-heading mb-3">Priority Development Areas</h2>
                  <div className="space-y-3">
                    {report.top_priorities.map(gap => (
                      <GapBar key={gap.competency_id} gap={gap} />
                    ))}
                  </div>
                </div>
              )}

              {/* All competencies */}
              <div>
                <h2 className="section-heading mb-3">All Competencies</h2>
                <div className="space-y-3">
                  {report.gaps.map(gap => (
                    <GapBar key={gap.competency_id} gap={gap} />
                  ))}
                </div>
              </div>
            </>
          )}

          {reportLoading && (
            <div className="flex items-center justify-center py-16 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
              Loading report…
            </div>
          )}

          {!report && !reportLoading && employees.length === 0 && !loading && (
            <div className="card p-8 text-center">
              <p className="section-heading mb-2">No employees yet</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                Add employees above, then submit assessment scores to generate gap reports.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
