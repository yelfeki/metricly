"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import {
  getCourse,
  getCourseRoster,
  listCourseTeams,
  listCourseModules,
  listInstruments,
  createTeam,
  assignTeam,
  autoFormTeams,
  updateModule,
  deployModule,
  getProgress,
} from "@/lib/api"
import type {
  ClassroomCourse,
  ClassroomEnrollment,
  ClassroomTeam,
  ClassroomModule,
  ClassroomInstrumentBrief,
  ClassroomProgress,
} from "@/lib/types"

const TABS = ["Overview", "Roster & teams", "Modules", "Progress"] as const
type Tab = (typeof TABS)[number]

const input: React.CSSProperties = {
  border: "1px solid var(--mx-line)",
  borderRadius: "var(--mx-r-md)",
  background: "var(--mx-surface)",
  fontSize: 13,
  color: "var(--mx-ink)",
  padding: "8px 10px",
  outline: "none",
  fontFamily: "var(--mx-font-sans)",
}
const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--mx-forest)",
  background: "var(--mx-grad-cool)",
  color: "var(--mx-paper)",
  fontSize: 12.5,
  fontWeight: 500,
  padding: "8px 14px",
  borderRadius: "var(--mx-r-pill)",
  cursor: "pointer",
}
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: "var(--mx-ink)", border: "1px solid var(--mx-line)" }

