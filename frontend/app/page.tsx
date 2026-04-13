import Link from "next/link"
import Header from "@/components/Header"
import ModuleCard from "@/components/ModuleCard"
import { en } from "@/lib/i18n"
import type { Module } from "@/lib/types"

const MODULES: Module[] = [
  {
    id: "alpha",
    name: en.modules.alpha.name,
    description: en.modules.alpha.description,
    detail: "",
    endpoint: "POST /api/v1/reliability/cronbach-alpha",
    category: en.modules.alpha.category,
    color: "indigo",
    href: "/alpha",
    available: true,
  },
  {
    id: "omega",
    name: en.modules.omega.name,
    description: en.modules.omega.description,
    detail: "",
    endpoint: "POST /api/v1/reliability/omega",
    category: en.modules.omega.category,
    color: "violet",
    href: null,
    available: false,
  },
  {
    id: "efa",
    name: en.modules.efa.name,
    description: en.modules.efa.description,
    detail: "",
    endpoint: "POST /api/v1/efa",
    category: en.modules.efa.category,
    color: "emerald",
    href: null,
    available: false,
  },
  {
    id: "dif",
    name: en.modules.dif.name,
    description: en.modules.dif.description,
    detail: "",
    endpoint: "POST /api/v1/dif",
    category: en.modules.dif.category,
    color: "amber",
    href: null,
    available: false,
  },
]

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* Hero */}
      <section className="border-b border-slate-200 bg-white px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-indigo-600">
            {en.dashboard.eyebrow}
          </p>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {en.dashboard.title}
          </h1>
          <p className="max-w-2xl text-base text-slate-500">{en.dashboard.subtitle}</p>
        </div>
      </section>

      {/* Module grid */}
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-slate-400">
            {en.dashboard.modulesHeading}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((mod) => (
              <ModuleCard key={mod.id} module={mod} />
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/surveys"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
            >
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Survey Builder
            </Link>
            <p className="text-xs text-slate-400">
              Metricly v0.1 · Python 3.11 · FastAPI · NumPy · SciPy
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
