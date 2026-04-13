"use client"

import { useState, useRef } from "react"
import Header from "@/components/Header"
import InterpretationBadge from "@/components/InterpretationBadge"
import { runCronbachAlpha } from "@/lib/api"
import { parseCSV, SAMPLE_CSV } from "@/lib/parseCSV"
import { en } from "@/lib/i18n"
import type { CronbachAlphaResponse } from "@/lib/types"

type InputMode = "paste" | "upload"

export default function AlphaPage() {
  const t = en.runner.alpha

  const [mode, setMode] = useState<InputMode>("paste")
  const [csvText, setCsvText] = useState("")
  const [hasHeader, setHasHeader] = useState(false)
  const [scaleName, setScaleName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)
  const [apiError, setApiError] = useState<string | null>(null)
  const [result, setResult] = useState<CronbachAlphaResponse | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string)
      setMode("paste") // show text after read
    }
    reader.readAsText(file)
  }

  async function handleRun() {
    setParseError(null)
    setSkippedRows(0)
    setApiError(null)
    setResult(null)

    const { data, error, skippedRows: dropped } = parseCSV(csvText, hasHeader)
    setSkippedRows(dropped)
    if (error) {
      setParseError(error)
      return
    }

    setIsLoading(true)
    try {
      const res = await runCronbachAlpha(data, scaleName || undefined)
      setResult(res)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const alphaColor =
    result === null
      ? "text-slate-900"
      : result.interpretation === "excellent"
      ? "text-emerald-600"
      : result.interpretation === "good"
      ? "text-green-600"
      : result.interpretation === "acceptable"
      ? "text-amber-600"
      : "text-red-600"

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/" backLabel={en.nav.backToDashboard} />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-3xl">

          {/* Page header */}
          <div className="mb-8">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-lg font-bold text-indigo-600">
                α
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Reliability
              </span>
            </div>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
              {t.title}
            </h1>
            <p className="text-sm text-slate-500">{t.subtitle}</p>
          </div>

          {/* Input card */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-medium text-slate-700">{t.inputLabel}</span>
              {/* Mode tabs */}
              <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
                {(["paste", "upload"] as InputMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded px-3 py-1 font-medium capitalize transition-colors ${
                      mode === m
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {m === "paste" ? t.pasteTab : t.uploadTab}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Textarea or upload zone */}
              {mode === "paste" ? (
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={t.pastePlaceholder}
                  rows={8}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
                  spellCheck={false}
                />
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-slate-600">
                    Click to upload a <span className="text-indigo-600">.csv</span> file
                  </p>
                  <p className="text-xs text-slate-400">Rows = respondents · Columns = items</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Options row */}
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {t.hasHeaderLabel}
                </label>

                <div className="flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={scaleName}
                    onChange={(e) => setScaleName(e.target.value)}
                    placeholder={t.scaleNamePlaceholder}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Parse error */}
              {parseError && (
                <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                  <span className="font-semibold">Parse error:</span> {parseError}
                </p>
              )}

              {/* Listwise deletion warning */}
              {!parseError && skippedRows > 0 && (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <span>
                    <span className="font-semibold">{skippedRows} row{skippedRows !== 1 ? "s" : ""} skipped</span>
                    {" "}due to missing or non-numeric values (listwise deletion).
                  </span>
                </p>
              )}

              {/* Action row */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setCsvText(SAMPLE_CSV); setMode("paste") }}
                  className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 transition-colors"
                >
                  {t.loadSample}
                </button>
                <button
                  onClick={handleRun}
                  disabled={isLoading || !csvText.trim()}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      {t.running}
                    </>
                  ) : (
                    <>
                      {t.run}
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* API error */}
          {apiError && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              <span className="font-semibold">Error: </span>{apiError}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t.resultsHeading}
              </h2>

              {/* Summary stats row */}
              <div className="grid grid-cols-3 gap-4">
                {/* Alpha */}
                <div className="col-span-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t.summaryAlpha}
                  </span>
                  <span className={`text-4xl font-bold tabular-nums ${alphaColor}`}>
                    {result.alpha.toFixed(3)}
                  </span>
                  <div className="mt-2">
                    <InterpretationBadge value={result.interpretation} size="sm" />
                  </div>
                </div>

                {/* n_items */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t.summaryItems}
                  </span>
                  <span className="text-4xl font-bold tabular-nums text-slate-900">
                    {result.n_items}
                  </span>
                </div>

                {/* n_respondents */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t.summaryRespondents}
                  </span>
                  <span className="text-4xl font-bold tabular-nums text-slate-900">
                    {result.n_respondents}
                  </span>
                </div>
              </div>

              {/* Scale name (if provided) */}
              {result.scale_name && (
                <p className="text-sm text-slate-500">
                  Scale: <span className="font-medium text-slate-700">{result.scale_name}</span>
                </p>
              )}

              {/* Item diagnostics table */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h3 className="text-sm font-semibold text-slate-700">{t.diagnosticsHeading}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3 text-left">{t.colItem}</th>
                        <th className="px-5 py-3 text-left">{t.colItemTotal}</th>
                        <th className="px-5 py-3 text-left">{t.colAlphaDeleted}</th>
                        <th className="px-5 py-3 text-left">{t.colDelta}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.item_total_correlations.map((r, i) => {
                        const alphaDeleted = result.alpha_if_item_deleted[i]
                        const delta = alphaDeleted - result.alpha
                        const barWidth = Math.max(0, Math.min(100, r * 100))
                        return (
                          <tr
                            key={i}
                            className="transition-colors hover:bg-slate-50"
                          >
                            {/* Item number */}
                            <td className="px-5 py-3 font-mono text-xs text-slate-500">
                              Item {i + 1}
                            </td>

                            {/* Item-total r with bar */}
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-12 tabular-nums text-slate-700">
                                  {r.toFixed(3)}
                                </span>
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-indigo-400"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Alpha if deleted */}
                            <td className="px-5 py-3 tabular-nums text-slate-700">
                              {alphaDeleted.toFixed(3)}
                            </td>

                            {/* Delta */}
                            <td className="px-5 py-3">
                              <span
                                className={`tabular-nums font-medium ${
                                  delta > 0.005
                                    ? "text-emerald-600"
                                    : delta < -0.005
                                    ? "text-red-500"
                                    : "text-slate-400"
                                }`}
                              >
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(3)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
                  Δ = α-if-deleted − α
                  &nbsp;·&nbsp;Positive Δ indicates the scale improves without this item.
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
