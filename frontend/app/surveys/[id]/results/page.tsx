"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Header from "@/components/Header"
import { getSurveyResults, getSurveyReliability, getFactorScores, updateSurvey, getSurveyStats, createInvites, listInvites, getSurvey } from "@/lib/api"
import type { CronbachAlphaResponse } from "@/lib/api"
import type { FactorScoreEntry, FactorScoresResponse, ForcedChoiceConfig, QuestionOut, QuestionStat, SurveyResults, SurveyStats, SurveyInvite } from "@/lib/types"

function round2(n: number) { return Math.round(n * 100) / 100 }

// ---------------------------------------------------------------------------
// Shared bar row
// ---------------------------------------------------------------------------

function Bar({ label, value, maxValue, suffix = "" }: {
  label: string; value: number; maxValue: number; suffix?: string
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 truncate text-xs" style={{ color: "rgba(30,27,75,0.6)" }} title={label}>{label}</span>
      <div className="flex-1 bar-track">
        <div className="bar-fill-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums" style={{ color: "rgba(30,27,75,0.5)" }}>{value}{suffix}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-question cards
// ---------------------------------------------------------------------------

function LikertCard({ stat }: { stat: QuestionStat }) {
  const scale = stat.question_type === "likert_7" ? 7 : 5
  const maxCount = Math.max(1, ...Object.values(stat.distribution))
  return (
    <div>
      {stat.n > 0 && (
        <div className="mb-4 flex items-center gap-6">
          <div className="text-center">
            <p className="metric-value text-3xl font-bold tabular-nums" style={{ color: "#5b21b6" }}>
              {stat.mean !== null ? round2(stat.mean) : "—"}
            </p>
            <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Mean</p>
          </div>
          {stat.std !== null && stat.std > 0 && (
            <div className="text-center">
              <p className="metric-value text-xl font-semibold tabular-nums" style={{ color: "rgba(30,27,75,0.7)" }}>±{round2(stat.std)}</p>
              <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>SD</p>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: scale }, (_, i) => {
          const key = String(i + 1)
          return <Bar key={key} label={key} value={stat.distribution[key] ?? 0} maxValue={maxCount} />
        })}
      </div>
    </div>
  )
}

function ChoiceCard({ stat }: { stat: QuestionStat }) {
  const maxCount = Math.max(1, ...Object.values(stat.distribution))
  const entries = Object.entries(stat.distribution).sort(([, a], [, b]) => b - a)
  return (
    <div className="space-y-2">
      {entries.length === 0
        ? <p className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>No responses yet.</p>
        : entries.map(([opt, count]) => <Bar key={opt} label={opt} value={count} maxValue={maxCount} />)
      }
    </div>
  )
}

function ForcedChoiceCard({ stat, question }: { stat: QuestionStat; question: QuestionOut }) {
  const cfg = question.options as ForcedChoiceConfig | null
  const labels = cfg?.labels ?? []

  const grouped: Record<string, Record<string, number>> = {}
  Object.entries(stat.distribution).forEach(([key, count]) => {
    const sep = key.indexOf("|")
    if (sep === -1) return
    const label = key.slice(0, sep)
    const item  = key.slice(sep + 1)
    if (!grouped[label]) grouped[label] = {}
    grouped[label][item] = count
  })

  const orderedLabels = labels.length ? labels : Object.keys(grouped)

  if (stat.n === 0) return <p className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>No responses yet.</p>

  return (
    <div className="space-y-5">
      {orderedLabels.map(label => {
        const items = grouped[label] ?? {}
        const maxCount = Math.max(1, ...Object.values(items))
        return (
          <div key={label}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#5b21b6" }}>{label}</p>
            <div className="space-y-1.5">
              {Object.entries(items)
                .sort(([, a], [, b]) => b - a)
                .map(([item, count]) => (
                  <Bar key={item} label={item} value={count} maxValue={maxCount} />
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RankingCard({ stat }: { stat: QuestionStat }) {
  const avgs = stat.ranking_averages ?? {}
  const sorted = Object.entries(avgs).sort(([, a], [, b]) => a - b)
  if (sorted.length === 0) return <p className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>No responses yet.</p>
  const maxAvg = Math.max(...sorted.map(([, v]) => v))
  return (
    <div className="space-y-2">
      {sorted.map(([item, avg], i) => (
        <div key={item} className="flex items-center gap-3">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "rgba(91,33,182,0.1)", color: "#5b21b6" }}
          >
            {i + 1}
          </span>
          <span className="w-28 shrink-0 truncate text-xs" style={{ color: "rgba(30,27,75,0.6)" }} title={item}>{item}</span>
          <div className="flex-1 bar-track">
            <div className="bar-fill-accent" style={{ width: `${100 - ((avg - 1) / Math.max(maxAvg - 1, 1)) * 100}%` }} />
          </div>
          <span className="w-16 text-right text-xs tabular-nums" style={{ color: "rgba(30,27,75,0.4)" }}>avg {avg.toFixed(1)}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px]" style={{ color: "rgba(30,27,75,0.35)" }}>Lower average rank = ranked higher by respondents.</p>
    </div>
  )
}

function TextCard({ stat }: { stat: QuestionStat }) {
  const vals = stat.text_values ?? []
  if (vals.length === 0) return <p className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>No responses yet.</p>
  return (
    <div className="space-y-2">
      {vals.map((v, i) => (
        <div key={i}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: "rgba(91,33,182,0.05)", border: "0.5px solid rgba(91,33,182,0.1)", color: "#1e1b4b" }}
        >{v}</div>
      ))}
    </div>
  )
}

function QuestionResultCard({ stat, question }: { stat: QuestionStat; question: QuestionOut }) {
  return (
    <div className="card overflow-hidden">
      <div
        className="border-b px-5 py-4"
        style={{ borderColor: "rgba(255,255,255,0.35)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{stat.text}</p>
        <div className="mt-1 flex items-center gap-3">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
            style={{ background: "rgba(91,33,182,0.08)", color: "rgba(30,27,75,0.6)" }}
          >
            {stat.question_type.replace(/_/g, " ")}
          </span>
          <span className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>{stat.n} response{stat.n !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="px-5 py-4">
        {(stat.question_type === "likert_5" || stat.question_type === "likert_7") && <LikertCard stat={stat} />}
        {(stat.question_type === "single_choice" || stat.question_type === "multiple_choice") && <ChoiceCard stat={stat} />}
        {stat.question_type === "forced_choice" && <ForcedChoiceCard stat={stat} question={question} />}
        {stat.question_type === "ranking" && <RankingCard stat={stat} />}
        {stat.question_type === "text" && <TextCard stat={stat} />}
        {stat.n === 0 && !["likert_5","likert_7","forced_choice","ranking","text"].includes(stat.question_type) && (
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>No responses yet.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reliability panel
// ---------------------------------------------------------------------------

const INTERP_COLORS: Record<string, string> = {
  poor: "#dc2626",
  acceptable: "#d97706",
  good: "#059669",
  excellent: "#5b21b6",
}

function AccordionCard({
  title, subtitle, open, onToggle, children,
}: {
  title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left" style={{ position: "relative", zIndex: 1 }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1e1b4b" }}>{title}</p>
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>{subtitle}</p>
        </div>
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "rgba(30,27,75,0.35)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="border-t px-5 py-4"
          style={{ borderColor: "rgba(255,255,255,0.35)", position: "relative", zIndex: 1 }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function ReliabilityPanel({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<CronbachAlphaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function run() {
    setOpen(true)
    if (data) return
    setLoading(true); setError(null)
    try {
      setData(await getSurveyReliability(surveyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AccordionCard
      title="Reliability Analysis"
      subtitle="Cronbach's alpha · internal consistency"
      open={open}
      onToggle={open ? () => setOpen(false) : run}
    >
      {loading && <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Computing…</p>}
      {error && <p className="text-xs" style={{ color: "#dc2626" }}>{error}</p>}
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="metric-value text-4xl font-bold tabular-nums" style={{ color: "#5b21b6" }}>
                {data.alpha.toFixed(3)}
              </p>
              <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Cronbach&apos;s α</p>
            </div>
            <div>
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize text-white"
                style={{ backgroundColor: INTERP_COLORS[data.interpretation] ?? "#5b21b6" }}
              >
                {data.interpretation}
              </span>
              <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
                {data.n_items} items · {data.n_respondents} respondents
              </p>
            </div>
          </div>

          <div>
            <p className="label-caps mb-2">Item-total correlations</p>
            <div className="space-y-1.5">
              {data.item_total_correlations.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0" style={{ color: "rgba(30,27,75,0.5)" }}>Item {i + 1}</span>
                  <div className="flex-1 bar-track">
                    <div className="bar-fill-accent" style={{ width: `${Math.max(0, r) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums" style={{ color: "rgba(30,27,75,0.5)" }}>{r.toFixed(3)}</span>
                  <span className="w-20 text-right tabular-nums" style={{ color: "rgba(30,27,75,0.35)" }}>
                    α−{i + 1}: {data.alpha_if_item_deleted[i].toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AccordionCard>
  )
}

// ---------------------------------------------------------------------------
// Factor scores panel
// ---------------------------------------------------------------------------

function ScoreCell({ entry }: { entry: FactorScoreEntry | undefined }) {
  if (!entry || entry.raw_mean === null) return <span style={{ color: "rgba(30,27,75,0.2)" }}>—</span>
  const hasNorm = entry.normalized !== null
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums" style={{ color: "rgba(30,27,75,0.7)" }}>{entry.raw_mean.toFixed(2)}</span>
      {hasNorm && <span className="tabular-nums text-[10px]" style={{ color: "rgba(30,27,75,0.4)" }}>{entry.normalized!.toFixed(1)}</span>}
      {entry.label && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: entry.color ?? "#5b21b6" }}
        >
          {entry.label}
        </span>
      )}
    </div>
  )
}

function FactorScoresPanel({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<FactorScoresResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function run() {
    setOpen(true)
    if (data) return
    setLoading(true); setError(null)
    try {
      setData(await getFactorScores(surveyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function downloadCSV() {
    if (!data || data.rows.length === 0) return
    const headers = ["Respondent", ...data.factors.flatMap(f => [`${f} (raw)`, `${f} (norm)`, `${f} label`])]
    const summaryMean = ["Mean", ...data.factors.flatMap(f => { const e = data.summary.mean[f]; return [e?.raw_mean?.toFixed(4) ?? "", e?.normalized?.toFixed(2) ?? "", e?.label ?? ""] })]
    const summarySd = ["SD", ...data.factors.flatMap(f => { const sd = data.summary.sd[f]; return [sd !== null && sd !== undefined ? sd.toFixed(4) : "", "", ""] })]
    const rows = data.rows.map(row => [row.respondent_id, ...data.factors.flatMap(f => { const e = row.scores[f]; return [e?.raw_mean?.toFixed(4) ?? "", e?.normalized?.toFixed(2) ?? "", e?.label ?? ""] })])
    const csv = [headers, ...rows, [], summaryMean, summarySd].map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `factor-scores-${surveyId}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <AccordionCard
      title="Factor Scores"
      subtitle="Mean score per respondent × factor, with normalization"
      open={open}
      onToggle={open ? () => setOpen(false) : run}
    >
      {loading && <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Loading…</p>}
      {error && <p className="text-xs" style={{ color: "#dc2626" }}>{error}</p>}
      {data && data.factors.length === 0 && (
        <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>
          No factors assigned yet. Open the survey editor and assign factors to questions.
        </p>
      )}
      {data && data.factors.length > 0 && (
        <div className="space-y-4">
          {data.rows.length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>No responses yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl" style={{ border: "0.5px solid rgba(255,255,255,0.4)" }}>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.3)" }}>
                      <th className="px-3 py-2 text-left label-caps whitespace-nowrap">Respondent</th>
                      {data.factors.map(f => (
                        <th key={f} className="px-3 py-2 text-right label-caps whitespace-nowrap">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: "0.5px solid rgba(255,255,255,0.3)" }}>
                        <td className="px-3 py-2 font-mono" style={{ color: "rgba(30,27,75,0.6)" }}>
                          <div className="flex items-center gap-2">
                            <span>{row.respondent_id}</span>
                            <Link
                              href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors whitespace-nowrap"
                              style={{ color: "#5b21b6", background: "rgba(91,33,182,0.08)" }}
                              title="View individual report"
                            >
                              Report →
                            </Link>
                          </div>
                        </td>
                        {data.factors.map(f => (
                          <td key={f} className="px-3 py-2 text-right">
                            <ScoreCell entry={row.scores[f]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.2)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>Mean</td>
                      {data.factors.map(f => (
                        <td key={f} className="px-3 py-2 text-right font-semibold" style={{ color: "#5b21b6" }}>
                          <ScoreCell entry={data.summary.mean[f]} />
                        </td>
                      ))}
                    </tr>
                    <tr style={{ background: "rgba(255,255,255,0.2)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "rgba(30,27,75,0.5)" }}>SD</td>
                      {data.factors.map(f => (
                        <td key={f} className="px-3 py-2 text-right tabular-nums" style={{ color: "rgba(30,27,75,0.5)" }}>
                          {data.summary.sd[f] !== null && data.summary.sd[f] !== undefined
                            ? (data.summary.sd[f] as number).toFixed(2)
                            : <span style={{ color: "rgba(30,27,75,0.2)" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button onClick={downloadCSV} className="btn-ghost gap-1.5 text-xs px-3 py-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </>
          )}
        </div>
      )}
    </AccordionCard>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="badge-live">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
        Live
      </span>
    )
  }
  if (status === "closed") {
    return (
      <span className="badge-closed">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Closed
      </span>
    )
  }
  return (
    <span className="badge-draft">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(30,27,75,0.3)" }} />
      Draft
    </span>
  )
}

// ---------------------------------------------------------------------------
// Response rate stats panel
// ---------------------------------------------------------------------------

function StatsPanel({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<SurveyStats | null>(null)

  useEffect(() => {
    getSurveyStats(surveyId).then(setData).catch(() => null)
  }, [surveyId])

  if (!data) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="card p-4">
        <p className="metric-value text-2xl font-bold tabular-nums" style={{ color: "#5b21b6" }}>{data.total_responded}</p>
        <p className="mt-0.5 label-caps">Responses</p>
      </div>
      <div className="card p-4">
        <p className="metric-value text-2xl font-bold tabular-nums" style={{ color: "rgba(30,27,75,0.7)" }}>{data.total_invited}</p>
        <p className="mt-0.5 label-caps">Invited</p>
      </div>
      <div className="card p-4">
        <p className="metric-value text-2xl font-bold tabular-nums" style={{ color: "#059669" }}>{data.response_rate.toFixed(1)}%</p>
        <p className="mt-0.5 label-caps">Response rate</p>
      </div>
      <div className="card p-4">
        <p className="metric-value text-sm font-semibold tabular-nums" style={{ color: "rgba(30,27,75,0.7)" }}>
          {data.last_response_at
            ? new Date(data.last_response_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "—"}
        </p>
        <p className="mt-0.5 label-caps">Last response</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invite panel
// ---------------------------------------------------------------------------

function InvitePanel({ surveyId }: { surveyId: string }) {
  const [open, setOpen] = useState(false)
  const [emailText, setEmailText] = useState("")
  const [invites, setInvites] = useState<SurveyInvite[]>([])
  const [sending, setSending] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function loadInvites() {
    setLoadingList(true)
    try { setInvites(await listInvites(surveyId)) } catch { /* ignore */ }
    finally { setLoadingList(false) }
  }

  function handleOpen() { setOpen(true); if (invites.length === 0) loadInvites() }

  async function handleSend() {
    const emails = emailText.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) return
    setSending(true); setError(null)
    try {
      const created = await createInvites(surveyId, emails)
      setInvites(prev => [...created, ...prev])
      setEmailText("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(url)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <AccordionCard
      title="Invite participants"
      subtitle="Add emails to generate unique respond links"
      open={open}
      onToggle={open ? () => setOpen(false) : handleOpen}
    >
      <div className="space-y-4">
        <div>
          <label className="label-caps mb-1.5 block">
            Emails — one per line, or comma/semicolon separated
          </label>
          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            rows={3}
            placeholder={"alice@company.com\nbob@company.com"}
            className="field w-full resize-none"
          />
        </div>
        {error && <p className="text-xs" style={{ color: "#dc2626" }}>{error}</p>}
        <button
          onClick={handleSend}
          disabled={sending || !emailText.trim()}
          className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
        >
          {sending ? "Creating…" : "Create invite links"}
        </button>

        {loadingList && <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>Loading…</p>}
        {invites.length > 0 && (
          <div className="overflow-hidden rounded-xl" style={{ border: "0.5px solid rgba(255,255,255,0.4)" }}>
            <table className="min-w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.3)" }}>
                  <th className="px-3 py-2 text-left label-caps">Email</th>
                  <th className="px-3 py-2 text-left label-caps">Status</th>
                  <th className="px-3 py-2 text-left label-caps">Link</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(inv => (
                  <tr key={inv.id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.3)" }}>
                    <td className="px-3 py-2" style={{ color: "rgba(30,27,75,0.7)" }}>{inv.email}</td>
                    <td className="px-3 py-2">
                      {inv.responded_at
                        ? <span className="font-semibold" style={{ color: "#059669" }}>Responded</span>
                        : <span style={{ color: "rgba(30,27,75,0.4)" }}>Pending</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => copyLink(inv.respond_url)}
                        className="rounded-full px-2 py-0.5 font-semibold transition-colors"
                        style={{ color: "#5b21b6", background: "rgba(91,33,182,0.08)" }}
                      >
                        {copied === inv.respond_url ? "Copied!" : "Copy link"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loadingList && invites.length === 0 && (
          <p className="text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>No invites yet.</p>
        )}
      </div>
    </AccordionCard>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [results, setResults] = useState<SurveyResults | null>(null)
  const [questions, setQuestions] = useState<QuestionOut[]>([])
  const [surveyStatus, setSurveyStatus] = useState<string>("draft")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const [res, survey] = await Promise.all([getSurveyResults(id), getSurvey(id)])
      setResults(res)
      setQuestions(survey.questions)
      setSurveyStatus(survey.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleStatusChange(newStatus: "draft" | "published" | "closed") {
    setStatusChanging(true)
    try {
      await updateSurvey(id, { status: newStatus })
      setSurveyStatus(newStatus)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setStatusChanging(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">
          {loading && (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
              Loading results…
            </div>
          )}
          {error && <div className="alert-error">{error}</div>}

          {results && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="page-title">{results.survey_name}</h1>
                    <StatusBadge status={surveyStatus} />
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
                    {results.response_count} response{results.response_count !== 1 ? "s" : ""}
                    {" · "}{results.questions.length} question{results.questions.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {(surveyStatus === "published" || surveyStatus === "closed") && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/surveys/${id}/respond`
                        navigator.clipboard.writeText(url).catch(() => prompt("Copy this link:", url))
                      }}
                      className="btn-ghost text-xs px-3 py-1.5"
                    >
                      Copy link
                    </button>
                  )}
                  <Link href={`/surveys/${id}/respond`} className="btn-ghost text-xs px-3 py-1.5">Preview</Link>
                  <Link href={`/surveys/${id}/edit`} className="btn-ghost text-xs px-3 py-1.5">Edit</Link>
                  <Link
                    href={`/surveys/${id}/dashboard`}
                    className="btn-ghost text-xs px-3 py-1.5 font-bold"
                    style={{ color: "#5b21b6" }}
                  >
                    Dashboard
                  </Link>

                  {surveyStatus === "draft" && (
                    <button
                      onClick={() => handleStatusChange("published")}
                      disabled={statusChanging}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
                    >
                      {statusChanging ? "…" : "Go Live"}
                    </button>
                  )}
                  {surveyStatus === "published" && (
                    <button
                      onClick={() => handleStatusChange("closed")}
                      disabled={statusChanging}
                      className="btn-danger text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      {statusChanging ? "…" : "Close"}
                    </button>
                  )}
                  {surveyStatus === "closed" && (
                    <button
                      onClick={() => handleStatusChange("published")}
                      disabled={statusChanging}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
                    >
                      {statusChanging ? "…" : "Reopen"}
                    </button>
                  )}

                  <button
                    onClick={load}
                    className="btn-ghost p-1.5"
                    title="Refresh"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Stats */}
              <StatsPanel surveyId={id} />

              {results.response_count === 0 && (
                <div
                  className="rounded-xl px-5 py-4 text-sm"
                  style={{ background: "rgba(245,158,11,0.1)", border: "0.5px solid rgba(245,158,11,0.25)", color: "#b45309" }}
                >
                  No responses yet. Share the{" "}
                  <Link href={`/surveys/${id}/respond`} className="font-semibold underline underline-offset-2">survey link</Link>
                  {" "}or use the invite panel below to start collecting data.
                </div>
              )}

              <InvitePanel surveyId={id} />
              <ReliabilityPanel surveyId={id} />
              <FactorScoresPanel surveyId={id} />

              {results.questions.map(stat => {
                const question = questions.find(q => q.id === stat.question_id)
                return question
                  ? <QuestionResultCard key={stat.question_id} stat={stat} question={question} />
                  : null
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
