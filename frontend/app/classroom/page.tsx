"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import { useAuth } from "@/components/AuthProvider"
import {
  listMyCourses,
  joinCourse,
  createCourse,
  getCourseTemplates,
} from "@/lib/api"
import type { ClassroomCourse, ClassroomTemplate } from "@/lib/types"

const btnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: "1px solid var(--mx-forest)",
  background: "var(--mx-grad-cool)",
  color: "var(--mx-paper)",
  fontSize: 13,
  fontWeight: 500,
  padding: "9px 16px",
  borderRadius: "var(--mx-r-pill)",
  cursor: "pointer",
}
const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  color: "var(--mx-ink)",
  border: "1px solid var(--mx-line)",
}
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--mx-line)",
  borderRadius: "var(--mx-r-md)",
  background: "var(--mx-surface)",
  fontSize: 13.5,
  color: "var(--mx-ink)",
  padding: "9px 11px",
  outline: "none",
  fontFamily: "var(--mx-font-sans)",
}

function rolePill(role: string | null) {
  const map: Record<string, string> = { instructor: "Instructor", ta: "TA", student: "Student" }
  return (
    <span className="mx-pill" style={{ fontSize: 11 }}>
      {map[role ?? ""] ?? "Member"}
    </span>
  )
}

export default function ClassroomHome() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<ClassroomCourse[]>([])
  const [templates, setTemplates] = useState<ClassroomTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // join form
  const [joinCode, setJoinCode] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joining, setJoining] = useState(false)

  // create form
  const [showCreate, setShowCreate] = useState(false)
  const [cCode, setCCode] = useState("")
  const [cTitle, setCTitle] = useState("")
  const [cTerm, setCTerm] = useState("")
  const [cSection, setCSection] = useState("")
  const [cTemplate, setCTemplate] = useState("")
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [cs, ts] = await Promise.all([listMyCourses(), getCourseTemplates().catch(() => [])])
      setCourses(cs)
      setTemplates(ts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
  }, [user?.id])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    setJoining(true)
    setError(null)
    try {
      await joinCourse(joinCode.trim().toUpperCase(), joinName.trim() || undefined)
      setJoinCode("")
      setJoinName("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setJoining(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!cCode.trim() || !cTitle.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createCourse({
        code: cCode.trim(),
        title: cTitle.trim(),
        term: cTerm.trim() || null,
        section: cSection.trim() || null,
        template: cTemplate || null,
      })
      setShowCreate(false)
      setCCode("")
      setCTitle("")
      setCTerm("")
      setCSection("")
      setCTemplate("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/" backLabel="Dashboard" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto" style={{ maxWidth: 920 }}>
          <div className="mx-eyebrow">Classroom</div>
          <h1 className="mx-display" style={{ fontSize: 40, marginTop: 6 }}>
            Your <span className="mx-italic mx-text-grad-warm">classes</span>
          </h1>
          <p className="mx-body" style={{ color: "var(--mx-ink-2)", marginTop: 8, maxWidth: 560 }}>
            Join a class with a code from your instructor, or open a class you teach to run the
            weekly measures and team reports.
          </p>

          {error && (
            <div
              className="mx-card"
              style={{ marginTop: 18, borderColor: "var(--mx-rose)", color: "var(--mx-rose)", fontSize: 13 }}
            >
              {error}
            </div>
          )}

          {/* Courses list */}
          <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
            {loading ? (
              <div className="mx-caption" style={{ color: "var(--mx-ink-3)" }}>Loading your classes…</div>
            ) : courses.length === 0 ? (
              <div className="mx-card" style={{ color: "var(--mx-ink-2)" }}>
                You’re not in any classes yet. Join one with a code below.
              </div>
            ) : (
              courses.map((c) => (
                <Link key={c.id} href={`/classroom/${c.id}`} style={{ textDecoration: "none" }}>
                  <div className="mx-card mx-card-hover" style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="mx-mono" style={{ fontSize: 12, color: "var(--mx-ink-3)" }}>{c.code}</span>
                        {rolePill(c.my_role)}
                      </div>
                      <div className="mx-display" style={{ fontSize: 22, marginTop: 3, color: "var(--mx-ink)" }}>
                        {c.title}
                      </div>
                      <div className="mx-caption" style={{ color: "var(--mx-ink-3)", marginTop: 2 }}>
                        {[c.term, c.section && `Section ${c.section}`, c.project_title].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {c.my_role !== "student" && (
                      <div style={{ textAlign: "right" }}>
                        <div className="mx-eyebrow" style={{ fontSize: 9 }}>Join code</div>
                        <div className="mx-mono" style={{ fontSize: 18, color: "var(--mx-forest)", letterSpacing: "0.08em" }}>
                          {c.join_code}
                        </div>
                      </div>
                    )}
                    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="var(--mx-ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 3 10 7 5 11" /></svg>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Join + Create */}
          <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <form className="mx-card" onSubmit={handleJoin}>
              <div className="mx-eyebrow">Join a class</div>
              <div className="mx-title" style={{ fontSize: 17, marginTop: 4, marginBottom: 12 }}>
                Enter your join code
              </div>
              <input
                style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.12em" }}
                placeholder="e.g. KX7P2M"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={12}
              />
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                placeholder="Your name (optional)"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
              />
              <button type="submit" style={{ ...btnPrimary, marginTop: 12 }} disabled={joining}>
                {joining ? "Joining…" : "Join class"}
              </button>
            </form>

            <div className="mx-card">
              <div className="mx-eyebrow">Teaching a class?</div>
              <div className="mx-title" style={{ fontSize: 17, marginTop: 4, marginBottom: 12 }}>
                Create a class
              </div>
              {!showCreate ? (
                <>
                  <p className="mx-caption" style={{ color: "var(--mx-ink-2)", marginBottom: 12 }}>
                    Spin up a class and share its join code with students. You can load the PSY 272
                    weekly measures in one click.
                  </p>
                  <button style={btnGhost} onClick={() => setShowCreate(true)}>New class</button>
                </>
              ) : (
                <form onSubmit={handleCreate} style={{ display: "grid", gap: 8 }}>
                  <input style={inputStyle} placeholder="Code (e.g. PSY 272)" value={cCode} onChange={(e) => setCCode(e.target.value)} />
                  <input style={inputStyle} placeholder="Title" value={cTitle} onChange={(e) => setCTitle(e.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle} placeholder="Term (Fall 2026)" value={cTerm} onChange={(e) => setCTerm(e.target.value)} />
                    <input style={inputStyle} placeholder="Section" value={cSection} onChange={(e) => setCSection(e.target.value)} />
                  </div>
                  <select style={inputStyle} value={cTemplate} onChange={(e) => setCTemplate(e.target.value)}>
                    <option value="">No starter modules</option>
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>{t.name}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button type="submit" style={btnPrimary} disabled={creating}>
                      {creating ? "Creating…" : "Create class"}
                    </button>
                    <button type="button" style={btnGhost} onClick={() => setShowCreate(false)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
