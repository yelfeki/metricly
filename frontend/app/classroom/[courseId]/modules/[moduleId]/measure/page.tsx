"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Header from "@/components/Header"
import { getModuleMeasure, submitModuleMeasure } from "@/lib/api"
import type { ClassroomModuleMeasure } from "@/lib/types"

export default function MeasurePage() {
  const router = useRouter()
  const { courseId, moduleId } = useParams<{ courseId: string; moduleId: string }>()
  const [measure, setMeasure] = useState<ClassroomModuleMeasure | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!courseId || !moduleId) return
    ;(async () => {
      setLoading(true)
      try {
        setMeasure(await getModuleMeasure(courseId, moduleId))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId, moduleId])

  const total = measure?.questions.length ?? 0
  const answered = Object.keys(answers).length
  const allDone = total > 0 && answered === total

  const scalePoints = useMemo(() => {
    if (!measure) return []
    const out: number[] = []
    for (let v = measure.scale_min; v <= measure.scale_max; v++) out.push(v)
    return out
  }, [measure])

  async function handleSubmit() {
    if (!measure || !allDone) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = measure.questions.map((q) => ({
        question_id: q.id,
        value: String(answers[q.id]),
      }))
      await submitModuleMeasure(courseId, moduleId, payload)
      router.push(`/classroom/${courseId}/modules/${moduleId}/report`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref={`/classroom/${courseId}/modules/${moduleId}`} backLabel="Concept" />
      <main className="flex-1 px-6 py-9">
        <div className="mx-auto" style={{ maxWidth: 760 }}>
          {loading ? (
            <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading the measure…</div>
          ) : error && !measure ? (
            <div className="mx-card" style={{ borderColor: "var(--mx-rose)", color: "var(--mx-rose)" }}>{error}</div>
          ) : measure ? (
            <>
              {/* header + progress */}
              <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                {[measure.week_no && `Week ${measure.week_no}`, measure.reading_ref].filter(Boolean).join("  ·  ")}
              </div>
              <h1 className="mx-display" style={{ fontSize: 30, marginTop: 5 }}>{measure.topic}</h1>
              <p className="mx-body" style={{ color: "var(--mx-ink-2)", marginTop: 6 }}>
                Answer for your own current or past job. There are no right answers — go with your honest read.
              </p>

              {measure.already_completed && (
                <div className="mx-card" style={{ marginTop: 14, padding: "12px 16px", background: "var(--mx-paper-2)" }}>
                  <span className="mx-caption" style={{ color: "var(--mx-ink-2)" }}>
                    You’ve already completed this measure. Submitting again replaces your previous response.
                  </span>
                </div>
              )}

              {/* sticky progress */}
              <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--mx-paper)", paddingTop: 12, paddingBottom: 8, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="mx-eyebrow">Progress</span>
                  <span className="mx-mono" style={{ fontSize: 11, color: "var(--mx-ink-3)" }}>{answered} / {total}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--mx-paper-2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${total ? (answered / total) * 100 : 0}%`, background: "var(--mx-forest)", transition: "width .22s var(--mx-ease)" }} />
                </div>
              </div>

              {/* items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                {measure.questions.map((q) => (
                  <div key={q.id} className="mx-card">
                    <div style={{ display: "flex", gap: 10 }}>
                      <span className="mx-mono" style={{ fontSize: 12, color: "var(--mx-ink-3)", marginTop: 2 }}>{q.position}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, color: "var(--mx-ink)", lineHeight: 1.4, marginBottom: 12 }}>{q.text}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {scalePoints.map((v) => {
                            const active = answers[q.id] === v
                            return (
                              <button
                                key={v}
                                onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                                style={{
                                  flex: 1,
                                  padding: "12px 4px",
                                  border: `1px solid ${active ? "var(--mx-forest)" : "var(--mx-line)"}`,
                                  background: active ? "var(--mx-forest)" : "var(--mx-surface)",
                                  color: active ? "var(--mx-paper)" : "var(--mx-ink)",
                                  borderRadius: "var(--mx-r-md)",
                                  cursor: "pointer",
                                  fontFamily: "var(--mx-font-display)",
                                  fontSize: 18,
                                  transition: "all .12s var(--mx-ease)",
                                }}
                              >
                                {v}
                              </button>
                            )
                          })}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                          <span className="mx-mono" style={{ fontSize: 10, color: "var(--mx-ink-3)" }}>{measure.scale_min} low</span>
                          <span className="mx-mono" style={{ fontSize: 10, color: "var(--mx-ink-3)" }}>{measure.scale_max} high</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="mx-card" style={{ marginTop: 14, borderColor: "var(--mx-rose)", color: "var(--mx-rose)", fontSize: 13 }}>{error}</div>
              )}

              {/* submit */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingBottom: 20 }}>
                <span className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>
                  {allDone ? "All items answered." : `${total - answered} item${total - answered === 1 ? "" : "s"} left`}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!allDone || submitting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    border: "1px solid var(--mx-forest)",
                    background: allDone ? "var(--mx-grad-cool)" : "var(--mx-paper-3)",
                    color: allDone ? "var(--mx-paper)" : "var(--mx-ink-3)",
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "11px 20px",
                    borderRadius: "var(--mx-r-pill)",
                    cursor: allDone && !submitting ? "pointer" : "default",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit my answers"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