export default function ManagePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const [tab, setTab] = useState<Tab>("Overview")
  const [course, setCourse] = useState<ClassroomCourse | null>(null)
  const [roster, setRoster] = useState<ClassroomEnrollment[]>([])
  const [teams, setTeams] = useState<ClassroomTeam[]>([])
  const [modules, setModules] = useState<ClassroomModule[]>([])
  const [instruments, setInstruments] = useState<ClassroomInstrumentBrief[]>([])
  const [progress, setProgress] = useState<ClassroomProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTeam, setNewTeam] = useState("")
  const [teamSize, setTeamSize] = useState(5)
  const [busy, setBusy] = useState(false)

  async function reloadRosterTeams() {
    const [r, t] = await Promise.all([getCourseRoster(courseId), listCourseTeams(courseId)])
    setRoster(r)
    setTeams(t)
  }
  async function reloadModules() {
    setModules(await listCourseModules(courseId))
  }

  useEffect(() => {
    if (!courseId) return
    ;(async () => {
      setLoading(true)
      try {
        const [c, r, t, m, ins] = await Promise.all([
          getCourse(courseId),
          getCourseRoster(courseId).catch(() => []),
          listCourseTeams(courseId).catch(() => []),
          listCourseModules(courseId),
          listInstruments().catch(() => []),
        ])
        setCourse(c)
        setRoster(r)
        setTeams(t)
        setModules(m)
        setInstruments(ins)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId])

  useEffect(() => {
    if (tab === "Progress" && courseId && !progress) {
      getProgress(courseId).then(setProgress).catch((e) => setError(String(e)))
    }
  }, [tab, courseId, progress])

  async function wrap(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const students = roster.filter((e) => e.role === "student")
  const isManager = course && course.my_role !== "student"

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/classroom/${courseId}`} backLabel="Class" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 960 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading…</div>
          ) : !course ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error ?? "Not found"}</div>
          ) : !isManager ? (
            <div className="mx-card">This console is for instructors and TAs.</div>
          ) : (
            <>
              <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>{[course.code, course.term].filter(Boolean).join("  ·  ")}</div>
              <h1 className="mx-display" style={{ fontSize: 32, marginTop: 4 }}>{course.title}</h1>

              {/* tabs */}
              <div style={{ display: "flex", gap: 4, marginTop: 16, borderBottom: "1px solid var(--mx-line)" }}>
                {TABS.map((t) => (
                  <button key={t} onClick={() => setTab(t)} style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 14px", fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? "var(--mx-forest)" : "var(--mx-ink-3)", borderBottom: `2px solid ${tab === t ? "var(--mx-clay)" : "transparent"}`, marginBottom: -1 }}>{t}</button>
                ))}
              </div>

              {error && <div className="mx-card" style={{ marginTop: 14, borderColor: "var(--mx-rose)", color: "var(--mx-rose)", fontSize: 13 }}>{error}</div>}

              <div style={{ marginTop: 18 }}>
                {tab === "Overview" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div className="mx-card" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                      <div>
                        <div className="mx-eyebrow">Join code</div>
                        <div className="mx-num" style={{ fontSize: 40, color: "var(--mx-forest)", letterSpacing: "0.1em" }}>{course.join_code}</div>
                        <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Students enter this at /classroom to join.</div>
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 22 }}>
                        <Stat n={students.length} label="students" />
                        <Stat n={teams.length} label="teams" />
                        <Stat n={modules.length} label="modules" />
                      </div>
                    </div>
                    <div className="mx-card">
                      <div className="mx-eyebrow" style={{ marginBottom: 8 }}>Quick start</div>
                      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--mx-ink-2)", lineHeight: 1.7 }}>
                        <li>Share the join code with your class.</li>
                        <li>Form teams in <b>Roster &amp; teams</b>.</li>
                        <li>Check deploy status in <b>Modules</b>.</li>
                        <li>Track completions in <b>Progress</b>.</li>
                      </ol>
                    </div>
                    <div className="mx-card">
                      <div className="mx-eyebrow" style={{ marginBottom: 8 }}>View as a student</div>
                      <p className="mx-caption" style={{ color: "var(--mx-ink-2)", marginBottom: 12 }}>Open the student experience for this class.</p>
                      <Link href={`/classroom/${courseId}`} style={{ textDecoration: "none" }}><span style={btnGhost}>Open student view</span></Link>
                    </div>
                  </div>
                )}

                {tab === "Roster & teams" && (
                  <>
                    <div className="mx-card" style={{ marginBottom: 16, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div>
                        <div className="mx-eyebrow" style={{ marginBottom: 6 }}>Create a team</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input style={input} placeholder="Team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
                          <button style={btn} disabled={busy || !newTeam.trim()} onClick={() => wrap(async () => { await createTeam(courseId, newTeam.trim()); setNewTeam(""); await reloadRosterTeams() })}>Add</button>
                        </div>
                      </div>
                      <div style={{ marginLeft: "auto" }}>
                        <div className="mx-eyebrow" style={{ marginBottom: 6 }}>Auto-form teams</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>size</span>
                          <input style={{ ...input, width: 56 }} type="number" min={2} max={20} value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} />
                          <button style={btnGhost} disabled={busy} onClick={() => wrap(async () => { await autoFormTeams(courseId, teamSize); await reloadRosterTeams() })}>Distribute unassigned</button>
                        </div>
                      </div>
                    </div>

                    <div className="mx-card">
                      {students.length === 0 ? (
                        <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>No students have joined yet.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ textAlign: "left" }}>
                              <th style={th}>Student</th><th style={th}>Email</th><th style={th}>Team</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map((s) => (
                              <tr key={s.id} style={{ borderTop: "1px solid var(--mx-line)" }}>
                                <td style={td}>{s.name ?? "—"}</td>
                                <td style={{ ...td, color: "var(--mx-ink-3)", fontSize: 12 }}>{s.email ?? "—"}</td>
                                <td style={td}>
                                  <select
                                    style={{ ...input, padding: "6px 8px" }}
                                    value={s.team_id ?? ""}
                                    onChange={(e) => wrap(async () => {
                                      await assignTeam(courseId, s.id, e.target.value || null)
                                      await reloadRosterTeams()
                                    })}
                                  >
                                    <option value="">— no team —</option>
                                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}

                {tab === "Modules" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {modules.map((m) => (
                      <div key={m.id} className="mx-card" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                        <span className="mx-mono" style={{ fontSize: 10, color: "var(--mx-ink-3)", border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-pill)", padding: "2px 9px" }}>WK {m.week_no ?? "—"}</span>
                        <span style={{ fontWeight: 500, fontSize: 14 }}>{m.topic}</span>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                          {m.survey_id ? (
                            <span className="mx-pill" style={{ background: "#E7EFE2", borderColor: "#cfe0c5", color: "#4a5e3a" }}>Deployed</span>
                          ) : m.instrument_id ? (
                            <>
                              <span className="mx-pill">Instrument attached</span>
                              <button style={btn} disabled={busy} onClick={() => wrap(async () => { await deployModule(courseId, m.id); await reloadModules() })}>Deploy</button>
                            </>
                          ) : (
                            <>
                              <select id={`ins-${m.id}`} style={{ ...input, padding: "6px 8px", maxWidth: 220 }} defaultValue="">
                                <option value="">Attach an instrument…</option>
                                {instruments.map((i) => <option key={i.id} value={i.id}>{i.short_name} — {i.name}</option>)}
                              </select>
                              <button style={btnGhost} disabled={busy} onClick={() => wrap(async () => {
                                const sel = document.getElementById(`ins-${m.id}`) as HTMLSelectElement | null
                                if (!sel?.value) return
                                await updateModule(courseId, m.id, { instrument_id: sel.value })
                                await reloadModules()
                              })}>Attach</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "Progress" && (
                  <div className="mx-card" style={{ overflowX: "auto" }}>
                    {!progress ? (
                      <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading…</div>
                    ) : progress.students.length === 0 ? (
                      <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>No students yet.</div>
                    ) : (
                      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                        <thead>
                          <tr>
                            <th style={th}>Student</th>
                            <th style={th}>Team</th>
                            {progress.modules.map((m) => <th key={m.id} style={{ ...th, textAlign: "center" }}>WK {m.week_no ?? "—"}</th>)}
                            <th style={{ ...th, textAlign: "center" }}>Done</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progress.students.map((s) => (
                            <tr key={s.enrollment_id} style={{ borderTop: "1px solid var(--mx-line)" }}>
                              <td style={td}>{s.name ?? "—"}</td>
                              <td style={{ ...td, color: "var(--mx-ink-3)", fontSize: 12 }}>{s.team_name ?? "—"}</td>
                              {progress.modules.map((m) => (
                                <td key={m.id} style={{ ...td, textAlign: "center" }}>
                                  {s.completed_module_ids.includes(m.id) ? (
                                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "var(--mx-forest)" }} />
                                  ) : (
                                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", border: "1px solid var(--mx-line-2)" }} />
                                  )}
                                </td>
                              ))}
                              <td style={{ ...td, textAlign: "center" }} className="mx-mono">{s.completed_count}/{progress.modules.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mx-ink-3)", padding: "6px 10px" }
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, color: "var(--mx-ink)" }

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="mx-num" style={{ fontSize: 28, color: "var(--mx-ink)" }}>{n}</div>
      <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>{label}</div>
    </div>
  )
}
