"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import ImportModal from "@/components/ImportModal"
import { getSurveys, deleteSurvey } from "@/lib/api"
import type { SurveyListItem } from "@/lib/types"

function copyRespondLink(id: string) {
  const url = `${window.location.origin}/surveys/${id}/respond`
  navigator.clipboard.writeText(url).catch(() => {
    prompt("Copy this link:", url)
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="badge-live">
        <span className="h-1.5 w-1.5 rounded-full bg-[#0F2841]" />
        Live
      </span>
    )
  }
  if (status === "closed") {
    return (
      <span className="badge-closed">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Closed
      </span>
    )
  }
  return (
    <span className="badge-draft">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(10,30,51,0.3)" }} />
      Draft
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setSurveys(await getSurveys())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await deleteSurvey(id)
      setSurveys((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/" backLabel="Dashboard" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="page-title">Surveys</h1>
              <p className="mt-1 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
                Build surveys, collect responses, and analyse results.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="btn-ghost flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import
              </button>
              <Link href="/surveys/new" className="btn-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Survey
              </Link>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>
              Loading surveys…
            </div>
          )}

          {error && <div className="alert-error">{error}</div>}

          {!loading && !error && surveys.length === 0 && (
            <div
              className="flex flex-col items-center justify-center rounded-[14px] py-20 text-center"
              style={{
                background: "rgba(255,255,255,0.3)",
                border: "1.5px dashed rgba(15,40,65,0.2)",
                backdropFilter: "blur(8px)",
              }}
            >
              <svg
                className="mb-4 h-10 w-10"
                style={{ color: "rgba(15,40,65,0.25)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-semibold" style={{ color: "rgba(10,30,51,0.55)" }}>No surveys yet</p>
              <p className="mt-1 text-xs" style={{ color: "rgba(10,30,51,0.35)" }}>Create your first survey to get started.</p>
              <Link href="/surveys/new" className="btn-primary mt-5">
                Create Survey
              </Link>
            </div>
          )}

          {!loading && !error && surveys.length > 0 && (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Survey</th>
                    <th>Status</th>
                    <th>Responses</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <p className="font-semibold text-sm" style={{ color: "#0A1E33" }}>{s.name}</p>
                        {s.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: "rgba(10,30,51,0.45)" }}>
                            {s.description}
                          </p>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="tabular-nums text-sm font-semibold" style={{ color: "rgba(10,30,51,0.7)" }}>
                        {s.response_count}
                      </td>
                      <td className="text-sm" style={{ color: "rgba(10,30,51,0.4)" }}>
                        {formatDate(s.created_at)}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {(s.status === "published" || s.status === "closed") && (
                            <button
                              onClick={() => copyRespondLink(s.id)}
                              title="Copy respond link"
                              className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                              style={{ color: "rgba(10,30,51,0.5)" }}
                            >
                              Copy link
                            </button>
                          )}
                          <Link
                            href={`/surveys/${s.id}/edit`}
                            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                            style={{ color: "rgba(10,30,51,0.6)" }}
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/surveys/${s.id}/results`}
                            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                            style={{ color: "#0F2841" }}
                          >
                            Results
                          </Link>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            disabled={deleting === s.id}
                            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-50"
                            style={{ color: "#DD6334" }}
                          >
                            {deleting === s.id ? "…" : "Delete"}
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

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
