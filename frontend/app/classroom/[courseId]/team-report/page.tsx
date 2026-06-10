"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import { getTeamReport, saveTeamSection } from "@/lib/api"
import type {
  ClassroomRecommendation,
  ClassroomTeamReport,
  ClassroomTeamReportModule,
} from "@/lib/types"

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--mx-line)",
  borderRadius: "var(--mx-r-md)",
  background: "var(--mx-surface)",
  fontSize: 13,
  color: "var(--mx-ink)",
  padding: "8px 10px",
  outline: "none",
  fontFamily: "var(--mx-font-sans)",
}
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--mx-ink-3)",
  display: "block",
  marginBottom: 4,
}

function initials(name: string | null): string {
  if (!name) return "?"
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

export default function TeamReportPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const [report, setReport] = useState<ClassroomTeamReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    ;(async () => {
      setLoading(true)
      try {
        setReport(await getTeamReport(courseId))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId])

  const written = report?.modules.filter((m) => m.section.synthesis || m.section.recommendations.length).length ?? 0
  const withMeasure = report?.modules.filter((m) => m.has_measure).length ?? 0

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/classroom/${courseId}`} backLabel="This week" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 16 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading the team report…</div>
          ) : error ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error}</div>
          ) : report ? (
            <>
              {/* hero */}
              <div className="mx-card" style={{ color: "var(--mx-paper)", border: "1px solid var(--mx-forest)", background: "var(--mx-grad-hero)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: "auto -10% -40% auto", width: "52%", height: "80%", background: "radial-gradient(50% 50% at 50% 50%, rgba(226,177,70,.4) 0%, transparent 72%)", pointerEvents: "none" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
                  <div>
                    <div className="mx-eyebrow" style={{ color: "var(--mx-butter)" }}>{report.team_name} · integrated report</div>
                    <div className="mx-display" style={{ fontSize: 30, marginTop: 6, color: "#FBF5E6" }}>{report.project_title ?? report.course_title}</div>
                    <div style={{ marginTop: 8, fontSize: 12.5, color: "#F4ECD8" }}>
                      You all edit this together — then download your own copy to submit.
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mx-num" style={{ fontSize: 34, color: "#fff" }}>{written}<span style={{ fontSize: 18, color: "var(--mx-butter)" }}> / {withMeasure}</span></div>
                    <div style={{ fontSize: 11, color: "#F4ECD8" }}>topics written</div>
                  </div>
                </div>
              </div>

              {/* download note */}
              <div className="mx-card" style={{ padding: "12px 16px", background: "var(--mx-paper-2)", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="mx-caption" style={{ color: "var(--mx-ink-2)", flex: 1, lineHeight: 1.5 }}>
                  <b style={{ color: "var(--mx-ink)" }}>Your copy is personal.</b> Your download includes your own results plus the team’s combined results and everything written here. Each member downloads and submits their own PDF.
                </span>
                <Link href={`/classroom/${courseId}/team-report/print`} style={{ textDecoration: "none" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: "var(--mx-r-pill)", whiteSpace: "nowrap" }}>
                    Download my copy
                  </span>
                </Link>
              </div>

              {report.modules.map((m) => (
                <TeamModuleSection key={m.module_id} courseId={courseId} module={m} />
              ))}
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function TeamModuleSection({ courseId, module: m }: { courseId: string; module: ClassroomTeamReportModule }) {
  const [synthesis, setSynthesis] = useState(m.section.synthesis ?? "")
  const [recs, setRecs] = useState<ClassroomRecommendation[]>(
    m.section.recommendations.length ? m.section.recommendations : [{}]
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(m.section.updated_at)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const cleaned = recs.filter((r) => r.observation || r.concept || r.action || r.feasibility)
      const out = await saveTeamSection(courseId, m.module_id, { synthesis, recommendations: cleaned })
      setSavedAt(out.updated_at)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const status = !m.has_measure ? "Locked" : synthesis || recs.some((r) => r.concept || r.action) ? "Written" : "In progress"

  return (
    <div className="mx-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--mx-line)", background: "var(--mx-paper-2)" }}>
        <span className="mx-mono" style={{ fontSize: 10, color: "var(--mx-ink-3)", border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-pill)", padding: "2px 9px" }}>WK {m.week_no ?? "—"}</span>
        <span className="mx-display" style={{ fontSize: 20 }}>{m.topic}</span>
        <span className="mx-pill" style={{ marginLeft: "auto", background: status === "Written" ? "#E7EFE2" : "var(--mx-paper-2)", borderColor: status === "Written" ? "#cfe0c5" : "var(--mx-line)", color: status === "Written" ? "#4a5e3a" : "var(--mx-ink-2)" }}>{status}</span>
      </div>

      {!m.has_measure ? (
        <div style={{ padding: 20 }}>
          <span className="mx-caption" style={{ color: "var(--mx-ink-2)" }}>Opens once the Week {m.week_no ?? ""} measure runs.</span>
        </div>
      ) : (
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 20 }}>
          {/* team figures */}
          <div>
            <div style={labelStyle}>Team results</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
              <span className="mx-num" style={{ fontSize: 36, color: "var(--mx-ink)" }}>{m.team_composite ?? "—"}</span>
              <span className="mx-caption" style={{ color: "var(--mx-ink-3)", paddingBottom: 6 }}>team avg · {m.team_n}/{m.team_total} in</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {m.team_factor_means.map((f) => (
                <div key={f.name} style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--mx-ink-2)", marginBottom: 4 }}>{f.name}</div>
                    <div style={{ height: 8, borderRadius: 4, background: "var(--mx-paper-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${f.mean ?? 0}%`, background: "var(--mx-cobalt)", borderRadius: 4 }} />
                    </div>
                  </div>
                  <span className="mx-mono" style={{ fontSize: 11, color: "var(--mx-ink-3)", textAlign: "right" }}>{f.mean ?? "—"}</span>
                </div>
              ))}
            </div>
            <hr style={{ border: "none", borderTop: "1px solid var(--mx-line)", margin: "14px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.members.map((mem) => (
                <div key={mem.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: mem.is_me ? "var(--mx-clay)" : "var(--mx-accent-soft, #E8E2D0)", color: mem.is_me ? "#fff" : "var(--mx-forest)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600 }}>{initials(mem.name)}</span>
                  <span style={{ fontSize: 12, color: "var(--mx-ink-2)" }}>{mem.name ?? "Member"}{mem.is_me ? " · you" : ""}</span>
                  <span className="mx-mono" style={{ marginLeft: "auto", fontSize: 11, color: mem.completed ? "var(--mx-ink)" : "var(--mx-ink-3)" }}>{mem.completed ? mem.composite : "—"}</span>
                </div>
              ))}
            </div>
            {m.lenses.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {m.lenses.map((l) => (
                  <span key={l} style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: "var(--mx-r-pill)", background: "var(--mx-paper-2)", color: "var(--mx-ink-2)", border: "1px solid var(--mx-line)" }}>{l}</span>
                ))}
              </div>
            )}
          </div>

          {/* shared writing */}
          <div>
            <div style={labelStyle}>Your team’s reading · co-written</div>
            <textarea value={synthesis} onChange={(e) => setSynthesis(e.target.value)} rows={4} placeholder="Interpret the team’s pattern with this week’s theory…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 12 }} />

            <div style={labelStyle}>Recommendation · one per topic</div>
            {recs.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-md)", padding: 10, marginBottom: 8 }}>
                <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Observation — what in the data?" value={r.observation ?? ""} onChange={(e) => setRecs((p) => p.map((x, k) => (k === i ? { ...x, observation: e.target.value } : x)))} />
                <select style={{ ...inputStyle, marginBottom: 6 }} value={r.concept ?? ""} onChange={(e) => setRecs((p) => p.map((x, k) => (k === i ? { ...x, concept: e.target.value } : x)))}>
                  <option value="">I-O concept…</option>
                  {m.concept_options.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input style={{ ...inputStyle, marginBottom: 6 }} placeholder="Recommended action" value={r.action ?? ""} onChange={(e) => setRecs((p) => p.map((x, k) => (k === i ? { ...x, action: e.target.value } : x)))} />
                <input style={inputStyle} placeholder="Why an employer could realistically do it" value={r.feasibility ?? ""} onChange={(e) => setRecs((p) => p.map((x, k) => (k === i ? { ...x, feasibility: e.target.value } : x)))} />
                {recs.length > 1 && (
                  <button onClick={() => setRecs((p) => p.filter((_, k) => k !== i))} style={{ marginTop: 6, background: "none", border: "none", color: "var(--mx-ink-3)", fontSize: 11, cursor: "pointer" }}>Remove</button>
                )}
              </div>
            ))}
            <button onClick={() => setRecs((p) => [...p, {}])} style={{ background: "none", border: "none", color: "var(--mx-forest)", fontSize: 12, cursor: "pointer", padding: 0 }}>+ Add recommendation</button>

            {err && <div style={{ color: "var(--mx-rose)", fontSize: 12, marginTop: 8 }}>{err}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>{savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "Saves for the whole team"}</span>
              <button onClick={save} disabled={saving} style={{ border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 12.5, fontWeight: 500, padding: "8px 16px", borderRadius: "var(--mx-r-pill)", cursor: "pointer" }}>{saving ? "Saving…" : "Save section"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
