"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  IconChartBar,
  IconChartHistogram,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconUsersGroup,
  IconChartDots,
  IconListNumbers,
  IconMessageCircle,
  IconReportAnalytics,
  IconArrowUpRight,
  IconArrowDownRight,
  IconAward,
  IconAlertTriangle,
} from "@tabler/icons-react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import Header from "@/components/Header"
import {
  getSurveyResults,
  getSurveyReliability,
  getFactorScores,
  updateSurvey,
  getSurveyStats,
  createInvites,
  listInvites,
  getSurvey,
  getDashboard,
  getGroupComparison,
  getRespondents,
} from "@/lib/api"
import type { CronbachAlphaResponse } from "@/lib/api"
import type {
  DashboardData,
  FactorDistribution,
  FactorGroupComparison,
  FactorScoreEntry,
  FactorScoresResponse,
  ForcedChoiceConfig,
  GroupComparisonData,
  QuestionOut,
  QuestionStat,
  RespondentRow,
  RespondentsData,
  SurveyResults,
  SurveyStats,
  SurveyInvite,
} from "@/lib/types"

function round2(n: number) { return Math.round(n * 100) / 100 }

// ---------------------------------------------------------------------------
// Palette (5 pigments only — navy / cobalt / olive / butter / persimmon).
// scorePigment maps a 1–5 Likert mean to a pigment band; the order is
// cool → warm (low → high), so low scores read as quiet/cool and high
// scores read as energetic/warm. Used by FactorGaugeCard + ItemsTable.
// ---------------------------------------------------------------------------

const PIGMENT = {
  navy:      { main: "#0F2841", tint: "rgba(15,40,65,0.10)",   deep: "#0A1E33" },
  cobalt:    { main: "#2A5BA8", tint: "rgba(42,91,168,0.14)",  deep: "#042C53" },
  olive:     { main: "#7E8A55", tint: "rgba(126,138,85,0.18)", deep: "#3F4A2A" },
  butter:    { main: "#E2B146", tint: "rgba(226,177,70,0.22)", deep: "#5A3A0C" },
  persimmon: { main: "#DD6334", tint: "rgba(221,99,52,0.18)",  deep: "#4A1B0C" },
} as const

type PigmentKey = keyof typeof PIGMENT

function scorePigment(mean: number | null | undefined, scale = 5): PigmentKey {
  if (mean === null || mean === undefined) return "navy"
  const t = Math.max(0, Math.min(1, (mean - 1) / Math.max(1, scale - 1)))
  if (t < 0.2) return "navy"
  if (t < 0.4) return "cobalt"
  if (t < 0.6) return "olive"
  if (t < 0.8) return "butter"
  return "persimmon"
}

// ---------------------------------------------------------------------------
// Shared bar row — unchanged (legacy) — used by per-question cards.
// ---------------------------------------------------------------------------

