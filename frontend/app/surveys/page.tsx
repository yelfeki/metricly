"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Header from "@/components/Header"
import { getSurveys, deleteSurvey } from "@/lib/api"
import type { SurveyListItem } from "@/lib/types"

function copyRespondLink(id: string) {
  const url = `${window.location.origin}/surveys/${id}/respond`
  navigator.clipboard.writeText(url).catch(() => {
    prompt("Copy this link:", url)
  })
}

function StatusBadge({ status }: { status: string }) {
  return status === "published" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Surveys</h1>
              <p className="mt-1 text-sm text-slate-500">
                Build surveys, collect responses, and analyse results.
              </p>
            </div>
            <Link
              href="/surveys/new"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Survey
            </Link>
          </div>

          {/* States */}
          {loading && (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400">
              Loading surveys…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && surveys.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-20 text-center">
              <svg className="mb-4 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium text-slate-500">No surveys yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first survey to get started.</p>
              <Link
                href="/surveys/new"
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Create Survey
              </Link>
            </div>
          )}

          {!loading && !error && surveys.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 text-left">Survey</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">Responses</th>
                    <th className="px-5 py-3 text-left">Created</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {surveys.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{s.name}</p>
                        {s.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{s.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-5 py-4 tabular-nums text-slate-600">
                        {s.response_count}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === "published" && (
                            <button
                              onClick={() => copyRespondLink(s.id)}
                              title="Copy respond link"
                              className="rounded px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                              Copy link
                            </button>
                          )}
                          <Link
                            href={`/surveys/${s.id}/edit`}
                            className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/surveys/${s.id}/results`}
                            className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            Results
                          </Link>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            disabled={deleting === s.id}
                            className="rounded px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
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
    </div>
  )
}
