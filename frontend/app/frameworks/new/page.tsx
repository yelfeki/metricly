"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import {
  createFramework,
  addCompetency,
  addProficiencyLevel,
  linkSurvey,
  getSurveys,
} from "@/lib/api"
import type { CompetencyOut, FrameworkOut, SurveyListItem } from "@/lib/types"

// ---------------------------------------------------------------------------
// Default proficiency scale
// ---------------------------------------------------------------------------

const DEFAULT_LEVELS = [
  { level: 1, label: "Novice",      description: "Limited exposure; needs close guidance.",              color: "#ef4444" },
  { level: 2, label: "Developing",  description: "Basic understanding; can perform with support.",       color: "#f59e0b" },
  { level: 3, label: "Proficient",  description: "Solid competency; works independently.",              color: "#3b82f6" },
  { level: 4, label: "Advanced",    description: "Deep expertise; guides others.",                       color: "#8b5cf6" },
  { level: 5, label: "Expert",      description: "Mastery; recognized authority; drives best practice.", color: "#059669" },
]

const STEPS = ["Details", "Competencies", "Proficiency Scale", "Link Surveys"]

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function Step1Details({
  title, setTitle,
  roleTitle, setRoleTitle,
  description, setDescription,
}: {
  title: string; setTitle: (v: string) => void
  roleTitle: string; setRoleTitle: (v: string) => void
  description: string; setDescription: (v: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="label-caps mb-1.5 block">Framework title *</label>
        <input
          className="field"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Senior Software Engineer"
        />
      </div>
      <div>
        <label className="label-caps mb-1.5 block">Role title</label>
        <input
          className="field"
          value={roleTitle}
          onChange={e => setRoleTitle(e.target.value)}
          placeholder="e.g. Software Engineer L4"
        />
        <p className="mt-1 text-xs" style={{ color: "rgba(30,27,75,0.4)" }}>The job title this framework applies to.</p>
      </div>
      <div>
        <label className="label-caps mb-1.5 block">Description</label>
        <textarea
          className="field resize-none"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe the purpose and scope of this framework…"
        />
      </div>
    </div>
  )
}

function Step2Competencies({
  competencies, setCompetencies,
}: {
  competencies: { name: string; description: string }[]
  setCompetencies: (v: { name: string; description: string }[]) => void
}) {
  function add() {
    setCompetencies([...competencies, { name: "", description: "" }])
  }
  function remove(i: number) {
    setCompetencies(competencies.filter((_, idx) => idx !== i))
  }
  function update(i: number, field: "name" | "description", val: string) {
    setCompetencies(competencies.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
        Define the core skills and behaviours this role requires. Each competency will be independently assessed and scored.
      </p>
      {competencies.map((comp, i) => (
        <div key={i} className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #5b21b6, #2563eb)" }}
            >
              {i + 1}
            </span>
            <input
              className="field flex-1"
              value={comp.name}
              onChange={e => update(i, "name", e.target.value)}
              placeholder="Competency name (e.g. Technical Proficiency)"
            />
            <button
              onClick={() => remove(i)}
              className="shrink-0 p-1.5 rounded-full transition-colors"
              style={{ color: "rgba(30,27,75,0.35)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(30,27,75,0.35)")}
              title="Remove competency"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <input
            className="field"
            value={comp.description}
            onChange={e => update(i, "description", e.target.value)}
            placeholder="Brief description of what this competency covers…"
          />
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-[14px] py-3 text-sm font-semibold transition-all"
        style={{
          border: "1.5px dashed rgba(91,33,182,0.25)",
          background: "rgba(255,255,255,0.25)",
          color: "#5b21b6",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,33,182,0.06)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
      >
        + Add competency
      </button>
      {competencies.length === 0 && (
        <p className="text-center text-xs" style={{ color: "rgba(30,27,75,0.35)" }}>
          Add at least one competency to continue.
        </p>
      )}
    </div>
  )
}

function Step3Scale({
  levels, setLevels,
}: {
  levels: { level: number; label: string; description: string; color: string }[]
  setLevels: (v: typeof levels) => void
}) {
  function update(i: number, field: string, val: string) {
    setLevels(levels.map((lv, idx) => idx === i ? { ...lv, [field]: val } : lv))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
        Define what each proficiency level means for this role. The target level for gap analysis is automatically set to <strong>Proficient (level 3)</strong>.
      </p>
      {levels.map((lv, i) => (
        <div key={i} className="card p-4">
          <div className="mb-3 flex items-center gap-3">
            <input
              type="color"
              value={lv.color}
              onChange={e => update(i, "color", e.target.value)}
              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border-0 p-0.5"
              style={{ background: "rgba(255,255,255,0.4)" }}
              title="Level color"
            />
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: lv.color }}
            >
              {lv.level}
            </span>
            <input
              className="field flex-1"
              value={lv.label}
              onChange={e => update(i, "label", e.target.value)}
              placeholder="Level label (e.g. Proficient)"
            />
          </div>
          <input
            className="field"
            value={lv.description}
            onChange={e => update(i, "description", e.target.value)}
            placeholder="Describe what this level looks like in practice…"
          />
        </div>
      ))}
    </div>
  )
}

function Step4LinkSurveys({
  competencies,
  surveys,
  links,
  setLinks,
}: {
  competencies: CompetencyOut[]
  surveys: SurveyListItem[]
  links: Record<string, { survey_id: string; factor: string }>
  setLinks: (v: Record<string, { survey_id: string; factor: string }>) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "rgba(30,27,75,0.5)" }}>
        Optionally map each competency to a survey and factor. Gap analysis will pull scores from the linked factor.
      </p>
      {competencies.map(comp => {
        const link = links[comp.id] || { survey_id: "", factor: "" }
        return (
          <div key={comp.id} className="card p-4">
            <p className="mb-3 text-sm font-semibold" style={{ color: "#1e1b4b" }}>{comp.name}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-caps mb-1 block">Assessment</label>
                <select
                  className="field"
                  value={link.survey_id}
                  onChange={e => setLinks({ ...links, [comp.id]: { survey_id: e.target.value, factor: "" } })}
                >
                  <option value="">None</option>
                  {surveys.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-caps mb-1 block">Factor</label>
                <input
                  className="field"
                  value={link.factor}
                  onChange={e => setLinks({ ...links, [comp.id]: { ...link, factor: e.target.value } })}
                  placeholder="Factor name"
                  disabled={!link.survey_id}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewFrameworkPage() {
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [title, setTitle] = useState("")
  const [roleTitle, setRoleTitle] = useState("")
  const [description, setDescription] = useState("")

  // Step 2
  const [competencies, setCompetencies] = useState<{ name: string; description: string }[]>([
    { name: "", description: "" },
  ])

  // Step 3
  const [levels, setLevels] = useState(DEFAULT_LEVELS)

  // Step 4
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [surveysLoaded, setSurveysLoaded] = useState(false)
  const [savedFramework, setSavedFramework] = useState<FrameworkOut | null>(null)
  const [savedCompetencies, setSavedCompetencies] = useState<CompetencyOut[]>([])
  const [links, setLinks] = useState<Record<string, { survey_id: string; factor: string }>>({})

  const canNext = step === 0
    ? title.trim().length > 0
    : step === 1
    ? competencies.some(c => c.name.trim())
    : step === 2
    ? levels.every(l => l.label.trim())
    : true

  async function next() {
    if (step === 2) {
      // Save framework + competencies + levels before showing step 4
      setSaving(true); setError(null)
      try {
        const fw = await createFramework({
          title: title.trim(),
          description: description.trim() || null,
          role_title: roleTitle.trim() || null,
        })

        const validComps = competencies.filter(c => c.name.trim())
        const createdComps: CompetencyOut[] = []
        for (let i = 0; i < validComps.length; i++) {
          const c = await addCompetency(fw.id, {
            name: validComps[i].name.trim(),
            description: validComps[i].description.trim() || null,
            order_index: i,
          })
          createdComps.push(c)
        }

        for (const lv of levels) {
          await addProficiencyLevel(fw.id, {
            level: lv.level,
            label: lv.label.trim(),
            description: lv.description.trim() || null,
            color: lv.color,
          })
        }

        setSavedFramework(fw)
        setSavedCompetencies(createdComps)

        // Load surveys for step 4
        if (!surveysLoaded) {
          try {
            const s = await getSurveys()
            setSurveys(s)
            setSurveysLoaded(true)
          } catch {}
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setStep(s => s + 1)
  }

  async function finish() {
    if (!savedFramework) return
    setSaving(true); setError(null)
    try {
      for (const comp of savedCompetencies) {
        const link = links[comp.id]
        if (link?.survey_id && link.factor.trim()) {
          await linkSurvey(savedFramework.id, {
            survey_id: link.survey_id,
            competency_id: comp.id,
          })
        }
      }
      router.push("/frameworks")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header backHref="/frameworks" backLabel="Frameworks" />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-xl">

          {/* Page heading */}
          <div className="mb-8">
            <p className="eyebrow mb-1">New Framework</p>
            <h1 className="page-title">Build a Competency Framework</h1>
          </div>

          {/* Step indicator */}
          <div className="mb-8 flex items-center gap-0">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all"
                    style={{
                      background: i <= step
                        ? "linear-gradient(135deg, #5b21b6, #2563eb)"
                        : "rgba(255,255,255,0.4)",
                      color: i <= step ? "#fff" : "rgba(30,27,75,0.4)",
                      border: i <= step ? "none" : "0.5px solid rgba(30,27,75,0.15)",
                    }}
                  >
                    {i < step ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className="mt-1 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: i === step ? "#5b21b6" : "rgba(30,27,75,0.35)" }}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="mb-4 h-px w-8 sm:w-12"
                    style={{ background: i < step ? "linear-gradient(90deg, #5b21b6, #2563eb)" : "rgba(30,27,75,0.12)" }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="card p-6">
            <h2 className="section-heading mb-5">
              {STEPS[step]}
            </h2>

            {step === 0 && (
              <Step1Details
                title={title} setTitle={setTitle}
                roleTitle={roleTitle} setRoleTitle={setRoleTitle}
                description={description} setDescription={setDescription}
              />
            )}
            {step === 1 && (
              <Step2Competencies competencies={competencies} setCompetencies={setCompetencies} />
            )}
            {step === 2 && (
              <Step3Scale levels={levels} setLevels={setLevels} />
            )}
            {step === 3 && savedFramework && (
              <Step4LinkSurveys
                competencies={savedCompetencies}
                surveys={surveys}
                links={links}
                setLinks={setLinks}
              />
            )}

            {error && <p className="mt-4 text-xs" style={{ color: "#dc2626" }}>{error}</p>}
          </div>

          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={() => step === 0 ? router.push("/frameworks") : setStep(s => s - 1)}
              className="btn-ghost"
              disabled={saving}
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < 3 ? (
              <button
                onClick={next}
                disabled={!canNext || saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "Saving…" : "Continue"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => router.push("/frameworks")}
                  className="btn-ghost"
                  disabled={saving}
                >
                  Skip
                </button>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Finish"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