function Bar({ label, value, maxValue, suffix = "" }: {
  label: string; value: number; maxValue: number; suffix?: string
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 truncate text-xs" style={{ color: "rgba(10,30,51,0.6)" }} title={label}>{label}</span>
      <div className="flex-1 bar-track">
        <div className="bar-fill-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums" style={{ color: "rgba(10,30,51,0.5)" }}>{value}{suffix}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-question cards (legacy — kept for the "Responses" detail section)
// ---------------------------------------------------------------------------

function LikertCard({ stat }: { stat: QuestionStat }) {
  const scale = stat.question_type === "likert_7" ? 7 : 5
  const maxCount = Math.max(1, ...Object.values(stat.distribution))
  return (
    <div>
      {stat.n > 0 && (
        <div className="mb-4 flex items-center gap-6">
          <div className="text-center">
            <p className="metric-value text-3xl font-bold tabular-nums" style={{ color: "#0F2841" }}>
              {stat.mean !== null ? round2(stat.mean) : "—"}
            </p>
            <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>Mean</p>
          </div>
          {stat.std !== null && stat.std > 0 && (
            <div className="text-center">
              <p className="metric-value text-xl font-semibold tabular-nums" style={{ color: "rgba(10,30,51,0.7)" }}>±{round2(stat.std)}</p>
              <p className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>SD</p>
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
        ? <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>No responses yet.</p>
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

  if (stat.n === 0) return <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>No responses yet.</p>

  return (
    <div className="space-y-5">
      {orderedLabels.map(label => {
        const items = grouped[label] ?? {}
        const maxCount = Math.max(1, ...Object.values(items))
        return (
          <div key={label}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "#0F2841" }}>{label}</p>
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
  if (sorted.length === 0) return <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>No responses yet.</p>
  const maxAvg = Math.max(...sorted.map(([, v]) => v))
  return (
    <div className="space-y-2">
      {sorted.map(([item, avg], i) => (
        <div key={item} className="flex items-center gap-3">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "rgba(15,40,65,0.1)", color: "#0F2841" }}
          >
            {i + 1}
          </span>
          <span className="w-28 shrink-0 truncate text-xs" style={{ color: "rgba(10,30,51,0.6)" }} title={item}>{item}</span>
          <div className="flex-1 bar-track">
            <div className="bar-fill-accent" style={{ width: `${100 - ((avg - 1) / Math.max(maxAvg - 1, 1)) * 100}%` }} />
          </div>
          <span className="w-16 text-right text-xs tabular-nums" style={{ color: "rgba(10,30,51,0.4)" }}>avg {avg.toFixed(1)}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px]" style={{ color: "rgba(10,30,51,0.35)" }}>Lower average rank = ranked higher by respondents.</p>
    </div>
  )
}

function TextCard({ stat }: { stat: QuestionStat }) {
  const vals = stat.text_values ?? []
  if (vals.length === 0) return <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>No responses yet.</p>
  return (
    <div className="space-y-2">
      {vals.map((v, i) => (
        <div key={i}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: "rgba(15,40,65,0.05)", border: "0.5px solid rgba(15,40,65,0.1)", color: "#0A1E33" }}
        >{v}</div>
      ))}
    </div>
  )
}

function QuestionResultCard({ stat, question }: { stat: QuestionStat; question: QuestionOut }) {
  return (
    <div className="mx-card overflow-hidden">
      <div
        className="border-b px-5 py-4"
        style={{ borderColor: "var(--mx-line)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "#0A1E33" }}>{stat.text}</p>
        <div className="mt-1 flex items-center gap-3">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
            style={{ background: "rgba(15,40,65,0.08)", color: "rgba(10,30,51,0.6)" }}
          >
            {stat.question_type.replace(/_/g, " ")}
          </span>
          <span className="text-xs" style={{ color: "rgba(10,30,51,0.4)" }}>{stat.n} response{stat.n !== 1 ? "s" : ""}</span>
          {question.factor && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "rgba(42,91,168,0.10)", color: "#042C53" }}
            >
              {question.factor}
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {(stat.question_type === "likert_5" || stat.question_type === "likert_7") && <LikertCard stat={stat} />}
        {(stat.question_type === "single_choice" || stat.question_type === "multiple_choice") && <ChoiceCard stat={stat} />}
        {stat.question_type === "forced_choice" && <ForcedChoiceCard stat={stat} question={question} />}
        {stat.question_type === "ranking" && <RankingCard stat={stat} />}
        {stat.question_type === "text" && <TextCard stat={stat} />}
        {stat.n === 0 && !["likert_5","likert_7","forced_choice","ranking","text"].includes(stat.question_type) && (
          <p className="text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>No responses yet.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reliability panel (legacy)
// ---------------------------------------------------------------------------

const INTERP_COLORS: Record<string, string> = {
  poor: "#DD6334",
  acceptable: "#E2B146",
  good: "#7E8A55",
  excellent: "#0F2841",
}

function AccordionCard({
  title, subtitle, open, onToggle, children, defaultIcon,
}: {
  title: string; subtitle: string; open: boolean; onToggle: () => void
  children: React.ReactNode
  defaultIcon?: React.ReactNode
}) {
  return (
    <div className="mx-card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          {defaultIcon}
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--mx-ink)" }}>{title}</p>
            <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>{subtitle}</p>
          </div>
        </div>
        <IconChevronDown
          size={16}
          stroke={1.8}
          style={{
            color: "var(--mx-ink-3)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform var(--mx-dur-fast) var(--mx-ease)",
          }}
        />
      </button>
      {open && (
        <div className="border-t px-5 py-4" style={{ borderColor: "var(--mx-line)" }}>
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
    try { setData(await getSurveyReliability(surveyId)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  return (
    <AccordionCard
      title="Reliability analysis"
      subtitle="Cronbach's α · internal consistency"
      open={open}
      onToggle={open ? () => setOpen(false) : run}
    >
      {loading && <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>Computing…</p>}
      {error && <p className="text-xs" style={{ color: "var(--mx-rose)" }}>{error}</p>}
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="metric-value text-4xl font-bold tabular-nums" style={{ color: "#0F2841" }}>
                {data.alpha.toFixed(3)}
              </p>
              <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>Cronbach&apos;s α</p>
            </div>
            <div>
              <span
                className="inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize text-white"
                style={{ backgroundColor: INTERP_COLORS[data.interpretation] ?? "#0F2841" }}
              >
                {data.interpretation}
              </span>
              <p className="mt-1 text-xs" style={{ color: "var(--mx-ink-3)" }}>
                {data.n_items} items · {data.n_respondents} respondents
              </p>
            </div>
          </div>

          <div>
            <p className="label-caps mb-2">Item-total correlations</p>
            <div className="space-y-1.5">
              {data.item_total_correlations.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0" style={{ color: "rgba(10,30,51,0.5)" }}>Item {i + 1}</span>
                  <div className="flex-1 bar-track">
                    <div className="bar-fill-accent" style={{ width: `${Math.max(0, r) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums" style={{ color: "rgba(10,30,51,0.5)" }}>{r.toFixed(3)}</span>
                  <span className="w-20 text-right tabular-nums" style={{ color: "rgba(10,30,51,0.35)" }}>
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
// Factor scores panel (legacy)
// ---------------------------------------------------------------------------

function ScoreCell({ entry }: { entry: FactorScoreEntry | undefined }) {
  if (!entry || entry.raw_mean === null) return <span style={{ color: "rgba(10,30,51,0.2)" }}>—</span>
  const hasNorm = entry.normalized !== null
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums" style={{ color: "rgba(10,30,51,0.7)" }}>{entry.raw_mean.toFixed(2)}</span>
      {hasNorm && <span className="tabular-nums text-[10px]" style={{ color: "rgba(10,30,51,0.4)" }}>{entry.normalized!.toFixed(1)}</span>}
      {entry.label && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ backgroundColor: entry.color ?? "#0F2841" }}
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
    try { setData(await getFactorScores(surveyId)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
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
      title="Factor scores (per respondent)"
      subtitle="Mean score per respondent × factor, with normalization"
      open={open}
      onToggle={open ? () => setOpen(false) : run}
    >
      {loading && <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>Loading…</p>}
      {error && <p className="text-xs" style={{ color: "var(--mx-rose)" }}>{error}</p>}
      {data && data.factors.length === 0 && (
        <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>
          No factors assigned yet. Open the survey editor and assign factors to questions.
        </p>
      )}
      {data && data.factors.length > 0 && (
        <div className="space-y-4">
          {data.rows.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>No responses yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--mx-line)" }}>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--mx-paper-2)" }}>
                      <th className="px-3 py-2 text-left label-caps whitespace-nowrap">Respondent</th>
                      {data.factors.map(f => (
                        <th key={f} className="px-3 py-2 text-right label-caps whitespace-nowrap">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--mx-line)" }}>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--mx-ink-2)" }}>
                          <div className="flex items-center gap-2">
                            <span>{row.respondent_id}</span>
                            <Link
                              href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors whitespace-nowrap"
                              style={{ color: "#0F2841", background: "rgba(15,40,65,0.08)" }}
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
                    <tr style={{ borderTop: "1px solid var(--mx-line)", background: "var(--mx-paper-2)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "var(--mx-ink-2)" }}>Mean</td>
                      {data.factors.map(f => (
                        <td key={f} className="px-3 py-2 text-right font-semibold" style={{ color: "#0F2841" }}>
                          <ScoreCell entry={data.summary.mean[f]} />
                        </td>
                      ))}
                    </tr>
                    <tr style={{ background: "var(--mx-paper-2)" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "var(--mx-ink-2)" }}>SD</td>
                      {data.factors.map(f => (
                        <td key={f} className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--mx-ink-2)" }}>
                          {data.summary.sd[f] !== null && data.summary.sd[f] !== undefined
                            ? (data.summary.sd[f] as number).toFixed(2)
                            : <span style={{ color: "rgba(10,30,51,0.2)" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button onClick={downloadCSV} className="mx-pill" style={{ fontSize: 11 }}>
                <IconDownload size={12} stroke={1.8} />
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
  const map: Record<string, { label: string; dotColor: string; bg: string; fg: string }> = {
    published: { label: "Live",   dotColor: "#7E8A55", bg: "rgba(126,138,85,0.16)", fg: "#3F4A2A" },
    closed:    { label: "Closed", dotColor: "#DD6334", bg: "rgba(221,99,52,0.16)",  fg: "#4A1B0C" },
    draft:     { label: "Draft",  dotColor: "rgba(10,30,51,0.4)", bg: "var(--mx-paper-2)", fg: "var(--mx-ink-2)" },
  }
  const s = map[status] ?? map.draft
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        fontFamily: "var(--mx-font-sans)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: s.bg,
        color: s.fg,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dotColor }} />
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Invite panel (legacy, mx-skinned)
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
        {error && <p className="text-xs" style={{ color: "var(--mx-rose)" }}>{error}</p>}
        <button
          onClick={handleSend}
          disabled={sending || !emailText.trim()}
          className="rounded-[999px] px-4 py-2 transition-all disabled:opacity-50"
          style={{
            fontFamily: "var(--mx-font-sans)",
            fontSize: 12,
            fontWeight: 500,
            background: "var(--mx-forest)",
            color: "var(--mx-paper)",
            boxShadow: "var(--mx-shadow-card)",
          }}
        >
          {sending ? "Creating…" : "Create invite links"}
        </button>

        {loadingList && <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>Loading…</p>}
        {invites.length > 0 && (
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--mx-line)" }}>
            <table className="min-w-full text-xs">
              <thead>
                <tr style={{ background: "var(--mx-paper-2)" }}>
                  <th className="px-3 py-2 text-left label-caps">Email</th>
                  <th className="px-3 py-2 text-left label-caps">Status</th>
                  <th className="px-3 py-2 text-left label-caps">Link</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(inv => (
                  <tr key={inv.id} style={{ borderTop: "1px solid var(--mx-line)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--mx-ink-2)" }}>{inv.email}</td>
                    <td className="px-3 py-2">
                      {inv.responded_at
                        ? <span className="font-semibold" style={{ color: "#3F4A2A" }}>Responded</span>
                        : <span style={{ color: "var(--mx-ink-3)" }}>Pending</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => copyLink(inv.respond_url)}
                        className="rounded-full px-2 py-0.5 font-semibold transition-colors"
                        style={{ color: "#0F2841", background: "rgba(15,40,65,0.08)" }}
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
          <p className="text-xs" style={{ color: "var(--mx-ink-3)" }}>No invites yet.</p>
        )}
      </div>
    </AccordionCard>
  )
}

// ---------------------------------------------------------------------------
// ───── NEW DASHBOARD COMPONENTS ───────────────────────────────────────────
// ---------------------------------------------------------------------------

// Section header with anchor target — used by the in-page nav. Each
// `id` corresponds to a NAV_SECTIONS entry below.
function SectionHeader({
  id, title, subtitle, Icon, count,
}: {
  id: string
  title: string
  subtitle?: string
  Icon: typeof IconChartBar
  count?: number
}) {
  return (
    <div id={id} className="flex items-baseline justify-between gap-4" style={{ scrollMarginTop: 96 }}>
      <div className="flex items-baseline gap-3">
        <Icon size={18} stroke={1.6} style={{ color: "var(--mx-ink-2)", alignSelf: "center" }} />
        <div>
          <h2 className="mx-h3" style={{ fontSize: 22, lineHeight: 1.1 }}>{title}</h2>
          {subtitle && (
            <p className="mx-caption mt-0.5" style={{ fontSize: 12 }}>{subtitle}</p>
          )}
        </div>
      </div>
      {count !== undefined && (
        <span
          className="mx-tnum"
          style={{
            fontSize: 11,
            padding: "2px 9px",
            borderRadius: 999,
            background: "var(--mx-paper-2)",
            border: "1px solid var(--mx-line)",
            color: "var(--mx-ink-2)",
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// Sticky section nav — anchor-link pills under the page header. Highlights
// the current section based on a simple in-view intersection observer.
const NAV_SECTIONS = [
  { id: "overview",       label: "Overview",       Icon: IconChartHistogram },
  { id: "factors",        label: "Factors",        Icon: IconChartDots },
  { id: "items",          label: "Items",          Icon: IconListNumbers },
  { id: "demographics",   label: "Demographics",   Icon: IconUsersGroup },
  { id: "roster",         label: "Roster",         Icon: IconReportAnalytics },
  { id: "psychometrics",  label: "Psychometrics",  Icon: IconChartBar },
  { id: "responses",      label: "Responses",      Icon: IconMessageCircle },
] as const

function SectionNav() {
  const [active, setActive] = useState<string>("overview")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) setActive(visible[0].target.id)
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    NAV_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      className="sticky z-20 -mx-6 mb-6 px-6 py-3"
      style={{
        top: 64,
        background: "rgba(250,247,242,0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--mx-line)",
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {NAV_SECTIONS.map(s => {
          const Icon = s.Icon
          const isActive = active === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1.5 transition-all"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 11.5,
                fontWeight: 500,
                background: isActive ? "var(--mx-forest)" : "transparent",
                color: isActive ? "var(--mx-paper)" : "var(--mx-ink-2)",
                border: isActive ? "1px solid var(--mx-forest)" : "1px solid transparent",
              }}
            >
              <Icon size={12} stroke={1.8} />
              {s.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// OverviewHero — composite + 4 KPI inline cards
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | null) {
  if (seconds === null || seconds === undefined) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds - m * 60)
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

function KpiBlock({
  label, value, sub, accent,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: PigmentKey
}) {
  const colour = accent ? PIGMENT[accent].main : "var(--mx-ink)"
  return (
    <div
      style={{
        background: "var(--mx-paper)",
        border: "1px solid var(--mx-line)",
        borderRadius: "var(--mx-r-md)",
        padding: "12px 14px",
      }}
    >
      <p
        className="mx-eyebrow"
        style={{ margin: 0, fontSize: 9.5, letterSpacing: "0.20em" }}
      >
        {label}
      </p>
      <p
        className="mx-tnum mt-1"
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.05,
          color: colour,
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="mx-tnum mt-0.5"
          style={{ fontSize: 10.5, color: "var(--mx-ink-3)" }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function OverviewHero({
  surveyName,
  status,
  dashboard,
  stats,
  alpha,
  responseCount,
  questionCount,
}: {
  surveyName: string
  status: string
  dashboard: DashboardData | null
  stats: SurveyStats | null
  alpha: number | null
  responseCount: number
  questionCount: number
}) {
  const composite = dashboard?.average_composite
  const compositeColor = dashboard?.composite_color ?? "#0F2841"
  const compositeLabel = dashboard?.composite_label

  return (
    <section className="mx-hero" style={{ padding: "32px 36px" }}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <p className="mx-eyebrow" style={{ margin: 0 }}>Survey results</p>
            <StatusBadge status={status} />
          </div>
          <h1
            className="mx-h2"
            style={{ fontSize: 36, lineHeight: 1.05, color: "var(--mx-ink)" }}
          >
            {surveyName}
          </h1>
          <p className="mx-caption mt-2" style={{ fontSize: 13 }}>
            {responseCount} response{responseCount !== 1 ? "s" : ""} ·{" "}
            {questionCount} question{questionCount !== 1 ? "s" : ""}
            {dashboard?.date_range_start && dashboard?.date_range_end && (
              <>
                {" · "}
                {new Date(dashboard.date_range_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                –
                {new Date(dashboard.date_range_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </>
            )}
          </p>
        </div>

        {/* Composite score, when computable */}
        {composite !== null && composite !== undefined && (
          <div
            className="flex flex-shrink-0 items-baseline gap-3"
            style={{
              background: "var(--mx-paper)",
              border: "1px solid var(--mx-line)",
              borderRadius: "var(--mx-r-lg)",
              padding: "16px 22px",
            }}
          >
            <div>
              <p
                className="mx-eyebrow"
                style={{ margin: 0, fontSize: 9.5 }}
              >
                Composite
              </p>
              <p
                className="mx-num mx-text-grad-cool"
                style={{ fontSize: 48, lineHeight: 1, marginTop: 4 }}
              >
                {composite.toFixed(2)}
              </p>
            </div>
            {compositeLabel && (
              <span
                className="rounded-full px-2.5 py-1"
                style={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: compositeColor,
                  color: "#FAF7F2",
                  textTransform: "uppercase",
                }}
              >
                {compositeLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        <KpiBlock
          label="Responses"
          value={stats?.total_responded ?? responseCount}
          sub={stats ? `of ${stats.total_invited} invited` : undefined}
          accent="navy"
        />
        <KpiBlock
          label="Response rate"
          value={stats ? `${stats.response_rate.toFixed(0)}%` : "—"}
          sub={stats?.last_response_at
            ? `last ${new Date(stats.last_response_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "no responses yet"}
          accent="olive"
        />
        <KpiBlock
          label="Cronbach α"
          value={alpha !== null ? alpha.toFixed(2) : "—"}
          sub={alpha !== null
            ? alpha >= 0.9 ? "excellent" : alpha >= 0.7 ? "good" : alpha >= 0.6 ? "acceptable" : "poor"
            : "not computed"}
          accent="cobalt"
        />
        <KpiBlock
          label="Avg completion"
          value={formatDuration(stats?.avg_completion_time_seconds ?? null)}
          sub="median not shown"
          accent="butter"
        />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Likert-scale labels (used by the response distribution bar)
// ---------------------------------------------------------------------------

const LIKERT_5_LABELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
const LIKERT_7_LABELS = ["Strongly disagree", "Disagree", "Slightly disagree", "Neutral", "Slightly agree", "Agree", "Strongly agree"]

function likertLabel(level: number, scale: number) {
  const labels = scale === 7 ? LIKERT_7_LABELS : LIKERT_5_LABELS
  return labels[level - 1] ?? String(level)
}

// ---------------------------------------------------------------------------
// HighLowItemCard — single best/worst item with stacked distribution bar
// ---------------------------------------------------------------------------

function HighLowItemCard({
  stat,
  kind,
  question,
}: {
  stat: QuestionStat
  kind: "highest" | "lowest"
  question: QuestionOut | undefined
}) {
  const scale = stat.question_type === "likert_7" ? 7 : 5
  const accent = kind === "highest" ? PIGMENT.olive : PIGMENT.persimmon
  const Icon = kind === "highest" ? IconAward : IconAlertTriangle
  const ArrowIcon = kind === "highest" ? IconArrowUpRight : IconArrowDownRight

  const dist = Array.from({ length: scale }, (_, i) => {
    const lvl = i + 1
    return {
      level: lvl,
      count: stat.distribution[String(lvl)] ?? 0,
      pig: PIGMENT[scorePigment(lvl, scale)],
      label: likertLabel(lvl, scale),
    }
  })
  const total = dist.reduce((s, d) => s + d.count, 0)
  const modal = dist.reduce((a, b) => (b.count > a.count ? b : a), dist[0])

  return (
    <div className="mx-card" style={{ padding: 22 }}>
      {/* Banner */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-[999px] px-2.5 py-1"
          style={{
            fontFamily: "var(--mx-font-sans)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            background: accent.tint,
            color: accent.deep,
          }}
        >
          <Icon size={12} stroke={1.8} />
          {kind === "highest" ? "Highest rated item" : "Lowest rated item"}
        </span>
        <div className="flex items-baseline gap-1">
          <ArrowIcon size={16} stroke={1.8} style={{ color: accent.main, alignSelf: "center" }} />
          <p
            className="mx-num"
            style={{ fontSize: 32, lineHeight: 1, color: accent.main }}
          >
            {stat.mean !== null ? stat.mean.toFixed(2) : "—"}
          </p>
          <p
            className="mx-tnum"
            style={{ fontSize: 10.5, color: "var(--mx-ink-3)" }}
          >
            / {scale}
          </p>
        </div>
      </div>

      {/* Item text */}
      <p
        className="mt-3"
        style={{
          fontFamily: "var(--mx-font-display)",
          fontSize: 19,
          lineHeight: 1.3,
          letterSpacing: "-0.012em",
          color: "var(--mx-ink)",
        }}
      >
        {stat.text}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {question?.factor && (
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10.5,
              fontWeight: 500,
              background: "var(--mx-paper-2)",
              border: "1px solid var(--mx-line)",
              color: "var(--mx-ink-2)",
            }}
          >
            {question.factor}
          </span>
        )}
        <span
          className="mx-tnum"
          style={{ fontSize: 11, color: "var(--mx-ink-3)" }}
        >
          n = {total}
          {stat.std !== null && stat.std > 0 ? ` · σ ${stat.std.toFixed(2)}` : ""}
        </span>
      </div>

      {/* Stacked distribution bar */}
      <div className="mt-5">
        <div
          className="flex h-9 overflow-hidden rounded-md"
          style={{ border: "1px solid var(--mx-line)" }}
        >
          {dist.map((d) => {
            const pct = total > 0 ? (d.count / total) * 100 : 0
            return (
              <div
                key={d.level}
                className="flex items-center justify-center"
                style={{
                  width: `${pct}%`,
                  background: d.count === 0 ? "var(--mx-paper-2)" : d.pig.main,
                  color: "#FAF7F2",
                  transition: "width var(--mx-dur-slow) var(--mx-ease)",
                  minWidth: d.count > 0 ? 22 : 0,
                  borderRight: "1px solid rgba(250,247,242,0.18)",
                }}
                title={`${d.label}: ${d.count} (${total > 0 ? Math.round((d.count / total) * 100) : 0}%)`}
              >
                {pct >= 7 && (
                  <span
                    className="mx-tnum"
                    style={{ fontSize: 11, fontWeight: 700 }}
                  >
                    {d.count}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Scale ticks under the bar */}
        <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${scale}, 1fr)` }}>
          {dist.map((d) => (
            <div
              key={d.level}
              className="flex flex-col items-center"
              style={{ color: "var(--mx-ink-3)" }}
            >
              <span
                className="mx-tnum"
                style={{ fontSize: 10, lineHeight: 1 }}
              >
                {d.level}
              </span>
            </div>
          ))}
        </div>

        {/* Endpoint labels */}
        <div className="mt-2 flex justify-between">
          <span
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10.5,
              color: "var(--mx-ink-3)",
            }}
          >
            Strongly disagree
          </span>
          <span
            style={{
              fontFamily: "var(--mx-font-sans)",
              fontSize: 10.5,
              color: "var(--mx-ink-3)",
            }}
          >
            Strongly agree
          </span>
        </div>
      </div>

      {/* Modal-response footnote */}
      {total > 0 && (
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--mx-font-display)",
            fontStyle: "italic",
            fontSize: 12,
            color: "var(--mx-ink-2)",
          }}
        >
          Most common: <span style={{ color: modal.pig.deep, fontWeight: 600 }}>{modal.label.toLowerCase()}</span>{" "}
          ({Math.round((modal.count / total) * 100)}% of respondents)
        </p>
      )}
    </div>
  )
}

function HighLowSection({
  results,
  questions,
}: {
  results: SurveyResults
  questions: QuestionOut[]
}) {
  const qMap = new Map(questions.map(q => [q.id, q]))
  const scored = results.questions.filter(s =>
    (s.question_type === "likert_5" || s.question_type === "likert_7") &&
    s.mean !== null && s.n > 0
  )
  if (scored.length === 0) return null
  const sorted = [...scored].sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
  const highest = sorted[0]
  const lowest = sorted[sorted.length - 1]
  if (highest === lowest) {
    return <HighLowItemCard stat={highest} kind="highest" question={qMap.get(highest.question_id)} />
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <HighLowItemCard stat={highest} kind="highest" question={qMap.get(highest.question_id)} />
      <HighLowItemCard stat={lowest} kind="lowest" question={qMap.get(lowest.question_id)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Factor gauge card — per-factor score + 5-band gauge + strongest/weakest item
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SurveyPolarMap — ONE large polar / radar chart at the survey level. Each
// axis is a factor; the dot at each axis is a pigment-colored circle whose
// hue is driven by the factor's mean (cool→warm = low→high). Sits at the
// top of the Overview section as the primary visual hero for the dataset.
// ---------------------------------------------------------------------------

function SurveyPolarMap({
  factors,
  scale = 5,
}: {
  factors: FactorDistribution[]
  scale?: number
}) {
  if (factors.length === 0) return null

  const data = factors.map(f => ({
    factor: f.factor_name,
    short: f.factor_name.length > 14 ? f.factor_name.slice(0, 13) + "…" : f.factor_name,
    mean: f.mean ?? 0,
    n: f.n,
    label: f.label,
    color: f.color,
  }))

  // Custom dot — pigment chosen by score, sized larger than default so the
  // "colorful circles inside" reading is unambiguous. White stroke separates
  // dots from the filled polygon underneath.
  // recharts passes its dot prop a shape-renderable function whose payload
  // contains the data row; type loosely typed for compatibility.
  function ColoredDot(props: { cx?: number; cy?: number; payload?: { mean: number } }) {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined || !payload) return <g />
    const pig = PIGMENT[scorePigment(payload.mean, scale)]
    return (
      <g>
        <circle cx={cx} cy={cy} r={11} fill={pig.main} stroke="#FAF7F2" strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={5} fill="#FAF7F2" opacity={0.55} />
      </g>
    )
  }

  // < 3 factors: a radar would degenerate. Fall back to a horizontal bar
  // strip styled like the per-factor mini-bar, but coloured per factor.
  if (data.length < 3) {
    return (
      <div className="mx-card" style={{ padding: 24 }}>
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="mx-eyebrow" style={{ margin: 0 }}>Survey polar map</p>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--mx-font-display)",
                fontSize: 22,
                lineHeight: 1.1,
                letterSpacing: "-0.012em",
                color: "var(--mx-ink)",
              }}
            >
              Factor scores at a glance.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {data.map((d, i) => {
            const pig = PIGMENT[scorePigment(d.mean, scale)]
            const pct = ((d.mean - 1) / (scale - 1)) * 100
            return (
              <div key={i} className="flex items-center gap-3">
                <span style={{ width: 14, height: 14, borderRadius: 999, background: pig.main, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--mx-font-sans)", fontSize: 12, color: "var(--mx-ink)", width: 140 }}>{d.factor}</span>
                <div className="flex-1 overflow-hidden rounded-full" style={{ height: 8, background: "var(--mx-paper-2)" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pig.main }} />
                </div>
                <span className="mx-tnum" style={{ fontSize: 12, color: pig.main, fontWeight: 600, width: 40, textAlign: "right" }}>
                  {d.mean.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-card" style={{ padding: 24 }}>
      {/* Heading */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="mx-eyebrow" style={{ margin: 0 }}>Survey polar map</p>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--mx-font-display)",
              fontSize: 24,
              lineHeight: 1.1,
              letterSpacing: "-0.012em",
              color: "var(--mx-ink)",
            }}
          >
            Factor scores at a <em className="mx-text-grad-warm">glance.</em>
          </p>
        </div>
        <p className="mx-caption" style={{ fontSize: 12, maxWidth: 320 }}>
          {factors.length} factors plotted on a 1–{scale} scale. Each node is a
          factor; dot color tracks the score from cool (low) to warm (high).
        </p>
      </div>

      {/* Chart + legend grid */}
      <div className="mt-5 grid items-center gap-4 md:grid-cols-[1fr_240px]">
        {/* Polar plot */}
        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="78%">
              <PolarGrid stroke="rgba(10,30,51,0.12)" />
              <PolarAngleAxis
                dataKey="short"
                tick={{
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 11.5,
                  fill: "var(--mx-ink)",
                  fontWeight: 500,
                }}
              />
              <PolarRadiusAxis
                domain={[1, scale]}
                tick={{ fontFamily: "var(--mx-font-mono)", fontSize: 9, fill: "var(--mx-ink-3)" }}
                axisLine={false}
                tickCount={scale}
                angle={90}
              />
              <Radar
                dataKey="mean"
                stroke={PIGMENT.cobalt.main}
                strokeWidth={2}
                fill={PIGMENT.cobalt.main}
                fillOpacity={0.18}
                dot={ColoredDot as never}
                isAnimationActive
              />
              <Tooltip
                contentStyle={{
                  background: "var(--mx-paper)",
                  border: "1px solid var(--mx-line)",
                  borderRadius: 10,
                  boxShadow: "var(--mx-shadow-card)",
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12,
                  color: "var(--mx-ink)",
                }}
                formatter={(v) => {
                  const formatted = typeof v === "number" ? v.toFixed(2) : String(v ?? "")
                  return [formatted, "Mean"] as [string, string]
                }}
                labelFormatter={(_l, payload) => {
                  const item = payload?.[0]?.payload as { factor?: string; n?: number; label?: string | null } | undefined
                  if (!item?.factor) return ""
                  return `${item.factor}${item.label ? ` · ${item.label}` : ""} (n=${item.n})`
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with factor names + scores */}
        <div className="space-y-2">
          {[...data]
            .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
            .map(d => {
              const pig = PIGMENT[scorePigment(d.mean, scale)]
              return (
                <div
                  key={d.factor}
                  className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5"
                  style={{ background: "var(--mx-paper-2)", border: "1px solid var(--mx-line)" }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: pig.main,
                      border: "2px solid #FAF7F2",
                      boxShadow: "0 0 0 1px var(--mx-line)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="flex-1 truncate"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 12,
                      color: "var(--mx-ink)",
                      fontWeight: 500,
                    }}
                    title={d.factor}
                  >
                    {d.factor}
                  </span>
                  <span
                    className="mx-tnum"
                    style={{ fontSize: 13, color: pig.main, fontWeight: 700 }}
                  >
                    {d.mean.toFixed(2)}
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Score-band swatch row */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--mx-line)" }}>
        <span className="mx-eyebrow" style={{ margin: 0, fontSize: 9.5 }}>Score band</span>
        {(["navy", "cobalt", "olive", "butter", "persimmon"] as const).map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 999, background: PIGMENT[k].main }} />
            <span style={{ fontFamily: "var(--mx-font-sans)", fontSize: 10.5, color: "var(--mx-ink-3)" }}>
              {["Low", "Below", "Mid", "Above", "High"][i]}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// FactorRadar — polar chart showing each item in the factor as an axis. Mean
// is plotted on a 1–5 (or 1–7) radial scale. Recharts auto-distributes axes
// evenly around the circle. Axis labels use "Q1, Q2…" because full item text
// is too long to render at the poles; the full text shows in the tooltip.
function FactorRadar({
  items,
  scale,
  fillColor,
}: {
  items: QuestionStat[]
  scale: number
  fillColor: string
}) {
  if (items.length === 0) return null
  const data = items.map((it, i) => ({
    axis: `Q${i + 1}`,
    text: it.text,
    mean: it.mean ?? 0,
    n: it.n,
  }))
  // < 3 items: a radar polygon degenerates. Fall back to a horizontal mini-bar list.
  if (data.length < 3) {
    return (
      <div className="space-y-1.5">
        {data.map((d, i) => {
          const pct = ((d.mean - 1) / (scale - 1)) * 100
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="mx-tnum" style={{ fontSize: 10, color: "var(--mx-ink-3)", width: 24 }}>{d.axis}</span>
              <div className="flex-1 overflow-hidden rounded-full" style={{ height: 6, background: "var(--mx-paper-2)" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: fillColor }} />
              </div>
              <span className="mx-tnum" style={{ fontSize: 10, color: "var(--mx-ink-2)", width: 30, textAlign: "right" }}>
                {d.mean.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="rgba(10,30,51,0.10)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{
            fontFamily: "var(--mx-font-mono)",
            fontSize: 10,
            fill: "var(--mx-ink-3)",
          }}
        />
        <PolarRadiusAxis
          domain={[1, scale]}
          tick={false}
          axisLine={false}
          tickCount={scale}
        />
        <Radar
          dataKey="mean"
          stroke={fillColor}
          strokeWidth={1.5}
          fill={fillColor}
          fillOpacity={0.22}
          dot={{ r: 3, fill: fillColor, stroke: "var(--mx-paper)", strokeWidth: 1 }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--mx-paper)",
            border: "1px solid var(--mx-line)",
            borderRadius: 10,
            boxShadow: "var(--mx-shadow-card)",
            fontFamily: "var(--mx-font-sans)",
            fontSize: 12,
            color: "var(--mx-ink)",
          }}
          formatter={(v) => {
            const formatted = typeof v === "number" ? v.toFixed(2) : String(v ?? "")
            return [formatted, "Mean"] as [string, string]
          }}
          labelFormatter={(_l, payload) => {
            const item = payload?.[0]?.payload as { text?: string; n?: number } | undefined
            return item?.text ? `${item.text} (n=${item.n})` : ""
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function FactorGaugeCard({
  factor, itemsInFactor,
}: {
  factor: FactorDistribution
  itemsInFactor: QuestionStat[]
}) {
  const pig = PIGMENT[scorePigment(factor.mean)]
  // 1–5 scale assumed for Likert composites; clamp pct to [0,100].
  const pct = factor.mean === null ? 0 : Math.max(0, Math.min(100, ((factor.mean - 1) / 4) * 100))

  const itemsWithMean = itemsInFactor.filter(it => it.mean !== null && it.n > 0)
  const sorted = [...itemsWithMean].sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]

  // Determine Likert scale from the first scored item in this factor
  // (defaults to 5 if no items or non-Likert).
  const scale = itemsInFactor.find(it => it.question_type === "likert_7")
    ? 7
    : 5

  return (
    <div className="mx-card" style={{ padding: 22 }}>
      {/* Header row */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p
            style={{
              fontFamily: "var(--mx-font-display)",
              fontSize: 20,
              lineHeight: 1.15,
              color: "var(--mx-ink)",
              letterSpacing: "-0.012em",
            }}
          >
            {factor.factor_name}
          </p>
          <p className="mx-tnum" style={{ fontSize: 10.5, color: "var(--mx-ink-3)" }}>
            n = {factor.n}{factor.sd !== null ? ` · σ ${factor.sd.toFixed(2)}` : ""}
            {itemsWithMean.length > 0 ? ` · ${itemsWithMean.length} items` : ""}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <p
            className="mx-num"
            style={{
              fontSize: 34,
              lineHeight: 1,
              color: pig.main,
            }}
          >
            {factor.mean !== null ? factor.mean.toFixed(2) : "—"}
          </p>
          {factor.label && (
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: factor.color ?? pig.main,
                color: "#FAF7F2",
                textTransform: "uppercase",
              }}
            >
              {factor.label}
            </span>
          )}
        </div>
      </div>

      {/* Polar / radar — every item plotted as an axis. */}
      <div className="mt-4">
        <FactorRadar items={itemsWithMean} scale={scale} fillColor={pig.main} />
      </div>

      {/* 5-band gauge bar */}
      <div className="mt-4">
        <div
          className="relative overflow-hidden rounded-full"
          style={{ height: 8, background: "var(--mx-paper-2)", border: "1px solid var(--mx-line)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${PIGMENT.navy.main}, ${pig.main})`,
            }}
          />
          {[25, 50, 75].map(p => (
            <span
              key={p}
              className="absolute top-0 bottom-0"
              style={{ left: `${p}%`, width: 1, background: "rgba(10,30,51,0.08)" }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between" style={{ fontFamily: "var(--mx-font-mono)", fontSize: 9.5, color: "var(--mx-ink-3)" }}>
          <span>Low</span>
          <span>Below</span>
          <span>Mid</span>
          <span>Above</span>
          <span>High</span>
        </div>
      </div>

      {/* Strongest / weakest item line */}
      {(strongest || weakest) && (
        <div className="mt-4 space-y-1.5 border-t pt-3" style={{ borderColor: "var(--mx-line)" }}>
          {strongest && strongest.mean !== null && (
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: PIGMENT.olive.tint, color: PIGMENT.olive.deep }}
              >
                <IconArrowUpRight size={10} stroke={2} />
                {strongest.mean.toFixed(2)}
              </span>
              <span
                className="flex-1 truncate"
                style={{ fontFamily: "var(--mx-font-sans)", fontSize: 11.5, color: "var(--mx-ink-2)" }}
                title={strongest.text}
              >
                {strongest.text}
              </span>
            </div>
          )}
          {weakest && weakest !== strongest && weakest.mean !== null && (
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: PIGMENT.persimmon.tint, color: PIGMENT.persimmon.deep }}
              >
                <IconArrowDownRight size={10} stroke={2} />
                {weakest.mean.toFixed(2)}
              </span>
              <span
                className="flex-1 truncate"
                style={{ fontFamily: "var(--mx-font-sans)", fontSize: 11.5, color: "var(--mx-ink-2)" }}
                title={weakest.text}
              >
                {weakest.text}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FactorsPanel({
  dashboard, results, questions,
}: {
  dashboard: DashboardData | null
  results: SurveyResults
  questions: QuestionOut[]
}) {
  if (!dashboard || dashboard.factor_distributions.length === 0) {
    return (
      <div
        className="mx-card p-8 text-center"
        style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}
      >
        No factors configured. Assign factors to questions in the editor to see this section populated.
      </div>
    )
  }

  // Map factor_name → question stats (joined via QuestionOut.factor → QuestionStat.question_id).
  const factorByQid = new Map(questions.map(q => [q.id, q.factor]))
  const statsByFactor = new Map<string, QuestionStat[]>()
  results.questions.forEach(stat => {
    const f = factorByQid.get(stat.question_id)
    if (!f) return
    if (!statsByFactor.has(f)) statsByFactor.set(f, [])
    statsByFactor.get(f)!.push(stat)
  })

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {dashboard.factor_distributions.map(factor => (
        <FactorGaugeCard
          key={factor.factor_name}
          factor={factor}
          itemsInFactor={statsByFactor.get(factor.factor_name) ?? []}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Items table — sortable list of every Likert/numeric-scored question
// ---------------------------------------------------------------------------

function ItemsTable({
  results, questions,
}: {
  results: SurveyResults
  questions: QuestionOut[]
}) {
  const [sortBy, setSortBy] = useState<"order" | "mean-desc" | "mean-asc" | "n">("order")

  const scored = results.questions.filter(s =>
    s.question_type === "likert_5" || s.question_type === "likert_7"
  )

  const qOrder = new Map(questions.map((q, i) => [q.id, i]))
  const qFactor = new Map(questions.map(q => [q.id, q.factor]))

  const sorted = useMemo(() => {
    const list = [...scored]
    if (sortBy === "mean-desc") list.sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity))
    if (sortBy === "mean-asc") list.sort((a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity))
    if (sortBy === "n") list.sort((a, b) => b.n - a.n)
    if (sortBy === "order") list.sort((a, b) => (qOrder.get(a.question_id) ?? 0) - (qOrder.get(b.question_id) ?? 0))
    return list
  }, [scored, sortBy, qOrder])

  if (scored.length === 0) {
    return (
      <div
        className="mx-card p-6 text-center"
        style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}
      >
        No Likert-scaled items in this survey.
      </div>
    )
  }

  return (
    <div className="mx-card overflow-hidden">
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--mx-line)" }}
      >
        <p className="mx-eyebrow" style={{ margin: 0 }}>{scored.length} scored items</p>
        <div className="flex items-center gap-1.5">
          {[
            { v: "order", label: "Order" },
            { v: "mean-desc", label: "Mean ↓" },
            { v: "mean-asc", label: "Mean ↑" },
            { v: "n", label: "n" },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setSortBy(opt.v as typeof sortBy)}
              className="rounded-[999px] px-2.5 py-1 transition-all"
              style={{
                fontFamily: "var(--mx-font-sans)",
                fontSize: 10.5,
                fontWeight: 500,
                background: sortBy === opt.v ? "var(--mx-forest)" : "transparent",
                color: sortBy === opt.v ? "var(--mx-paper)" : "var(--mx-ink-2)",
                border: "1px solid",
                borderColor: sortBy === opt.v ? "var(--mx-forest)" : "var(--mx-line)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full" style={{ fontFamily: "var(--mx-font-sans)", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--mx-paper-2)" }}>
              <th className="px-4 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>#</th>
              <th className="px-4 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>Item</th>
              <th className="px-4 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>Factor</th>
              <th className="px-4 py-2 text-right" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>Mean</th>
              <th className="px-4 py-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>Distribution</th>
              <th className="px-4 py-2 text-right" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>n</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, idx) => {
              const factor = qFactor.get(s.question_id)
              const scale = s.question_type === "likert_7" ? 7 : 5
              const pct = s.mean === null ? 0 : Math.max(0, Math.min(100, ((s.mean - 1) / (scale - 1)) * 100))
              const pig = PIGMENT[scorePigment(s.mean, scale)]
              return (
                <tr key={s.question_id} style={{ borderTop: "1px solid var(--mx-line)" }}>
                  <td className="px-4 py-2.5 mx-tnum" style={{ color: "var(--mx-ink-3)", width: 40 }}>{idx + 1}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--mx-ink)", maxWidth: 360 }}>
                    <p className="truncate" title={s.text}>{s.text}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {factor ? (
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          background: "var(--mx-paper-2)",
                          border: "1px solid var(--mx-line)",
                          color: "var(--mx-ink-2)",
                        }}
                      >
                        {factor}
                      </span>
                    ) : (
                      <span style={{ color: "var(--mx-ink-3)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 mx-tnum text-right" style={{ color: pig.main, fontWeight: 600 }}>
                    {s.mean !== null ? s.mean.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2.5" style={{ width: 200 }}>
                    <div
                      className="relative overflow-hidden rounded-full"
                      style={{ height: 6, background: "var(--mx-paper-2)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%`, background: pig.main }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 mx-tnum text-right" style={{ color: "var(--mx-ink-3)" }}>{s.n}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demographics — heatmap of (factor × group) means + significance markers
// ---------------------------------------------------------------------------

function DemographicsHeatmap({
  data,
}: {
  data: GroupComparisonData
}) {
  if (data.factors.length === 0 || data.group_values.length === 0) return null

  // Compute global range across all cells for color scaling.
  const allMeans: number[] = []
  data.factors.forEach(f => {
    f.groups.forEach(g => {
      if (g.mean !== null) allMeans.push(g.mean)
    })
  })
  const lo = allMeans.length ? Math.min(...allMeans) : 1
  const hi = allMeans.length ? Math.max(...allMeans) : 5
  const range = hi - lo || 1

  function cellColor(mean: number | null) {
    if (mean === null) return { bg: "var(--mx-paper-2)", fg: "var(--mx-ink-3)" }
    const pig = PIGMENT[scorePigment(mean)]
    // Tint by how high within range; floor of 0.15 so every cell is visible.
    const t = Math.max(0.15, (mean - lo) / range)
    return {
      bg: pig.main + Math.round(t * 220).toString(16).padStart(2, "0"),
      fg: t > 0.55 ? "#FAF7F2" : pig.deep,
    }
  }

  return (
    <div className="mx-card overflow-hidden">
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--mx-line)" }}
      >
        <p
          style={{
            fontFamily: "var(--mx-font-display)",
            fontSize: 16,
            color: "var(--mx-ink)",
            letterSpacing: "-0.012em",
          }}
        >
          {data.demographic_key}
        </p>
        <p
          className="mx-tnum"
          style={{ fontSize: 10.5, color: "var(--mx-ink-3)" }}
        >
          {data.group_values.length} group{data.group_values.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full" style={{ fontFamily: "var(--mx-font-sans)", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--mx-paper-2)" }}>
              <th className="px-3 py-2 text-left" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>
                Factor
              </th>
              {data.group_values.map(g => (
                <th
                  key={g}
                  className="px-3 py-2 text-center"
                  style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--mx-ink-3)" }}
                >
                  {g}
                </th>
              ))}
              <th className="px-3 py-2 text-right" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}>
                p
              </th>
            </tr>
          </thead>
          <tbody>
            {data.factors.map((f: FactorGroupComparison) => (
              <tr key={f.factor_name} style={{ borderTop: "1px solid var(--mx-line)" }}>
                <td className="px-3 py-2" style={{ color: "var(--mx-ink)", fontWeight: 500 }}>
                  {f.factor_name}
                </td>
                {data.group_values.map(g => {
                  const cell = f.groups.find(gr => gr.group_value === g)
                  const c = cellColor(cell?.mean ?? null)
                  return (
                    <td key={g} className="px-1 py-1 text-center" style={{ minWidth: 80 }}>
                      <div
                        className="mx-1 rounded-md px-2 py-1.5"
                        style={{ background: c.bg, color: c.fg }}
                      >
                        <span className="mx-tnum" style={{ fontSize: 12, fontWeight: 600 }}>
                          {cell?.mean !== null && cell?.mean !== undefined ? cell.mean.toFixed(2) : "—"}
                        </span>
                        {cell && (
                          <span className="ml-1 mx-tnum" style={{ fontSize: 9, opacity: 0.7 }}>
                            n={cell.n}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td
                  className="px-3 py-2 text-right mx-tnum"
                  style={{
                    fontSize: 11,
                    color: f.significant ? PIGMENT.persimmon.deep : "var(--mx-ink-3)",
                    fontWeight: f.significant ? 600 : 400,
                  }}
                >
                  {f.p_value !== null ? f.p_value.toFixed(3) : "—"}
                  {f.significant && <span className="ml-0.5">*</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DemographicsPanel({
  surveyId,
  dashboard,
}: {
  surveyId: string
  dashboard: DashboardData | null
}) {
  const [byKey, setByKey] = useState<Map<string, GroupComparisonData>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const keys = dashboard?.demographic_keys ?? []

  useEffect(() => {
    if (keys.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(keys.map(k => getGroupComparison(surveyId, k).catch(() => null)))
      .then(results => {
        if (cancelled) return
        const next = new Map<string, GroupComparisonData>()
        results.forEach((r, i) => { if (r) next.set(keys[i], r) })
        setByKey(next)
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [surveyId, keys.join("|")])

  if (loading) {
    return (
      <div className="mx-card p-6 text-center" style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
        Loading demographic breakdowns…
      </div>
    )
  }
  if (error) return <p className="text-xs" style={{ color: "var(--mx-rose)" }}>{error}</p>
  if (keys.length === 0) {
    return (
      <div className="mx-card p-6 text-center" style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
        No demographic questions in this survey. Mark a question as demographic in the editor to enable breakdowns.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="mx-caption" style={{ fontSize: 12 }}>
        Factor means split by each demographic. <span style={{ color: PIGMENT.persimmon.deep, fontWeight: 600 }}>*</span> = p &lt; 0.05 (significant group difference).
      </p>
      {Array.from(byKey.entries()).map(([key, data]) => (
        <DemographicsHeatmap key={key} data={data} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Roster — paginated respondent table with top-factor / dip-factor
// ---------------------------------------------------------------------------

function RosterTable({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<RespondentsData | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageSize = 10

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRespondents(surveyId, page, pageSize, "desc")
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [surveyId, page])

  if (loading && !data) {
    return (
      <div className="mx-card p-6 text-center" style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
        Loading respondents…
      </div>
    )
  }
  if (error) return <p className="text-xs" style={{ color: "var(--mx-rose)" }}>{error}</p>
  if (!data || data.rows.length === 0) {
    return (
      <div className="mx-card p-6 text-center" style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
        No responses yet.
      </div>
    )
  }

  // Compute cohort min/max composite for the "vs cohort" mini-bar.
  const composites = data.rows.map(r => r.composite_score).filter((s): s is number => s !== null)
  const lo = composites.length ? Math.min(...composites) : 1
  const hi = composites.length ? Math.max(...composites) : 5
  const range = Math.max(hi - lo, 0.1)

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size))

  function topAndDip(row: RespondentRow): { top: string | null; dip: string | null } {
    const entries = Object.entries(row.factor_scores)
      .map(([k, v]) => [k, v.raw_mean] as const)
      .filter((e): e is readonly [string, number] => e[1] !== null)
    if (entries.length === 0) return { top: null, dip: null }
    const sorted = [...entries].sort(([, a], [, b]) => b - a)
    return { top: sorted[0][0], dip: sorted[sorted.length - 1][0] }
  }

  return (
    <div className="mx-card overflow-hidden">
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--mx-line)" }}
      >
        <p className="mx-eyebrow" style={{ margin: 0 }}>
          {data.total} respondent{data.total !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="mx-pill disabled:opacity-40"
            style={{ fontSize: 11 }}
          >
            Prev
          </button>
          <span className="mx-tnum" style={{ fontSize: 11, color: "var(--mx-ink-3)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="mx-pill disabled:opacity-40"
            style={{ fontSize: 11 }}
          >
            Next
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full" style={{ fontFamily: "var(--mx-font-sans)", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--mx-paper-2)" }}>
              {["Respondent", "Submitted", "Composite", "vs cohort", "Top", "Dip", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left"
                  style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mx-ink-3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const { top, dip } = topAndDip(row)
              const pct = row.composite_score !== null
                ? Math.max(2, Math.min(100, ((row.composite_score - lo) / range) * 100))
                : 0
              const pig = PIGMENT[scorePigment(row.composite_score)]
              return (
                <tr key={row.response_id} style={{ borderTop: "1px solid var(--mx-line)" }}>
                  <td className="px-3 py-2.5 font-mono" style={{ color: "var(--mx-ink-2)", fontSize: 11 }}>
                    {row.respondent_ref ?? row.response_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2.5 mx-tnum" style={{ color: "var(--mx-ink-3)", fontSize: 11 }}>
                    {new Date(row.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-3 py-2.5 mx-tnum" style={{ color: pig.main, fontWeight: 600 }}>
                    {row.composite_score !== null ? row.composite_score.toFixed(2) : "—"}
                    {row.composite_label && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: row.composite_color ?? pig.main, color: "#FAF7F2" }}
                      >
                        {row.composite_label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" style={{ width: 140 }}>
                    <div
                      className="relative overflow-hidden rounded-full"
                      style={{ height: 5, background: "var(--mx-paper-2)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%`, background: pig.main }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {top ? (
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          fontSize: 10,
                          background: PIGMENT.olive.tint,
                          color: PIGMENT.olive.deep,
                          fontWeight: 500,
                        }}
                      >
                        {top}
                      </span>
                    ) : <span style={{ color: "var(--mx-ink-3)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {dip && dip !== top ? (
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          fontSize: 10,
                          background: PIGMENT.persimmon.tint,
                          color: PIGMENT.persimmon.deep,
                          fontWeight: 500,
                        }}
                      >
                        {dip}
                      </span>
                    ) : <span style={{ color: "var(--mx-ink-3)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/surveys/${surveyId}/responses/${row.response_id}/report`}
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors"
                      style={{ color: "#0F2841", background: "rgba(15,40,65,0.08)" }}
                    >
                      Report →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Qualitative panel — all open-text answers grouped by question
// ---------------------------------------------------------------------------

function QualitativePanel({ results }: { results: SurveyResults }) {
  const textQs = results.questions.filter(q =>
    q.question_type === "text" && (q.text_values?.length ?? 0) > 0
  )
  if (textQs.length === 0) {
    return (
      <div className="mx-card p-6 text-center" style={{ color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-sans)", fontSize: 13 }}>
        No open-text responses yet.
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {textQs.map(q => (
        <div key={q.question_id} className="mx-card" style={{ padding: 20 }}>
          <p
            style={{
              fontFamily: "var(--mx-font-display)",
              fontSize: 16,
              lineHeight: 1.25,
              color: "var(--mx-ink)",
              letterSpacing: "-0.012em",
            }}
          >
            {q.text}
          </p>
          <p className="mx-tnum mt-1" style={{ fontSize: 10.5, color: "var(--mx-ink-3)" }}>
            {q.text_values?.length ?? 0} response{(q.text_values?.length ?? 0) !== 1 ? "s" : ""}
          </p>
          <div className="mt-3 space-y-2">
            {(q.text_values ?? []).map((v, i) => (
              <div
                key={i}
                className="rounded-[10px] px-3 py-2"
                style={{
                  background: "var(--mx-paper-2)",
                  border: "1px solid var(--mx-line)",
                  fontFamily: "var(--mx-font-sans)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--mx-ink)",
                }}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [results, setResults] = useState<SurveyResults | null>(null)
  const [questions, setQuestions] = useState<QuestionOut[]>([])
  const [surveyStatus, setSurveyStatus] = useState<string>("draft")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [stats, setStats] = useState<SurveyStats | null>(null)
  const [alpha, setAlpha] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [res, survey] = await Promise.all([getSurveyResults(id), getSurvey(id)])
      setResults(res)
      setQuestions(survey.questions)
      setSurveyStatus(survey.status)
      // Side requests — best-effort, don't block the page.
      getDashboard(id).then(setDashboard).catch(() => {})
      getSurveyStats(id).then(setStats).catch(() => {})
      getSurveyReliability(id).then(r => setAlpha(r.alpha)).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

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

  function copyRespondLink() {
    const url = `${window.location.origin}/surveys/${id}/respond`
    navigator.clipboard.writeText(url).catch(() => prompt("Copy this link:", url))
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/surveys" backLabel="Surveys" />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          {loading && (
            <div className="flex items-center justify-center py-20" style={{ color: "var(--mx-ink-3)", fontSize: 14 }}>
              Loading results…
            </div>
          )}
          {error && (
            <div
              className="rounded-[14px] px-4 py-3"
              style={{
                background: "rgba(194,78,78,0.06)",
                border: "1px solid rgba(194,78,78,0.25)",
                color: "var(--mx-rose)",
                fontFamily: "var(--mx-font-sans)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {results && (
            <>
              {/* Hero */}
              <OverviewHero
                surveyName={results.survey_name}
                status={surveyStatus}
                dashboard={dashboard}
                stats={stats}
                alpha={alpha}
                responseCount={results.response_count}
                questionCount={results.questions.length}
              />

              {/* Action bar */}
              <div className="mt-4 mb-2 flex flex-wrap items-center justify-end gap-2">
                {(surveyStatus === "published" || surveyStatus === "closed") && (
                  <button onClick={copyRespondLink} className="mx-pill" style={{ fontSize: 11 }}>
                    <IconCopy size={12} stroke={1.8} />
                    Copy link
                  </button>
                )}
                <Link href={`/surveys/${id}/respond`} className="mx-pill" style={{ fontSize: 11 }}>Preview</Link>
                <Link href={`/surveys/${id}/edit`} className="mx-pill" style={{ fontSize: 11 }}>Edit</Link>
                <Link
                  href={`/surveys/${id}/dashboard`}
                  className="mx-pill"
                  style={{ fontSize: 11, color: "#0F2841", fontWeight: 600 }}
                >
                  Dashboard →
                </Link>
                {surveyStatus === "draft" && (
                  <button
                    onClick={() => handleStatusChange("published")}
                    disabled={statusChanging}
                    className="rounded-[999px] px-3 py-1.5 transition-all disabled:opacity-50"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11,
                      fontWeight: 500,
                      background: PIGMENT.olive.main,
                      color: "#FAF7F2",
                    }}
                  >
                    {statusChanging ? "…" : "Go live"}
                  </button>
                )}
                {surveyStatus === "published" && (
                  <button
                    onClick={() => handleStatusChange("closed")}
                    disabled={statusChanging}
                    className="rounded-[999px] px-3 py-1.5 transition-all disabled:opacity-50"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11,
                      fontWeight: 500,
                      background: PIGMENT.persimmon.main,
                      color: "#FAF7F2",
                    }}
                  >
                    {statusChanging ? "…" : "Close"}
                  </button>
                )}
                {surveyStatus === "closed" && (
                  <button
                    onClick={() => handleStatusChange("published")}
                    disabled={statusChanging}
                    className="rounded-[999px] px-3 py-1.5 transition-all disabled:opacity-50"
                    style={{
                      fontFamily: "var(--mx-font-sans)",
                      fontSize: 11,
                      fontWeight: 500,
                      background: PIGMENT.olive.main,
                      color: "#FAF7F2",
                    }}
                  >
                    {statusChanging ? "…" : "Reopen"}
                  </button>
                )}
                <button onClick={load} className="mx-pill" style={{ fontSize: 11 }} title="Refresh">
                  <IconRefresh size={12} stroke={1.8} />
                </button>
              </div>

              {/* No-response warning */}
              {results.response_count === 0 && (
                <div
                  className="mb-6 rounded-[14px] px-5 py-4"
                  style={{
                    background: PIGMENT.butter.tint,
                    border: `1px solid ${PIGMENT.butter.main}55`,
                    color: PIGMENT.butter.deep,
                    fontFamily: "var(--mx-font-sans)",
                    fontSize: 13,
                  }}
                >
                  No responses yet. Share the{" "}
                  <Link href={`/surveys/${id}/respond`} className="font-semibold underline underline-offset-2">survey link</Link>
                  {" "}or use the invite panel in the Psychometrics tab below.
                </div>
              )}

              {/* Sticky section nav */}
              <SectionNav />

              {/* ── #overview ─────────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="overview"
                  title="Overview"
                  subtitle="Survey-wide polar map plus the single best and worst item"
                  Icon={IconChartHistogram}
                />
                {dashboard && dashboard.factor_distributions.length > 0 && (
                  <SurveyPolarMap factors={dashboard.factor_distributions} />
                )}
                <HighLowSection results={results} questions={questions} />
              </section>

              {/* ── #factors ──────────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="factors"
                  title="Factors"
                  subtitle="Mean per factor with 5-band gauge and strongest / weakest item"
                  Icon={IconChartDots}
                  count={dashboard?.factor_distributions.length}
                />
                <FactorsPanel dashboard={dashboard} results={results} questions={questions} />
              </section>

              {/* ── #items ────────────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="items"
                  title="Items"
                  subtitle="Every scored question, sortable by mean or order"
                  Icon={IconListNumbers}
                />
                <ItemsTable results={results} questions={questions} />
              </section>

              {/* ── #demographics ─────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="demographics"
                  title="Demographics"
                  subtitle="Factor means split by demographic group, with significance markers"
                  Icon={IconUsersGroup}
                  count={dashboard?.demographic_keys.length}
                />
                <DemographicsPanel surveyId={id} dashboard={dashboard} />
              </section>

              {/* ── #roster ───────────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="roster"
                  title="Roster"
                  subtitle="Individual respondents with composite + top / dip factor"
                  Icon={IconReportAnalytics}
                />
                <RosterTable surveyId={id} />
              </section>

              {/* ── #psychometrics ────────────────────────────────────────── */}
              <section className="space-y-4 mb-10">
                <SectionHeader
                  id="psychometrics"
                  title="Psychometrics"
                  subtitle="Reliability · normalized factor scores · invites"
                  Icon={IconChartBar}
                />
                <ReliabilityPanel surveyId={id} />
                <FactorScoresPanel surveyId={id} />
                <InvitePanel surveyId={id} />
              </section>

              {/* ── #responses ────────────────────────────────────────────── */}
              <section className="space-y-4">
                <SectionHeader
                  id="responses"
                  title="Responses"
                  subtitle="Per-question detail (Likert / choice / ranking / text)"
                  Icon={IconMessageCircle}
                  count={results.questions.length}
                />
                {results.questions.length > 0 && (
                  <>
                    {/* Qualitative card — surface free-text answers first */}
                    <QualitativePanel results={results} />
                    {/* Every question as a card */}
                    {results.questions.map(stat => {
                      const question = questions.find(q => q.id === stat.question_id)
                      return question
                        ? <QuestionResultCard key={stat.question_id} stat={stat} question={question} />
                        : null
                    })}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
