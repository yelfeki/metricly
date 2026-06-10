"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getCourse,
  getMyEnrollment,
  listCourseModules,
  getTeamModuleStatus,
} from "@/lib/api"
import type {
  ClassroomCourse,
  ClassroomModule,
  ClassroomMyEnrollment,
  ClassroomTeamModuleStatus,
  ModuleConcept,
} from "@/lib/types"

function parseConcept(json: string | null): ModuleConcept {
  if (!json) return {}
  try {
    return JSON.parse(json) as ModuleConcept
  } catch {
    return {}
  }
}

function initials(name: string | null): string {
  if (!name) return "?"
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

export default function CourseDashboard() {
  const { courseId } = useParams<{ courseId: string }>()
  const [course, setCourse] = useState<ClassroomCourse | null>(null)
  const [me, setMe] = useState<ClassroomMyEnrollment | null>(null)
  const [modules, setModules] = useState<ClassroomModule[]>([])
  const [teamStatus, setTeamStatus] = useState<ClassroomTeamModuleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const current = useMemo(() => {
    if (modules.length === 0) return null
    const next = modules.find((m) => m.completed === false)
    return next ?? modules[modules.length - 1]
  }, [modules])

  const doneCount = modules.filter((m) => m.completed).length

  useEffect(() => {
    if (!courseId) return
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [c, enr, mods] = await Promise.all([
          getCourse(courseId),
          getMyEnrollment(courseId),
          listCourseModules(courseId),
        ])
        setCourse(c)
        setMe(enr)
        setModules(mods)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId])

  useEffect(() => {
    if (!courseId || !current) return
    getTeamModuleStatus(courseId, current.id).then(setTeamStatus).catch(() => setTeamStatus(null))
  }, [courseId, current?.id])

  const isStudent = me?.enrollment.role === "student"

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/classroom" backLabel="Classes" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 980 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading…</div>
          ) : error ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error}</div>
          ) : course ? (
            <>
              {/* breadcrumb */}
              <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                {[course.code, course.term, course.project_title].filter(Boolean).join("  ·  ")}
              </div>

              {/* instructor banner */}
              {!isStudent && (
                <div
                  className="mx-card"
                  style={{ marginTop: 12, padding: "12px 16px", background: "var(--mx-paper-2)", display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span className="mx-pill">Instructor view</span>
                  <span className="mx-caption" style={{ color: "var(--mx-ink-2)" }}>
                    You’re seeing the student experience. Share join code{" "}
                    <b className="mx-mono" style={{ color: "var(--mx-forest)" }}>{course.join_code}</b> with your class.
                  </span>
                </div>
              )}

              {/* timeline */}
              <div className="mx-card" style={{ marginTop: 16, padding: "18px 22px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div className="mx-eyebrow">The project</div>
                  <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                    <span className="mx-mono" style={{ color: "var(--mx-ink-2)" }}>{doneCount}</span> of {modules.length} measures done
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {modules.map((m) => {
                    const state = m.completed ? "done" : m.id === current?.id ? "cur" : "up"
                    const color = state === "done" ? "var(--mx-forest)" : state === "cur" ? "var(--mx-clay)" : "var(--mx-line-2)"
                    return (
                      <div key={m.id} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ width: 14, height: 14, borderRadius: "50%", background: state === "done" ? "var(--mx-forest)" : "var(--mx-paper)", border: `2px solid ${color}`, boxShadow: state === "cur" ? "0 0 0 4px rgba(221,99,52,.15)" : "none" }} />
                        </div>
                        <div className="mx-mono" style={{ fontSize: 9.5, color: "var(--mx-ink-3)", marginTop: 5 }}>WK {m.week_no ?? "—"}</div>
                        <div style={{ fontSize: 11.5, fontWeight: state === "up" ? 400 : 500, color: state === "up" ? "var(--mx-ink-3)" : "var(--mx-ink)", marginTop: 1, lineHeight: 1.2 }}>{m.topic}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* hero + team */}
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
                {current ? (
                  <HeroCard courseId={course.id} module={current} />
                ) : (
                  <div className="mx-card" style={{ color: "var(--mx-ink-2)" }}>No weekly measures yet.</div>
                )}

                <div className="mx-card">
                  <div className="mx-eyebrow" style={{ marginBottom: 10 }}>
                    {teamStatus?.team_name ? `${teamStatus.team_name} · this measure` : "Your team"}
                  </div>
                  {teamStatus && teamStatus.team_id ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                        <span className="mx-num" style={{ fontSize: 30, color: "var(--mx-ink)" }}>{teamStatus.submitted}</span>
                        <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>/ {teamStatus.total} submitted</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {teamStatus.members.map((m) => (
                          <div key={m.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--mx-line)" }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--mx-accent-soft, #E8E2D0)", color: "var(--mx-forest)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>{initials(m.name)}</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                              {m.name ?? "Member"}{m.is_me && <span style={{ color: "var(--mx-ink-3)", fontWeight: 400 }}> · you</span>}
                            </span>
                            <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: m.completed ? "var(--mx-forest)" : "transparent", border: m.completed ? "none" : "1px solid var(--mx-line-2)" }} />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mx-caption" style={{ color: "var(--mx-ink-2)" }}>
                      You’re not on a team yet. Your instructor will assign you to one for the group project.
                    </p>
                  )}
                </div>
              </div>

              {/* progress note */}
              <div className="mx-card" style={{ marginTop: 16, padding: "14px 18px", background: "var(--mx-paper-2)" }}>
                <span className="mx-caption" style={{ color: "var(--mx-ink-2)" }}>
                  Reports and the combined team report open as you and your teammates complete each weekly measure.
                </span>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function HeroCard({ courseId, module: m }: { courseId: string; module: ClassroomModule }) {
  const concept = parseConcept(m.concept_json)
  const done = !!m.completed
  return (
    <div
      className="mx-card"
      style={{ color: "var(--mx-paper)", border: "1px solid var(--mx-forest)", background: "var(--mx-grad-hero)", position: "relative", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", inset: "auto -12% -36% auto", width: "60%", height: "78%", background: "radial-gradient(50% 50% at 50% 50%, rgba(226,177,70,.42) 0%, rgba(221,99,52,.14) 50%, transparent 75%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div className="mx-eyebrow" style={{ color: "var(--mx-butter)" }}>
          {done ? "Completed" : "This week"}{m.week_no ? ` · Week ${m.week_no}` : ""}
        </div>
        <div className="mx-display" style={{ fontSize: 32, marginTop: 7, color: "#FBF5E6" }}>{m.topic}</div>
        {concept.why_it_matters && (
          <div style={{ marginTop: 10, fontSize: 13.5, maxWidth: 460, color: "#F4ECD8", lineHeight: 1.55 }}>
            {concept.why_it_matters}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {m.reading_ref && <Chip>{m.reading_ref}</Chip>}
          {(concept.lenses ?? []).slice(0, 2).map((l) => <Chip key={l}>{l}</Chip>)}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <Link href={done ? `/classroom/${courseId}/modules/${m.id}/report` : `/classroom/${courseId}/modules/${m.id}`} style={{ textDecoration: "none" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--mx-paper)", color: "var(--mx-forest)", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: "var(--mx-r-pill)" }}>
              {done ? "Open your report" : "Read the concept & begin"}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 3 10 7 5 11" /></svg>
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11.5, fontWeight: 500, padding: "4px 11px", borderRadius: "var(--mx-r-pill)", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", color: "#F4ECD8" }}>
      {children}
    </span>
  )
}
