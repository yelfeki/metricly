"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Header from "@/components/Header"
import { getCourse, listCourseModules, completeCourseModule } from "@/lib/api"
import type {
  ClassroomCourse,
  ClassroomModule,
  ModuleConcept,
  ModulePrompts,
} from "@/lib/types"

function parse<T>(json: string | null): T {
  if (!json) return {} as T
  try {
    return JSON.parse(json) as T
  } catch {
    return {} as T
  }
}

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11.5,
  fontWeight: 500,
  padding: "4px 11px",
  borderRadius: "var(--mx-r-pill)",
  background: "var(--mx-paper-2)",
  color: "var(--mx-ink-2)",
  border: "1px solid var(--mx-line)",
}

export default function ModuleConceptPage() {
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const [course, setCourse] = useState<ClassroomCourse | null>(null)
  const [module, setModule] = useState<ClassroomModule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!courseId || !moduleId) return
    ;(async () => {
      setLoading(true)
      try {
        const [c, mods] = await Promise.all([getCourse(courseId), listCourseModules(courseId)])
        setCourse(c)
        const m = mods.find((x) => x.id === moduleId) ?? null
        setModule(m)
        setDone(!!m?.completed)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId, moduleId])

  async function markComplete() {
    if (!courseId || !moduleId) return
    setMarking(true)
    try {
      await completeCourseModule(courseId, moduleId)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarking(false)
    }
  }

  const concept = parse<ModuleConcept>(module?.concept_json ?? null)
  const prompts = parse<ModulePrompts>(module?.prompts_json ?? null)

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/classroom/${courseId}`} backLabel="This week" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 980 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading…</div>
          ) : error ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error}</div>
          ) : module ? (
            <>
              <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                {[course?.code, module.week_no && `Week ${module.week_no}`, "before you begin"].filter(Boolean).join("  ·  ")}
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16, alignItems: "start" }}>
                {/* CONCEPT PANEL */}
                <div className="mx-card" style={{ padding: 26 }}>
                  <div className="mx-eyebrow">The concept · why we measure this</div>
                  <div className="mx-display" style={{ fontSize: 28, marginTop: 7, lineHeight: 1.12 }}>{module.topic}</div>

                  {concept.definition && (
                    <p style={{ marginTop: 14, fontSize: 14, color: "var(--mx-ink-2)", lineHeight: 1.6 }}>{concept.definition}</p>
                  )}

                  {(concept.why_it_matters || (concept.lenses && concept.lenses.length > 0)) && (
                    <div style={{ marginTop: 18, padding: "15px 16px", background: "var(--mx-paper-2)", border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-md)" }}>
                      <div className="mx-eyebrow" style={{ marginBottom: 6, color: "var(--mx-clay)" }}>Connect it to the course</div>
                      {concept.why_it_matters && (
                        <p style={{ fontSize: 13, color: "var(--mx-ink-2)", lineHeight: 1.55, margin: 0 }}>{concept.why_it_matters}</p>
                      )}
                      {concept.lenses && concept.lenses.length > 0 && (
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
                          {concept.lenses.map((l) => <span key={l} style={chip}>{l}</span>)}
                        </div>
                      )}
                    </div>
                  )}

                  {module.reading_ref && (
                    <div style={{ marginTop: 16, padding: "12px 14px", border: "1px solid var(--mx-line)", borderRadius: "var(--mx-r-md)", display: "inline-block" }}>
                      <div className="mx-eyebrow" style={{ marginBottom: 4 }}>Reading</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--mx-ink)" }}>{module.reading_ref}</div>
                    </div>
                  )}

                  {concept.key_terms && concept.key_terms.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div className="mx-eyebrow" style={{ marginBottom: 8 }}>Key terms you’ll use later</div>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {concept.key_terms.map((t) => <span key={t} style={chip}>{t}</span>)}
                      </div>
                    </div>
                  )}
                </div>

                {/* MEASURE / ACTION */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="mx-card">
                    <div className="mx-eyebrow">The measure</div>
                    <div className="mx-display" style={{ fontSize: 22, marginTop: 5 }}>{module.topic}</div>
                    {prompts.guiding_questions && prompts.guiding_questions.length > 0 && (
                      <>
                        <div className="mx-eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>You’ll later interpret with</div>
                        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                          {prompts.guiding_questions.map((q, i) => (
                            <li key={i} style={{ fontSize: 12.5, color: "var(--mx-ink-2)", lineHeight: 1.5 }}>{q}</li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>

                  {done ? (
                    <div className="mx-card" style={{ background: "var(--mx-paper-2)", textAlign: "center" }}>
                      <div className="mx-eyebrow" style={{ color: "var(--mx-sage)" }}>Completed</div>
                      <p className="mx-caption" style={{ color: "var(--mx-ink-2)", margin: "8px 0 12px" }}>
                        Logged for the group project. Your report opens here once it’s wired up.
                      </p>
                      <Link href={`/classroom/${courseId}`} style={{ textDecoration: "none" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--mx-line)", color: "var(--mx-ink)", fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: "var(--mx-r-pill)" }}>Back to this week</span>
                      </Link>
                    </div>
                  ) : module.survey_id ? (
                    <Link href={`/surveys/${module.survey_id}/respond`} style={{ textDecoration: "none" }}>
                      <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 13, fontWeight: 500, padding: "12px 16px", borderRadius: "var(--mx-r-pill)" }}>
                        Begin the measure
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 3 10 7 5 11" /></svg>
                      </span>
                    </Link>
                  ) : (
                    <div className="mx-card" style={{ background: "var(--mx-paper-2)" }}>
                      <p className="mx-caption" style={{ color: "var(--mx-ink-2)", marginTop: 0, marginBottom: 12 }}>
                        The live measure will run here once your instructor attaches an instrument. For now you can log
                        this week as complete.
                      </p>
                      <button
                        onClick={markComplete}
                        disabled={marking}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--mx-forest)", background: "var(--mx-grad-cool)", color: "var(--mx-paper)", fontSize: 13, fontWeight: 500, padding: "10px 16px", borderRadius: "var(--mx-r-pill)", cursor: "pointer" }}
                      >
                        {marking ? "Saving…" : "Mark this week complete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="mx-card" style={{ color: "var(--mx-ink-2)" }}>Module not found.</div>
          )}
        </div>
      </main>
    </div>
  )
}
