"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { getTeamReport } from "@/lib/api"
import type { ClassroomTeamReport, ClassroomRecommendation } from "@/lib/types"

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .doc-page { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; }
  .mod-block { break-inside: avoid; }
}
`

export default function TeamReportPrintPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const [report, setReport] = useState<ClassroomTeamReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    ;(async () => {
      try {
        const r = await getTeamReport(courseId)
        setReport(r)
        setTimeout(() => window.print(), 700)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [courseId])

  return (
    <div style={{ background: "var(--mx-paper-2)", minHeight: "100vh", padding: "24px 16px" }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ maxWidth: 760, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href={`/classroom/${courseId}/team-report`} style={{ color: "var(--mx-ink-2)", textDecoration: "none", fontSize: 13 }}>← Back to the team report</Link>
        <button onClick={() => window.print()} style={{ border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: "var(--mx-r-pill)", cursor: "pointer" }}>
          Print / Save as PDF
        </button>
      </div>

      {error ? (
        <div style={{ maxWidth: 760, margin: "0 auto", color: "var(--mx-rose)" }}>{error}</div>
      ) : !report ? (
        <div style={{ maxWidth: 760, margin: "0 auto", color: "var(--mx-ink-3)", fontSize: 13 }}>Preparing your copy…</div>
      ) : (
        <div className="doc-page" style={{ maxWidth: 760, margin: "0 auto", background: "#fff", border: "1px solid var(--mx-line)", borderRadius: 8, padding: "40px 44px", boxShadow: "var(--mx-shadow-card)" }}>
          {/* title */}
          <div style={{ borderBottom: "2px solid var(--mx-forest)", paddingBottom: 14, marginBottom: 22 }}>
            <div style={{ fontFamily: "var(--mx-font-mono)", fontSize: 11, color: "var(--mx-ink-3)", letterSpacing: "0.08em" }}>
              {[report.course_code, report.term].filter(Boolean).join(" · ")}
            </div>
            <div className="mx-display" style={{ fontSize: 30, marginTop: 4 }}>{report.project_title ?? report.course_title}</div>
            <div style={{ fontSize: 13, color: "var(--mx-ink-2)", marginTop: 6 }}>
              {report.team_name} · integrated team report{report.my_name ? ` · prepared by ${report.my_name}` : ""}
            </div>
          </div>

          {report.modules.filter((m) => m.has_measure).map((m) => (
            <div key={m.module_id} className="mod-block" style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--mx-font-mono)", fontSize: 10, color: "var(--mx-ink-3)" }}>WK {m.week_no ?? "—"}</span>
                <span className="mx-display" style={{ fontSize: 20 }}>{m.topic}</span>
              </div>

              {/* results side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 12 }}>
                <div style={{ border: "1px solid var(--mx-line)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mx-clay)", marginBottom: 4 }}>Your result</div>
                  <div style={{ fontFamily: "var(--mx-font-display)", fontSize: 26 }}>{m.my_composite ?? "—"}<span style={{ fontSize: 13, color: "var(--mx-ink-3)" }}> / 100</span></div>
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--mx-ink-2)", lineHeight: 1.5 }}>
                    {m.my_factors.map((f) => `${f.name} ${f.normalized ?? "—"}`).join(" · ")}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--mx-line)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mx-ink-3)", marginBottom: 4 }}>Team result · {m.team_n}/{m.team_total}</div>
                  <div style={{ fontFamily: "var(--mx-font-display)", fontSize: 26 }}>{m.team_composite ?? "—"}<span style={{ fontSize: 13, color: "var(--mx-ink-3)" }}> / 100</span></div>
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--mx-ink-2)", lineHeight: 1.5 }}>
                    {m.team_factor_means.map((f) => `${f.name} ${f.mean ?? "—"}`).join(" · ")}
                  </div>
                </div>
              </div>

              {/* synthesis */}
              {m.section.synthesis && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mx-ink-3)", marginBottom: 4 }}>Our reading</div>
                  <p style={{ fontSize: 13, color: "var(--mx-ink)", lineHeight: 1.6, margin: 0 }}>{m.section.synthesis}</p>
                </div>
              )}

              {/* recommendations */}
              {m.section.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mx-ink-3)", marginBottom: 6 }}>Recommendation{m.section.recommendations.length > 1 ? "s" : ""}</div>
                  {m.section.recommendations.map((r: ClassroomRecommendation, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--mx-ink-2)", lineHeight: 1.55, marginBottom: 6, paddingLeft: 12, borderLeft: "2px solid var(--mx-line-2)" }}>
                      {r.observation && <><b style={{ color: "var(--mx-ink)" }}>Observation:</b> {r.observation} </>}
                      {r.concept && <>· <b style={{ color: "var(--mx-ink)" }}>Concept:</b> {r.concept} </>}
                      {r.action && <>· <b style={{ color: "var(--mx-ink)" }}>Action:</b> {r.action} </>}
                      {r.feasibility && <>· <b style={{ color: "var(--mx-ink)" }}>Why realistic:</b> {r.feasibility}</>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid var(--mx-line)", fontSize: 10, color: "var(--mx-ink-3)", fontFamily: "var(--mx-font-mono)" }}>
            Generated with Metricly · {report.course_code}
          </div>
        </div>
      )}
    </div>
  )
}
