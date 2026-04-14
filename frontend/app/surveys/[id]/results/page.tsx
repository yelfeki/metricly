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
      <span className="w-32 shrink-0 truncate text-xs text-slate-600" title={label}>{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2.5">
        <div className="h-full rounded-full bg-indigo-400 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums text-slate-500">{value}{suffix}</span>
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
            <p className="text-3xl font-bold tabular-nums text-indigo-600">
              {stat.mean !== null ? round2(stat.mean) : "—"}
            </p>
            <p className="text-xs text-slate-400">Mean</p>
          </div>
          {stat.std !== null && stat.std > 0 && (
            <div className="text-center">
              <p className="text-xl font-semibold tabular-nums text-slate-700">±{round2(stat.std)}</p>
              <p className="text-xs text-slate-400">SD</p>
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
        ? <p className="text-xs text-slate-400">No responses yet.</p>
        : entries.map(([opt, count]) => <Bar key={opt} label={opt} value={count} maxValue={maxCount} />)
      }
    </div>
  )
}

// Forced choice: group distribution keys ("label|item") by label
function ForcedChoiceCard({ stat, question }: { stat: QuestionStat; question: QuestionOut }) {
  const cfg = question.options as ForcedChoiceConfig | null
  const labels = cfg?.labels ?? []

  // Group: { "Most like me": { "Bold": 5, "Creative": 2 }, ... }
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

  if (stat.n === 0) return <p className="text-xs text-slate-400">No responses yet.</p>

  return (
    <div className="space-y-5">
      {orderedLabels.map(label => {
        const items = grouped[label] ?? {}
        const maxCount = Math.max(1, ...Object.values(items))
        return (
          <div key={label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">{label}</p>
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

// Ranking: items sorted by average rank (lower = more preferred)
function RankingCard({ stat }: { stat: QuestionStat }) {
  const avgs = stat.ranking_averages ?? {}
  const sorted = Object.entries(avgs).sort(([, a], [, b]) => a - b)
  if (sorted.length === 0) return <p className="text-xs text-slate-400">No responses yet.</p>
  const maxAvg = Math.max(...sorted.map(([, v]) => v))
  return (
    <div className="space-y-2">
      {sorted.map(([item, avg], i) => (
        <div key={item} className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
            {i + 1}
          </span>
          <span className="w-28 shrink-0 truncate text-xs text-slate-600" title={item}>{item}</span>
          <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2.5">
            {/* Invert: lower avg rank = wider bar */}
            <div className="h-full rounded-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${100 - ((avg - 1) / Math.max(maxAvg - 1, 1)) * 100}%` }} />
          </div>
          <span className="w-16 text-right text-xs tabular-nums text-slate-400">avg {avg.toFixed(1)}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-400">Lower average rank = ranked higher by respondents.</p>
    </div>
  )
}

function TextCard({ stat }: { stat: QuestionStat }) {
  const vals = stat.text_values ?? []
  if (vals.length === 0) return <p className="text-xs text-slate-400">No responses yet.</p>
  return (
    <div className="space-y-2">
      {vals.map((v, i) => (
        <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{v}</div>
      ))}
    </div>
  )
}

function QuestionResultCard({ stat, question }: { stat: QuestionStat; question: QuestionOut }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-sm font-semibold text-slate-800">{stat.text}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 capitalize">
            {stat.question_type.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-slate-400">{stat.n} response{stat.n !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="px-5 py-4">
        {(stat.question_type === "likert_5" || stat.question_type === "likert_7") && <LikertCard stat={stat} />}
        {(stat.question_type === "single_choice" || stat.question_type === "multiple_choice") && <ChoiceCard stat={stat} />}
        {stat.question_type === "forced_choice" && <ForcedChoiceCard stat={stat} question={question} />}
        {stat.question_type === "ranking" && <RankingCard stat={stat} />}
        {stat.question_type === "text" && <TextCard stat={stat} />}
        {stat.n === 0 && !["likert_5","likert_7","forced_choice","ranking","text"].includes(stat.question_type) && (
          <p className="text-xs text-slate-400">No responses yet.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reliability panel
// ---------------------------------------------------------------------------

const INTERP_STYLES: Record<string, string> = {
  poor: "bg-red-50 text-red-700 ring-red-200",
  acceptable: "bg-amber-50 text-amber-700 ring-amber-200",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  excellent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={open ? () => setOpen(false) : run}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">Reliability Analysis</p>
          <p className="text-xs text-slate-400">Cronbach&apos;s alpha · internal consistency</p>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {loading && <p className="text-xs text-slate-400">Computing…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {data && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-4xl font-bold tabular-nums text-indigo-600">{data.alpha.toFixed(3)}</p>
                  <p className="text-xs text-slate-400">Cronbach&apos;s α</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 capitalize ${INTERP_STYLES[data.interpretation]}`}>
                    {data.interpretation}
                  </span>
                  <p className="mt-1 text-xs text-slate-400">{data.n_items} items · {data.n_respondents} respondents</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Item-total correlations</p>
                <div className="space-y-1.5">
                  {data.item_total_correlations.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-16 shrink-0 text-slate-500">Item {i + 1}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-slate-100 h-2">
                        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(0, r) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums text-slate-500">{r.toFixed(3)}</span>
                      <span className="w-20 text-right tabular-nums text-slate-400">
                        α−{i + 1}: {data.alpha_if_item_deleted[i].toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Factor scores panel
// ---------------------------------------------------------------------------

function ScoreCell({ entry }: { entry: FactorScoreEntry | undefined }) {
  if (!entry || entry.raw_mean === null) {
    return <span className="text-slate-300">—</span>
  }
  const hasNorm = entry.normalized !== null
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums text-slate-700">{entry.raw_mean.toFixed(2)}</span>
      {hasNorm && (
        <span className="tabular-nums text-[10px] text-slate-400">{entry.normalized!.toFixed(1)}</span>
      )}
      {entry.label && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: entry.color ?? "#64748b" }}
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
    const summaryMean = [
      "Mean",
      ...data.factors.flatMap(f => {
        const e = data.summary.mean[f]
        return [e?.raw_mean?.toFixed(4) ?? "", e?.normalized?.toFixed(2) ?? "", e?.label ?? ""]
      }),
    ]
    const summarySd = [
      "SD",
      ...data.factors.flatMap(f => {
        const sd = data.summary.sd[f]
        return [sd !== null && sd !== undefined ? sd.toFixed(4) : "", "", ""]
      }),
    ]
    const rows = data.rows.map(row => [
      row.respondent_id,
      ...data.factors.flatMap(f => {
        const e = row.scores[f]
        return [e?.raw_mean?.toFixed(4) ?? "", e?.normalized?.toFixed(2) ?? "", e?.label ?? ""]
      }),
    ])
    const csv = [headers, ...rows, [], summaryMean, summarySd]
      .map(r => r.join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `factor-scores-${surveyId}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={open ? () => setOpen(false) : run}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">Factor Scores</p>
          <p className="text-xs text-slate-400">Mean score per respondent × factor, with normalization</p>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {loading && <p className="text-xs text-slate-400">Loading…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {data && data.factors.length === 0 && (
            <p className="text-xs text-slate-400">
              No factors assigned to questions yet. Open the survey editor and assign factors to questions to see scores here.
            </p>
          )}
          {data && data.factors.length > 0 && (
            <div className="space-y-4">
              {data.rows.length === 0 ? (
                <p className="text-xs text-slate-400">No responses yet.</p>
              ) : (
                <>
                  {/* Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">Respondent</th>
                          {data.factors.map(f => (
                            <th key={f} className="px-3 py-2 text-right font-semibold text-slate-500 whitespace-nowrap">{f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600 font-mono">
                              <div className="flex items-center gap-2">
                                <span>{row.respondent_id}</span>
                                <Link
                                  href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors whitespace-nowrap"
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
                        <tr className="border-t-2 border-slate-200 bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-500">Mean</td>
                          {data.factors.map(f => (
                            <td key={f} className="px-3 py-2 text-right font-semibold text-indigo-600">
                              <ScoreCell entry={data.summary.mean[f]} />
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-500">SD</td>
                          {data.factors.map(f => (
                            <td key={f} className="px-3 py-2 text-right tabular-nums text-slate-500">
                              {data.summary.sd[f] !== null && data.summary.sd[f] !== undefined
                                ? (data.summary.sd[f] as number).toFixed(2)
                                : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Download */}
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download CSV
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  if (status === "closed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Closed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
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
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-2xl font-bold tabular-nums text-indigo-600">{data.total_responded}</p>
        <p className="mt-0.5 text-xs text-slate-400">Responses</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-2xl font-bold tabular-nums text-slate-700">{data.total_invited}</p>
        <p className="mt-0.5 text-xs text-slate-400">Invited</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-2xl font-bold tabular-nums text-emerald-600">{data.response_rate.toFixed(1)}%</p>
        <p className="mt-0.5 text-xs text-slate-400">Response rate</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold tabular-nums text-slate-700">
          {data.last_response_at
            ? new Date(data.last_response_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "—"}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">Last response</p>
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
    try {
      setInvites(await listInvites(surveyId))
    } catch {
      // ignore
    } finally {
      setLoadingList(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    if (invites.length === 0) loadInvites()
  }

  async function handleSend() {
    const emails = emailText
      .split(/[\n,;]+/)
      .map(e => e.trim())
      .filter(Boolean)
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">Invite participants</p>
          <p className="text-xs text-slate-400">Add emails to generate unique respond links</p>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Email input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Emails — one per line, or comma/semicolon separated
            </label>
            <textarea
              value={emailText}
              onChange={e => setEmailText(e.target.value)}
              rows={3}
              placeholder={"alice@company.com\nbob@company.com"}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleSend}
            disabled={sending || !emailText.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? "Creating…" : "Create invite links"}
          </button>

          {/* Invite list */}
          {loadingList && <p className="text-xs text-slate-400">Loading…</p>}
          {invites.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2 font-semibold text-slate-500">Email</th>
                    <th className="px-3 py-2 font-semibold text-slate-500">Status</th>
                    <th className="px-3 py-2 font-semibold text-slate-500">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{inv.email}</td>
                      <td className="px-3 py-2">
                        {inv.responded_at ? (
                          <span className="text-emerald-600 font-medium">Responded</span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => copyLink(inv.respond_url)}
                          className="rounded px-2 py-0.5 text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
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
            <p className="text-xs text-slate-400">No invites yet.</p>
          )}
        </div>
      )}
    </div>
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
      const [res, survey] = await Promise.all([
        getSurveyResults(id),
        getSurvey(id),
      ])
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
          {loading && <div className="flex items-center justify-center py-20 text-sm text-slate-400">Loading results…</div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

          {results && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{results.survey_name}</h1>
                    <StatusBadge status={surveyStatus} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {results.response_count} response{results.response_count !== 1 ? "s" : ""}
                    {" · "}{results.questions.length} question{results.questions.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {/* Copy respond link — only when live or closed */}
                  {(surveyStatus === "published" || surveyStatus === "closed") && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/surveys/${id}/respond`
                        navigator.clipboard.writeText(url).catch(() => prompt("Copy this link:", url))
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                    >
                      Copy link
                    </button>
                  )}
                  <Link href={`/surveys/${id}/respond`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
                    Preview
                  </Link>
                  <Link href={`/surveys/${id}/edit`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
                    Edit
                  </Link>
                  <Link href={`/surveys/${id}/dashboard`}
                    className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100">
                    Dashboard
                  </Link>

                  {/* Status action buttons */}
                  {surveyStatus === "draft" && (
                    <button
                      onClick={() => handleStatusChange("published")}
                      disabled={statusChanging}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {statusChanging ? "…" : "Go Live"}
                    </button>
                  )}
                  {surveyStatus === "published" && (
                    <button
                      onClick={() => handleStatusChange("closed")}
                      disabled={statusChanging}
                      className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:opacity-50"
                    >
                      {statusChanging ? "…" : "Close"}
                    </button>
                  )}
                  {surveyStatus === "closed" && (
                    <button
                      onClick={() => handleStatusChange("published")}
                      disabled={statusChanging}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {statusChanging ? "…" : "Reopen"}
                    </button>
                  )}

                  <button onClick={load}
                    className="rounded-lg border border-slate-200 p-2 text-slate-400 shadow-sm transition hover:text-slate-600" title="Refresh">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Response rate stats */}
              <StatsPanel surveyId={id} />

              {results.response_count === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
                  No responses yet. Share the{" "}
                  <Link href={`/surveys/${id}/respond`} className="font-semibold underline underline-offset-2">survey link</Link>
                  {" "}or use the invite panel below to start collecting data.
                </div>
              )}

              {/* Invite panel */}
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
