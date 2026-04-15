"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getFramework,
  listPulseSchedules,
  createPulseSchedule,
  updatePulseSchedule,
  deletePulseSchedule,
  getSurveys,
} from "@/lib/api"
import type { FrameworkOut, PulseFrequency, PulseScheduleOut, SurveyListItem } from "@/lib/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FREQ_LABELS: Record<PulseFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Schedule card
// ---------------------------------------------------------------------------

function ScheduleCard({
  schedule,
  surveyName,
  onToggle,
  onDelete,
  toggling,
  deleting,
}: {
  schedule: PulseScheduleOut
  surveyName: string
  onToggle: () => void
  onDelete: () => void
  toggling: boolean
  deleting: boolean
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={
                schedule.is_active
                  ? { background: "rgba(34,197,94,0.1)", border: "0.5px solid rgba(34,197,94,0.3)", color: "#16a34a" }
                  : { background: "rgba(30,27,75,0.07)", border: "0.5px solid rgba(30,27,75,0.15)", color: "rgba(30,27,75,0.4)" }
              }
            >
              {schedule.is_active ? "Active" : "Inactive"}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
            >
              {FREQ_LABELS[schedule.frequency as PulseFrequency] ?? schedule.frequency}
            </span>
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: "#1e1b4b" }}>{surveyName}</p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
            <div>
              <span className="label-caps block mb-0.5">Start</span>
              {formatDate(schedule.start_date)}
            </div>
            <div>
              <span className="label-caps block mb-0.5">End</span>
              {formatDate(schedule.end_date)}
            </div>
            <div>
              <span className="label-caps block mb-0.5">Next</span>
              <span style={{ color: schedule.next_assessment_date ? "#5b21b6" : "rgba(30,27,75,0.35)" }}>
                {formatDate(schedule.next_assessment_date)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            onClick={onToggle}
            disabled={toggling}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {toggling ? "…" : schedule.is_active ? "Pause" : "Activate"}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="btn-danger text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PulsePage() {
  const { id } = useParams<{ id: string }>()
  const [framework, setFramework] = useState<FrameworkOut | null>(null)
  const [schedules, setSchedules] = useState<PulseScheduleOut[]>([])
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [surveyId, setSurveyId] = useState("")
  const [frequency, setFrequency] = useState<PulseFrequency>("monthly")
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0])
  const [endDate, setEndDate] = useState("")
  const [creating, setCreating] = useState(false)

  // Per-card loading states
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [fw, sched, survs] = await Promise.all([
        getFramework(id),
        listPulseSchedules(id),
        getSurveys(),
      ])
      setFramework(fw)
      setSchedules(sched)
      setSurveys(survs)
      if (survs.length > 0 && !surveyId) setSurveyId(survs[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleCreate() {
    if (!surveyId) return
    setCreating(true); setError(null)
    try {
      const ps = await createPulseSchedule(id, {
        survey_id: surveyId,
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        is_active: true,
      })
      setSchedules(prev => [ps, ...prev])
      setShowCreate(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleToggle(ps: PulseScheduleOut) {
    setToggling(ps.id)
    try {
      const updated = await updatePulseSchedule(id, ps.id, { is_active: !ps.is_active })
      setSchedules(prev => prev.map(s => s.id === ps.id ? updated : s))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(psId: string) {
    if (!confirm("Delete this pulse schedule?")) return
    setDeleting(psId)
    try {
      await deletePulseSchedule(id, psId)
      setSchedules(prev => prev.filter(s => s.id !== psId))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
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

  const activeCount = schedules.filter(s => s.is_active).length
  const surveyMap = Object.fromEntries(surveys.map(s => [s.id, s.name]))

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/frameworks" backLabel="Frameworks" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-1">Pulse Checks</p>
              <h1 className="page-title">{framework?.title ?? "…"}</h1>
              {framework?.role_title && (
                <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>{framework.role_title}</p>
              )}
            </div>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="btn-primary shrink-0"
            >
              {showCreate ? "Cancel" : "+ New Schedule"}
            </button>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {/* Summary */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Total Schedules</p>
              <p className="metric-value text-3xl font-bold" style={{ color: "#1e1b4b" }}>{schedules.length}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="label-caps mb-1">Active</p>
              <p className="metric-value text-3xl font-bold" style={{ color: activeCount > 0 ? "#059669" : "rgba(30,27,75,0.3)" }}>
                {activeCount}
              </p>
            </div>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="card mb-6 p-5">
              <h2 className="section-heading mb-4">New Pulse Schedule</h2>
              <div className="space-y-4">
                <div>
                  <label className="label-caps mb-1.5 block">Assessment</label>
                  {surveys.length === 0 ? (
                    <p className="text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>No surveys available.</p>
                  ) : (
                    <select className="field" value={surveyId} onChange={e => setSurveyId(e.target.value)}>
                      {surveys.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="label-caps mb-1.5 block">Frequency</label>
                  <select className="field" value={frequency} onChange={e => setFrequency(e.target.value as PulseFrequency)}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-caps mb-1.5 block">Start date</label>
                    <input className="field" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">End date (optional)</label>
                    <input className="field" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={!surveyId || creating}
                  className="btn-primary disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Schedule"}
                </button>
              </div>
            </div>
          )}

          {/* Schedules list */}
          {schedules.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="section-heading mb-2">No pulse schedules yet</p>
              <p className="text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                Create a schedule to run recurring assessments for this framework.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map(ps => (
                <ScheduleCard
                  key={ps.id}
                  schedule={ps}
                  surveyName={surveyMap[ps.survey_id] ?? ps.survey_id}
                  onToggle={() => handleToggle(ps)}
                  onDelete={() => handleDelete(ps.id)}
                  toggling={toggling === ps.id}
                  deleting={deleting === ps.id}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
