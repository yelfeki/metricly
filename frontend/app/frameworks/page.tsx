"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import { listFrameworks, deleteFramework } from "@/lib/api"
import type { FrameworkListItem } from "@/lib/types"

export default function FrameworksPage() {
  const [frameworks, setFrameworks] = useState<FrameworkListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      setFrameworks(await listFrameworks())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await deleteFramework(id)
      setFrameworks(prev => prev.filter(f => f.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">

          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-1">Workforce Development</p>
              <h1 className="page-title">Competency Frameworks</h1>
              <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
                Define skills, set proficiency targets, and track team readiness.
              </p>
            </div>
            <Link href="/frameworks/new" className="btn-primary">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Framework
            </Link>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "rgba(30,27,75,0.4)" }}>
              Loading…
            </div>
          )}
          {error && <div className="alert-error mb-4">{error}</div>}

          {!loading && frameworks.length === 0 && (
            <div
              className="rounded-[14px] px-8 py-16 text-center"
              style={{ border: "1.5px dashed rgba(91,33,182,0.2)", background: "rgba(255,255,255,0.25)" }}
            >
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: "rgba(91,33,182,0.08)" }}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "#5b21b6" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="section-heading mb-1">No frameworks yet</p>
              <p className="mb-5 text-sm" style={{ color: "rgba(30,27,75,0.45)" }}>
                Build your first competency framework to start tracking skill gaps.
              </p>
              <Link href="/frameworks/new" className="btn-primary">
                Build your first framework
              </Link>
            </div>
          )}

          {!loading && frameworks.length > 0 && (
            <div className="card overflow-hidden">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Framework</th>
                    <th>Role</th>
                    <th>Competencies</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {frameworks.map(fw => (
                    <tr key={fw.id}>
                      <td>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "#1e1b4b" }}>{fw.title}</p>
                          {fw.description && (
                            <p className="mt-0.5 text-xs truncate max-w-[260px]" style={{ color: "rgba(30,27,75,0.45)" }}>
                              {fw.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td>
                        {fw.role_title
                          ? <span className="text-xs" style={{ color: "rgba(30,27,75,0.6)" }}>{fw.role_title}</span>
                          : <span style={{ color: "rgba(30,27,75,0.25)" }}>—</span>
                        }
                      </td>
                      <td>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ background: "rgba(91,33,182,0.08)", color: "#5b21b6" }}
                        >
                          {fw.competency_count}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs" style={{ color: "rgba(30,27,75,0.45)" }}>
                          {new Date(fw.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/frameworks/${fw.id}/gap-report`}
                            className="btn-ghost text-xs px-3 py-1.5"
                          >
                            Gap Report
                          </Link>
                          <Link
                            href={`/frameworks/${fw.id}/team-report`}
                            className="btn-ghost text-xs px-3 py-1.5"
                          >
                            Team
                          </Link>
                          <button
                            onClick={() => handleDelete(fw.id, fw.title)}
                            disabled={deleting === fw.id}
                            className="btn-danger text-xs px-3 py-1.5"
                          >
                            {deleting === fw.id ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
