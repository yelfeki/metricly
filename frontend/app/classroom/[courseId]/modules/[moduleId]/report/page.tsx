"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import { getModuleReport, getReflection, saveReflection } from "@/lib/api"
import type {
  ClassroomModuleReport,
  ClassroomRecommendation,
} from "@/lib/types"

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--mx-line)",
  borderRadius: "var(--mx-r-md)",
  background: "var(--mx-surface)",
  fontSize: 13,
  color: "var(--mx-ink)",
  padding: "9px 11px",
  outline: "none",
  fontFamily: "var(--mx-font-sans)",
}
const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--mx-ink-3)",
  display: "block",
  marginBottom: 5,
}

function SectionLabel({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 2px 0" }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--mx-forest)", color: "var(--mx-paper)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mx-font-display)", fontSize: 14, flex: "0 0 auto" }}>{n}</span>
      <span className="mx-display" style={{ fontSize: 22 }}>{title}</span>
      {hint && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--mx-ink-3)", fontStyle: "italic" }}>{hint}</span>}
    </div>
  )
}

export default function ReportWorkbookPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const [report, setReport] = useState<ClassroomModuleReport | null>(null)
  const [synthesis, setSynthesis] = useState("")
  const [recs, setRecs] = useState<ClassroomRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId || !moduleId) return
    ;(async () => {
      setLoading(true)
      try {
        const [r, refl] = await Promise.all([
          getModuleReport(courseId, moduleId),
          getReflection(courseId, moduleId),
        ])
        setReport(r)
        setSynthesis(refl.synthesis ?? "")
        setRecs(refl.recommendations.length ? refl.recommendations : [{}])
        setSavedAt(refl.updated_at)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId, moduleId])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const cleaned = recs.filter((r) => r.observation || r.concept || r.action || r.feasibility)
      const out = await saveReflection(courseId, moduleId, { synthesis, recommendations: cleaned })
      setSavedAt(out.updated_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function updateRec(i: number, patch: Partial<ClassroomRecommendation>) {
    setRecs((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/classroom/${courseId}`} backLabel="This week" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 16 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading your report…</div>
          ) : error && !report ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error}</div>
          ) : report ? (
            <>
              <div>
                <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                  {[report.week_no && `Week ${report.week_no}`, report.reading_ref].filter(Boolean).join("  ·  ")}
                </div>
                <h1 className="mx-display" style={{ fontSize: 32, marginTop: 4 }}>{report.topic}</h1>
              </div>

              <div className="mx-card" style={{ padding: "14px 18px", background: "var(--mx-paper-2)", display: "flex", gap: 12, alignItems: "center" }}>
                <span className="mx-caption" style={{ color: "var(--mx-ink-2)", lineHeight: 1.5 }}>
                  The figures below are <b style={{ color: "var(--mx-ink)" }}>yours to read</b> — Metricly won’t interpret them for you. Study the data, then write your own synthesis and recommendations using this week’s I-O concepts.
                </span>
              </div>

              {/* SECTION 1 — THE DATA */}
              <SectionLabel n={1} title="The data" hint="read only · your figures" />

              <div className="mx-card">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div className="mx-eyebrow">Your overall score</div>
                    <span className="mx-num mx-text-grad-cool" style={{ fontSize: 64 }}>{report.composite ?? "—"}</span>
                    <span className="mx-caption" style={{ color: "var(--mx-ink-3)", marginLeft: 6 }}>/ 100</span>
                  </div>
                  {report.team_composite != null && (
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="mx-eyebrow">Team average</div>
                      <span className="mx-num" style={{ fontSize: 32, color: "var(--mx-ink-2)" }}>{report.team_composite}</span>
                      <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>{report.team_n} teammate{report.team_n === 1 ? "" : "s"}</div>
                    </div>
                  )}
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--mx-line)", margin: "16px 0" }} />

                <div className="mx-eyebrow" style={{ marginBottom: 12 }}>By factor · you vs. team</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {report.factors.map((f) => (
                    <div key={f.name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 38px", gap: 12, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--mx-ink-2)" }}>{f.name}</div>
                      <div style={{ position: "relative", height: 12, borderRadius: 6, background: "var(--mx-paper-2)", overflow: "visible" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${f.normalized ?? 0}%`, background: "var(--mx-grad-cool)", borderRadius: 6 }} />
                        {f.team_mean != null && (
                          <div title={`Team ${f.team_mean}`} style={{ position: "absolute", left: `calc(${f.team_mean}% - 1px)`, top: -3, bottom: -3, width: 2, background: "var(--mx-ink)" }} />
                        )}
                      </div>
                      <div className="mx-mono" style={{ fontSize: 13, color: "var(--mx-ink)", textAlign: "right" }}>{f.normalized ?? "—"}</div>
                    </div>
                  ))}
                </div>
                {report.factors.some((f) => f.team_mean != null) && (
                  <div className="mx-caption" style={{ color: "var(--mx-ink-3)", marginTop: 10 }}>
                    <span style={{ display: "inline-block", width: 10, height: 2, background: "var(--mx-ink)", verticalAlign: "middle" }} /> team average
                  </div>
                )}
              </div>

              {/* item-level */}
              <div className="mx-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="mx-eyebrow">Item by item · your answers</div>
                  <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>{report.scale_min} low → {report.scale_max} high · <span style={{ color: "var(--mx-clay)" }}>R</span> reverse</span>
                </div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
                  {report.items.map((it, i) => {
                    const frac = it.value != null ? (it.value - report.scale_min) / Math.max(1, report.scale_max - report.scale_min) : 0
                    return (
                      <div key={it.question_id} title={it.text} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", maxWidth: 22, height: 64, display: "flex", alignItems: "flex-end" }}>
                          <div style={{ width: "100%", height: `${Math.max(6, frac * 64)}px`, background: it.reverse_scored ? "var(--mx-cobalt)" : "var(--mx-forest)", borderRadius: "3px 3px 0 0" }} />
                        </div>
                        <span className="mx-mono" style={{ fontSize: 9, color: "var(--mx-ink-3)" }}>{i + 1}{it.reverse_scored ? <span style={{ color: "var(--mx-clay)" }}>R</span> : ""}</span>
                        <span className="mx-mono" style={{ fontSize: 10, color: "var(--mx-ink-2)" }}>{it.value ?? "—"}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* SECTION 2 — YOUR READ */}
              <SectionLabel n={2} title="Your read" hint="you write this — not Metricly" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
                <div className="mx-card">
                  {report.guiding_questions.length > 0 && (
                    <div style={{ background: "var(--mx-paper-2)", border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-md)", padding: "13px 15px", marginBottom: 14 }}>
                      <div className="mx-eyebrow" style={{ color: "var(--mx-clay)", marginBottom: 6 }}>Guiding questions</div>
                      <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 }}>
                        {report.guiding_questions.map((q, i) => (
                          <li key={i} style={{ fontSize: 13, color: "var(--mx-ink-2)", lineHeight: 1.5 }}>{q}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <textarea
                    value={synthesis}
                    onChange={(e) => setSynthesis(e.target.value)}
                    rows={7}
                    placeholder="Write your synthesis here… What pattern do you see? Which I-O concept explains it? How do you compare with your team?"
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, fontSize: 13.5 }}
                  />
                </div>

                <div className="mx-card" style={{ background: "var(--mx-paper-2)" }}>
                  {report.lenses.length > 0 && (
                    <>
                      <div className="mx-eyebrow" style={{ marginBottom: 8 }}>Lenses to use</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                        {report.lenses.map((l) => (
                          <span key={l} style={{ fontSize: 11.5, fontWeight: 500, padding: "4px 10px", borderRadius: "var(--mx-r-pill)", background: "var(--mx-surface)", color: "var(--mx-ink-2)", border: "1px solid var(--mx-line)" }}>{l}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {report.key_terms.length > 0 && (
                    <>
                      <div className="mx-eyebrow" style={{ marginBottom: 8 }}>Key terms</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {report.key_terms.map((t) => (
                          <span key={t} style={{ fontSize: 11.5, fontWeight: 500, padding: "4px 10px", borderRadius: "var(--mx-r-pill)", background: "var(--mx-surface)", color: "var(--mx-ink-2)", border: "1px solid var(--mx-line)" }}>{t}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* SECTION 3 — RECOMMENDATIONS */}
              <SectionLabel n={3} title="Recommended actions" hint="evidence-based · you propose them" />

              <div className="mx-card" style={{ background: "var(--mx-paper-2)", padding: "14px 16px" }}>
                <div className="mx-eyebrow" style={{ color: "var(--mx-clay)", marginBottom: 6 }}>What makes a recommendation evidence-based?</div>
                <span className="mx-caption" style={{ color: "var(--mx-ink-2)", lineHeight: 1.55 }}>
                  Tie each action to <b style={{ color: "var(--mx-ink)" }}>something in your data</b>, name the <b style={{ color: "var(--mx-ink)" }}>I-O concept</b> behind it, and make it <b style={{ color: "var(--mx-ink)" }}>realistic for an employer</b> to do.
                </span>
              </div>

              {recs.map((r, i) => (
                <div key={i} className="mx-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: "var(--mx-r-pill)", background: "var(--mx-forest)", color: "var(--mx-paper)" }}>Recommendation {i + 1}</span>
                    {recs.length > 1 && (
                      <button onClick={() => setRecs((prev) => prev.filter((_, k) => k !== i))} style={{ background: "none", border: "none", color: "var(--mx-ink-3)", fontSize: 12, cursor: "pointer" }}>Remove</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Observation — what in your data?</label>
                      <input style={inputStyle} value={r.observation ?? ""} onChange={(e) => updateRec(i, { observation: e.target.value })} placeholder="e.g. workload items scored highest…" />
                    </div>
                    <div>
                      <label style={labelStyle}>I-O concept it draws on</label>
                      <select style={inputStyle} value={r.concept ?? ""} onChange={(e) => updateRec(i, { concept: e.target.value })}>
                        <option value="">Choose a concept…</option>
                        {report.concept_options.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Recommended action — specific &amp; doable</label>
                      <input style={inputStyle} value={r.action ?? ""} onChange={(e) => updateRec(i, { action: e.target.value })} placeholder="e.g. a protected weekly planning block…" />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Why an employer could realistically do it</label>
                      <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={r.feasibility ?? ""} onChange={(e) => updateRec(i, { feasibility: e.target.value })} placeholder="Cost, effort, and the evidence or theory that backs it…" />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => setRecs((prev) => [...prev, {}])} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--mx-line)", background: "transparent", color: "var(--mx-ink)", fontSize: 12.5, fontWeight: 500, padding: "8px 14px", borderRadius: "var(--mx-r-pill)", cursor: "pointer" }}>
                + Add another recommendation
              </button>

              {error && <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)", fontSize: 13 }}>{error}</div>}

              {/* save bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--mx-line)", paddingTop: 14, marginTop: 4 }}>
                <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                  {savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "Not saved yet"}
                </span>
                <div style={{ display: "flex", gap: 10 }}>
                  <Link href={`/classroom/${courseId}`} style={{ textDecoration: "none" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--mx-line)", color: "var(--mx-ink)", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: "var(--mx-r-pill)" }}>Back to this week</span>
                  </Link>
                  <button onClick={save} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 13, fontWeight: 500, padding: "9px 18px", borderRadius: "var(--mx-r-pill)", cursor: "pointer" }}>
                    {saving ? "Saving…" : "Save report"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
