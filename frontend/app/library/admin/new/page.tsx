"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import { useAuth } from "@/components/AuthProvider"
import { getLibraryCategories } from "@/lib/api"
import type { InstrumentCategoryOut } from "@/lib/types"

// ---------------------------------------------------------------------------
// Field component
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="mb-4">
      <label className="label-caps mb-1 block">
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px]" style={{ color: "rgba(30,27,75,0.4)" }}>{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminNewInstrumentPage() {
  const { role } = useAuth()
  const router = useRouter()
  const [categories, setCategories] = useState<InstrumentCategoryOut[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    short_name: "",
    description: "",
    construct_measured: "",
    theoretical_framework: "",
    source_citation: "",
    source_url: "",
    license_type: "open",
    is_proprietary: false,
    total_items: 0,
    estimated_minutes: "",
    scoring_type: "mean",
    response_format: "likert5",
    validated_populations: "",
    languages: "",
    reliability_alpha: "",
    category_id: "",
  })

  useEffect(() => {
    getLibraryCategories().then(setCategories).catch(() => {})
  }, [])

  if (role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col">
        <Header backHref="/library" backLabel="Library" />
        <div className="flex flex-1 items-center justify-center">
          <div className="alert-error max-w-sm">Admin access required.</div>
        </div>
      </div>
    )
  }

  function set(key: string, value: string | boolean | number) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.short_name.trim()) return
    setSaving(true); setError(null)
    try {
      // Parse JSON array fields
      const validated_populations = form.validated_populations.trim()
        ? JSON.stringify(form.validated_populations.split(",").map(s => s.trim()).filter(Boolean))
        : null
      const languages = form.languages.trim()
        ? JSON.stringify(form.languages.split(",").map(s => s.trim()).filter(Boolean))
        : null

      const body = {
        name: form.name.trim(),
        short_name: form.short_name.trim(),
        description: form.description.trim() || null,
        construct_measured: form.construct_measured.trim() || null,
        theoretical_framework: form.theoretical_framework.trim() || null,
        source_citation: form.source_citation.trim() || null,
        source_url: form.source_url.trim() || null,
        license_type: form.license_type,
        is_proprietary: form.is_proprietary,
        total_items: Number(form.total_items) || 0,
        estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
        scoring_type: form.scoring_type,
        response_format: form.response_format,
        validated_populations,
        languages,
        reliability_alpha: form.reliability_alpha ? Number(form.reliability_alpha) : null,
        category_id: form.category_id || null,
      }

      const res = await fetch("/api/v1/library/instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.detail === "string" ? data.detail : `Error ${res.status}`)
      }
      const created = await res.json()
      router.push(`/library/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/library" backLabel="Library" />

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-2xl">

          <div className="mb-8">
            <p className="eyebrow mb-1">Admin</p>
            <h1 className="page-title">Add New Instrument</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(30,27,75,0.5)" }}>
              Add a validated psychometric instrument to the library.
            </p>
          </div>

          {error && <div className="alert-error mb-6">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-0">

            {/* Identity */}
            <div className="card mb-6 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(30,27,75,0.4)" }}>Identity</p>

              <FormField label="Instrument Name" required>
                <input
                  className="field w-full"
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Psychological Safety Scale"
                  required
                />
              </FormField>

              <FormField label="Short Name / Code" required hint="Unique identifier, e.g. PSS-7. Used as a stable key.">
                <input
                  className="field w-full"
                  value={form.short_name}
                  onChange={e => set("short_name", e.target.value)}
                  placeholder="e.g. PSS-7"
                  required
                />
              </FormField>

              <FormField label="Category">
                <select
                  className="field w-full"
                  value={form.category_id}
                  onChange={e => set("category_id", e.target.value)}
                >
                  <option value="">— No category —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Description">
                <textarea
                  className="field w-full resize-none"
                  rows={3}
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  placeholder="Brief description of what the instrument measures and for whom."
                />
              </FormField>

              <FormField label="Construct Measured">
                <input
                  className="field w-full"
                  value={form.construct_measured}
                  onChange={e => set("construct_measured", e.target.value)}
                  placeholder="e.g. Team Psychological Safety"
                />
              </FormField>
            </div>

            {/* Measurement */}
            <div className="card mb-6 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(30,27,75,0.4)" }}>Measurement</p>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Response Format">
                  <select
                    className="field w-full"
                    value={form.response_format}
                    onChange={e => set("response_format", e.target.value)}
                  >
                    <option value="likert5">Likert 1–5</option>
                    <option value="likert7">Likert 1–7</option>
                    <option value="forced_choice">Forced Choice</option>
                    <option value="other">Other / Mixed</option>
                  </select>
                </FormField>

                <FormField label="Scoring Type">
                  <select
                    className="field w-full"
                    value={form.scoring_type}
                    onChange={e => set("scoring_type", e.target.value)}
                  >
                    <option value="mean">Mean</option>
                    <option value="sum">Sum</option>
                    <option value="subscale">Subscale</option>
                  </select>
                </FormField>

                <FormField label="Total Items">
                  <input
                    type="number"
                    min={1}
                    className="field w-full"
                    value={form.total_items || ""}
                    onChange={e => set("total_items", Number(e.target.value))}
                    placeholder="e.g. 10"
                  />
                </FormField>

                <FormField label="Est. Minutes">
                  <input
                    type="number"
                    min={1}
                    className="field w-full"
                    value={form.estimated_minutes}
                    onChange={e => set("estimated_minutes", e.target.value)}
                    placeholder="e.g. 5"
                  />
                </FormField>

                <FormField label="Cronbach's α" hint="Reported reliability (0–1)">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className="field w-full"
                    value={form.reliability_alpha}
                    onChange={e => set("reliability_alpha", e.target.value)}
                    placeholder="e.g. 0.85"
                  />
                </FormField>
              </div>
            </div>

            {/* License & Access */}
            <div className="card mb-6 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(30,27,75,0.4)" }}>License & Access</p>

              <FormField label="License Type">
                <select
                  className="field w-full"
                  value={form.license_type}
                  onChange={e => set("license_type", e.target.value)}
                >
                  <option value="open">Open Access</option>
                  <option value="public_domain">Public Domain</option>
                  <option value="proprietary">Proprietary (Metricly)</option>
                </select>
              </FormField>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_proprietary}
                  onChange={e => set("is_proprietary", e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#5b21b6]"
                />
                <span className="text-xs font-medium" style={{ color: "#1e1b4b" }}>Mark as proprietary</span>
              </label>
            </div>

            {/* Validation */}
            <div className="card mb-6 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(30,27,75,0.4)" }}>Validation</p>

              <FormField label="Validated Populations" hint="Comma-separated, e.g. healthcare teams, university students">
                <input
                  className="field w-full"
                  value={form.validated_populations}
                  onChange={e => set("validated_populations", e.target.value)}
                  placeholder="e.g. healthcare teams, managers"
                />
              </FormField>

              <FormField label="Languages" hint="Comma-separated ISO codes, e.g. en, ar, fr">
                <input
                  className="field w-full"
                  value={form.languages}
                  onChange={e => set("languages", e.target.value)}
                  placeholder="e.g. en, ar"
                />
              </FormField>
            </div>

            {/* Citation */}
            <div className="card mb-6 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(30,27,75,0.4)" }}>Citation</p>

              <FormField label="Theoretical Framework">
                <input
                  className="field w-full"
                  value={form.theoretical_framework}
                  onChange={e => set("theoretical_framework", e.target.value)}
                  placeholder="e.g. Bandura (1977) social cognitive theory"
                />
              </FormField>

              <FormField label="Source Citation">
                <textarea
                  className="field w-full resize-none"
                  rows={2}
                  value={form.source_citation}
                  onChange={e => set("source_citation", e.target.value)}
                  placeholder="APA citation…"
                />
              </FormField>

              <FormField label="Source URL">
                <input
                  type="url"
                  className="field w-full"
                  value={form.source_url}
                  onChange={e => set("source_url", e.target.value)}
                  placeholder="https://…"
                />
              </FormField>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim() || !form.short_name.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create Instrument"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
